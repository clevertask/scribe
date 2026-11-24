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

  const caret = view.coordsAtPos($head.pos);
  const contentTop =
    viewport.top + (capped ? 0 : hostOffset(wrapper)) + (firstRow.contains(cell) ? 0 : height);
  // A tall, wrapped header can leave less room than the usual scroll margins.
  // Spend the remaining space on the caret before reserving any extra clearance.
  const padding = Math.min(
    5,
    Math.max(0, (viewport.bottom - contentTop - (caret.bottom - caret.top)) / 2),
  );
  const clearance = contentTop + padding;
  let distance = 0;
  if (caret.top < clearance) {
    distance = caret.top - clearance;
  } else if (caret.bottom > viewport.bottom - padding) {
    distance = caret.bottom - viewport.bottom + padding;
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

  if (firstRow.contains(cell) || padding < 5) {
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

  // Native scrolling reserves another five pixels and can push the caret back
  // behind a tall header. Only suppress it when outer scrolling is unnecessary.
  if (padding >= 5) return false;
  const visibleCaret = view.coordsAtPos($head.pos);
  const ownerWindow = wrapper.ownerDocument.defaultView!;
  const visualViewport = ownerWindow.visualViewport;
  const windowLeft = visualViewport?.offsetLeft ?? 0;
  const windowTop = visualViewport?.offsetTop ?? 0;
  if (
    visibleCaret.top < windowTop ||
    visibleCaret.bottom > windowTop + (visualViewport?.height ?? ownerWindow.innerHeight) ||
    visibleCaret.left < windowLeft ||
    visibleCaret.right > windowLeft + (visualViewport?.width ?? ownerWindow.innerWidth)
  )
    return false;
  const programmaticScrollOverflow = /^(auto|scroll|overlay|hidden)$/;
  for (let outer = parentElement(wrapper); outer; outer = parentElement(outer)) {
    const style = outer.ownerDocument.defaultView!.getComputedStyle(outer);
    const box = outer.getBoundingClientRect();
    const scaleY = outer.offsetHeight > 0 ? box.height / outer.offsetHeight : 1;
    const scaleX = outer.offsetWidth > 0 ? box.width / outer.offsetWidth : 1;
    const top = box.top + outer.clientTop * scaleY;
    const left = box.left + outer.clientLeft * scaleX;
    if (
      (programmaticScrollOverflow.test(style.overflowY) &&
        (visibleCaret.top < top || visibleCaret.bottom > top + outer.clientHeight * scaleY)) ||
      (programmaticScrollOverflow.test(style.overflowX) &&
        (visibleCaret.left < left || visibleCaret.right > left + outer.clientWidth * scaleX))
    )
      return false;
  }
  return true;
};

/** Move the original header cells; no extra editable DOM or document state. */
export const createStickyTableHeaderPlugin = () =>
  new Plugin({
    props: {
      handleScrollToSelection: scrollSelectionBelowStickyHeader,
      handleDOMEvents: {
        mousedown(view, event) {
          if (
            !view.editable ||
            event.defaultPrevented ||
            event.button !== 0 ||
            event.ctrlKey ||
            event.metaKey ||
            event.altKey
          )
            return false;
          const target = event.target as HTMLElement | null;
          const header = target?.closest<HTMLTableCellElement>("th");
          const wrapper = header?.closest<HTMLElement>(ACTIVE_TABLE_SELECTOR);
          if (
            !header ||
            !wrapper ||
            !headerCells(wrapper)?.[header.cellIndex]?.isSameNode(header)
          ) {
            return false;
          }
          const position = view.posAtCoords({ left: event.clientX, top: event.clientY });
          if (!position || view.state.doc.resolve(position.pos).parent.inlineContent) return false;

          const doc = header.ownerDocument;
          let nativeNode: Node | null = null;
          let nativeOffset = 0;
          try {
            const caret = doc.caretPositionFromPoint?.(event.clientX, event.clientY);
            if (caret) {
              nativeNode = caret.offsetNode;
              nativeOffset = caret.offset;
            } else {
              const range = doc.caretRangeFromPoint?.(event.clientX, event.clientY);
              nativeNode = range?.startContainer ?? null;
              nativeOffset = range?.startOffset ?? 0;
            }
          } catch {
            return false;
          }
          if (!nativeNode || !header.contains(nativeNode)) return false;
          const nativePosition = view.posAtDOM(nativeNode, nativeOffset);
          const contentStart = view.posAtDOM(header, 0);
          const contentEnd = view.posAtDOM(header, header.childNodes.length);
          if (
            nativePosition === position.pos ||
            (position.pos > contentStart && position.pos < contentEnd)
          )
            return false;
          // A sticky cell can put its blank space below the paragraph at the
          // pointer. ProseMirror's block-boundary hit test then picks the next
          // cell. Let native selection keep the clicked character and support
          // text dragging, Shift-click and word selection in this narrow case.
          // Returning true skips ProseMirror's handler, without cancelling the
          // browser's default action or claiming resize gestures handled earlier.
          return true;
        },
      },
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
