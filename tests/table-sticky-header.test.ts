import type { Editor } from "@tiptap/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createScribeEditor } from "../lib/main";
import { html2md } from "../lib/utils/html-to-markdown";

const HEADER_TOP_PROPERTY = "--scribe-table-sticky-header-top";
const editors = new Set<Editor>();
const hosts = new Set<HTMLElement>();

afterEach(() => {
  for (const editor of editors) {
    if (!editor.isDestroyed) editor.destroy();
  }
  for (const host of hosts) host.remove();
  editors.clear();
  hosts.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const createFixture = () => {
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrameId = 1;
  const requestFrame = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    const id = nextFrameId++;
    frames.set(id, callback);
    return id;
  });
  const cancelFrame = vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
    frames.delete(id);
  });

  const observers: RecordedResizeObserver[] = [];
  class RecordedResizeObserver implements ResizeObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();

    constructor(readonly callback: ResizeObserverCallback) {
      observers.push(this);
    }
  }
  vi.stubGlobal("ResizeObserver", RecordedResizeObserver);

  const visualViewport = Object.assign(new EventTarget(), { offsetTop: 0, height: 800 });
  vi.stubGlobal("visualViewport", visualViewport);
  const documentAddListener = vi.spyOn(document, "addEventListener");
  const documentRemoveListener = vi.spyOn(document, "removeEventListener");
  const windowAddListener = vi.spyOn(window, "addEventListener");
  const windowRemoveListener = vi.spyOn(window, "removeEventListener");
  const viewportRemoveListener = vi.spyOn(visualViewport, "removeEventListener");
  const onContentChange = vi.fn();
  const editor = createScribeEditor({
    content: `
      <table data-table-sticky-header-row="true"><tbody>
        <tr><th><p>Heading</p></th></tr>
        <tr><td><p>Body cell</p></td></tr>
      </tbody></table>
      <p>After</p>
    `,
    editable: true,
    onContentChange,
  });
  editors.add(editor);

  const host = document.createElement("div");
  host.style.overflowY = "auto";
  Object.defineProperties(host, {
    clientHeight: { value: 300 },
    scrollHeight: { value: 1200 },
    offsetHeight: { value: 300 },
  });
  document.body.appendChild(host);
  host.appendChild(editor.view.dom);
  hosts.add(host);
  vi.spyOn(host, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 60, 600, 300));

  const wrapper = editor.view.dom.querySelector<HTMLElement>(".tableWrapper");
  const table = wrapper?.querySelector("table");
  if (!wrapper || !table) throw new Error("Expected a rendered table wrapper");
  let wrapperTop = -80;
  Object.defineProperty(wrapper, "offsetHeight", { value: 700 });
  vi.spyOn(wrapper, "getBoundingClientRect").mockImplementation(
    () => new DOMRect(0, wrapperTop, 600, 700),
  );
  vi.spyOn(table, "getBoundingClientRect").mockImplementation(
    () => new DOMRect(0, wrapperTop, 600, 700),
  );
  for (const cell of table.rows[0].cells) {
    vi.spyOn(cell, "getBoundingClientRect").mockImplementation(
      () => new DOMRect(0, wrapperTop, 600, 32),
    );
  }

  let bodyPosition: number | undefined;
  editor.state.doc.descendants((node, position) => {
    if (node.isText && node.text === "Body cell") bodyPosition = position;
  });
  if (bodyPosition === undefined) throw new Error("Expected a body cell selection");
  editor.commands.setTextSelection(bodyPosition);

  const observer = observers.find((candidate) =>
    candidate.observe.mock.calls.some(([element]) => element === wrapper),
  );
  if (!observer) throw new Error("Expected the sticky plugin to observe its table");

  const flushFrames = () => {
    const pending = Array.from(frames.entries());
    frames.clear();
    for (const [, callback] of pending) callback(0);
  };

  return {
    editor,
    wrapper,
    table,
    observer,
    frames,
    requestFrame,
    cancelFrame,
    visualViewport,
    documentAddListener,
    documentRemoveListener,
    windowAddListener,
    windowRemoveListener,
    viewportRemoveListener,
    onContentChange,
    flushFrames,
    moveTable(top: number) {
      wrapperTop = top;
    },
  };
};

