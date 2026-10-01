import { mergeAttributes } from "@tiptap/core";
import { Table } from "@tiptap/extension-table";
import type { ResolvedPos } from "@tiptap/pm/model";
import { NodeSelection, Plugin, type EditorState, type Selection } from "@tiptap/pm/state";
import { columnResizing, columnResizingPluginKey, tableEditing } from "@tiptap/pm/tables";
import {
  normalizeTableLayout,
  SCROLL_TABLE_COLUMN_WIDTH,
  scrollTablePresentation,
  SCRIBE_TABLE_LAYOUTS,
  ScribeTableView,
  tableHasHeaderRow,
  tableLayoutAttributes,
  type ScribeTableLayout,
} from "./table-layout";
import { scrollSelectionBelowStickyHeader } from "./table-sticky-header";

export type { ScribeTableLayout } from "./table-layout";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    scribeTableLayout: {
      setTableLayout: (layout: ScribeTableLayout) => ReturnType;
      setTableHeightLimit: (limit: boolean) => ReturnType;
      setTableStickyHeaderRow: (sticky: boolean) => ReturnType;
    };
  }
}

const selectedTable = (state: EditorState) => {
  if (
    state.selection instanceof NodeSelection &&
    state.selection.node.type.spec.tableRole === "table"
  ) {
    return { node: state.selection.node, position: state.selection.from };
  }

  const { $from } = state.selection;

  for (let depth = $from.depth; depth > 0; depth--) {
    if ($from.node(depth).type.spec.tableRole === "table") {
      return { node: $from.node(depth), position: $from.before(depth) };
    }
  }

  return null;
};

const eventTableLayout = (event: Event) => {
  const target = event.target as HTMLElement | null;
  return target?.closest?.("table")?.getAttribute("data-table-layout");
};

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
  addAttributes() {
    return {
      ...this.parent?.(),
      tableLayout: {
        default: "auto",
        parseHTML: (element) => normalizeTableLayout(element.getAttribute("data-table-layout")),
        renderHTML: ({ tableLayout }) =>
          normalizeTableLayout(tableLayout) === "auto"
            ? {}
            : { "data-table-layout": normalizeTableLayout(tableLayout) },
      },
      limitHeight: {
        default: false,
        parseHTML: (element) => element.getAttribute("data-table-limit-height") === "true",
        renderHTML: ({ limitHeight }) =>
          limitHeight === true ? { "data-table-limit-height": "true" } : {},
      },
      stickyHeaderRow: {
        default: false,
        parseHTML: (element) => element.getAttribute("data-table-sticky-header-row") === "true",
        renderHTML: ({ stickyHeaderRow }) =>
          stickyHeaderRow === true ? { "data-table-sticky-header-row": "true" } : {},
      },
    };
  },

  renderHTML(props) {
    let table = this.parent!(props);

    if (props.node.attrs.tableLayout === "scroll") {
      const { width, colgroup } = scrollTablePresentation(props.node, this.options.cellMinWidth);
      table = [
        "table",
        mergeAttributes(this.options.HTMLAttributes, props.HTMLAttributes, {
          style: `width: ${width}px; min-width: ${width}px`,
        }),
        colgroup,
        ["tbody", 0],
      ];
    }

    return props.node.attrs.tableLayout !== "auto" ||
      props.node.attrs.limitHeight ||
      props.node.attrs.stickyHeaderRow
      ? ["div", { class: "tableWrapper", ...tableLayoutAttributes(props.node) }, table]
      : table;
  },

  addCommands() {
    const parentCommands = this.parent?.();

    return {
      ...parentCommands,
      setTableLayout:
        (layout) =>
        ({ editor, state, tr, dispatch }) => {
          const table = selectedTable(state);

          if (!editor.isEditable || !table || !SCRIBE_TABLE_LAYOUTS.includes(layout)) {
            return false;
          }

          if (dispatch && table.node.attrs.tableLayout !== layout) {
            tr.setNodeMarkup(table.position, undefined, {
              ...table.node.attrs,
              tableLayout: layout,
            });
            if (layout === "fit") {
              tr.setMeta(columnResizingPluginKey, { setHandle: -1 });
            }
          }

          return true;
        },
      setTableHeightLimit:
        (limit) =>
        ({ editor, state, tr, dispatch }) => {
          const table = selectedTable(state);

          if (!editor.isEditable || !table || typeof limit !== "boolean") {
            return false;
          }

          if (dispatch && table.node.attrs.limitHeight !== limit) {
            tr.setNodeMarkup(table.position, undefined, {
              ...table.node.attrs,
              limitHeight: limit,
            });
          }

          return true;
        },
      setTableStickyHeaderRow:
        (sticky) =>
        ({ editor, state, tr, dispatch }) => {
          const table = selectedTable(state);

          if (
            !editor.isEditable ||
            !table ||
            typeof sticky !== "boolean" ||
            (sticky && (table.node.attrs.limitHeight !== true || !tableHasHeaderRow(table.node)))
          ) {
            return false;
          }

          if (dispatch && table.node.attrs.stickyHeaderRow !== sticky) {
            tr.setNodeMarkup(table.position, undefined, {
              ...table.node.attrs,
              stickyHeaderRow: sticky,
            });
          }

          return true;
        },
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
    const options = {
      handleWidth: this.options.handleWidth,
      cellMinWidth: this.options.cellMinWidth,
      defaultCellMinWidth: this.options.cellMinWidth,
      View: this.options.View,
      lastColumnResizable: this.options.lastColumnResizable,
    };
    const resizing = columnResizing(options);
    const handlers = resizing.props.handleDOMEvents!;
    // Only install one plugin. The alternate native mousedown handler keeps
    // unspecified scroll-mode columns readable during its live drag preview.
    const scrollResizing = columnResizing({
      ...options,
      defaultCellMinWidth: SCROLL_TABLE_COLUMN_WIDTH,
    });
    const scrollMouseDown = scrollResizing.props.handleDOMEvents!.mousedown!;

    resizing.props.handleDOMEvents = {
      ...handlers,
      mousemove: (view, event) => {
        if (eventTableLayout(event) === "fit") {
          const resizeState = columnResizingPluginKey.getState(view.state);

          if (resizeState && resizeState.activeHandle > -1 && !resizeState.dragging) {
            view.dispatch(view.state.tr.setMeta(columnResizingPluginKey, { setHandle: -1 }));
          }

          return false;
        }

        return handlers.mousemove?.call(resizing, view, event);
      },
      mousedown: (view, event) => {
        const layout = eventTableLayout(event);

        if (layout === "fit") {
          return false;
        }

        return layout === "scroll"
          ? scrollMouseDown.call(scrollResizing, view, event)
          : handlers.mousedown?.call(resizing, view, event);
      },
    };

    return [
      resizing,
      tableEditing({
        allowTableNodeSelection: this.options.allowTableNodeSelection,
      }),
      new Plugin({
        props: {
          handleScrollToSelection: scrollSelectionBelowStickyHeader,
        },
      }),
    ];
  },

  addNodeView() {
    // columnResizing installs the configured table NodeView.
    return null;
  },
}).configure({
  resizable: true,
  View: ScribeTableView,
});
