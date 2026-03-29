import { ReactRenderer } from "@tiptap/react";
import { SuggestionKeyDownProps, SuggestionProps } from "@tiptap/suggestion";
import tippy, { Instance, Props } from "tippy.js";
import { SlashCommandList, SlashCommandRef } from "./SlashCommandList";

const renderItems = (_props) => () => {
  let component: ReactRenderer<SlashCommandRef>;
  let popup: Instance<Props>[] = [];
  let suggestionProps: SuggestionProps & { darkMode?: boolean };

  return {
    onStart: (props: SuggestionProps) => {
      suggestionProps = { ...props, ..._props };
      component = new ReactRenderer(SlashCommandList, {
        props: suggestionProps,
        editor: props.editor,
      });

      if (!props.clientRect) {
        return;
      }

      popup = tippy("body", {
        getReferenceClientRect: props.clientRect as Props["getReferenceClientRect"],
        appendTo: () => document.body,
        content: component.element,
        showOnCreate: true,
        interactive: true,
        trigger: "manual",
        placement: "bottom-start",
      });
    },
    onUpdate: (props: SuggestionProps) => {
      suggestionProps = { ...props, ..._props };
      component?.updateProps(suggestionProps);

      if (!props.clientRect) {
        return;
      }
      if (popup[0] && !popup[0].state.isDestroyed) {
        popup[0].setProps({
          getReferenceClientRect: props.clientRect as Props["getReferenceClientRect"],
        });
      }
    },
    onKeyDown(props: SuggestionKeyDownProps) {
      if (props.event.key === "Escape" && popup[0] && !popup[0].state.isDestroyed) {
        popup[0].hide();

        return true;
      }

      if (props.event.key === "Enter") {
        if (
          suggestionProps.items.filter((item) =>
            item.title.toLowerCase().startsWith(suggestionProps.query.toLowerCase()),
          ).length === 0
        ) {
          this.onExit();
        }
      }

      return (component?.ref as SlashCommandRef | undefined)?.onKeyDown(props) || false;
    },
    onExit() {
      if (popup[0] && !popup[0].state.isDestroyed) {
        popup[0].destroy();
      }
      component?.destroy();
    },
  };
};

export default renderItems;
