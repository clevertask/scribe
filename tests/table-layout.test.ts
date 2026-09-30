import { generateHTML, generateJSON, getSchema, type JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { CellSelection } from "@tiptap/pm/tables";
import type { Editor } from "@tiptap/react";
import { afterEach, describe, expect, it } from "vitest";
import { createScribeEditor } from "../lib/main";
import { createScribeSchemaExtensions } from "../lib/schema";
import { html2md } from "../lib/utils/html-to-markdown";
import { md2html } from "../lib/utils/markdown-to-html";

const tableHtml = (attributes = "", prefix = "First", widths = false) => `
  <table ${attributes}><tbody>
    <tr><th ${widths ? 'colwidth="180"' : ""}><p>${prefix} heading</p></th><th><p>Notes</p></th></tr>
    <tr><td ${widths ? 'colwidth="180"' : ""}><p>${prefix} cell</p></td><td><p><strong>Keep formatting</strong></p></td></tr>
  </tbody></table>
`;
const siblingTables = `<p>Before</p>${tableHtml("", "First", true)}<p>Between</p>${tableHtml("", "Second")}<p>After</p>`;
const editors = new Set<Editor>();

afterEach(() => {
  for (const editor of editors) {
    if (!editor.isDestroyed) editor.destroy();
  }
  editors.clear();
});

const createEditor = (content = siblingTables, editable = true) => {
  const editor = createScribeEditor({ content, editable });
  editors.add(editor);
  return editor;
};

const tableNodes = (document: ProseMirrorNode) => {
  const tables: { node: ProseMirrorNode; position: number }[] = [];
  document.descendants((node, position) => {
    if (node.type.name === "table") tables.push({ node, position });
  });
  return tables;
};

const selectText = (editor: Editor, text: string) => {
  let foundPosition: number | undefined;
  editor.state.doc.descendants((node, position) => {
    if (foundPosition === undefined && node.isText && node.text?.includes(text)) {
      foundPosition = position + node.text.indexOf(text);
    }
  });
  if (foundPosition === undefined) throw new Error(`Expected text: ${text}`);
  editor.commands.setTextSelection(foundPosition);
};

const collectTables = (document: JSONContent): JSONContent[] => [
  ...(document.type === "table" ? [document] : []),
  ...(document.content ?? []).flatMap(collectTables),
];

describe("explicit table layout", () => {
  it("changes only the selected table and retains authored widths, rich content, and surrounding blocks", () => {
    const editor = createEditor();
    const original = editor.state.doc;
    const [first, second] = tableNodes(original);
    selectText(editor, "First cell");

    expect(editor.commands.setTableLayout("scroll")).toBe(true);
    expect(editor.commands.setTableHeightLimit(true)).toBe(true);
    const [updatedFirst, unchangedSecond] = tableNodes(editor.state.doc);
    expect(updatedFirst.node.attrs).toMatchObject({ tableLayout: "scroll", limitHeight: true });
    expect(updatedFirst.node.content.eq(first.node.content)).toBe(true);
    expect(updatedFirst.node.firstChild?.firstChild?.attrs.colwidth).toEqual([180]);
    expect(unchangedSecond.node).toBe(second.node);
    expect(editor.state.doc.firstChild).toBe(original.firstChild);
    expect(editor.state.doc.lastChild).toBe(original.lastChild);

    selectText(editor, "Second cell");
    expect(editor.commands.setTableLayout("fit")).toBe(true);
    expect(tableNodes(editor.state.doc)[0].node.attrs).toMatchObject({
      tableLayout: "scroll",
      limitHeight: true,
    });
    expect(tableNodes(editor.state.doc)[1].node.attrs).toMatchObject({
      tableLayout: "fit",
      limitHeight: false,
    });

    selectText(editor, "First cell");
    for (const layout of ["fit", "auto", "scroll"] as const) {
      expect(editor.commands.setTableLayout(layout)).toBe(true);
      expect(tableNodes(editor.state.doc)[0].node.content.eq(first.node.content)).toBe(true);
    }
    expect(() => editor.state.doc.check()).not.toThrow();
  });

  it("applies layout to a multi-cell selection without disturbing the selected cells", () => {
    const editor = createEditor(tableHtml());
    const cellPositions: number[] = [];
    editor.state.doc.descendants((node, position) => {
      if (node.type.spec.tableRole === "cell") cellPositions.push(position);
    });
    const selection = CellSelection.create(editor.state.doc, cellPositions[0], cellPositions[1]);
    editor.view.dispatch(editor.state.tr.setSelection(selection));

    expect(editor.commands.setTableLayout("fit")).toBe(true);
    expect(editor.state.selection).toBeInstanceOf(CellSelection);
    expect(editor.state.selection.from).toBe(selection.from);
    expect(editor.state.selection.to).toBe(selection.to);
    expect(tableNodes(editor.state.doc)[0].node.attrs.tableLayout).toBe("fit");
  });

  it("rejects commands outside a table and in read-only mode", () => {
    const editor = createEditor();
    selectText(editor, "Before");
    const original = editor.getJSON();
    expect(editor.can().setTableLayout("fit")).toBe(false);
    expect(editor.commands.setTableLayout("fit")).toBe(false);
    expect(editor.commands.setTableHeightLimit(true)).toBe(false);
    expect(editor.getJSON()).toEqual(original);

    selectText(editor, "First cell");
    expect(editor.can().setTableLayout("scroll")).toBe(true);
    expect(editor.getJSON()).toEqual(original);
    editor.setEditable(false);
    expect(editor.can().setTableLayout("scroll")).toBe(false);
    expect(editor.can().setTableHeightLimit(true)).toBe(false);
    expect(editor.commands.setTableLayout("scroll")).toBe(false);
    expect(editor.commands.setTableHeightLimit(true)).toBe(false);
    expect(editor.getJSON()).toEqual(original);
  });

  it("keeps legacy table defaults and omits their attributes from HTML and GFM", () => {
    const editor = createEditor(tableHtml());
    expect(tableNodes(editor.state.doc)[0].node.attrs).toMatchObject({
      tableLayout: "auto",
      limitHeight: false,
    });
    expect(editor.getHTML()).not.toContain("data-table-layout");
    expect(editor.getHTML()).not.toContain("data-table-limit-height");
    expect(html2md(editor.getHTML())).toContain("| First heading | Notes |");
    expect(html2md(editor.getHTML())).not.toContain("<table");
  });

  it.each([
    ["fit", false],
    ["scroll", false],
    ["auto", true],
    ["fit", true],
    ["scroll", true],
  ] as const)(
    "round-trips %s layout with height limit %s through JSON, HTML, and Markdown",
    (layout, limitHeight) => {
      const editor = createEditor(tableHtml());
      selectText(editor, "First cell");
      editor.commands.setTableLayout(layout);
      editor.commands.setTableHeightLimit(limitHeight);
      const json = editor.getJSON();
      const extensions = createScribeSchemaExtensions({ enableUndoRedo: false });
      const schema = getSchema(extensions);
      expect(() => schema.nodeFromJSON(json).check()).not.toThrow();
      const html = generateHTML(json, extensions);
      expect(collectTables(generateJSON(html, extensions))[0]).toEqual(collectTables(json)[0]);

      const markdown = html2md(html);
      expect(markdown).toContain("<table");
      const restored = generateJSON(md2html(markdown), extensions);
      expect(collectTables(restored)[0]).toEqual(collectTables(json)[0]);
      const restoredEditor = createEditor(md2html(markdown), false);
      expect(tableNodes(restoredEditor.state.doc)[0].node.attrs).toMatchObject({
        tableLayout: layout,
        limitHeight,
      });
    },
  );

  it("normalizes unknown HTML options to the legacy defaults", () => {
    const editor = createEditor(
      tableHtml('data-table-layout="unknown" data-table-limit-height="false"'),
    );
    expect(tableNodes(editor.state.doc)[0].node.attrs).toMatchObject({
      tableLayout: "auto",
      limitHeight: false,
    });
    expect(editor.getHTML()).not.toContain("data-table-layout");
    expect(editor.getHTML()).not.toContain("data-table-limit-height");
  });
});
