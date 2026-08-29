import type { ScribeProps } from "..";
import MarkdownPaste from "./extension-markdown-paste";
import Focus from "@tiptap/extension-focus";
import { SlashCommand } from "./slashCommand";
import SelectedText from "./extension-selectedText";
import renderItems from "./slashCommand/renderItems";
import Placeholder from "@tiptap/extension-placeholder";
import { getSlashCommandContext, getSuggestionItems } from "./slashCommand/items";
import suggestion from "./emoji/suggest";
import { ScribeTableOfContents } from "./tableOfContents";
import { ExternalLinkPreview } from "./external-link-preview";
import { createScribeSchemaExtensionSet } from "../../../schema-extensions";

export const initExtensions = (props: ScribeProps) => {
  const {
    items: getCustomSlashCommandItems,
    render: renderSlashCommandItems,
    ...slashSuggestion
  } = props.slashCommand ?? {};
  const schemaExtensions = createScribeSchemaExtensionSet({
    enableUndoRedo: props.enableUndoRedo,
  });

  return [
    schemaExtensions.starterKit,
    ExternalLinkPreview.configure(props.externalLinkPreview),
    schemaExtensions.callout,
    schemaExtensions.taskList,
    schemaExtensions.taskItem,
    schemaExtensions.tableKit,
    schemaExtensions.table,
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
        ...slashSuggestion,
        items: (suggestionProps) => {
          const defaultItems = getSuggestionItems(suggestionProps);

          if (!getCustomSlashCommandItems) {
            return defaultItems;
          }

          return getCustomSlashCommandItems({
            ...suggestionProps,
            context: getSlashCommandContext(suggestionProps.editor),
            defaultItems,
          });
        },
        render: renderSlashCommandItems ?? renderItems,
      },
    }),
    schemaExtensions.highlight,
    SelectedText,
    schemaExtensions.link,
    schemaExtensions.image,
    schemaExtensions.emoji.configure({ suggestion: suggestion() }),
    schemaExtensions.mathematics,
    schemaExtensions.typography,
    ...(props.enableTableOfContents
      ? [
          ScribeTableOfContents.configure({
            onUpdate: props.onTableOfContentsChange,
          }),
        ]
      : []),
  ];
};
