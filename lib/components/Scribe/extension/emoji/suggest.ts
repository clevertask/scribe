import tippy, { Instance, Props } from "tippy.js";
import { ReactRenderer } from "@tiptap/react";

import { getPopupMountTarget } from "../getPopupMountTarget";
import { EmojiList, EmojiListRef } from "./EmojiList";

export default () => ({
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
    let popup: Instance<Props> | null = null;

    return {
      onStart: (props) => {
        if (!props.clientRect) {
          return;
        }

        component = new ReactRenderer(EmojiList, {
          props,
          editor: props.editor,
        });

        popup = tippy(props.editor.view.dom, {
          getReferenceClientRect: props.clientRect,
          appendTo: getPopupMountTarget(props.editor),
          content: component.element,
          popperOptions: {
            strategy: "fixed",
          },
          showOnCreate: true,
          interactive: true,
          trigger: "manual",
          placement: "bottom-start",
        });
      },

      onUpdate(props) {
        if (!component || !popup || !props.clientRect) {
          return;
        }

        component.updateProps(props);

        popup.setProps({
          getReferenceClientRect: props.clientRect,
        });
      },

      onKeyDown(props) {
        if (props.event.key === "Escape" && popup) {
          popup.hide();

          return true;
        }

        return component?.ref?.onKeyDown(props) ?? false;
      },

      onExit() {
        popup?.destroy();
        component?.destroy();
      },
    };
  },
});
