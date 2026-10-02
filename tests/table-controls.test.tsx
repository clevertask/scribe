import { Theme } from "@radix-ui/themes";
import { Editor as CoreEditor } from "@tiptap/core";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import type { Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { Scribe, type ScribeRef } from "../lib/main";
import { getSelectionTableContext } from "../lib/components/Menu/tableBubbleMenuPlugin";
import {
  ScribeTable,
  selectionHasTableAncestor,
} from "../lib/components/Scribe/extension/resizable-table";
import { getSuggestionItems } from "../lib/components/Scribe/extension/slashCommand/items";

const TABLE_CONTENT = `
  <p>Before</p>
  <table>
    <tbody>
      <tr><th>Header 1</th><th>Header 2</th><th>Header 3</th></tr>
      <tr><td>Cell 1</td><td>Cell 2</td><td>Cell 3</td></tr>
      <tr><td>Cell 4</td><td>Cell 5</td><td>Cell 6</td></tr>
    </tbody>
  </table>
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
    if (position !== undefined || !node.isText) {
      return;
    }

    const offset = node.text?.indexOf(text) ?? -1;

    if (offset >= 0) {
      position = nodePosition + offset;
    }
  });

  if (position === undefined) {
    throw new Error(`Expected to find text: ${text}`);
  }

  return position;
};

const findTable = (editor: Editor) => {
  let table: { node: ProseMirrorNode; position: number } | undefined;

  editor.state.doc.descendants((node, position) => {
    if (!table && node.type.name === "table") {
      table = { node, position };
      return false;
    }
  });

  return table;
};

const countTables = (editor: Editor) => {
  let count = 0;

  editor.state.doc.descendants((node) => {
    if (node.type.name === "table") {
      count += 1;
    }
  });

  return count;
};

const selectText = (editor: Editor, text: string) => {
  act(() => {
    editor.commands.setTextSelection(findTextPosition(editor, text));
    editor.view.focus();
  });
};

const openTableLayout = async () => {
  const toolbar = await screen.findByRole("toolbar", { name: "Table controls" });
  fireEvent.pointerDown(within(toolbar).getByRole("button", { name: "Table layout" }), {
    button: 0,
    ctrlKey: false,
  });
  return screen.findByRole("menu");
};

const closeTableLayout = async (editor: Editor) => {
  fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  await waitFor(() => expect(editor.view.hasFocus()).toBe(true));
};

const openTableHeight = async () => {
  await openTableLayout();
  fireEvent.click(screen.getByRole("menuitem", { name: "Maximum height…" }));
  return screen.findByRole("dialog", { name: "Table height" });
};

describe("Scribe table controls", () => {
  it("inserts a headed table with sticky headers by default and preserves an explicit opt-out", async () => {
    const editor = renderScribe("<p>/table</p>");
    const tableItem = getSuggestionItems({ query: "table", editor }).find(
      (item) => item.title === "Table",
    );

    if (!tableItem) {
      throw new Error("Expected the default Table slash command");
    }

    act(() => {
      tableItem.command({
        editor,
        range: { from: 1, to: 7 },
        props: tableItem,
      });
    });

    const table = findTable(editor)?.node;

    expect(table).toBeDefined();
    expect(table?.childCount).toBe(3);
    expect(table?.firstChild?.childCount).toBe(3);
    table?.firstChild?.forEach((cell) => expect(cell.type.name).toBe("tableHeader"));
    expect(table?.attrs).toMatchObject({ stickyHeaderRow: true, limitHeight: false });
    await openTableLayout();
    const stickyOption = screen.getByRole("menuitemcheckbox", { name: "Sticky header row" });
    expect(stickyOption).toHaveAttribute("aria-checked", "true");
    expect(stickyOption).not.toHaveAttribute("aria-disabled");
    expect(screen.getByRole("menuitemcheckbox", { name: "Limit height" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    fireEvent.click(stickyOption);
    await waitFor(() => {
      expect(findTable(editor)?.node.attrs.stickyHeaderRow).toBe(false);
      expect(editor.view.hasFocus()).toBe(true);
    });

    const savedHtml = editor.getHTML();
    const cellPosition = editor.state.selection.from;
    expect(savedHtml).not.toContain('data-table-sticky-header-row="true"');
    act(() => {
      editor.commands.setContent(savedHtml);
      editor.commands.setTextSelection(cellPosition);
      editor.view.focus();
    });
    await openTableLayout();
    const restoredOption = screen.getByRole("menuitemcheckbox", { name: "Sticky header row" });
    expect(restoredOption).toHaveAttribute("aria-checked", "false");
    expect(restoredOption).not.toHaveAttribute("aria-disabled");
    expect(findTable(editor)?.node.attrs).toMatchObject({
      stickyHeaderRow: false,
      limitHeight: false,
    });
  });

  it("hides the Table slash command inside a table and keeps it available outside", () => {
    const editor = renderScribe(TABLE_CONTENT);

    selectText(editor, "Cell 1");

    expect(
      getSuggestionItems({ query: "table", editor }).some((item) => item.title === "Table"),
    ).toBe(false);

    selectText(editor, "Before");

    expect(
      getSuggestionItems({ query: "table", editor }).some((item) => item.title === "Table"),
    ).toBe(true);
  });

  it("rejects direct table insertion inside a table and permits it outside", () => {
    const editor = renderScribe(TABLE_CONTENT);
    const initialDocument = editor.getJSON();

    selectText(editor, "Cell 1");

    expect(editor.can().insertTable()).toBe(false);
    expect(editor.commands.insertTable()).toBe(false);
    expect(editor.getJSON()).toEqual(initialDocument);
    expect(countTables(editor)).toBe(1);

    selectText(editor, "Before");

    expect(editor.can().insertTable()).toBe(true);
    expect(editor.commands.insertTable()).toBe(true);
    expect(countTables(editor)).toBe(2);
  });

  it("detects a table ancestor at either selection endpoint", () => {
    const editor = renderScribe(TABLE_CONTENT);
    const beforePosition = findTextPosition(editor, "Before");
    const headerPosition = findTextPosition(editor, "Header 1");
    const cellPosition = findTextPosition(editor, "Cell 6");
    const afterPosition = findTextPosition(editor, "After");

    for (const [from, to] of [
      [beforePosition, headerPosition],
      [cellPosition, afterPosition],
    ]) {
      const selection = TextSelection.create(editor.state.doc, from, to);

      expect(selectionHasTableAncestor(selection)).toBe(true);
    }
  });

  it("shows table-scoped actions and applies row, column, header, and delete commands", async () => {
    const editor = renderScribe(TABLE_CONTENT);

    selectText(editor, "Header 1");

    const toolbar = await screen.findByRole("toolbar", { name: "Table controls" });
    const controls = within(toolbar);
    const controlNames = [
      "Add row above",
      "Add row below",
      "Delete row",
      "Add column before",
      "Add column after",
      "Delete column",
      "Toggle header row",
      "Delete table",
    ];

    controlNames.forEach((name) => expect(controls.getByRole("button", { name })).toBeEnabled());
    expect(toolbar.closest("[data-scribe-popup-root]")).not.toBeNull();
    expect(controls.getByRole("button", { name: "Toggle header row" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    fireEvent.click(controls.getByRole("button", { name: "Toggle header row" }));

    await waitFor(() => {
      findTable(editor)?.node.firstChild?.forEach((cell) =>
        expect(cell.type.name).toBe("tableCell"),
      );
      expect(controls.getByRole("button", { name: "Toggle header row" })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
    });

    fireEvent.click(controls.getByRole("button", { name: "Toggle header row" }));

    await waitFor(() => {
      findTable(editor)?.node.firstChild?.forEach((cell) =>
        expect(cell.type.name).toBe("tableHeader"),
      );
    });

    fireEvent.click(controls.getByRole("button", { name: "Add row above" }));
    expect(findTable(editor)?.node.childCount).toBe(4);

    fireEvent.click(controls.getByRole("button", { name: "Delete row" }));
    expect(findTable(editor)?.node.childCount).toBe(3);

    fireEvent.click(controls.getByRole("button", { name: "Add row below" }));
    expect(findTable(editor)?.node.childCount).toBe(4);

    fireEvent.click(controls.getByRole("button", { name: "Delete row" }));
    expect(findTable(editor)?.node.childCount).toBe(3);

    fireEvent.click(controls.getByRole("button", { name: "Add column before" }));
    expect(findTable(editor)?.node.firstChild?.childCount).toBe(4);

    fireEvent.click(controls.getByRole("button", { name: "Delete column" }));
    expect(findTable(editor)?.node.firstChild?.childCount).toBe(3);

    fireEvent.click(controls.getByRole("button", { name: "Add column after" }));
    expect(findTable(editor)?.node.firstChild?.childCount).toBe(4);

    fireEvent.click(controls.getByRole("button", { name: "Delete column" }));
    expect(findTable(editor)?.node.firstChild?.childCount).toBe(3);

    fireEvent.click(controls.getByRole("button", { name: "Delete table" }));

    await waitFor(() => {
      expect(findTable(editor)).toBeUndefined();
      expect(screen.queryByRole("toolbar", { name: "Table controls" })).not.toBeInTheDocument();
    });
  });

  it("only resolves a table when the entire selection stays inside the same table", () => {
    const editor = renderScribe(TABLE_CONTENT);
    const headerPosition = findTextPosition(editor, "Header 1");
    const cellPosition = findTextPosition(editor, "Cell 6");
    const beforePosition = findTextPosition(editor, "Before");

    act(() => {
      editor.view.dispatch(
        editor.state.tr.setSelection(
          TextSelection.create(editor.state.doc, headerPosition, cellPosition),
        ),
      );
    });

    expect(getSelectionTableContext(editor.state)?.position).toBe(findTable(editor)?.position);

    act(() => {
      editor.view.dispatch(
        editor.state.tr.setSelection(
          TextSelection.create(editor.state.doc, beforePosition, headerPosition),
        ),
      );
    });

    expect(getSelectionTableContext(editor.state)).toBeNull();
  });

  it("waits for editor focus and hides after the selection leaves the table", async () => {
    const editor = renderScribe(TABLE_CONTENT);

    act(() => {
      editor.commands.setTextSelection(findTextPosition(editor, "Header 1"));
    });

    expect(screen.queryByRole("toolbar", { name: "Table controls" })).not.toBeInTheDocument();

    act(() => {
      editor.view.focus();
    });

    expect(await screen.findByRole("toolbar", { name: "Table controls" })).toBeInTheDocument();

    act(() => {
      editor.commands.setTextSelection(findTextPosition(editor, "Before"));
    });

    await waitFor(() => {
      expect(screen.queryByRole("toolbar", { name: "Table controls" })).not.toBeInTheDocument();
    });
  });

  it("moves keyboard focus into and back out of the table controls", async () => {
    const editor = renderScribe(TABLE_CONTENT);

    selectText(editor, "Header 1");

    const toolbar = await screen.findByRole("toolbar", { name: "Table controls" });
    const firstControl = within(toolbar).getByRole("button", { name: "Add row above" });
    const secondControl = within(toolbar).getByRole("button", { name: "Add row below" });

    fireEvent.keyDown(editor.view.dom, { key: "F10", altKey: true });
    expect(firstControl).toHaveFocus();

    fireEvent.keyDown(toolbar, { key: "ArrowRight" });
    expect(secondControl).toHaveFocus();

    fireEvent.keyDown(toolbar, { key: "Escape" });
    await waitFor(() => expect(editor.view.hasFocus()).toBe(true));
  });

  it("does not render table controls for a read-only editor", () => {
    const editor = renderScribe(TABLE_CONTENT, false);

    act(() => {
      editor.commands.setTextSelection(findTextPosition(editor, "Header 1"));
    });

    expect(screen.queryByRole("toolbar", { name: "Table controls" })).not.toBeInTheDocument();
  });

  it("offers explicit layout and height choices for the active table", async () => {
    const editor = renderScribe(TABLE_CONTENT);
    selectText(editor, "Cell 1");
    const toolbar = await screen.findByRole("toolbar", { name: "Table controls" });
    const layoutTrigger = within(toolbar).getByRole("button", { name: "Table layout" });
    fireEvent.pointerDown(layoutTrigger, { button: 0, ctrlKey: false });

    expect(await screen.findByRole("menuitemradio", { name: "Auto", exact: true })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("menuitemcheckbox", { name: "Limit height" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(screen.getByRole("menuitemcheckbox", { name: "Sticky header row" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Scroll horizontally" }));
    await waitFor(() => {
      expect(findTable(editor)?.node.attrs.tableLayout).toBe("scroll");
      expect(editor.view.hasFocus()).toBe(true);
    });

    fireEvent.pointerDown(layoutTrigger, { button: 0, ctrlKey: false });
    expect(
      await screen.findByRole("menuitemradio", { name: "Scroll horizontally" }),
    ).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Limit height" }));
    await waitFor(() => {
      expect(findTable(editor)?.node.attrs).toMatchObject({
        tableLayout: "scroll",
        limitHeight: true,
      });
      expect(editor.view.hasFocus()).toBe(true);
    });
  });

  it("toggles sticky headers independently of Limit height", async () => {
    const editor = renderScribe(TABLE_CONTENT);
    selectText(editor, "Cell 1");
    await openTableLayout();

    const stickyOption = screen.getByRole("menuitemcheckbox", { name: "Sticky header row" });
    expect(stickyOption).not.toHaveAttribute("aria-disabled");
    expect(stickyOption).not.toHaveAttribute("aria-describedby");
    fireEvent.click(stickyOption);
    await waitFor(() => {
      expect(findTable(editor)?.node.attrs).toMatchObject({
        limitHeight: false,
        stickyHeaderRow: true,
      });
      expect(editor.view.hasFocus()).toBe(true);
    });

    await openTableLayout();
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Limit height" }));
    await waitFor(() => expect(editor.view.hasFocus()).toBe(true));
    await openTableLayout();
    const enabledOption = screen.getByRole("menuitemcheckbox", { name: "Sticky header row" });
    expect(enabledOption).toHaveAttribute("aria-checked", "true");
    expect(enabledOption).not.toHaveAttribute("aria-disabled");
    expect(findTable(editor)?.node.attrs).toMatchObject({
      limitHeight: true,
      stickyHeaderRow: true,
    });

    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Limit height" }));
    await waitFor(() => expect(editor.view.hasFocus()).toBe(true));
    await openTableLayout();
    const unlimitedOption = screen.getByRole("menuitemcheckbox", { name: "Sticky header row" });
    expect(unlimitedOption).toHaveAttribute("aria-checked", "true");
    expect(unlimitedOption).not.toHaveAttribute("aria-disabled");
    fireEvent.click(unlimitedOption);
    await waitFor(() => {
      expect(findTable(editor)?.node.attrs).toMatchObject({
        limitHeight: false,
        stickyHeaderRow: false,
      });
      expect(editor.view.hasFocus()).toBe(true);
    });
  });

  it("requires a real top header row and keeps mixed rows unchanged", async () => {
    const editor = renderScribe(`
      <table><tbody>
        <tr><th>Partial heading</th><td>Ordinary first-row cell</td></tr>
        <tr><td>Body cell</td><td>Other body cell</td></tr>
      </tbody></table>
    `);
    selectText(editor, "Body cell");
    await openTableLayout();

    const stickyOption = screen.getByRole("menuitemcheckbox", { name: "Sticky header row" });
    expect(stickyOption).toHaveAttribute("aria-disabled", "true");
    expect(stickyOption).toHaveAccessibleDescription("Requires a header row.");
    fireEvent.click(stickyOption);
    expect(findTable(editor)?.node.attrs.stickyHeaderRow).toBe(false);
    expect(findTable(editor)?.node.firstChild?.child(0).type.name).toBe("tableHeader");
    expect(findTable(editor)?.node.firstChild?.child(1).type.name).toBe("tableCell");
  });

  it("retains a checked sticky preference when the header row is removed and restored", async () => {
    const editor = renderScribe(
      TABLE_CONTENT.replace("<table>", '<table data-table-sticky-header-row="true">'),
    );
    selectText(editor, "Header 1");
    await openTableLayout();
    expect(screen.getByRole("menuitemcheckbox", { name: "Sticky header row" })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    await closeTableLayout(editor);
    const toolbar = await screen.findByRole("toolbar", { name: "Table controls" });
    fireEvent.click(within(toolbar).getByRole("button", { name: "Toggle header row" }));
    await openTableLayout();
    const headerDisabledOption = screen.getByRole("menuitemcheckbox", {
      name: "Sticky header row",
    });
    expect(headerDisabledOption).toHaveAttribute("aria-checked", "true");
    expect(headerDisabledOption).toHaveAttribute("aria-disabled", "true");
    expect(headerDisabledOption).toHaveAccessibleDescription("Requires a header row.");
    fireEvent.click(headerDisabledOption);
    expect(findTable(editor)?.node.attrs.stickyHeaderRow).toBe(true);
    await closeTableLayout(editor);

    fireEvent.click(within(toolbar).getByRole("button", { name: "Toggle header row" }));
    await openTableLayout();
    const restoredOption = screen.getByRole("menuitemcheckbox", { name: "Sticky header row" });
    expect(restoredOption).toHaveAttribute("aria-checked", "true");
    expect(restoredOption).not.toHaveAttribute("aria-disabled");
    expect(findTable(editor)?.node.attrs.limitHeight).toBe(false);
  });

  it("supports keyboard toggling sticky headers and returns focus to the active cell", async () => {
    const editor = renderScribe(TABLE_CONTENT);
    selectText(editor, "Cell 1");
    const selectionBefore = editor.state.selection.toJSON();
    const toolbar = await screen.findByRole("toolbar", { name: "Table controls" });
    const layoutTrigger = within(toolbar).getByRole("button", { name: "Table layout" });

    fireEvent.keyDown(editor.view.dom, { key: "F10", altKey: true });
    fireEvent.keyDown(toolbar, { key: "End" });
    fireEvent.keyDown(toolbar, { key: "ArrowLeft" });
    expect(layoutTrigger).toHaveFocus();
    fireEvent.keyDown(layoutTrigger, { key: "ArrowDown" });
    const menu = await screen.findByRole("menu");
    fireEvent.keyDown(menu, { key: "End" });
    const stickyOption = screen.getByRole("menuitemcheckbox", { name: "Sticky header row" });
    await waitFor(() => expect(stickyOption).toHaveFocus());
    fireEvent.keyDown(stickyOption, { key: "Enter" });

    await waitFor(() => {
      expect(findTable(editor)?.node.attrs.stickyHeaderRow).toBe(true);
      expect(editor.view.hasFocus()).toBe(true);
    });
    expect(editor.state.selection.toJSON()).toEqual(selectionBefore);
    await openTableLayout();
    await closeTableLayout(editor);
    await waitFor(() => expect(editor.view.hasFocus()).toBe(true));
    expect(editor.state.selection.toJSON()).toEqual(selectionBefore);
  });

  it("reads and changes only the selected table's sticky preference", async () => {
    const editor = renderScribe(`
      <table data-table-sticky-header-row="true"><tbody>
        <tr><th>First heading</th></tr><tr><td>First body</td></tr>
      </tbody></table>
      <p>Between tables</p>
      <table data-table-limit-height="true"><tbody>
        <tr><th>Second heading</th></tr><tr><td>Second body</td></tr>
      </tbody></table>
    `);
    selectText(editor, "First body");
    const firstTableBefore = findTable(editor)?.node.toJSON();
    await openTableLayout();
    expect(screen.getByRole("menuitemcheckbox", { name: "Sticky header row" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await closeTableLayout(editor);

    selectText(editor, "Second body");
    await openTableLayout();
    const secondOption = screen.getByRole("menuitemcheckbox", { name: "Sticky header row" });
    expect(secondOption).toHaveAttribute("aria-checked", "false");
    fireEvent.click(secondOption);
    await waitFor(() => {
      expect(getSelectionTableContext(editor.state)?.node.attrs.stickyHeaderRow).toBe(true);
      expect(editor.view.hasFocus()).toBe(true);
    });
    expect(findTable(editor)?.node.toJSON()).toEqual(firstTableBefore);
  });

  it("disables the sticky option if the editor becomes read-only", async () => {
    const editor = renderScribe(TABLE_CONTENT);
    selectText(editor, "Cell 1");
    await openTableLayout();
    act(() => editor.setEditable(false));

    const stickyOption = screen.getByRole("menuitemcheckbox", { name: "Sticky header row" });
    await waitFor(() => expect(stickyOption).toHaveAttribute("aria-disabled", "true"));
    fireEvent.click(stickyOption);
    expect(findTable(editor)?.node.attrs.stickyHeaderRow).toBe(false);
  });

  it("keeps existing layout choices available when an external editor lacks optional table settings", async () => {
    const LegacyTable = ScribeTable.extend({
      addCommands() {
        const commands = { ...this.parent?.() };
        delete commands.setTableStickyHeaderRow;
        delete commands.setTableMaxHeight;
        return commands;
      },
    });
    const externalEditor = new CoreEditor({
      content: TABLE_CONTENT,
      editable: true,
      extensions: [StarterKit, LegacyTable, TableRow, TableHeader, TableCell],
    });
    liveEditors.add(externalEditor);
    render(
      <Theme>
        <Scribe externalEditor={externalEditor} editable showBarMenu={false} />
      </Theme>,
    );
    selectText(externalEditor, "Cell 1");
    await openTableLayout();

    expect(screen.getByRole("menuitemcheckbox", { name: "Limit height" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "Fit to width" })).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitemcheckbox", { name: "Sticky header row" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Maximum height…" })).not.toBeInTheDocument();
  });

  it("reads checked options from each table after moving the selection", async () => {
    const editor = renderScribe(`
      <table data-table-layout="fit" data-table-limit-height="true"><tbody><tr><td><p>Fit table</p></td></tr></tbody></table>
      <p>Between tables</p>
      <table data-table-layout="scroll"><tbody><tr><td><p>Scroll table</p></td></tr></tbody></table>
    `);
    selectText(editor, "Fit table");
    const toolbar = await screen.findByRole("toolbar", { name: "Table controls" });
    fireEvent.pointerDown(within(toolbar).getByRole("button", { name: "Table layout" }), {
      button: 0,
      ctrlKey: false,
    });
    expect(await screen.findByRole("menuitemradio", { name: "Fit to width" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("menuitemcheckbox", { name: "Limit height" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());

    selectText(editor, "Scroll table");
    const nextToolbar = await screen.findByRole("toolbar", { name: "Table controls" });
    fireEvent.pointerDown(within(nextToolbar).getByRole("button", { name: "Table layout" }), {
      button: 0,
      ctrlKey: false,
    });
    expect(
      await screen.findByRole("menuitemradio", { name: "Scroll horizontally" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("menuitemradio", { name: "Fit to width" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(screen.getByRole("menuitemcheckbox", { name: "Limit height" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    await waitFor(() => expect(editor.view.hasFocus()).toBe(true));
    selectText(editor, "Between tables");
    await waitFor(() =>
      expect(screen.queryByRole("toolbar", { name: "Table controls" })).not.toBeInTheDocument(),
    );
  });

  it("applies a complete custom-height draft with Enter without enabling the height limit", async () => {
    const editor = renderScribe(TABLE_CONTENT);
    selectText(editor, "Cell 1");
    const initialDocument = editor.getJSON();
    const initialSelection = editor.state.selection.toJSON();
    await openTableHeight();
    const field = screen.getByRole("textbox", { name: "Maximum height (px)" });
    await waitFor(() => expect(field).toHaveFocus());
    expect(field).toHaveValue("");
    expect(field).toHaveAttribute("placeholder", "Editor default");
    fireEvent.change(field, { target: { value: "480" } });
    expect(editor.getJSON()).toEqual(initialDocument);
    fireEvent.keyDown(field, { key: "Enter" });

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(editor.view.hasFocus()).toBe(true);
    });
    expect(findTable(editor)?.node.attrs).toMatchObject({ maxHeight: 480, limitHeight: false });
    expect(editor.state.selection.toJSON()).toEqual(initialSelection);
  });

  it("reports invalid height drafts inline and cancels them without changing the document", async () => {
    const editor = renderScribe(TABLE_CONTENT);
    selectText(editor, "Cell 1");
    const initialDocument = editor.getJSON();
    const initialSelection = editor.state.selection.toJSON();
    const dialog = await openTableHeight();
    const field = screen.getByRole("textbox", { name: "Maximum height (px)" });

    for (const value of ["", "119", "2001", "240.5", "1e3"]) {
      fireEvent.change(field, { target: { value } });
      fireEvent.click(screen.getByRole("button", { name: "Apply", exact: true }));
      expect(screen.getByRole("alert")).toHaveTextContent("Enter a whole number from 120 to 2000.");
      expect(field).toHaveAttribute("aria-invalid", "true");
      expect(field).toHaveAccessibleDescription(expect.stringContaining("Enter a whole number"));
      expect(editor.getJSON()).toEqual(initialDocument);
    }

    fireEvent.change(field, { target: { value: "520" } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(editor.view.hasFocus()).toBe(true);
    });
    expect(editor.getJSON()).toEqual(initialDocument);
    expect(editor.state.selection.toJSON()).toEqual(initialSelection);
  });

  it("preserves a whole-table selection after changing the maximum height", async () => {
    const editor = renderScribe(TABLE_CONTENT);
    const position = findTable(editor)?.position;
    if (position === undefined) throw new Error("Expected an existing table");
    act(() => {
      editor.commands.setNodeSelection(position);
      editor.view.focus();
    });
    const initialSelection = editor.state.selection.toJSON();
    await openTableHeight();
    fireEvent.change(screen.getByRole("textbox", { name: "Maximum height (px)" }), {
      target: { value: "400" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply", exact: true }));
    await waitFor(() => expect(editor.view.hasFocus()).toBe(true));
    expect(editor.state.selection.toJSON()).toEqual(initialSelection);
    expect(findTable(editor)?.node.attrs.maxHeight).toBe(400);
  });

  it("clears only the custom height and follows the host default without hardcoding it in the field", async () => {
    const editor = renderScribe(
      TABLE_CONTENT.replace(
        "<table>",
        '<table data-table-max-height="420" data-table-limit-height="true">',
      ),
    );
    const root = editor.view.dom.closest<HTMLElement>("[data-scribe-root]");
    root?.style.setProperty("--scribe-table-max-height", "520px");
    selectText(editor, "Cell 1");
    await openTableHeight();
    expect(screen.getByRole("textbox", { name: "Maximum height (px)" })).toHaveValue("420");
    fireEvent.click(screen.getByRole("button", { name: "Use default", exact: true }));
    await waitFor(() => expect(editor.view.hasFocus()).toBe(true));
    expect(findTable(editor)?.node.attrs).toMatchObject({ maxHeight: null, limitHeight: true });
    expect(root?.style.getPropertyValue("--scribe-table-max-height")).toBe("520px");

    const dialog = await openTableHeight();
    expect(screen.getByRole("textbox", { name: "Maximum height (px)" })).toHaveValue("");
    expect(dialog).not.toHaveTextContent("360");
    expect(dialog).toHaveTextContent("configured height");
  });

  it("reads and updates only the selected table's custom height", async () => {
    const editor = renderScribe(`
      <table data-table-max-height="240"><tbody><tr><th>First heading</th></tr><tr><td>First body</td></tr></tbody></table>
      <p>Between tables</p>
      <table data-table-max-height="480"><tbody><tr><th>Second heading</th></tr><tr><td>Second body</td></tr></tbody></table>
    `);
    selectText(editor, "First body");
    await openTableHeight();
    const firstField = screen.getByRole("textbox", { name: "Maximum height (px)" });
    expect(firstField).toHaveValue("240");
    fireEvent.change(firstField, { target: { value: "320" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply", exact: true }));
    await waitFor(() => expect(editor.view.hasFocus()).toBe(true));

    selectText(editor, "Second body");
    await openTableHeight();
    expect(screen.getByRole("textbox", { name: "Maximum height (px)" })).toHaveValue("480");
    fireEvent.click(screen.getByRole("button", { name: "Use default", exact: true }));
    await waitFor(() => expect(editor.view.hasFocus()).toBe(true));
    expect(getSelectionTableContext(editor.state)?.node.attrs.maxHeight).toBeNull();
    expect(findTable(editor)?.node.attrs.maxHeight).toBe(320);
  });

  it("keeps the active cell mapped through unrelated edits while a height draft is open", async () => {
    const editor = renderScribe(TABLE_CONTENT);
    selectText(editor, "Cell 1");
    const initialPosition = editor.state.selection.from;
    await openTableHeight();
    const field = screen.getByRole("textbox", { name: "Maximum height (px)" });
    fireEvent.change(field, { target: { value: "440" } });
    act(() => editor.view.dispatch(editor.state.tr.insertText("Prefix ", 1)));
    expect(screen.getByRole("dialog", { name: "Table height" })).toBeInTheDocument();
    expect(field).toHaveValue("440");
    fireEvent.click(screen.getByRole("button", { name: "Apply", exact: true }));
    await waitFor(() => expect(editor.view.hasFocus()).toBe(true));
    expect(editor.state.selection.from).toBe(initialPosition + "Prefix ".length);
    expect(getSelectionTableContext(editor.state)?.node.attrs.maxHeight).toBe(440);
  });

  it.each(["selection changed", "table removed", "read-only"])(
    "closes an unsaved height draft safely when the editor becomes %s",
    async (change) => {
      const editor = renderScribe(TABLE_CONTENT);
      selectText(editor, "Cell 1");
      await openTableHeight();
      fireEvent.change(screen.getByRole("textbox", { name: "Maximum height (px)" }), {
        target: { value: "600" },
      });
      act(() => {
        if (change === "selection changed") {
          editor.commands.setTextSelection(findTextPosition(editor, "Cell 2"));
        } else if (change === "table removed") {
          editor.commands.deleteTable();
        } else {
          editor.setEditable(false);
        }
      });
      const selectionAfter = editor.state.selection.toJSON();
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(editor.state.selection.toJSON()).toEqual(selectionAfter);
      if (change !== "table removed") expect(findTable(editor)?.node.attrs.maxHeight).toBeNull();
    },
  );

  it("closes an unsaved height draft when the caller destroys the editor", async () => {
    const editor = renderScribe(TABLE_CONTENT);
    selectText(editor, "Cell 1");
    await openTableHeight();
    fireEvent.change(screen.getByRole("textbox", { name: "Maximum height (px)" }), {
      target: { value: "600" },
    });
    act(() => editor.destroy());
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it.each(["adjacent table", "replacement table"])(
    "does not apply a stale draft to an %s after the original table is removed",
    async (replacement) => {
      const editor = renderScribe(`
        <table><tbody><tr><th>Original heading</th></tr><tr><td>Original body</td></tr></tbody></table>
        ${replacement === "adjacent table" ? '<table data-table-max-height="280"><tbody><tr><th>Other heading</th></tr><tr><td>Other body</td></tr></tbody></table>' : ""}
      `);
      selectText(editor, "Original body");
      const original = findTable(editor);
      if (!original) throw new Error("Expected the original table");
      await openTableHeight();
      fireEvent.change(screen.getByRole("textbox", { name: "Maximum height (px)" }), {
        target: { value: "640" },
      });
      const apply = screen.getByRole("button", { name: "Apply", exact: true });
      let documentAfterRemoval: ReturnType<Editor["getJSON"]> | undefined;
      act(() => {
        if (replacement === "adjacent table") {
          editor.commands.deleteTable();
        } else {
          editor.commands.insertContentAt(
            { from: original.position, to: original.position + original.node.nodeSize },
            '<table data-table-max-height="280"><tbody><tr><th>Replacement heading</th></tr><tr><td>Replacement body</td></tr></tbody></table>',
          );
        }
        documentAfterRemoval = editor.getJSON();
        // Exercise the stale button before React removes the invalidated dialog.
        fireEvent.click(apply);
      });
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(editor.getJSON()).toEqual(documentAfterRemoval);
      expect(findTable(editor)?.node.attrs.maxHeight).toBe(280);
    },
  );

  it("supports caller-owned editors without table extensions", () => {
    const externalEditor = new CoreEditor({
      content: "<p>Minimal external editor</p>",
      editable: true,
      extensions: [StarterKit],
    });
    liveEditors.add(externalEditor);

    expect(() =>
      render(
        <Theme>
          <Scribe externalEditor={externalEditor} editable showBarMenu={false} />
        </Theme>,
      ),
    ).not.toThrow();
    expect(screen.queryByRole("toolbar", { name: "Table controls" })).not.toBeInTheDocument();
  });
});
