import { Theme } from "@radix-ui/themes";
import { Editor as CoreEditor } from "@tiptap/core";
import type { Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { Callout, Scribe, type ScribeRef } from "../lib/main";
import { getSelectionCalloutContext } from "../lib/components/Menu/calloutBubbleMenuPlugin";
import { getSuggestionItems } from "../lib/components/Scribe/extension/slashCommand/items";

const CALLOUT_CONTENT = `
  <p>Before</p>
  <aside data-type="callout" data-variant="info">
    <div data-callout-content><p>Read this note</p></div>
  </aside>
  <p>After</p>
`;
const liveEditors = new Set<Editor>();

afterEach(() => {
  liveEditors.forEach((editor) => {
    if (!editor.isDestroyed) {
      editor.destroy();
    }
  });
  liveEditors.clear();
});

const renderScribe = (content: string, editable = true) => {
  const scribeRef = createRef<ScribeRef>();

  render(
    <Theme>
      <Scribe ref={scribeRef} content={content} editable={editable} showBarMenu={false} />
    </Theme>,
  );

  const editor = scribeRef.current?.editor;

  if (!editor) {
    throw new Error("Expected Scribe to expose its editor");
  }

  liveEditors.add(editor);

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
    throw new Error(`Expected to find text: ${text}`);
  }

  return position;
};

const selectText = (editor: Editor, text: string) => {
  act(() => {
    editor.commands.setTextSelection(findTextPosition(editor, text));
    editor.view.focus();
  });
};

describe("Scribe callout controls", () => {
  it("inserts an Info callout from the default slash command", () => {
    const editor = renderScribe("<p>/callout</p>");
    const calloutItem = getSuggestionItems({ query: "callout", editor }).find(
      (item) => item.title === "Callout",
    );

    if (!calloutItem) {
      throw new Error("Expected the default Callout slash command");
    }

    act(() => {
      calloutItem.command({
        editor,
        range: { from: 1, to: 9 },
        props: calloutItem,
      });
    });

    expect(editor.getJSON().content?.[0]).toMatchObject({
      type: "callout",
      attrs: { variant: "info" },
    });
  });

  it("shows labeled variants, changes type, and turns a callout into text", async () => {
    const editor = renderScribe(CALLOUT_CONTENT);

    selectText(editor, "Read this note");

    const toolbar = await screen.findByRole("toolbar", { name: "Callout type" });
    const controls = within(toolbar);

    ["Info", "Tip", "Warning", "Caution", "Turn into text"].forEach((name) => {
      expect(controls.getByRole("button", { name })).toBeVisible();
    });
    expect(toolbar.closest("[data-scribe-popup-root]")).not.toBeNull();
    expect(controls.getByRole("button", { name: "Info" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(controls.getByRole("button", { name: "Warning" }));

    await waitFor(() => {
      expect(getSelectionCalloutContext(editor.state)?.node.attrs.variant).toBe("warning");
      expect(controls.getByRole("button", { name: "Warning" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    });

    fireEvent.click(controls.getByRole("button", { name: "Turn into text" }));

    await waitFor(() => {
      expect(getSelectionCalloutContext(editor.state)).toBeNull();
      expect(screen.queryByRole("toolbar", { name: "Callout type" })).not.toBeInTheDocument();
    });
    expect(editor.getText()).toContain("Read this note");
  });

  it("moves keyboard focus into, through, and back out of the controls", async () => {
    const editor = renderScribe(CALLOUT_CONTENT);

    selectText(editor, "Read this note");

    const toolbar = await screen.findByRole("toolbar", { name: "Callout type" });
    const infoControl = within(toolbar).getByRole("button", { name: "Info" });
    const tipControl = within(toolbar).getByRole("button", { name: "Tip" });

    fireEvent.keyDown(editor.view.dom, { key: "F10", altKey: true });
    expect(infoControl).toHaveFocus();

    fireEvent.keyDown(toolbar, { key: "ArrowRight" });
    expect(tipControl).toHaveFocus();

    fireEvent.keyDown(toolbar, { key: "End" });
    expect(within(toolbar).getByRole("button", { name: "Turn into text" })).toHaveFocus();

    fireEvent.keyDown(toolbar, { key: "Escape" });
    await waitFor(() => expect(editor.view.hasFocus()).toBe(true));
  });

  it("defers to the more specific table controls for a table inside a callout", async () => {
    const editor = renderScribe(`
      <aside data-type="callout" data-variant="warning">
        <div data-callout-content>
          <table><tbody><tr><th>Nested header</th><td>Nested cell</td></tr></tbody></table>
        </div>
      </aside>
    `);

    selectText(editor, "Nested header");

    const tableToolbar = await screen.findByRole("toolbar", { name: "Table controls" });

    expect(screen.queryByRole("toolbar", { name: "Callout type" })).not.toBeInTheDocument();

    fireEvent.keyDown(editor.view.dom, { key: "F10", altKey: true });

    expect(within(tableToolbar).getByRole("button", { name: "Add row above" })).toHaveFocus();
  });

  it("defers to the more specific callout controls for a callout inside a table", async () => {
    const editor = renderScribe(`
      <table><tbody><tr><td>
        <aside data-type="callout" data-variant="info">
          <div data-callout-content><p>Nested note</p></div>
        </aside>
      </td></tr></tbody></table>
    `);

    selectText(editor, "Nested note");

    const calloutToolbar = await screen.findByRole("toolbar", { name: "Callout type" });

    expect(screen.queryByRole("toolbar", { name: "Table controls" })).not.toBeInTheDocument();

    fireEvent.keyDown(editor.view.dom, { key: "F10", altKey: true });

    expect(within(calloutToolbar).getByRole("button", { name: "Info" })).toHaveFocus();
  });

  it("waits for focus and does not show authoring controls in read-only mode", async () => {
    const editableEditor = renderScribe(CALLOUT_CONTENT);

    act(() => {
      editableEditor.commands.setTextSelection(findTextPosition(editableEditor, "Read this note"));
    });

    expect(screen.queryByRole("toolbar", { name: "Callout type" })).not.toBeInTheDocument();

    act(() => {
      editableEditor.view.focus();
    });

    expect(await screen.findByRole("toolbar", { name: "Callout type" })).toBeInTheDocument();

    editableEditor.destroy();
    liveEditors.delete(editableEditor);
    const readOnlyEditor = renderScribe(CALLOUT_CONTENT, false);

    act(() => {
      readOnlyEditor.commands.setTextSelection(findTextPosition(readOnlyEditor, "Read this note"));
    });

    expect(screen.queryByRole("toolbar", { name: "Callout type" })).not.toBeInTheDocument();
    expect(document.querySelector('[data-type="callout"]')).not.toBeNull();
  });

  it("supports caller-owned editors that explicitly install the exported extension", async () => {
    const externalEditor = new CoreEditor({
      content: CALLOUT_CONTENT,
      extensions: [StarterKit, Callout],
    });

    liveEditors.add(externalEditor);

    render(
      <Theme>
        <Scribe externalEditor={externalEditor} editable showBarMenu={false} />
      </Theme>,
    );

    selectText(externalEditor, "Read this note");

    const toolbar = await screen.findByRole("toolbar", { name: "Callout type" });

    fireEvent.click(within(toolbar).getByRole("button", { name: "Tip" }));

    await waitFor(() => {
      expect(externalEditor.isActive("callout", { variant: "tip" })).toBe(true);
    });
  });
});
