import { generateHTML, generateJSON, getSchema, type JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { redoDepth, undoDepth } from "@tiptap/pm/history";
import { CellSelection } from "@tiptap/pm/tables";
import type { Editor } from "@tiptap/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createScribeEditor } from "../lib/main";
import { createScribeSchemaExtensions } from "../lib/schema";
import {
  DEFAULT_TABLE_MAX_HEIGHT,
  MAX_TABLE_MAX_HEIGHT,
  MIN_TABLE_MAX_HEIGHT,
  normalizeTableMaxHeight,
} from "../lib/components/Scribe/extension/table-layout";
import { html2md } from "../lib/utils/html-to-markdown";
import { md2html } from "../lib/utils/markdown-to-html";

const tableHtml = (attributes = "", prefix = "First", widths = false) => `
  <table ${attributes}><tbody>
    <tr><th ${widths ? 'colwidth="180"' : ""}><p>${prefix} heading</p></th><th><p>Notes</p></th></tr>
    <tr><td ${widths ? 'colwidth="180"' : ""}><p>${prefix} cell</p></td><td><p><strong>Keep formatting</strong></p></td></tr>
  </tbody></table>
`;
const headerlessTableHtml = (attributes: string) =>
  tableHtml(attributes).replaceAll("<th", "<td").replaceAll("</th>", "</td>");
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

describe("new table sticky header default", () => {
  it.each([
    { name: "default options", options: undefined, rows: 3, columns: 3 },
    {
      name: "an explicit header row",
      options: { rows: 2, cols: 2, withHeaderRow: true },
      rows: 2,
      columns: 2,
    },
  ])("creates a sticky header with $name", ({ options, rows, columns }) => {
    const editor = createEditor("<p>Before</p><p>After</p>");
    selectText(editor, "Before");
    expect(editor.commands.insertTable(options)).toBe(true);
    const table = tableNodes(editor.state.doc)[0].node;
    expect(table.childCount).toBe(rows);
    expect(table.firstChild?.childCount).toBe(columns);
    table.firstChild?.forEach((cell) => expect(cell.type.name).toBe("tableHeader"));
    expect(table.attrs).toMatchObject({ stickyHeaderRow: true, limitHeight: false });
    expect(editor.view.dom.querySelector(".tableWrapper")).toHaveAttribute(
      "data-table-sticky-header-active",
      "true",
    );
    const savedHtml = editor.getHTML();
    expect(savedHtml).toContain('data-table-sticky-header-row="true"');
    const restoredEditor = createEditor(savedHtml, false);
    expect(tableNodes(restoredEditor.state.doc)[0].node.attrs.stickyHeaderRow).toBe(true);
    expect(restoredEditor.view.dom.querySelector(".tableWrapper")).toHaveAttribute(
      "data-table-sticky-header-active",
      "true",
    );
  });

  it("leaves newly inserted headerless tables off", () => {
    const editor = createEditor("<p>Before</p><p>After</p>");
    selectText(editor, "Before");
    expect(editor.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: false })).toBe(true);
    const table = tableNodes(editor.state.doc)[0].node;
    table.firstChild?.forEach((cell) => expect(cell.type.name).toBe("tableCell"));
    expect(table.attrs.stickyHeaderRow).toBe(false);
    expect(editor.view.dom.querySelector(".tableWrapper")).toHaveAttribute(
      "data-table-sticky-header-active",
      "false",
    );
  });

  it("checks insertion without mutation and undoes or redoes the table and default together", () => {
    const editor = createEditor("<p>Before</p><p>After</p>");
    selectText(editor, "Before");
    const original = editor.getJSON();
    const initialState = editor.state;
    const onTransaction = vi.fn();
    editor.on("transaction", onTransaction);
    expect(editor.can().insertTable()).toBe(true);
    expect(onTransaction).not.toHaveBeenCalled();
    expect(editor.state).toBe(initialState);
    expect(editor.getJSON()).toEqual(original);
    expect(undoDepth(editor.state)).toBe(0);
    expect(redoDepth(editor.state)).toBe(0);

    expect(editor.commands.insertTable()).toBe(true);
    expect(tableNodes(editor.state.doc)[0].node.attrs.stickyHeaderRow).toBe(true);
    expect(undoDepth(editor.state)).toBe(1);
    expect(editor.commands.undo()).toBe(true);
    expect(editor.getJSON()).toEqual(original);
    expect(editor.commands.redo()).toBe(true);
    expect(tableNodes(editor.state.doc)).toHaveLength(1);
    expect(tableNodes(editor.state.doc)[0].node.attrs.stickyHeaderRow).toBe(true);
    expect(editor.view.dom.querySelector(".tableWrapper")).toHaveAttribute(
      "data-table-sticky-header-active",
      "true",
    );
  });

  it("preserves opting out after creation through JSON, HTML, and Markdown", () => {
    const editor = createEditor("<p>Before</p><p>After</p>");
    selectText(editor, "Before");
    editor.commands.insertTable();
    expect(editor.commands.setTableStickyHeaderRow(false)).toBe(true);
    const json = editor.getJSON();
    expect(collectTables(json)[0].attrs?.stickyHeaderRow).toBe(false);
    const html = editor.getHTML();
    expect(html).not.toContain("data-table-sticky-header-row");
    const markdown = html2md(html);
    expect(markdown).not.toContain("<table");
    for (const content of [html, md2html(markdown)]) {
      const restored = createEditor(content, false);
      expect(tableNodes(restored.state.doc)[0].node.attrs.stickyHeaderRow).toBe(false);
      expect(restored.view.dom.querySelector(".tableWrapper")).toHaveAttribute(
        "data-table-sticky-header-active",
        "false",
      );
    }
    const restoredJsonEditor = createEditor();
    restoredJsonEditor.commands.setContent(json);
    expect(tableNodes(restoredJsonEditor.state.doc)[0].node.attrs.stickyHeaderRow).toBe(false);
  });

  it.each([undefined, false])(
    "keeps legacy JSON with preference %s off when loaded",
    (stickyHeaderRow) => {
      const json = generateJSON(tableHtml(), createScribeSchemaExtensions());
      const table = collectTables(json)[0];
      if (stickyHeaderRow === undefined) {
        delete table.attrs!.stickyHeaderRow;
      } else {
        table.attrs!.stickyHeaderRow = stickyHeaderRow;
      }
      const editor = createEditor("<p>Load content</p>");
      editor.commands.setContent(json);
      expect(tableNodes(editor.state.doc)[0].node.attrs.stickyHeaderRow).toBe(false);
      expect(editor.view.dom.querySelector(".tableWrapper")).toHaveAttribute(
        "data-table-sticky-header-active",
        "false",
      );
    },
  );
});

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
      stickyHeaderRow: false,
    });
    expect(editor.getHTML()).not.toContain("data-table-layout");
    expect(editor.getHTML()).not.toContain("data-table-limit-height");
    expect(editor.getHTML()).not.toContain("data-table-sticky-header");
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

