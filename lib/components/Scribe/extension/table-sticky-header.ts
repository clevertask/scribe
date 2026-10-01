import { Plugin } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

const ACTIVE_TABLE_SELECTOR = '.tableWrapper[data-table-sticky-header-active="true"]';
const HEADER_TOP_PROPERTY = "--scribe-table-sticky-header-top";
const SCROLLABLE_OVERFLOW = /^(auto|scroll|overlay)$/;

const parentElement = (element: HTMLElement): HTMLElement | null => {
  if (element.parentElement) return element.parentElement;
  const root = element.getRootNode();
  return "host" in root ? (root.host as HTMLElement) : null;
};

const headerCells = (wrapper: HTMLElement) =>
  wrapper.querySelector<HTMLTableElement>(":scope > table")?.rows[0]?.cells;

const headerHeight = (wrapper: HTMLElement) =>
  Math.max(
    0,
    ...Array.from(headerCells(wrapper) ?? [], (cell) => cell.getBoundingClientRect().height),
  );

/** Horizontal overflow and non-scrolling editor frames are not vertical targets. */
const verticalScrollAncestor = (wrapper: HTMLElement): HTMLElement | null => {
  const ownerWindow = wrapper.ownerDocument.defaultView;
  if (!ownerWindow) return null;

  for (let ancestor = parentElement(wrapper); ancestor; ancestor = parentElement(ancestor)) {
    if (
      ancestor === wrapper.ownerDocument.body ||
      ancestor === wrapper.ownerDocument.documentElement
    ) {
      break;
    }
    if (
      SCROLLABLE_OVERFLOW.test(ownerWindow.getComputedStyle(ancestor).overflowY) &&
      ancestor.scrollHeight > ancestor.clientHeight + 1
    ) {
      return ancestor;
    }
  }
  return null;
};

const scrollViewport = (wrapper: HTMLElement, ancestor: HTMLElement | null) => {
  const ownerWindow = wrapper.ownerDocument.defaultView!;
  const viewportTop = ownerWindow.visualViewport?.offsetTop ?? 0;
  const viewportBottom =
    viewportTop + (ownerWindow.visualViewport?.height ?? ownerWindow.innerHeight);
  if (!ancestor) return { top: viewportTop, bottom: viewportBottom };

  const box = ancestor.getBoundingClientRect();
  const scale = ancestor.offsetHeight > 0 ? box.height / ancestor.offsetHeight : 1;
  const top = box.top + ancestor.clientTop * scale;
  return {
    top: Math.max(viewportTop, top),
    bottom: Math.min(viewportBottom, top + ancestor.clientHeight * scale),
  };
};

const hostOffset = (wrapper: HTMLElement) => {
  // A computed length resolves rem/calc/custom properties as well as pixels.
  const value = wrapper.ownerDocument.defaultView?.getComputedStyle(wrapper).scrollMarginTop;
  return Math.max(0, Number.parseFloat(value ?? "") || 0);
};

const syncHeaderPosition = (wrapper: HTMLElement) => {
  if (wrapper.getAttribute("data-table-limit-height") === "true") {
    wrapper.style.removeProperty(HEADER_TOP_PROPERTY);
    return;
  }

  const table = wrapper.querySelector<HTMLTableElement>(":scope > table");
  if (!table) return;
  const wrapperBox = wrapper.getBoundingClientRect();
  const viewport = scrollViewport(wrapper, verticalScrollAncestor(wrapper));
  const maximumTop = Math.max(
    0,
    table.getBoundingClientRect().bottom - wrapperBox.top - headerHeight(wrapper),
  );
  const offset = Math.max(
    0,
    Math.min(viewport.top + hostOffset(wrapper) - wrapperBox.top, maximumTop),
  );
  const scale = wrapper.offsetHeight > 0 ? wrapperBox.height / wrapper.offsetHeight : 1;
  const value = String(offset / (scale || 1)) + "px";
  if (wrapper.style.getPropertyValue(HEADER_TOP_PROPERTY) !== value) {
    wrapper.style.setProperty(HEADER_TOP_PROPERTY, value);
  }
};

