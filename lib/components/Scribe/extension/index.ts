import "katex/dist/katex.min.css";
import Placeholder from "@tiptap/extension-placeholder";
import StarterKit from "@tiptap/starter-kit";
import { SlashCommand } from "./slashCommand";
import { getSuggestionItems } from "./slashCommand/items";
import renderItems from "./slashCommand/renderItems";
import Focus from "@tiptap/extension-focus";
import Highlight from "@tiptap/extension-highlight";
import SelectedText from "./extension-selectedText";
import Link from "./extension-link";
import Image from "@tiptap/extension-image";
import { ScribeProps } from "..";
import Table from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import MathExtension from "@clevertask/tiptap-math-extension";

export const initExtensions = (props: ScribeProps) => [
  StarterKit.configure({
    dropcursor: {
      width: 4,
      color: "#ebf6fe",
    },
  }),
  MathExtension.configure({ evaluation: true, delimiters: "bracket" }),
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
];
