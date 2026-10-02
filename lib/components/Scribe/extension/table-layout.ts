import { TableView } from "@tiptap/extension-table";
import type { DOMOutputSpec, Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";

export const SCRIBE_TABLE_LAYOUTS = ["auto", "fit", "scroll"] as const;
export type ScribeTableLayout = (typeof SCRIBE_TABLE_LAYOUTS)[number];
export const SCROLL_TABLE_COLUMN_WIDTH = 128;
export const MIN_TABLE_MAX_HEIGHT = 120;
export const MAX_TABLE_MAX_HEIGHT = 2000;
export const DEFAULT_TABLE_MAX_HEIGHT = 360;

export const normalizeTableMaxHeight = (value: unknown): number | null => {
  const height = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;

  return typeof height === "number" &&
    Number.isInteger(height) &&
    height >= MIN_TABLE_MAX_HEIGHT &&
    height <= MAX_TABLE_MAX_HEIGHT
    ? height
    : null;
};

export const normalizeTableLayout = (value: unknown): ScribeTableLayout =>
  value === "fit" || value === "scroll" ? value : "auto";

export const tableHasHeaderRow = (table: ProseMirrorNode) => {
  const firstRow = table.firstChild;

  if (!firstRow || firstRow.childCount === 0) {
    return false;
  }

  let hasOnlyHeaderCells = true;
  firstRow.forEach((cell) => {
    if (cell.type.spec.tableRole !== "header_cell") {
      hasOnlyHeaderCells = false;
    }
  });

  return hasOnlyHeaderCells;
};

export const tableHasStickyHeader = (node: ProseMirrorNode) =>
  node.attrs.stickyHeaderRow === true && tableHasHeaderRow(node);

export const tableLayoutAttributes = (node: ProseMirrorNode) => {
  const maxHeight = normalizeTableMaxHeight(node.attrs.maxHeight);

  return {
    "data-table-layout": normalizeTableLayout(node.attrs.tableLayout),
    "data-table-limit-height": node.attrs.limitHeight === true ? "true" : "false",
    "data-table-sticky-header-row": node.attrs.stickyHeaderRow === true ? "true" : "false",
    "data-table-sticky-header-active": tableHasStickyHeader(node) ? "true" : "false",
    ...(maxHeight === null ? {} : { "data-table-max-height": String(maxHeight) }),
  };
};

export const scrollTablePresentation = (node: ProseMirrorNode, cellMinWidth: number) => {
  let width = 0;
  const columns: DOMOutputSpec[] = [];

  node.firstChild?.forEach((cell) => {
    for (let index = 0; index < cell.attrs.colspan; index++) {
      const authoredWidth = cell.attrs.colwidth?.[index];
      const columnWidth = authoredWidth
        ? Math.max(authoredWidth, cellMinWidth)
        : SCROLL_TABLE_COLUMN_WIDTH;

      width += columnWidth;
      columns.push([
        "col",
        { style: `${authoredWidth ? "width" : "min-width"}: ${columnWidth}px` },
      ]);
    }
  });

  return { width, colgroup: ["colgroup", {}, ...columns] as DOMOutputSpec };
};

/** Keep native column resizing, cell selection and the editable tbody intact. */
export class ScribeTableView extends TableView {
  constructor(node: ProseMirrorNode, cellMinWidth: number, view?: EditorView) {
    super(node, cellMinWidth, view);
    this.applyLayout();
  }

  update(node: ProseMirrorNode) {
    if (!super.update(node)) {
      return false;
    }

    this.applyLayout();
    return true;
  }

  private applyLayout() {
    const layout = normalizeTableLayout(this.node.attrs.tableLayout);
    const maxHeight = normalizeTableMaxHeight(this.node.attrs.maxHeight);

    if (maxHeight === null) {
      this.dom.removeAttribute("data-table-max-height");
      this.table.removeAttribute("data-table-max-height");
      this.dom.style.removeProperty("--scribe-table-custom-max-height");
    } else {
      this.dom.style.setProperty("--scribe-table-custom-max-height", `${maxHeight}px`);
    }

    for (const [name, value] of Object.entries(tableLayoutAttributes(this.node))) {
      this.dom.setAttribute(name, value);
      this.table.setAttribute(name, value);
    }

    if (!tableHasStickyHeader(this.node) || this.node.attrs.limitHeight === true) {
      this.dom.style.removeProperty("--scribe-table-sticky-header-top");
    }

    // Rebuild column presentation from authored widths so changing modes never
    // leaves the previous mode's minimum widths behind or rewrites the document.
    let column = 0;
    let totalWidth = 0;
    this.node.firstChild?.forEach((cell) => {
      for (let index = 0; index < cell.attrs.colspan; index++, column++) {
        const width = cell.attrs.colwidth?.[index];
        const minimum = layout === "scroll" ? SCROLL_TABLE_COLUMN_WIDTH : this.cellMinWidth;
        const col = this.colgroup.children[column] as HTMLTableColElement | undefined;

        if (!col) {
          continue;
        }

        col.style.width = width ? `${Math.max(width, this.cellMinWidth)}px` : "";
        col.style.minWidth = width ? "" : `${minimum}px`;
        totalWidth += width ? Math.max(width, this.cellMinWidth) : minimum;
      }
    });

    if (layout === "scroll") {
      this.table.style.width = `${totalWidth}px`;
      this.table.style.minWidth = `${totalWidth}px`;
    }
  }
}
