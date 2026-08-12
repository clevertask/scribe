import { Table } from "@tiptap/extension-table";
import { columnResizing, columnResizingPluginKey, tableEditing } from "@tiptap/pm/tables";

/**
 * Tiptap only registers its column-resizing plugin when the editor is editable
 * during extension initialization. Scribe can become editable after mount, so
 * register the plugin for the editor lifetime and let its event handlers honor
 * the current `view.editable` value.
 */
export const ScribeTable = Table.extend({
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