describe("custom table maximum height", () => {
  it("keeps the legacy default unset and exposes the supported pixel range", () => {
    expect(MIN_TABLE_MAX_HEIGHT).toBe(120);
    expect(MAX_TABLE_MAX_HEIGHT).toBe(2000);
    expect(DEFAULT_TABLE_MAX_HEIGHT).toBe(360);
    const editor = createEditor(tableHtml());
    expect(tableNodes(editor.state.doc)[0].node.attrs.maxHeight).toBeNull();
    expect(editor.getHTML()).not.toContain("data-table-max-height");
    expect(editor.getHTML()).not.toContain("--scribe-table-custom-max-height");
    expect(html2md(editor.getHTML())).not.toContain("<table");
  });

  it.each([120, 360, 600, 2000])("accepts a whole-pixel height of %s", (height) => {
    expect(normalizeTableMaxHeight(height)).toBe(height);
    expect(normalizeTableMaxHeight(String(height))).toBe(height);
    const editor = createEditor(tableHtml());
    selectText(editor, "First cell");
    expect(editor.commands.setTableMaxHeight(height)).toBe(true);
    expect(tableNodes(editor.state.doc)[0].node.attrs.maxHeight).toBe(height);
  });

  it.each([
    undefined,
    true,
    false,
    0,
    -120,
    119,
    2001,
    600.5,
    NaN,
    Infinity,
    "",
    " 600 ",
    "600px",
    "600.0",
    "6e2",
    "600; color: red",
    {},
  ])("ignores the invalid stored height %j before presenting it", (height) => {
    expect(normalizeTableMaxHeight(height)).toBeNull();
    const editor = createEditor(tableHtml());
    const json = editor.getJSON();
    collectTables(json)[0].attrs!.maxHeight = height;
    editor.commands.setContent(json);
    const wrapper = editor.view.dom.querySelector<HTMLElement>(".tableWrapper")!;
    expect(wrapper).not.toHaveAttribute("data-table-max-height");
    expect(wrapper.style.getPropertyValue("--scribe-table-custom-max-height")).toBe("");
    expect(editor.getHTML()).not.toContain("data-table-max-height");
    expect(editor.getHTML()).not.toContain("--scribe-table-custom-max-height");
  });

  it.each(["119", "2001", "600.5", "600px", "6e2", "600; color: red"])(
    "normalizes invalid HTML height %s to the unset default",
    (height) => {
      const editor = createEditor(tableHtml(`data-table-max-height="${height}"`));
      expect(tableNodes(editor.state.doc)[0].node.attrs.maxHeight).toBeNull();
      expect(editor.getHTML()).not.toContain("data-table-max-height");
    },
  );

  it.each([undefined, true, false, 119, 2001, 600.5, NaN, Infinity, "600", "600px"])(
    "rejects invalid command input %j without changing the document",
    (height) => {
      const editor = createEditor(tableHtml('data-table-max-height="600"'));
      selectText(editor, "First cell");
      const original = editor.getJSON();
      const historyDepth = undoDepth(editor.state);
      expect(editor.can().setTableMaxHeight(height as number)).toBe(false);
      expect(editor.commands.setTableMaxHeight(height as number)).toBe(false);
      expect(editor.getJSON()).toEqual(original);
      expect(undoDepth(editor.state)).toBe(historyDepth);
    },
  );

  it("changes only the selected table, preserves content and other preferences, and remembers an inactive cap", () => {
    const editor = createEditor(siblingTables);
    const original = editor.state.doc;
    const [first, second] = tableNodes(original);
    selectText(editor, "First cell");
    expect(
      editor
        .chain()
        .setTableLayout("scroll")
        .setTableStickyHeaderRow(true)
        .setTableMaxHeight(600)
        .setTableHeightLimit(true)
        .run(),
    ).toBe(true);
    const [updatedFirst, unchangedSecond] = tableNodes(editor.state.doc);
    expect(updatedFirst.node.attrs).toMatchObject({
      maxHeight: 600,
      limitHeight: true,
      tableLayout: "scroll",
      stickyHeaderRow: true,
    });
    expect(updatedFirst.node.content.eq(first.node.content)).toBe(true);
    expect(updatedFirst.node.firstChild?.firstChild?.attrs.colwidth).toEqual([180]);
    expect(unchangedSecond.node).toBe(second.node);
    expect(editor.state.doc.firstChild).toBe(original.firstChild);
    expect(editor.state.doc.lastChild).toBe(original.lastChild);

    expect(editor.commands.setTableHeightLimit(false)).toBe(true);
    expect(tableNodes(editor.state.doc)[0].node.attrs.maxHeight).toBe(600);
    selectText(editor, "Second cell");
    expect(editor.commands.setTableMaxHeight(240)).toBe(true);
    expect(tableNodes(editor.state.doc)[0].node.attrs.maxHeight).toBe(600);
    expect(tableNodes(editor.state.doc)[1].node.attrs).toMatchObject({
      maxHeight: 240,
      limitHeight: false,
      tableLayout: "auto",
      stickyHeaderRow: false,
    });
    expect(() => editor.state.doc.check()).not.toThrow();
  });

  it("updates and clears native table presentation while preserving the saved override with Limit height off", () => {
    const editor = createEditor(tableHtml());
    selectText(editor, "First cell");
    const wrapper = editor.view.dom.querySelector<HTMLElement>(".tableWrapper")!;
    const table = wrapper.querySelector("table")!;
    expect(editor.commands.setTableMaxHeight(600)).toBe(true);
    expect(wrapper).toHaveAttribute("data-table-max-height", "600");
    expect(table).toHaveAttribute("data-table-max-height", "600");
    expect(wrapper.style.getPropertyValue("--scribe-table-custom-max-height")).toBe("600px");
    expect(wrapper).toHaveAttribute("data-table-limit-height", "false");
    expect(editor.commands.setTableHeightLimit(true)).toBe(true);
    expect(editor.commands.setTableMaxHeight(240)).toBe(true);
    expect(wrapper.style.getPropertyValue("--scribe-table-custom-max-height")).toBe("240px");
    expect(editor.commands.setTableHeightLimit(false)).toBe(true);
    expect(wrapper.style.getPropertyValue("--scribe-table-custom-max-height")).toBe("240px");
    expect(editor.commands.setTableMaxHeight(null)).toBe(true);
    expect(tableNodes(editor.state.doc)[0].node.attrs.maxHeight).toBeNull();
    expect(wrapper.style.getPropertyValue("--scribe-table-custom-max-height")).toBe("");
    expect(wrapper).not.toHaveAttribute("data-table-max-height");
    expect(table).not.toHaveAttribute("data-table-max-height");
    expect(editor.getHTML()).not.toContain("data-table-max-height");
    expect(editor.view.dom.querySelector(".tableWrapper")).toBe(wrapper);
  });

  it("checks availability without dispatching, supports undo and redo, and does not add history for the same value", () => {
    const editor = createEditor(`${tableHtml()}<p>After</p>`);
    selectText(editor, "First cell");
    const initialState = editor.state;
    const onTransaction = vi.fn();
    editor.on("transaction", onTransaction);
    expect(editor.can().setTableMaxHeight(600)).toBe(true);
    expect(editor.can().setTableMaxHeight(null)).toBe(true);
    expect(onTransaction).not.toHaveBeenCalled();
    expect(editor.state).toBe(initialState);
    expect(undoDepth(editor.state)).toBe(0);
    expect(editor.commands.setTableMaxHeight(600)).toBe(true);
    const document = editor.state.doc;
    expect(editor.commands.setTableMaxHeight(600)).toBe(true);
    expect(editor.state.doc).toBe(document);
    expect(undoDepth(editor.state)).toBe(1);
    expect(editor.commands.undo()).toBe(true);
    expect(tableNodes(editor.state.doc)[0].node.attrs.maxHeight).toBeNull();
    expect(editor.commands.redo()).toBe(true);
    expect(tableNodes(editor.state.doc)[0].node.attrs.maxHeight).toBe(600);
  });

  it("supports cell and whole-table selections without disturbing the selection", () => {
    const editor = createEditor(tableHtml());
    const cellPositions: number[] = [];
    editor.state.doc.descendants((node, position) => {
      if (node.type.spec.tableRole === "cell") cellPositions.push(position);
    });
    const selection = CellSelection.create(editor.state.doc, cellPositions[0], cellPositions[1]);
    editor.view.dispatch(editor.state.tr.setSelection(selection));
    expect(editor.commands.setTableMaxHeight(600)).toBe(true);
    expect(editor.state.selection).toBeInstanceOf(CellSelection);
    expect(editor.state.selection.from).toBe(selection.from);
    expect(editor.state.selection.to).toBe(selection.to);
    const [{ position }] = tableNodes(editor.state.doc);
    expect(editor.chain().setNodeSelection(position).setTableMaxHeight(240).run()).toBe(true);
    // The native tableEditing plugin normalizes whole-table selection to cells.
    expect(editor.state.selection).toBeInstanceOf(CellSelection);
    expect((editor.state.selection as CellSelection).isRowSelection()).toBe(true);
    expect((editor.state.selection as CellSelection).isColSelection()).toBe(true);
    expect(tableNodes(editor.state.doc)[0].node.attrs.maxHeight).toBe(240);
  });

  it("rejects commands outside a table and in read-only mode", () => {
    const editor = createEditor(siblingTables);
    selectText(editor, "Before");
    const original = editor.getJSON();
    expect(editor.can().setTableMaxHeight(600)).toBe(false);
    expect(editor.commands.setTableMaxHeight(600)).toBe(false);
    expect(editor.commands.setTableMaxHeight(null)).toBe(false);
    selectText(editor, "First cell");
    editor.setEditable(false);
    expect(editor.can().setTableMaxHeight(600)).toBe(false);
    expect(editor.commands.setTableMaxHeight(600)).toBe(false);
    expect(editor.commands.setTableMaxHeight(null)).toBe(false);
    expect(editor.getJSON()).toEqual(original);
  });

  it.each([false, true])(
    "round-trips the saved maximum with Limit height %s through JSON, HTML, Markdown and read-only presentation",
    (limitHeight) => {
      const editor = createEditor(tableHtml());
      selectText(editor, "First cell");
      editor.commands.setTableMaxHeight(600);
      editor.commands.setTableHeightLimit(limitHeight);
      const json = editor.getJSON();
      const extensions = createScribeSchemaExtensions({ enableUndoRedo: false });
      const schema = getSchema(extensions);
      expect(() => schema.nodeFromJSON(json).check()).not.toThrow();
      const html = generateHTML(json, extensions);
      expect(html).toContain('data-table-max-height="600"');
      expect(html).toContain("--scribe-table-custom-max-height: 600px");
      expect(html).toContain('class="tableWrapper"');
      expect(collectTables(generateJSON(html, extensions))[0]).toEqual(collectTables(json)[0]);
      const markdown = html2md(html);
      expect(markdown).toContain("<table");
      expect(markdown).toContain('data-table-max-height="600"');
      const restored = generateJSON(md2html(markdown), extensions);
      expect(collectTables(restored)[0]).toEqual(collectTables(json)[0]);
      const readOnly = createEditor(md2html(markdown), false);
      const wrapper = readOnly.view.dom.querySelector<HTMLElement>(".tableWrapper")!;
      expect(wrapper).toHaveAttribute("data-table-max-height", "600");
      expect(wrapper).toHaveAttribute("data-table-limit-height", String(limitHeight));
      expect(wrapper.style.getPropertyValue("--scribe-table-custom-max-height")).toBe("600px");
    },
  );
});

