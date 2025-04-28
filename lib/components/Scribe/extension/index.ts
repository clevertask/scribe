import { ScribeProps } from "..";
import Link from "./extension-link";
import Focus from "@tiptap/extension-focus";
import Image from "@tiptap/extension-image";
import Table from "@tiptap/extension-table";
import StarterKit from "@tiptap/starter-kit";
import { SlashCommand } from "./slashCommand";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import TableRow from "@tiptap/extension-table-row";
import Highlight from "@tiptap/extension-highlight";
import SelectedText from "./extension-selectedText";
import TableCell from "@tiptap/extension-table-cell";
import renderItems from "./slashCommand/renderItems";
import Placeholder from "@tiptap/extension-placeholder";
import TableHeader from "@tiptap/extension-table-header";
import { getSuggestionItems } from "./slashCommand/items";
import { LatexExtension } from "./math-extension";

export const initExtensions = (props: ScribeProps) => [
  StarterKit.configure({
    dropcursor: {
      width: 4,
      color: "#ebf6fe",
    },
  }),
  TaskList.configure({
    HTMLAttributes: {
      class: "scribe-task-list",
    },
  }),
  TaskItem.configure({
    nested: true,
  }),
  Table.configure({
    resizable: true,
  }),
  TableRow,
  TableHeader,
  TableCell,
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
  LatexExtension,
];
