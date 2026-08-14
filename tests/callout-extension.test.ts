import type { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import {
  CALLOUT_VARIANTS,
  createScribeEditor,
  DEFAULT_CALLOUT_VARIANT,
  html2md,
  md2html,
} from "../lib/main";

const editors = new Set<Editor>();

const createEditor = (content: string) => {
  const editor = createScribeEditor({ content, editable: true });

  editors.add(editor);

  return editor;
};

const findTextPosition = (editor: Editor, text: string) => {
  let position: number | undefined;

  editor.state.doc.descendants((node, nodePosition) => {
    if (position === undefined && node.isText && node.text?.includes(text)) {
      position = nodePosition;
    }
  });

  if (position === undefined) {
    throw new Error(`Could not find text: ${text}`);
  }

  return position;
};

const pressKey = (editor: Editor, key: string) => {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
  });

  editor.view.dom.dispatchEvent(event);

  expect(event.defaultPrevented).toBe(true);
};

afterEach(() => {
  editors.forEach((editor) => {
    if (!editor.isDestroyed) {
      editor.destroy();
    }
  });
  editors.clear();
});

describe("Callout", () => {
  it.each(CALLOUT_VARIANTS)("parses and renders the %s variant", (variant) => {
    const editor = createEditor(
      `<aside data-type="callout" data-variant="${variant}"><div data-callout-content><p>Read me</p></div></aside>`,
    );
    const callout = editor.getJSON().content?.[0];
    const output = document.createElement("div");

    output.innerHTML = editor.getHTML();

    expect(callout).toMatchObject({
      type: "callout",
      attrs: { variant },
      content: [{ type: "paragraph", content: [{ type: "text", text: "Read me" }] }],
    });
    expect(output.querySelector("aside")?.getAttribute("data-variant")).toBe(variant);
    expect(output.querySelector("[data-callout-content]")?.textContent).toBe("Read me");
    expect(output.querySelector("[data-callout-label]")?.textContent?.toLowerCase()).toBe(variant);
    expect(output.querySelector("[data-callout-icon]")).toHaveAttribute("aria-hidden", "true");
    expect(output.querySelector("aside")).toHaveAttribute("role", "note");
    expect(output.querySelector("[role=alert]")).toBeNull();
  });

  it("normalizes missing or unknown HTML variants to info", () => {
    const editor = createEditor(
      '<aside data-type="callout" data-variant="custom"><div data-callout-content><p>Heads up</p></div></aside>',
    );

    expect(editor.getJSON().content?.[0].attrs).toEqual({
      variant: DEFAULT_CALLOUT_VARIANT,
    });
    expect(editor.getHTML()).toContain('data-variant="info"');
  });

  it("does not let a nested generated content marker swallow a minimal Callout", () => {
    const editor = createEditor(
      [
        '<aside data-type="callout" data-variant="info">',
        "<p>Outer before</p>",
        '<aside data-type="callout" data-variant="warning">',
        "<div data-callout-content><p>Inner message</p></div>",
        "</aside>",
        "<p>Outer after</p>",
        "</aside>",
      ].join(""),
    );

    expect(editor.getJSON().content?.[0]).toMatchObject({
      type: "callout",
      attrs: { variant: "info" },
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Outer before" }] },
        {
          type: "callout",
          attrs: { variant: "warning" },
          content: [{ type: "paragraph", content: [{ type: "text", text: "Inner message" }] }],
        },
        { type: "paragraph", content: [{ type: "text", text: "Outer after" }] },
      ],
    });
  });

  it("round-trips generated Callout HTML through Markdown without duplicating its label", () => {
    const source = createEditor(
      '<aside data-type="callout" data-variant="warning"><div data-callout-content><p><strong>Heads up</strong></p><ul><li><p>First consideration</p></li><li><p>Second consideration</p></li></ul></div></aside>',
    );
    const expectedCallout = source.getJSON().content?.[0];
    const generatedHTML = source.getHTML();
    const restored = createEditor(md2html(html2md(generatedHTML)));
    const restoredOutput = document.createElement("div");

    restoredOutput.innerHTML = restored.getHTML();

    expect(restored.getJSON().content?.[0]).toEqual(expectedCallout);
    expect(restoredOutput.querySelectorAll("[data-callout-label]")).toHaveLength(1);
    expect(restoredOutput.querySelector("[data-callout-label]")).toHaveTextContent("Warning");
  });

  it("rejects unsupported variants in structured content", () => {
    const editor = createEditor("<p>Before</p>");

    expect(() =>
      editor.schema.nodeFromJSON({
        type: "callout",
        attrs: { variant: "custom" },
        content: [{ type: "paragraph" }],
      }),
    ).toThrow("Invalid callout variant: custom");
  });

  it("wraps content, changes its variant, and unwraps it through public commands", () => {
    const editor = createEditor("<p>Important context</p>");

    editor.commands.setTextSelection(findTextPosition(editor, "Important context"));

    expect(editor.commands.insertCallout("warning")).toBe(true);
    expect(editor.isActive("callout", { variant: "warning" })).toBe(true);
    expect(editor.getText().trim()).toBe("Important context");

    expect(editor.commands.setCalloutVariant("caution")).toBe(true);
    expect(editor.isActive("callout", { variant: "caution" })).toBe(true);

    expect(editor.commands.unsetCallout()).toBe(true);
    expect(editor.isActive("callout")).toBe(false);
    expect(editor.getJSON().content?.[0]).toMatchObject({
      type: "paragraph",
      content: [{ type: "text", text: "Important context" }],
    });
  });

  it("uses info when insertCallout receives no variant", () => {
    const editor = createEditor("<p>Some context</p>");

    editor.commands.setTextSelection(findTextPosition(editor, "Some context"));

    expect(editor.commands.insertCallout()).toBe(true);
    expect(editor.isActive("callout", { variant: DEFAULT_CALLOUT_VARIANT })).toBe(true);
  });

  it("toggles a callout without nesting when the requested variant differs", () => {
    const editor = createEditor(
      '<aside data-type="callout" data-variant="warning"><div data-callout-content><p>Review this</p></div></aside>',
    );

    editor.commands.setTextSelection(findTextPosition(editor, "Review this"));

    expect(editor.commands.toggleCallout("info")).toBe(true);
    expect(editor.isActive("callout")).toBe(false);

    expect(editor.commands.toggleCallout("tip")).toBe(true);
    expect(editor.isActive("callout", { variant: "tip" })).toBe(true);
    expect(editor.getJSON().content?.[0].content?.[0].type).toBe("paragraph");
  });

  it("unwraps a callout when Backspace runs at its first child boundary", () => {
    const editor = createEditor(
      '<aside data-type="callout" data-variant="info"><div data-callout-content><p>Message</p></div></aside>',
    );

    editor.commands.setTextSelection(findTextPosition(editor, "Message"));

    pressKey(editor, "Backspace");
    expect(editor.isActive("callout")).toBe(false);
    expect(editor.getJSON().content?.[0]).toMatchObject({
      type: "paragraph",
      content: [{ type: "text", text: "Message" }],
    });
  });

  it("lifts a non-first child out of a callout with Backspace", () => {
    const editor = createEditor(
      '<aside data-type="callout" data-variant="tip"><div data-callout-content><p>First</p><p>Second</p></div></aside>',
    );
    const secondPosition = findTextPosition(editor, "Second");

    editor.commands.setTextSelection(secondPosition);

    pressKey(editor, "Backspace");
    const [remainingCallout, liftedParagraph, trailingParagraph] = editor.getJSON().content ?? [];

    expect(remainingCallout).toMatchObject({
      type: "callout",
      attrs: { variant: "tip" },
      content: [{ type: "paragraph", content: [{ type: "text", text: "First" }] }],
    });
    expect(liftedParagraph).toMatchObject({
      type: "paragraph",
      content: [{ type: "text", text: "Second" }],
    });
    expect(trailingParagraph).toEqual({ type: "paragraph" });
  });

  it("exits from an empty final paragraph with Enter", () => {
    const editor = createEditor(
      '<aside data-type="callout" data-variant="info"><div data-callout-content><p>Message</p><p></p></div></aside><p></p>',
    );
    const callout = editor.state.doc.firstChild;

    if (!callout) {
      throw new Error("Expected a callout");
    }

    editor.commands.setTextSelection(callout.nodeSize - 2);

    pressKey(editor, "Enter");
    expect(editor.getJSON().content).toMatchObject([
      {
        type: "callout",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Message" }] }],
      },
      { type: "paragraph" },
    ]);
    expect(editor.getJSON().content).toHaveLength(2);
  });
});
