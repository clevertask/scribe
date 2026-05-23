import { Extension } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion, { SuggestionOptions } from "@tiptap/suggestion";
import type { SlashCommandItemsProvider, SuggestionItem } from "./items";

export const slashMenuPluginKey = new PluginKey("slashSuggestion");

export type ScribeSlashCommandOptions = Omit<
  Partial<SuggestionOptions<SuggestionItem, SuggestionItem>>,
  "command" | "editor" | "items"
> & {
  items?: SlashCommandItemsProvider;
};

export type {
  SlashCommandContext,
  SlashCommandItemsProvider,
  SlashCommandItemsProviderProps,
  SuggestionItem,
} from "./items";

type SlashCommandOptions = {
  slashSuggestion: Partial<SuggestionOptions<SuggestionItem, SuggestionItem>>;
};

export const SlashCommand = Extension.create<SlashCommandOptions>({
  name: "slashCommand",

  addOptions() {
    return {
      ...this.parent?.(),
      slashSuggestion: {
        char: "/",
        startOfLine: true,
        command: ({ editor, range, props }) => {
          props.command({ editor, range, props });
        },
      } as Partial<SuggestionOptions<SuggestionItem, SuggestionItem>>,
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        pluginKey: slashMenuPluginKey,
        ...this.options.slashSuggestion,
        editor: this.editor,
      }),
    ];
  },
});
