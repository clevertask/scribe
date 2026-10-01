import type { EditorView } from "@tiptap/pm/view";

/** Keep native selection scrolling, with clearance for the pinned header. */
export const scrollSelectionBelowStickyHeader = (view: EditorView) => {
  const { $head } = view.state.selection;
  let cellPosition: number | undefined;

  if (["cell", "header_cell"].includes($head.nodeAfter?.type.spec.tableRole ?? "")) {
    cellPosition = $head.pos;
  } else {
    for (let depth = $head.depth; depth > 0; depth--) {
      if (["cell", "header_cell"].includes($head.node(depth).type.spec.tableRole ?? "")) {
        cellPosition = $head.before(depth);
        break;
      }
    }
  }

  if (cellPosition === undefined) {
    return false;
  }

  const cellDOM = view.nodeDOM(cellPosition);
  const cell = cellDOM?.nodeType === 1 ? (cellDOM as HTMLElement) : null;
  const wrapper = cell?.closest<HTMLElement>(
    '.tableWrapper[data-table-sticky-header-active="true"]',
  );
  const table = cell?.closest("table");
  const firstRow = table?.rows[0];

  if (!wrapper || !firstRow || table?.parentElement !== wrapper || firstRow.contains(cell)) {
    return false;
  }

  const headerHeight = Math.max(
    ...Array.from(firstRow.cells, (header) => header.getBoundingClientRect().height),
  );
  const visibleTop = wrapper.getBoundingClientRect().top + wrapper.clientTop;
  const caretTop = view.coordsAtPos($head.pos).top;
  const clearance = visibleTop + headerHeight + 5;

  if (headerHeight > 0 && caretTop < clearance) {
    wrapper.scrollTop -= clearance - caretTop;
  }

  // Native scrolling still handles horizontal overflow and outer ancestors.
  return false;
};
