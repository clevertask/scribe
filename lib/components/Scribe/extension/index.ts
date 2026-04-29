import type { ScribeProps, ScribeTableOfContentsItem } from "..";
import Link from "./extension-link";
import MarkdownPaste from "./extension-markdown-paste";
import Focus from "@tiptap/extension-focus";
import Image from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import { TableOfContents, type TableOfContentData } from "@tiptap/extension-table-of-contents";
import StarterKit from "@tiptap/starter-kit";
import { SlashCommand } from "./slashCommand";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import Highlight from "@tiptap/extension-highlight";
import SelectedText from "./extension-selectedText";
import renderItems from "./slashCommand/renderItems";
import Placeholder from "@tiptap/extension-placeholder";
import { getSuggestionItems } from "./slashCommand/items";
import { Mathematics } from "@tiptap/extension-mathematics";
import Typography from "@tiptap/extension-typography";
import Emoji, { gitHubEmojis } from "@tiptap/extension-emoji";
import suggestion from "./emoji/suggest";

const findHeadingElement = (item: TableOfContentData[number]) => {
  const heading = Array.from(
    item.editor.view.dom.querySelectorAll<HTMLElement>("[data-toc-id]"),
  ).find((element) => element.dataset.tocId === item.id);

  return heading ?? item.dom;
};

const mapTableOfContentsItems = (items: TableOfContentData): ScribeTableOfContentsItem[] =>
  items.map(
    ({
      id,
      isActive,
      isScrolledOver,
      itemIndex,
      level,
      originalLevel,
      pos,
      textContent,
      ...item
    }) => ({
      dom: findHeadingElement({
        id,
        isActive,
        isScrolledOver,
        itemIndex,
        level,
        originalLevel,
        pos,
        textContent,
        ...item,
      }),
      id,
      isActive,
      isScrolledOver,
      itemIndex,
      level,
      originalLevel,
      pos,
      textContent,
    }),
  );

export const initExtensions = (props: ScribeProps) => [
  StarterKit.configure({
    dropcursor: {
      width: 4,
      color: "#ebf6fe",
    },
  }),
  ...(props.enableTableOfContents
    ? [
        TableOfContents.configure({
          onUpdate: (items, isCreate) => {
            props.onTableOfContentsChange?.(mapTableOfContentsItems(items), isCreate);
          },
        }),
      ]
    : []),
  TaskList.configure({
    HTMLAttributes: {
      class: "scribe-task-list",
    },
  }),
  TaskItem.configure({
    nested: true,
  }),
  TableKit.configure({
    table: { resizable: true },
  }),
  Placeholder.configure({
    showOnlyWhenEditable: true,
    includeChildren: true,
    showOnlyCurrent: false,
    emptyEditorClass: "is-editor-empty",
    emptyNodeClass: "is-node-empty",
    placeholder: ({ editor: coreEditor, node }) => {
      if (coreEditor.isDestroyed) {
        return "";
      }
      if (node.type.name === "heading") {
        return `Heading ${node.attrs.level}`;
      }

      return props.placeholderText || 'Type "/" for commands...';
    },
  }),
  Focus.configure({ mode: "deepest", className: "has-focus" }),
  MarkdownPaste,
  SlashCommand.configure({
    slashSuggestion: {
      items: getSuggestionItems,
      render: renderItems,
    },
  }),
  Highlight,
  SelectedText,
  Link,
  Image.configure({
    inline: true,
    HTMLAttributes: {
      class: "scribe-image-node",
    },
    allowBase64: true,
  }),
  Emoji.configure({
    emojis: gitHubEmojis,
    enableEmoticons: true,
    suggestion: suggestion(),
  }),
  Mathematics,
  Typography,
];
