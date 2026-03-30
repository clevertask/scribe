import { ReactRenderer } from "@tiptap/react";
import { SuggestionKeyDownProps, SuggestionProps } from "@tiptap/suggestion";
import tippy, { Instance, Props } from "tippy.js";
import { getPopupMountTarget } from "../getPopupMountTarget";
import { SlashCommandList, SlashCommandRef } from "./SlashCommandList";

const renderItems = () => {
  let component: ReactRenderer<SlashCommandRef>;
  let popup: Instance<Props> | null = null;
  let suggestionProps: SuggestionProps;

  return {
    onStart: (props: SuggestionProps) => {
      suggestionProps = props;
      component = new ReactRenderer(SlashCommandList, {
        props: suggestionProps,
        editor: props.editor,
      });

      if (!props.clientRect) {
        return;
      }

      popup = tippy(props.editor.view.dom, {
        getReferenceClientRect: props.clientRect as Props["getReferenceClientRect"],
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
    onUpdate: (props: SuggestionProps) => {
      suggestionProps = props;
      component?.updateProps(suggestionProps);

      if (!props.clientRect) {
        return;
      }
      if (popup && !popup.state.isDestroyed) {
        popup.setProps({
          getReferenceClientRect: props.clientRect as Props["getReferenceClientRect"],
        });
      }
    },
    onKeyDown(props: SuggestionKeyDownProps) {
      if (props.event.key === "Escape" && popup && !popup.state.isDestroyed) {
        popup.hide();

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
      if (popup && !popup.state.isDestroyed) {
        popup.destroy();
      }
      component?.destroy();
    },
  };
};

export default renderItems;