describe("sticky table header lifecycle", () => {
  it("updates runtime offsets without content transactions or serialization changes", () => {
    const fixture = createFixture();
    const { editor, wrapper } = fixture;
    const jsonBefore = editor.getJSON();
    const htmlBefore = editor.getHTML();
    const markdownBefore = html2md(htmlBefore);
    const onTransaction = vi.fn();
    editor.on("transaction", onTransaction);
    fixture.onContentChange.mockClear();

    expect(wrapper.style.getPropertyValue(HEADER_TOP_PROPERTY)).toBe("140px");
    fixture.moveTable(-140);
    window.dispatchEvent(new Event("scroll"));
    window.dispatchEvent(new Event("resize"));
    fixture.observer.callback([], fixture.observer);
    expect(fixture.frames.size).toBe(1);
    fixture.flushFrames();

    expect(wrapper.style.getPropertyValue(HEADER_TOP_PROPERTY)).toBe("200px");
    expect(onTransaction).not.toHaveBeenCalled();
    expect(fixture.onContentChange).not.toHaveBeenCalled();
    expect(editor.getJSON()).toEqual(jsonBefore);
    expect(editor.getHTML()).toBe(htmlBefore);
    expect(html2md(editor.getHTML())).toBe(markdownBefore);
    expect(htmlBefore).not.toContain(HEADER_TOP_PROPERTY);
  });

  it.each(["disabled", "removed"] as const)(
    "clears the old wrapper offset when the sticky table is %s",
    (change) => {
      const { editor, wrapper, table, observer } = createFixture();
      expect(wrapper.style.getPropertyValue(HEADER_TOP_PROPERTY)).toBe("140px");

      if (change === "disabled") {
        expect(editor.commands.setTableStickyHeaderRow(false)).toBe(true);
        expect(wrapper).toHaveAttribute("data-table-sticky-header-active", "false");
      } else {
        expect(editor.commands.deleteTable()).toBe(true);
        expect(wrapper.isConnected).toBe(false);
        expect(editor.view.dom.querySelector("table")).toBeNull();
      }

      expect(wrapper.style.getPropertyValue(HEADER_TOP_PROPERTY)).toBe("");
      expect(observer.unobserve).toHaveBeenCalledWith(wrapper);
      expect(observer.unobserve).toHaveBeenCalledWith(table.rows[0].cells[0]);
    },
  );

  it("switches between parent scrolling and a height limit without clearing the sticky preference", () => {
    const { editor, wrapper } = createFixture();
    expect(wrapper.style.getPropertyValue(HEADER_TOP_PROPERTY)).toBe("140px");

    expect(editor.commands.setTableHeightLimit(true)).toBe(true);
    expect(wrapper.style.getPropertyValue(HEADER_TOP_PROPERTY)).toBe("");
    expect(wrapper).toHaveAttribute("data-table-sticky-header-active", "true");
    expect(wrapper).toHaveAttribute("data-table-sticky-header-row", "true");

    expect(editor.commands.setTableHeightLimit(false)).toBe(true);
    expect(wrapper.style.getPropertyValue(HEADER_TOP_PROPERTY)).toBe("140px");
    expect(wrapper).toHaveAttribute("data-table-sticky-header-row", "true");
  });

  it("cancels pending work and removes observers and scroll listeners on editor destruction", () => {
    const fixture = createFixture();
    const scrollRegistration = fixture.documentAddListener.mock.calls.find(
      ([type, , options]) =>
        type === "scroll" &&
        typeof options === "object" &&
        options?.capture === true &&
        options.passive === true,
    );
    const schedule = scrollRegistration?.[1];
    if (!schedule) throw new Error("Expected the sticky plugin's captured scroll listener");
    expect(fixture.windowAddListener).toHaveBeenCalledWith("resize", schedule, { passive: true });

    window.dispatchEvent(new Event("scroll"));
    const pendingFrame = Array.from(fixture.frames.keys())[0];
    expect(pendingFrame).toBeDefined();
    fixture.editor.destroy();

    expect(fixture.cancelFrame).toHaveBeenCalledWith(pendingFrame);
    expect(fixture.frames.size).toBe(0);
    expect(fixture.observer.disconnect).toHaveBeenCalledOnce();
    expect(fixture.documentRemoveListener).toHaveBeenCalledWith("scroll", schedule, true);
    expect(fixture.windowRemoveListener).toHaveBeenCalledWith("scroll", schedule);
    expect(fixture.windowRemoveListener).toHaveBeenCalledWith("resize", schedule);
    expect(fixture.viewportRemoveListener).toHaveBeenCalledWith("scroll", schedule);
    expect(fixture.viewportRemoveListener).toHaveBeenCalledWith("resize", schedule);
    expect(fixture.wrapper.style.getPropertyValue(HEADER_TOP_PROPERTY)).toBe("");

    fixture.requestFrame.mockClear();
    document.dispatchEvent(new Event("scroll"));
    window.dispatchEvent(new Event("scroll"));
    window.dispatchEvent(new Event("resize"));
    fixture.visualViewport.dispatchEvent(new Event("resize"));
    fixture.observer.callback([], fixture.observer);
    expect(fixture.requestFrame).not.toHaveBeenCalled();
  });
});
