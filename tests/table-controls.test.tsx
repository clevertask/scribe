import { Theme } from "@radix-ui/themes";
import { Editor as CoreEditor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import type { Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { Scribe, type ScribeRef } from "../lib/main";
import { getSelectionTableContext } from "../lib/components/Menu/tableBubbleMenuPlugin";
import { selectionHasTableAncestor } from "../lib/components/Scribe/extension/resizable-table";
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

describe("Scribe table controls", () => {
  it("inserts a three-by-three table with a header row from the slash command", () => {
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