/** Keep native selection scrolling, with clearance for the actual pinned row. */
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
  const wrapper = cell?.closest<HTMLElement>(ACTIVE_TABLE_SELECTOR);
  const table = cell?.closest("table");
  const firstRow = table?.rows[0];

  if (!wrapper || !firstRow || table?.parentElement !== wrapper) {
    return false;
  }

  const capped = wrapper.getAttribute("data-table-limit-height") === "true";
  const ancestor = capped ? wrapper : verticalScrollAncestor(wrapper);
  const viewport = scrollViewport(wrapper, ancestor);
  const height = headerHeight(wrapper);
  if (height <= 0 || viewport.bottom <= viewport.top) return false;

  const clearance =
    viewport.top + (capped ? 0 : hostOffset(wrapper)) + (firstRow.contains(cell) ? 0 : height) + 5;
  const caret = view.coordsAtPos($head.pos);
  let distance = 0;
  if (caret.top < clearance) {
    distance = caret.top - clearance;
  } else if (caret.bottom > viewport.bottom - 5) {
    distance = caret.bottom - viewport.bottom + 5;
  }
  if (distance) {
    if (ancestor) {
      const box = ancestor.getBoundingClientRect();
      const scale = ancestor.offsetHeight > 0 ? box.height / ancestor.offsetHeight : 1;
      ancestor.scrollTop += distance / (scale || 1);
    } else {
      wrapper.ownerDocument.defaultView?.scrollBy(0, distance);
    }
    syncHeaderPosition(wrapper);
  }

  if (firstRow.contains(cell)) {
    // ProseMirror stops at position:sticky before reaching the horizontal wrapper.
    const box = wrapper.getBoundingClientRect();
    const scale = wrapper.offsetWidth > 0 ? box.width / wrapper.offsetWidth : 1;
    const left = box.left + wrapper.clientLeft * scale + 5;
    const right = box.left + (wrapper.clientLeft + wrapper.clientWidth) * scale - 5;
    const headerCaret = view.coordsAtPos($head.pos);
    if (headerCaret.left < left) {
      wrapper.scrollLeft += (headerCaret.left - left) / (scale || 1);
    } else if (headerCaret.right > right) {
      wrapper.scrollLeft += (headerCaret.right - right) / (scale || 1);
    }
  }

  // Keep native body-cell scrolling and any remaining outer-ancestor work.
  return false;
};

/** Move the original header cells; no extra editable DOM or document state. */
export const createStickyTableHeaderPlugin = () =>
  new Plugin({
    props: {
      handleScrollToSelection: scrollSelectionBelowStickyHeader,
    },
    view(view) {
      const ownerWindow = view.dom.ownerDocument.defaultView;
      if (!ownerWindow) return {};

      let frame: number | null = null;
      let destroyed = false;
      let wrappers = new Set<HTMLElement>();
      const observed = new Set<Element>();
      const observer = ownerWindow.ResizeObserver ? new ownerWindow.ResizeObserver(schedule) : null;

      function schedule() {
        if (destroyed || frame !== null || wrappers.size === 0) return;
        frame = ownerWindow!.requestAnimationFrame(() => {
          frame = null;
          update();
        });
      }

      function update() {
        const nextWrappers = new Set(view.dom.querySelectorAll<HTMLElement>(ACTIVE_TABLE_SELECTOR));
        for (const oldWrapper of wrappers) {
          if (!nextWrappers.has(oldWrapper)) oldWrapper.style.removeProperty(HEADER_TOP_PROPERTY);
        }
        wrappers = nextWrappers;

        const nextObserved = new Set<Element>();
        if (wrappers.size) {
          for (
            let element: HTMLElement | null = view.dom;
            element;
            element = parentElement(element)
          ) {
            nextObserved.add(element);
          }
          for (const wrapper of wrappers) {
            nextObserved.add(wrapper);
            for (const cell of headerCells(wrapper) ?? []) nextObserved.add(cell);
            syncHeaderPosition(wrapper);
          }
        }
        for (const element of observed) {
          if (!nextObserved.has(element)) {
            observer?.unobserve(element);
            observed.delete(element);
          }
        }
        for (const element of nextObserved) {
          if (!observed.has(element)) {
            observer?.observe(element);
            observed.add(element);
          }
        }
      }

      const scrollRoots = new Set([view.dom.ownerDocument, view.root]);
      for (const root of scrollRoots) {
        root.addEventListener("scroll", schedule, { capture: true, passive: true });
      }
      ownerWindow.addEventListener("scroll", schedule, { passive: true });
      ownerWindow.addEventListener("resize", schedule, { passive: true });
      ownerWindow.visualViewport?.addEventListener("resize", schedule);
      ownerWindow.visualViewport?.addEventListener("scroll", schedule);
      update();

      return {
        update() {
          if (!destroyed) update();
        },
        destroy() {
          destroyed = true;
          if (frame !== null) ownerWindow.cancelAnimationFrame(frame);
          observer?.disconnect();
          for (const root of scrollRoots) root.removeEventListener("scroll", schedule, true);
          ownerWindow.removeEventListener("scroll", schedule);
          ownerWindow.removeEventListener("resize", schedule);
          ownerWindow.visualViewport?.removeEventListener("resize", schedule);
          ownerWindow.visualViewport?.removeEventListener("scroll", schedule);
          for (const wrapper of wrappers) wrapper.style.removeProperty(HEADER_TOP_PROPERTY);
        },
      };
    },
  });
