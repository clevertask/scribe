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
