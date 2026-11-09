import tippy, { Instance, Props } from "tippy.js";
import { ReactRenderer } from "@tiptap/react";

import { getPopupMountTarget } from "../getPopupMountTarget";
import { EmojiList, EmojiListRef } from "./EmojiList";
import { getEmojiSuggestions } from "./items";

export default () => ({
  items: ({ editor, query }) => {
    return getEmojiSuggestions(editor.storage.emoji.emojis, query);
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
