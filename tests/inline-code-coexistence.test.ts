import { Editor, type JSONContent } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { initExtensions } from "../lib/components/Scribe/extension";

const liveEditors = new Set<Editor>();

afterEach(() => {
  liveEditors.forEach((editor) => editor.destroy());
  liveEditors.clear();
});

const createEditor = (content: string) => {
  const editor = new Editor({
    content,
    editable: true,
    extensions: initExtensions({}),
  });

  liveEditors.add(editor);

  return editor;
};

const findTextNode = (content: JSONContent, text: string): JSONContent | undefined => {
  if (content.type === "text" && content.text === text) {
    return content;
  }

  for (const child of content.content ?? []) {
    const match = findTextNode(child, text);

    if (match) {
      return match;
    }
  }

  return undefined;
};

const markTypesFor = (editor: Editor, text: string) =>
  (findTextNode(editor.getJSON(), text)?.marks ?? []).map((mark) => mark.type).sort();

describe("inline code mark coexistence", () => {
  it("keeps existing link and bold marks when code is applied, undone, and redone", () => {
    const editor = createEditor(
      '<p><a href="https://example.com/reference"><strong>linkedCode</strong></a></p>',
    );
    const beforeCode = editor.getJSON();

    expect(editor.chain().setTextSelection({ from: 1, to: 11 }).setCode().run()).toBe(true);
    expect(markTypesFor(editor, "linkedCode")).toEqual(["bold", "code", "link"]);
    const withCode = editor.getJSON();

    expect(editor.commands.setCode()).toBe(true);
    expect(editor.getJSON()).toEqual(withCode);

    expect(editor.commands.undo()).toBe(true);
    expect(editor.getJSON()).toEqual(beforeCode);

    expect(editor.commands.redo()).toBe(true);
    expect(editor.getJSON()).toEqual(withCode);

    expect(editor.commands.toggleCode()).toBe(true);
    expect(markTypesFor(editor, "linkedCode")).toEqual(["bold", "link"]);
  });

  it("keeps code when link and bold marks are applied afterward", () => {
    const editor = createEditor("<p><code>plainCode</code></p>");

    expect(
      editor
        .chain()
        .setTextSelection({ from: 1, to: 10 })
        .setBold()
        .setLink({ href: "https://example.com/api" })
        .run(),
    ).toBe(true);
    expect(markTypesFor(editor, "plainCode")).toEqual(["bold", "code", "link"]);
  });
});
