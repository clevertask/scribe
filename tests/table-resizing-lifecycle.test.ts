import { columnResizingPluginKey } from "@tiptap/pm/tables";
import { afterEach, describe, expect, it } from "vitest";
import { createScribeEditor } from "../lib/main";
import type { Editor } from "@tiptap/react";

const editors = new Set<Editor>();

afterEach(() => {
  editors.forEach((editor) => {
    if (!editor.isDestroyed) {
      editor.destroy();
    }
  });
  editors.clear();
});

describe("table resizing lifecycle", () => {
  it("keeps column resizing available when a read-only editor becomes editable", () => {
    const editor = createScribeEditor({
      content:
        "<table><tbody><tr><th><p>Heading</p></th></tr><tr><td><p>Cell</p></td></tr></tbody></table>",
      editable: false,
    });
    editors.add(editor);

    expect(editor.isEditable).toBe(false);
    expect(columnResizingPluginKey.getState(editor.state)).toBeDefined();

    editor.setEditable(true);

    expect(editor.isEditable).toBe(true);
    expect(columnResizingPluginKey.getState(editor.state)).toBeDefined();
  });

  it("clears an active resize handle when editing is disabled", () => {
    const editor = createScribeEditor({
      content:
        "<table><tbody><tr><th><p>Heading</p></th></tr><tr><td><p>Cell</p></td></tr></tbody></table>",
      editable: true,
    });
    editors.add(editor);
    let firstCellPosition: number | undefined;

    editor.state.doc.descendants((node, position) => {
      if (firstCellPosition === undefined && node.type.name === "tableHeader") {
        firstCellPosition = position;
      }
    });

    if (firstCellPosition === undefined) {
      throw new Error("Expected the table to contain a header cell");
    }

    editor.view.dispatch(
      editor.state.tr.setMeta(columnResizingPluginKey, { setHandle: firstCellPosition }),
    );

    expect(columnResizingPluginKey.getState(editor.state)?.activeHandle).toBe(firstCellPosition);
    expect(editor.view.dom).toHaveClass("resize-cursor");
    expect(editor.view.dom.querySelectorAll(".column-resize-handle").length).toBeGreaterThan(0);

    editor.setEditable(false);

    expect(columnResizingPluginKey.getState(editor.state)?.activeHandle).toBe(-1);
    expect(editor.view.dom).not.toHaveClass("resize-cursor");
    expect(editor.view.dom.querySelectorAll(".column-resize-handle")).toHaveLength(0);
  });
});
