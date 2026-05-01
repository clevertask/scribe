import { Editor, Extension } from "@tiptap/core";
import { Node as TiptapNode } from "@tiptap/pm/model";
import { EditorState, Plugin, PluginKey, Transaction } from "@tiptap/pm/state";

export const SCRIBE_TABLE_OF_CONTENTS_META = "scribeTableOfContents";

type ScrollParent = HTMLElement | Window;

type HeadingEntry = {
  node: TiptapNode;
  pos: number;
};

export type ScribeTableOfContentsItem = {
  dom: HTMLElement;
  editor: Editor;
  id: string;
  isActive: boolean;
  isScrolledOver: boolean;
  itemIndex: number;
  level: number;
  node: TiptapNode;
  originalLevel: number;
  pos: number;
  textContent: string;
};

export type ScribeTableOfContentsChangeHandler = (
  items: ScribeTableOfContentsItem[],
  isCreate?: boolean,
) => void;

export type ScribeTableOfContentsScrollTarget = ScribeTableOfContentsItem | string;

type ScribeTableOfContentsOptions = {
  anchorTypes: string[];
  onUpdate?: ScribeTableOfContentsChangeHandler;
};

type ScribeTableOfContentsStorage = {
  anchors: HTMLElement[];
  content: ScribeTableOfContentsItem[];
  hasCreated: boolean;
  lastSignature: string;
  rafId: number | null;
  refresh: () => void;
  scheduleRefresh: () => void;
  scrollHandler: () => void;
  scrollParent: ScrollParent | null;
  updateScrollParent: () => void;
};

const pluginKey = new PluginKey("scribeTableOfContents");

const slugify = (content: string) => {
  const slug = content
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "heading";
};

const getHeadingLevel = (headline: HeadingEntry, previousItems: ScribeTableOfContentsItem[]) => {
  const previousHeadline = previousItems[previousItems.length - 1];
  const highestHeadlineAbove = [...previousItems]
    .reverse()
    .find((heading) => heading.originalLevel <= headline.node.attrs.level);
  const highestLevelAbove = highestHeadlineAbove?.level || 1;

  if (headline.node.attrs.level > (previousHeadline?.originalLevel || 1)) {
    return (previousHeadline?.level || 1) + 1;
  }

  if (headline.node.attrs.level < (previousHeadline?.originalLevel || 1)) {
    return highestLevelAbove;
  }

  return previousHeadline?.level || 1;
};

const getItemIndex = (previousItems: ScribeTableOfContentsItem[]) => {
  const previousHeadline = previousItems[previousItems.length - 1];

  return (previousHeadline?.itemIndex || 0) + 1;
};

const getHeadingId = (
  node: TiptapNode,
  usedIds: Map<string, number>,
  existingId?: string | null,
) => {
  if (node.textContent.length === 0) {
    return null;
  }

  const baseId = slugify(node.textContent);
  const nextCount = (usedIds.get(baseId) || 0) + 1;
  const id = nextCount === 1 ? baseId : `${baseId}-${nextCount}`;

  usedIds.set(baseId, nextCount);

  return existingId === id ? existingId : id;
};

const createTableOfContentsIdTransaction = (
  state: EditorState,
  anchorTypes: string[],
): Transaction | null => {
  const tr = state.tr;
  const usedIds = new Map<string, number>();
  let modified = false;

  state.doc.descendants((node, pos) => {
    if (!anchorTypes.includes(node.type.name)) {
      return;
    }

    const currentId = node.attrs["data-toc-id"] as string | null | undefined;
    const nextId = getHeadingId(node, usedIds, currentId);

    if (currentId === nextId) {
      return;
    }

    tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      "data-toc-id": nextId,
    });
    modified = true;
  });

  if (!modified) {
    return null;
  }

  return tr.setMeta(SCRIBE_TABLE_OF_CONTENTS_META, true).setMeta("addToHistory", false);
};

const isScrollable = (element: HTMLElement) => {
  const { overflowY } = window.getComputedStyle(element);

  return /(auto|scroll|overlay)/.test(overflowY) && element.scrollHeight > element.clientHeight;
};

const getScrollParent = (element: HTMLElement): ScrollParent => {
  let parent = element.parentElement;

  while (parent) {
    if (isScrollable(parent)) {
      return parent;
    }

    parent = parent.parentElement;
  }

  return window;
};

const isWindowScrollParent = (scrollParent: ScrollParent): scrollParent is Window => {
  return typeof Window !== "undefined" && scrollParent instanceof Window;
};

const getActivationThreshold = (scrollParent: ScrollParent) => {
  if (isWindowScrollParent(scrollParent)) {
    return 32;
  }

  return scrollParent.getBoundingClientRect().top + 32;
};

const getHeadingElement = (editor: Editor, pos: number) => {
  const dom = editor.view.nodeDOM(pos);

  return dom instanceof HTMLElement ? dom : null;
};

const collectHeadingEntries = (editor: Editor, anchorTypes: string[]) => {
  const entries: HeadingEntry[] = [];

  editor.state.doc.descendants((node, pos) => {
    if (!anchorTypes.includes(node.type.name) || node.textContent.length === 0) {
      return;
    }

    entries.push({ node, pos });
  });

  return entries;
};

const withActiveStates = (
  items: ScribeTableOfContentsItem[],
  scrollParent: ScrollParent | null,
) => {
  if (!scrollParent) {
    return items;
  }

  const threshold = getActivationThreshold(scrollParent);
  const scrolledOverIds = new Set<string>();
  let activeId: string | null = null;

  items.forEach((item) => {
    if (item.dom.getBoundingClientRect().top <= threshold) {
      activeId = item.id;
      scrolledOverIds.add(item.id);
    }
  });

  return items.map((item) => ({
    ...item,
    isActive: item.id === activeId,
    isScrolledOver: scrolledOverIds.has(item.id),
  }));
};

