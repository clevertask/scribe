import { Table } from "@tiptap/extension-table";
import type { ResolvedPos } from "@tiptap/pm/model";
import type { Selection } from "@tiptap/pm/state";
import { columnResizing, columnResizingPluginKey, tableEditing } from "@tiptap/pm/tables";

const positionHasTableAncestor = ($position: ResolvedPos) => {
  for (let depth = $position.depth; depth > 0; depth -= 1) {
    if ($position.node(depth).type.spec.tableRole === "table") {
      return true;
    }
  }

  return false;
};

export const selectionHasTableAncestor = (selection: Selection) =>
  positionHasTableAncestor(selection.$from) || positionHasTableAncestor(selection.$to);

/**
 * Tiptap only registers its column-resizing plugin when the editor is editable
 * during extension initialization. Scribe can become editable after mount, so
 * register the plugin for the editor lifetime and let its event handlers honor
 * the current `view.editable` value.
 */
export const ScribeTable = Table.extend({
  addCommands() {
    const parentCommands = this.parent?.();

    return {
      ...parentCommands,
      insertTable:
        (options = {}) =>
        (props) => {
          if (selectionHasTableAncestor(props.state.selection)) {
            return false;
          }

          return parentCommands?.insertTable?.(options)(props) ?? false;
        },
    };
  },

  onUpdate() {
    if (this.editor.isEditable) {
      return;
    }

    const resizeState = columnResizingPluginKey.getState(this.editor.state);

    if (resizeState && (resizeState.activeHandle > -1 || resizeState.dragging)) {
      this.editor.view.dispatch(
        this.editor.state.tr.setMeta(columnResizingPluginKey, { setHandle: -1 }),
      );
    }
  },

  addProseMirrorPlugins() {
    return [
      columnResizing({
        handleWidth: this.options.handleWidth,
        cellMinWidth: this.options.cellMinWidth,
        defaultCellMinWidth: this.options.cellMinWidth,
        View: this.options.View,
        lastColumnResizable: this.options.lastColumnResizable,
      }),
      tableEditing({
        allowTableNodeSelection: this.options.allowTableNodeSelection,
      }),
    ];
  },

  addNodeView() {
    // columnResizing installs the configured table NodeView.
    return null;
  },
}).configure({
  resizable: true,
});
