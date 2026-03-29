import tippy from "tippy.js";
import { ReactRenderer } from "@tiptap/react";

import { EmojiList, EmojiListRef } from "./EmojiList";

export default ({ darkMode }) => ({
  items: ({ editor, query }) => {
    return editor.storage.emoji.emojis
      .filter(({ shortcodes, tags }) => {
        return (
          shortcodes.find((shortcode) => shortcode.startsWith(query.toLowerCase())) ||
          tags.find((tag) => tag.startsWith(query.toLowerCase()))
        );
      })
      .slice(0, 5);
  },

  allowSpaces: false,

  render: () => {
    let component: ReactRenderer<EmojiListRef>;
    let popup: ReturnType<typeof tippy> = [];

    return {
      onStart: (props) => {
        if (!props.clientRect) {
          return;
        }

        component = new ReactRenderer(EmojiList, {
          props: { ...props, darkMode },
          editor: props.editor,
        });

        popup = tippy("body", {
          getReferenceClientRect: props.clientRect,
          appendTo: () => document.body,
          content: component.element,
          showOnCreate: true,
          interactive: true,
          trigger: "manual",
          placement: "bottom-start",
        });
      },

      onUpdate(props) {
        if (!component || !popup[0] || !props.clientRect) {
          return;
        }

        component.updateProps({ ...props, darkMode });

        popup[0].setProps({
          getReferenceClientRect: props.clientRect,
        });
      },

      onKeyDown(props) {
        if (props.event.key === "Escape" && popup[0]) {
          popup[0].hide();

          return true;
        }

        return component?.ref?.onKeyDown(props) ?? false;
      },

      onExit() {
        popup[0]?.destroy();
        component?.destroy();
      },
    };
  },
});