const buildTableOfContentsItems = (
  editor: Editor,
  anchorTypes: string[],
  scrollParent: ScrollParent | null,
) => {
  const entries = collectHeadingEntries(editor, anchorTypes);
  const items: ScribeTableOfContentsItem[] = [];

  entries.forEach((entry) => {
    const id = entry.node.attrs["data-toc-id"] as string | null | undefined;
    const dom = getHeadingElement(editor, entry.pos);

    if (!id || !dom) {
      return;
    }

    const originalLevel = Number(entry.node.attrs.level) || 1;
    const level = getHeadingLevel(entry, items);
    const itemIndex = getItemIndex(items);

    items.push({
      dom,
      editor,
      id,
      isActive: false,
      isScrolledOver: false,
      itemIndex,
      level,
      node: entry.node,
      originalLevel,
      pos: entry.pos,
      textContent: entry.node.textContent,
    });
  });

  return withActiveStates(items, scrollParent);
};

const getTableOfContentsSignature = (items: ScribeTableOfContentsItem[]) => {
  return JSON.stringify(
    items.map((item) => ({
      id: item.id,
      isActive: item.isActive,
      isScrolledOver: item.isScrolledOver,
      itemIndex: item.itemIndex,
      level: item.level,
      originalLevel: item.originalLevel,
      pos: item.pos,
      textContent: item.textContent,
    })),
  );
};

const emitTableOfContentsUpdate = (
  storage: ScribeTableOfContentsStorage,
  options: ScribeTableOfContentsOptions,
  items: ScribeTableOfContentsItem[],
) => {
  const signature = getTableOfContentsSignature(items);
  const isCreate = !storage.hasCreated;

  storage.anchors = items.map((item) => item.dom);
  storage.content = items;

  if (!isCreate && signature === storage.lastSignature) {
    return;
  }

  storage.hasCreated = true;
  storage.lastSignature = signature;
  options.onUpdate?.(items, isCreate);
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    scribeTableOfContents: {
      updateScribeTableOfContents: () => ReturnType;
    };
  }

  interface Storage {
    scribeTableOfContents: ScribeTableOfContentsStorage;
  }
}

export const ScribeTableOfContents = Extension.create<
  ScribeTableOfContentsOptions,
  ScribeTableOfContentsStorage
>({
  name: "scribeTableOfContents",

  addOptions() {
    return {
      anchorTypes: ["heading"],
    };
  },

  addStorage() {
    return {
      anchors: [],
      content: [],
      hasCreated: false,
      lastSignature: "",
      rafId: null,
      refresh: () => null,
      scheduleRefresh: () => null,
      scrollHandler: () => null,
      scrollParent: null,
      updateScrollParent: () => null,
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.anchorTypes,
        attributes: {
          "data-toc-id": {
            default: null,
            renderHTML: (attributes) => {
              const id = attributes["data-toc-id"];

              return id ? { "data-toc-id": id } : {};
            },
            parseHTML: (element) => element.getAttribute("data-toc-id"),
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      updateScribeTableOfContents:
        () =>
        ({ dispatch }) => {
          if (dispatch) {
            this.storage.refresh();
          }

          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: pluginKey,

        appendTransaction: (transactions, _oldState, newState) => {
          if (typeof window === "undefined") {
            return null;
          }

          const shouldSkip = transactions.some(
            (transaction) =>
              transaction.getMeta(SCRIBE_TABLE_OF_CONTENTS_META) ||
              transaction.getMeta("composition"),
          );

          if (shouldSkip || !transactions.some((transaction) => transaction.docChanged)) {
            return null;
          }

          return createTableOfContentsIdTransaction(newState, this.options.anchorTypes);
        },
      }),
    ];
  },

  onCreate() {
    if (typeof window === "undefined" || !this.editor.view) {
      return;
    }

    this.storage.scrollHandler = () => {
      this.storage.refresh();
    };

    this.storage.updateScrollParent = () => {
      const nextScrollParent = getScrollParent(this.editor.view.dom);

      if (this.storage.scrollParent === nextScrollParent) {
        return;
      }

      this.storage.scrollParent?.removeEventListener("scroll", this.storage.scrollHandler);
      this.storage.scrollParent = nextScrollParent;
      this.storage.scrollParent.addEventListener("scroll", this.storage.scrollHandler);
    };

    this.storage.refresh = () => {
      if (this.editor.isDestroyed) {
        return;
      }

      this.storage.updateScrollParent();
      const items = buildTableOfContentsItems(
        this.editor,
        this.options.anchorTypes,
        this.storage.scrollParent,
      );

      emitTableOfContentsUpdate(this.storage, this.options, items);
    };

    this.storage.scheduleRefresh = () => {
      if (this.storage.rafId !== null) {
        window.cancelAnimationFrame(this.storage.rafId);
      }

      this.storage.rafId = window.requestAnimationFrame(() => {
        this.storage.rafId = null;
        this.storage.refresh();
      });
    };

    const initialTransaction = createTableOfContentsIdTransaction(
      this.editor.state,
      this.options.anchorTypes,
    );

    if (initialTransaction) {
      this.editor.view.dispatch(initialTransaction);
    }

    this.storage.scheduleRefresh();
  },

  onTransaction({ transaction }) {
    if (transaction.docChanged) {
      this.storage.scheduleRefresh();
    }
  },

  onDestroy() {
    if (typeof window !== "undefined" && this.storage.rafId !== null) {
      window.cancelAnimationFrame(this.storage.rafId);
    }

    this.storage.scrollParent?.removeEventListener("scroll", this.storage.scrollHandler);
  },
});
