import { Button, Flex, Separator } from "@radix-ui/themes";
import { Editor, useEditorState } from "@tiptap/react";
import {
  BubbleMenu as CoreBubbleMenu,
  type BubbleMenuProps as CoreBubbleMenuProps,
} from "@tiptap/react/menus";
import { KeyboardEventHandler, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalloutIcon, RemoveCalloutIcon } from "../../icons/CalloutIcon";
import {
  CALLOUT_VARIANTS,
  CALLOUT_VARIANT_LABELS,
  isCalloutVariant,
  type CalloutVariant,
} from "../Scribe/extension/callout";
import { getPopupMountTarget } from "../Scribe/extension/getPopupMountTarget";
import { calloutBubbleMenuPluginKey, getSelectionCalloutContext } from "./calloutBubbleMenuPlugin";
import { getSelectionContextualMenuOwner } from "./contextualMenuOwner";

export interface CalloutBubbleMenuProps {
  editor: Editor;
}

type CalloutBubbleMenuShouldShow = NonNullable<CoreBubbleMenuProps["shouldShow"]>;
type CalloutVariantOption = {
  color: "amber" | "blue" | "green" | "red";
  label: string;
  variant: CalloutVariant;
};

const CALLOUT_VARIANT_COLORS = {
  info: "blue",
  tip: "green",
  warning: "amber",
  caution: "red",
} as const satisfies Record<CalloutVariant, CalloutVariantOption["color"]>;
const CALLOUT_VARIANT_OPTIONS: CalloutVariantOption[] = CALLOUT_VARIANTS.map((variant) => ({
  color: CALLOUT_VARIANT_COLORS[variant],
  label: CALLOUT_VARIANT_LABELS[variant],
  variant,
}));
const SCROLLABLE_OVERFLOW = /auto|overlay|scroll/;

const normalizeCalloutVariant = (variant: unknown): CalloutVariant =>
  isCalloutVariant(variant) ? variant : "info";

const getScrollableAncestors = (element: HTMLElement) => {
  const ownerWindow = element.ownerDocument.defaultView;

  if (!ownerWindow) {
    return [];
  }

  const ancestors: HTMLElement[] = [];
  let ancestor = element.parentElement;

  while (
    ancestor &&
    ancestor !== element.ownerDocument.body &&
    ancestor !== element.ownerDocument.documentElement
  ) {
    const style = ownerWindow.getComputedStyle(ancestor);

    if (SCROLLABLE_OVERFLOW.test(`${style.overflow} ${style.overflowX} ${style.overflowY}`)) {
      ancestors.push(ancestor);
    }

    ancestor = ancestor.parentElement;
  }

  return ancestors;
};