describe("sticky table header preference", () => {
  it.each([false, true])(
    "enables with Limit height %s only when the entire first row contains header cells",
    (limitHeight) => {
      const attributes = `data-table-limit-height="${limitHeight}"`;
      const headerless = headerlessTableHtml(attributes);
      const mixedHeader = tableHtml(attributes).replace(
        "<th><p>Notes</p></th>",
        "<td><p>Notes</p></td>",
      );
      for (const content of [headerless, mixedHeader]) {
        const editor = createEditor(content);
        selectText(editor, "First cell");
        const original = editor.getJSON();
        expect(editor.can().setTableStickyHeaderRow(true)).toBe(false);
        expect(editor.commands.setTableStickyHeaderRow(true)).toBe(false);
        expect(editor.getJSON()).toEqual(original);
      }

      const editor = createEditor(tableHtml(attributes));
      selectText(editor, "First cell");
      expect(editor.can().setTableStickyHeaderRow(true)).toBe(true);
      expect(editor.commands.setTableStickyHeaderRow(true)).toBe(true);
      expect(tableNodes(editor.state.doc)[0].node.attrs.stickyHeaderRow).toBe(true);
    },
  );

  it("changes the selected table without changing its content or a sibling table", () => {
    const editor = createEditor(
      `<p>Before</p>${tableHtml("", "First", true)}<p>Between</p>${tableHtml('data-table-limit-height="true"', "Second")}<p>After</p>`,
    );
    const original = editor.state.doc;
    const [first, second] = tableNodes(original);
    selectText(editor, "First cell");
    expect(editor.commands.setTableStickyHeaderRow(true)).toBe(true);
    const [enabledFirst, unchangedSecond] = tableNodes(editor.state.doc);
    expect(enabledFirst.node.attrs.stickyHeaderRow).toBe(true);
    expect(enabledFirst.node.content.eq(first.node.content)).toBe(true);
    expect(enabledFirst.node.firstChild?.firstChild?.attrs.colwidth).toEqual([180]);
    expect(unchangedSecond.node).toBe(second.node);
    expect(editor.state.doc.firstChild).toBe(original.firstChild);
    expect(editor.state.doc.lastChild).toBe(original.lastChild);

    selectText(editor, "Second cell");
    expect(editor.commands.setTableStickyHeaderRow(true)).toBe(true);
    expect(editor.commands.setTableStickyHeaderRow(false)).toBe(true);
    const [retainedFirst, disabledSecond] = tableNodes(editor.state.doc);
    expect(retainedFirst.node).toBe(enabledFirst.node);
    expect(disabledSecond.node.attrs.stickyHeaderRow).toBe(false);
    expect(disabledSecond.node.content.eq(second.node.content)).toBe(true);
  });

  it("checks availability without dispatching or adding undo history, and supports undo and redo", () => {
    const editor = createEditor(`${tableHtml()}<p>After</p>`);
    selectText(editor, "First cell");
    const initialState = editor.state;
    const onTransaction = vi.fn();
    editor.on("transaction", onTransaction);

    expect(editor.can().setTableStickyHeaderRow(true)).toBe(true);
    expect(editor.can().setTableStickyHeaderRow(false)).toBe(true);
    expect(onTransaction).not.toHaveBeenCalled();
    expect(editor.state).toBe(initialState);
    expect(undoDepth(editor.state)).toBe(0);
    expect(redoDepth(editor.state)).toBe(0);

    expect(editor.commands.setTableStickyHeaderRow(true)).toBe(true);
    expect(undoDepth(editor.state)).toBe(1);
    expect(editor.commands.undo()).toBe(true);
    expect(tableNodes(editor.state.doc)[0].node.attrs.stickyHeaderRow).toBe(false);
    expect(editor.commands.redo()).toBe(true);
    expect(tableNodes(editor.state.doc)[0].node.attrs.stickyHeaderRow).toBe(true);
  });

  it("rejects changes outside a table and in read-only mode while retaining a saved preference", () => {
    const editor = createEditor(
      `<p>Before</p>${tableHtml('data-table-sticky-header-row="true"')}<p>After</p>`,
    );
    const original = editor.getJSON();
    selectText(editor, "Before");
    expect(editor.can().setTableStickyHeaderRow(true)).toBe(false);
    expect(editor.commands.setTableStickyHeaderRow(false)).toBe(false);
    selectText(editor, "First cell");
    editor.setEditable(false);
    expect(editor.can().setTableStickyHeaderRow(true)).toBe(false);
    expect(editor.can().setTableStickyHeaderRow(false)).toBe(false);
    expect(editor.commands.setTableStickyHeaderRow(false)).toBe(false);
    expect(editor.getJSON()).toEqual(original);
    expect(editor.view.dom.querySelector(".tableWrapper")).toHaveAttribute(
      "data-table-sticky-header-active",
      "true",
    );
  });

  it("stays active when the height limit changes and retains the preference while a header row is removed", () => {
    const editor = createEditor(tableHtml());
    selectText(editor, "First cell");
    editor.commands.setTableStickyHeaderRow(true);
    const assertSticky = (active: boolean) => {
      expect(tableNodes(editor.state.doc)[0].node.attrs.stickyHeaderRow).toBe(true);
      expect(editor.view.dom.querySelector(".tableWrapper")).toHaveAttribute(
        "data-table-sticky-header-active",
        String(active),
      );
    };
    assertSticky(true);
    expect(editor.commands.setTableHeightLimit(true)).toBe(true);
    assertSticky(true);
    expect(editor.commands.setTableHeightLimit(false)).toBe(true);
    assertSticky(true);
    expect(editor.commands.toggleHeaderRow()).toBe(true);
    assertSticky(false);
    expect(editor.commands.setTableHeightLimit(true)).toBe(true);
    assertSticky(false);
    expect(editor.commands.toggleHeaderRow()).toBe(true);
    assertSticky(true);
    expect(editor.commands.setTableHeightLimit(false)).toBe(true);
    assertSticky(true);
  });

  it.each([
    ["no height limit", tableHtml('data-table-sticky-header-row="true"'), true],
    [
      "no header row",
      headerlessTableHtml('data-table-limit-height="true" data-table-sticky-header-row="true"'),
      false,
    ],
  ] as const)("can disable a saved preference with %s", (_description, content, canEnable) => {
    const editor = createEditor(content);
    selectText(editor, "First cell");
    expect(editor.can().setTableStickyHeaderRow(true)).toBe(canEnable);
    expect(editor.can().setTableStickyHeaderRow(false)).toBe(true);
    expect(editor.commands.setTableStickyHeaderRow(false)).toBe(true);
    expect(tableNodes(editor.state.doc)[0].node.attrs.stickyHeaderRow).toBe(false);
  });

  it.each([
    [
      "active",
      tableHtml(
        'data-table-limit-height="true" data-table-sticky-header-row="true"',
        "First",
        true,
      ),
      true,
    ],
    ["active without a height limit", tableHtml('data-table-sticky-header-row="true"'), true],
    [
      "inactive without a header row",
      headerlessTableHtml('data-table-limit-height="true" data-table-sticky-header-row="true"'),
      false,
    ],
  ])(
    "round-trips the %s preference through JSON, HTML, Markdown, and read-only rendering",
    (_description, content, active) => {
      const editor = createEditor(content);
      const json = editor.getJSON();
      const extensions = createScribeSchemaExtensions({ enableUndoRedo: false });
      const schema = getSchema(extensions);
      expect(() => schema.nodeFromJSON(json).check()).not.toThrow();
      const html = generateHTML(json, extensions);
      expect(html).toContain('data-table-sticky-header-row="true"');
      expect(collectTables(generateJSON(html, extensions))[0]).toEqual(collectTables(json)[0]);
      const markdown = html2md(html);
      expect(markdown).toContain("<table");
      expect(markdown).toContain('data-table-sticky-header-row="true"');
      const restored = generateJSON(md2html(markdown), extensions);
      expect(collectTables(restored)[0]).toEqual(collectTables(json)[0]);
      expect(collectTables(restored)[0].attrs).not.toHaveProperty("stickyHeaderActive");
      const readOnlyEditor = createEditor(md2html(markdown), false);
      expect(readOnlyEditor.view.dom.querySelector(".tableWrapper")).toHaveAttribute(
        "data-table-sticky-header-active",
        String(active),
      );
      expect(tableNodes(readOnlyEditor.state.doc)[0].node.content.toJSON()).toEqual(
        tableNodes(editor.state.doc)[0].node.content.toJSON(),
      );
    },
  );

  it.each(["false", "unknown"])(
    "treats %s as an unset HTML preference and derives active state from the document",
    (value) => {
      const editor = createEditor(
        tableHtml(
          `data-table-sticky-header-row="${value}" data-table-limit-height="true" data-table-sticky-header-active="true"`,
        ),
      );
      expect(tableNodes(editor.state.doc)[0].node.attrs.stickyHeaderRow).toBe(false);
      expect(editor.view.dom.querySelector(".tableWrapper")).toHaveAttribute(
        "data-table-sticky-header-active",
        "false",
      );
    },
  );
});
