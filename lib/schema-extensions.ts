import type { AnyExtension } from "@tiptap/core";
import Emoji, { gitHubEmojis } from "@tiptap/extension-emoji";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import { Mathematics } from "@tiptap/extension-mathematics";
import { TableKit } from "@tiptap/extension-table";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import Typography from "@tiptap/extension-typography";
import StarterKit from "@tiptap/starter-kit";
import { Callout } from "./components/Scribe/extension/callout";
import { ExternalLinkPreviewSchema } from "./components/Scribe/extension/external-link-preview/schema";
import Link from "./components/Scribe/extension/extension-link";
import { ScribeTable } from "./components/Scribe/extension/resizable-table";
import type { ScribeSchemaExtensionOptions } from "./schema";

type ScribeSchemaExtensionSet = {
  starterKit: AnyExtension;
  externalLinkPreview: AnyExtension;
  callout: AnyExtension;
  taskList: AnyExtension;
  taskItem: AnyExtension;
  tableKit: AnyExtension;
  table: AnyExtension;
  highlight: AnyExtension;
  link: AnyExtension;
  image: AnyExtension;
  emoji: AnyExtension;
  mathematics: AnyExtension;
  typography: AnyExtension;
};

export const createScribeSchemaExtensionSet = ({
  enableUndoRedo,
}: ScribeSchemaExtensionOptions = {}): ScribeSchemaExtensionSet => ({
  starterKit: StarterKit.configure({
    dropcursor: {
      width: 4,
      color: "#ebf6fe",
    },
    link: false,
    ...(enableUndoRedo === false ? { undoRedo: false } : {}),
  }),
  externalLinkPreview: ExternalLinkPreviewSchema,
  callout: Callout,
  taskList: TaskList.configure({
    HTMLAttributes: {
      class: "scribe-task-list",
    },
  }),
  taskItem: TaskItem.configure({
    nested: true,
  }),
  tableKit: TableKit.configure({ table: false }),
  table: ScribeTable,
  highlight: Highlight,
  link: Link,
  image: Image.configure({
    inline: true,
    HTMLAttributes: {
      class: "scribe-image-node",
    },
    allowBase64: true,
  }),
  emoji: Emoji.configure({
    emojis: gitHubEmojis,
    enableEmoticons: true,
  }),
  mathematics: Mathematics,
  typography: Typography,
});