const CalloutBubbleMenu = ({ editor }: CalloutBubbleMenuProps) => {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [menuMaxWidth, setMenuMaxWidth] = useState<number | null>(null);
  const hasCalloutCommands = useMemo(
    () =>
      Boolean(editor.schema.nodes.callout) &&
      typeof editor.commands.setCalloutVariant === "function" &&
      typeof editor.commands.unsetCallout === "function",
    [editor],
  );
  const activeVariant = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => {
      const context = getSelectionCalloutContext(currentEditor.state);

      return context ? normalizeCalloutVariant(context.node.attrs.variant) : null;
    },
  });
  const handleShouldShow = useCallback<CalloutBubbleMenuShouldShow>(
    ({ editor: currentEditor, element, state, view }) => {
      const hasFocus = view.hasFocus() || element.contains(element.ownerDocument.activeElement);

      return (
        hasCalloutCommands &&
        currentEditor.isEditable &&
        hasFocus &&
        getSelectionContextualMenuOwner(state) === "callout"
      );
    },
    [hasCalloutCommands],
  );
  const getReferencedVirtualElement = useCallback(() => {
    if (editor.isDestroyed) {
      return null;
    }

    const calloutContext = getSelectionCalloutContext(editor.state);

    if (!calloutContext) {
      return null;
    }

    const calloutDom = editor.view.nodeDOM(calloutContext.position);

    if (!(calloutDom instanceof HTMLElement)) {
      return null;
    }

    return (
      calloutDom.closest<HTMLElement>('[data-type="callout"]') ??
      calloutDom.querySelector<HTMLElement>('[data-type="callout"]') ??
      calloutDom
    );
  }, [editor]);
  const appendTo = useCallback(() => getPopupMountTarget(editor), [editor]);

  useEffect(() => {
    const ownerWindow = editor.view.dom.ownerDocument.defaultView;

    if (!ownerWindow) {
      return;
    }

    const scrollableAncestors = getScrollableAncestors(editor.view.dom);
    let positionFrame: number | null = null;
    const updatePosition = () => {
      if (positionFrame !== null) {
        return;
      }

      positionFrame = ownerWindow.requestAnimationFrame(() => {
        positionFrame = null;

        if (!editor.isDestroyed) {
          editor.view.dispatch(
            editor.state.tr.setMeta(calloutBubbleMenuPluginKey, "updatePosition"),
          );
        }
      });
    };

    ownerWindow.addEventListener("scroll", updatePosition, { passive: true });
    scrollableAncestors.forEach((ancestor) => {
      ancestor.addEventListener("scroll", updatePosition, { passive: true });
    });

    return () => {
      if (positionFrame !== null) {
        ownerWindow.cancelAnimationFrame(positionFrame);
      }

      ownerWindow.removeEventListener("scroll", updatePosition);
      scrollableAncestors.forEach((ancestor) => {
        ancestor.removeEventListener("scroll", updatePosition);
      });
    };
  }, [editor]);

  useEffect(() => {
    const editorRoot = editor.view.dom.closest<HTMLElement>("[data-scribe-root]");
    const ownerWindow = editor.view.dom.ownerDocument.defaultView;

    if (!editorRoot || !ownerWindow) {
      return;
    }

    const updateMenuWidth = () => {
      const editorWidth = editorRoot.getBoundingClientRect().width;

      setMenuMaxWidth(editorWidth > 0 ? Math.max(editorWidth - 16, 0) : null);
    };

    updateMenuWidth();

    if (!ownerWindow.ResizeObserver) {
      return;
    }

    const resizeObserver = new ownerWindow.ResizeObserver(updateMenuWidth);

    resizeObserver.observe(editorRoot);

    return () => resizeObserver.disconnect();
  }, [editor]);

  useEffect(() => {
    const editorDom = editor.view.dom;
    const handleEditorKeyDown = (event: KeyboardEvent) => {
      if (
        event.key !== "F10" ||
        !event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        !editor.isEditable ||
        getSelectionContextualMenuOwner(editor.state) !== "callout"
      ) {
        return;
      }

      const firstControl =
        toolbarRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)");

      if (!firstControl) {
        return;
      }

      event.preventDefault();
      firstControl.focus();
    };

    editorDom.addEventListener("keydown", handleEditorKeyDown, true);

    return () => editorDom.removeEventListener("keydown", handleEditorKeyDown, true);
  }, [editor]);

  const handleToolbarKeyDown = useCallback<KeyboardEventHandler<HTMLDivElement>>(
    (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        editor.chain().focus().run();
        return;
      }

      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
        return;
      }

      const controls = Array.from(
        event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
      );

      if (controls.length === 0) {
        return;
      }

      const activeElement = event.currentTarget.ownerDocument.activeElement;
      const activeIndex = controls.findIndex((control) => control === activeElement);
      let targetIndex = activeIndex;

      if (event.key === "Home") {
        targetIndex = 0;
      } else if (event.key === "End") {
        targetIndex = controls.length - 1;
      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        targetIndex = activeIndex <= 0 ? controls.length - 1 : activeIndex - 1;
      } else {
        targetIndex = activeIndex < 0 || activeIndex === controls.length - 1 ? 0 : activeIndex + 1;
      }

      event.preventDefault();
      controls[targetIndex]?.focus();
    },
    [editor],
  );
  const options = useMemo<NonNullable<CoreBubbleMenuProps["options"]>>(
    () => ({
      strategy: "fixed",
      placement: "top-start",
      offset: 8,
      flip: {},
      shift: { padding: 8 },
    }),
    [],
  );

  if (!hasCalloutCommands) {
    return null;
  }

  return (
    <CoreBubbleMenu
      editor={editor}
      pluginKey={calloutBubbleMenuPluginKey}
      updateDelay={0}
      resizeDelay={0}
      appendTo={appendTo}
      shouldShow={handleShouldShow}
      getReferencedVirtualElement={getReferencedVirtualElement}
      options={options}
    >
      <Flex
        ref={toolbarRef}
        className="scribe-callout-bubble-menu"
        role="toolbar"
        aria-label="Callout type"
        aria-keyshortcuts="Alt+F10"
        align="center"
        gap="1"
        wrap="wrap"
        onKeyDown={handleToolbarKeyDown}
        style={menuMaxWidth === null ? undefined : { maxWidth: menuMaxWidth }}
      >
        {CALLOUT_VARIANT_OPTIONS.map(({ color, label, variant }) => (
          <Button
            key={variant}
            type="button"
            className="scribe-callout-type-button"
            size="1"
            radius="medium"
            color={color}
            variant={activeVariant === variant ? "soft" : "ghost"}
            aria-pressed={activeVariant === variant}
            onClick={() => editor.chain().focus().setCalloutVariant(variant).run()}
          >
            <CalloutIcon variant={variant} />
            {label}
          </Button>
        ))}
        <Separator className="scribe-callout-menu-separator" orientation="vertical" decorative />
        <Button
          type="button"
          className="scribe-callout-type-button"
          size="1"
          radius="medium"
          color="gray"
          variant="ghost"
          onClick={() => editor.chain().focus().unsetCallout().run()}
        >
          <RemoveCalloutIcon />
          Turn into text
        </Button>
      </Flex>
    </CoreBubbleMenu>
  );
};

export default CalloutBubbleMenu;
