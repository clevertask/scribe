import { Box } from "@radix-ui/themes";
import { Editor, useEditorState } from "@tiptap/react";
import {
  BubbleMenu as CoreBubbleMenu,
  type BubbleMenuProps as CoreBubbleMenuProps,
} from "@tiptap/react/menus";
import { FC, KeyboardEventHandler, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getPopupMountTarget } from "../Scribe/extension/getPopupMountTarget";
import { getSelectionContextualMenuOwner } from "./contextualMenuOwner";
import LinkEditor from "./LinkEditor";
import {
  consumeLinkBubbleMenuFocusTarget,
  getPlainLinkContextAtPosition,
  getSelectionLinkContext,
  hideLinkBubbleMenu,
  linkBubbleMenuPluginKey,
  showLinkBubbleMenu,
} from "./linkBubbleMenuPlugin";

export interface LinkBubbleMenuProps {
  editor: Editor;
}

type LinkBubbleMenuShouldShow = NonNullable<CoreBubbleMenuProps["shouldShow"]>;

const SCROLLABLE_OVERFLOW = /auto|overlay|scroll/;
const MENU_GAP = 8;
// Tiptap applies offset after shift, so reserve the gap as well as the viewport inset.
const MENU_COLLISION_PADDING = 8 + MENU_GAP;

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

const LinkBubbleMenu: FC<LinkBubbleMenuProps> = ({ editor }) => {
  const [linkValue, setLinkValue] = useState("");
  const [menuSession, setMenuSession] = useState(0);
  const [menuMaxWidth, setMenuMaxWidth] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const focusFrameRef = useRef<number | null>(null);
  const linkState = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => ({
      context: getSelectionLinkContext(currentEditor.state),
    }),
  });

  useEffect(() => {
    // Mirror the selected link when the editor moves to a different link range.
    // oxlint-disable-next-line react/set-state-in-effect
    setLinkValue(linkState.context?.href ?? "");
  }, [linkState.context?.from, linkState.context?.href, linkState.context?.to]);

  useEffect(() => {
    return () => {
      if (focusFrameRef.current !== null) {
        window.cancelAnimationFrame(focusFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (editor.isDestroyed) {
      return;
    }

    const editorElement = editor.view.dom;
    let pointerStart: { x: number; y: number } | null = null;

    const openPlainLink = (context: ReturnType<typeof getPlainLinkContextAtPosition>) => {
      if (!context) {
        return false;
      }

      editor.commands.setTextSelection({ from: context.from, to: context.to });

      if (getSelectionContextualMenuOwner(editor.state) !== "link") {
        return false;
      }

      showLinkBubbleMenu(editor, "dialog");

      return true;
    };

    const handleMouseDown = (event: MouseEvent) => {
      if (event.button !== 0 || !editor.isEditable) {
        return;
      }

      const target = event.target as Element | null;
      const link = target?.closest?.("a");

      if (!link || !editorElement.contains(link)) {
        return;
      }

      pointerStart = { x: event.clientX, y: event.clientY };
    };

    const handleClick = (event: MouseEvent) => {
      if (event.button !== 0 || !editor.isEditable) {
        return;
      }

      const target = event.target as Element | null;
      const link = target?.closest?.("a");

      if (!link || !editorElement.contains(link)) {
        return;
      }

      const movedWhileSelecting =
        event.detail > 0 &&
        pointerStart !== null &&
        Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 4;

      pointerStart = null;

      if (movedWhileSelecting) {
        return;
      }

      const legacyWrapper = link.closest('[data-type="external-link-preview"]');
      if (legacyWrapper) {
        let legacyPosition: number;
        try {
          legacyPosition = editor.view.posAtDOM(legacyWrapper, 0);
        } catch {
          return;
        }
        if (editor.state.doc.nodeAt(legacyPosition)?.type.name === "externalLinkPreview") {
          editor.commands.setNodeSelection(legacyPosition);
          event.preventDefault();
          showLinkBubbleMenu(editor, "dialog");
        }
        return;
      }

      let clickedPosition: number;

      try {
        clickedPosition = editor.view.posAtDOM(link, 0);
      } catch {
        return;
      }

      const context = getPlainLinkContextAtPosition(editor.state, clickedPosition);
      const contextNode = context ? editor.view.nodeDOM(context.from) : null;

      if (!contextNode || !link.contains(contextNode)) {
        return;
      }

      if (openPlainLink(context)) {
        event.preventDefault();
      }
    };

    editorElement.addEventListener("mousedown", handleMouseDown);
    editorElement.addEventListener("click", handleClick);

    return () => {
      editorElement.removeEventListener("mousedown", handleMouseDown);
      editorElement.removeEventListener("click", handleClick);
    };
  }, [editor]);

  useEffect(() => {
    const editorElement = editor.view.dom;
    const handleEditorKeyDown = (event: KeyboardEvent) => {
      if (
        event.key !== "F10" ||
        !event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        !editor.isEditable
      ) {
        return;
      }

      let context = getSelectionLinkContext(editor.state);

      if (context?.kind === "plain") {
        editor.chain().extendMarkRange("link").run();
        context = getSelectionLinkContext(editor.state);
      }

      if (!context || getSelectionContextualMenuOwner(editor.state) !== "link") {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      showLinkBubbleMenu(editor, context.kind === "preview" ? "dialog" : "url");
    };

    editorElement.addEventListener("keydown", handleEditorKeyDown, true);

    return () => editorElement.removeEventListener("keydown", handleEditorKeyDown, true);
  }, [editor]);

  useEffect(() => {
    const ownerDocument = editor.view.dom.ownerDocument;
    const ownerWindow = ownerDocument.defaultView;

    if (!ownerWindow) {
      return;
    }

    const dismissWhenOutside = (target: EventTarget | null) => {
      const dialog = dialogRef.current;

      if (
        !dialog?.isConnected ||
        !(target instanceof ownerWindow.Node) ||
        dialog.contains(target) ||
        editor.view.dom.contains(target)
      ) {
        return;
      }

      hideLinkBubbleMenu(editor);
    };
    const handlePointerDown = (event: PointerEvent) => dismissWhenOutside(event.target);
    const handleFocusIn = (event: FocusEvent) => dismissWhenOutside(event.target);

    ownerDocument.addEventListener("pointerdown", handlePointerDown, true);
    ownerDocument.addEventListener("focusin", handleFocusIn);

    return () => {
      ownerDocument.removeEventListener("pointerdown", handlePointerDown, true);
      ownerDocument.removeEventListener("focusin", handleFocusIn);
    };
  }, [editor]);

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
          editor.view.dispatch(editor.state.tr.setMeta(linkBubbleMenuPluginKey, "updatePosition"));
        }
      });
    };

    ownerWindow.addEventListener("scroll", updatePosition, { passive: true });
    ownerWindow.visualViewport?.addEventListener("resize", updatePosition);
    ownerWindow.visualViewport?.addEventListener("scroll", updatePosition);
    scrollableAncestors.forEach((ancestor) => {
      ancestor.addEventListener("scroll", updatePosition, { passive: true });
    });

    return () => {
      if (positionFrame !== null) {
        ownerWindow.cancelAnimationFrame(positionFrame);
      }

      ownerWindow.removeEventListener("scroll", updatePosition);
      ownerWindow.visualViewport?.removeEventListener("resize", updatePosition);
      ownerWindow.visualViewport?.removeEventListener("scroll", updatePosition);
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

  const handleClose = useCallback(() => {
    if (editor.isDestroyed) {
      return;
    }

    const selectionEnd = editor.state.selection.to;
    hideLinkBubbleMenu(editor);
    editor.chain().setTextSelection(selectionEnd).focus().run();
  }, [editor]);

  const handleShow = useCallback(() => {
    if (focusFrameRef.current !== null) {
      window.cancelAnimationFrame(focusFrameRef.current);
    }

    const context = getSelectionLinkContext(editor.state);
    const focusTarget = consumeLinkBubbleMenuFocusTarget(editor);
    const focusRequestedTarget = () => {
      if (focusTarget === "dialog") {
        dialogRef.current?.focus({ preventScroll: true });
      } else {
        inputRef.current?.focus({ preventScroll: true });
        inputRef.current?.select();
      }
    };

    setLinkValue(context?.href ?? "");
    setMenuSession((currentSession) => currentSession + 1);
    focusRequestedTarget();
    focusFrameRef.current = window.requestAnimationFrame(() => {
      focusFrameRef.current = null;
      focusRequestedTarget();
    });
  }, [editor]);

  const handleHide = useCallback(() => {
    if (focusFrameRef.current !== null) {
      window.cancelAnimationFrame(focusFrameRef.current);
      focusFrameRef.current = null;
    }
  }, []);

  const handleDialogKeyDown = useCallback<KeyboardEventHandler<HTMLDivElement>>(
    (event) => {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      handleClose();
    },
    [handleClose],
  );

  const handleShouldShow = useCallback<LinkBubbleMenuShouldShow>(
    ({ editor: currentEditor, element, state }) => {
      const hasMenuFocus = element.contains(element.ownerDocument.activeElement);

      return (
        currentEditor.isEditable &&
        Boolean(getSelectionLinkContext(state)) &&
        getSelectionContextualMenuOwner(state) === "link" &&
        hasMenuFocus
      );
    },
    [],
  );

  const appendTo = useCallback(() => getPopupMountTarget(editor), [editor]);
  const keepFocusedControlVisible = useCallback(() => {
    const dialog = dialogRef.current;
    const focused = dialog?.ownerDocument.activeElement;

    if (!dialog || !focused || focused === dialog || !dialog.contains(focused)) {
      return;
    }

    const dialogRect = dialog.getBoundingClientRect();
    const focusedRect = focused.getBoundingClientRect();
    const top = dialogRect.top + dialog.clientTop + MENU_GAP;
    const bottom = dialogRect.top + dialog.clientTop + dialog.clientHeight - MENU_GAP;

    // Scroll only the form when the keyboard leaves less room, preserving the page and caret.
    if (focusedRect.top < top) {
      dialog.scrollTop -= top - focusedRect.top;
    } else if (focusedRect.bottom > bottom) {
      dialog.scrollTop += focusedRect.bottom - bottom;
    }
  }, []);
  const options = useMemo<NonNullable<CoreBubbleMenuProps["options"]>>(
    () => ({
      strategy: "fixed",
      placement: "bottom",
      offset: MENU_GAP,
      flip: { padding: MENU_COLLISION_PADDING },
      shift: { padding: MENU_COLLISION_PADDING, crossAxis: true },
      size: {
        padding: MENU_COLLISION_PADDING,
        apply: ({ availableHeight }) => {
          if (dialogRef.current) {
            dialogRef.current.style.maxHeight = `min(32rem, ${Math.max(0, availableHeight)}px)`;
          }
        },
      },
      inline: true,
      onHide: handleHide,
      onShow: handleShow,
      onUpdate: keepFocusedControlVisible,
    }),
    [handleHide, handleShow, keepFocusedControlVisible],
  );
  const context = linkState.context;

  return (
    <CoreBubbleMenu
      editor={editor}
      pluginKey={linkBubbleMenuPluginKey}
      updateDelay={0}
      resizeDelay={0}
      appendTo={appendTo}
      shouldShow={handleShouldShow}
      options={options}
    >
      <Box
        ref={dialogRef}
        className="scribe-link-popover"
        role="dialog"
        aria-label="Edit link"
        aria-keyshortcuts="Alt+F10"
        tabIndex={-1}
        onFocusCapture={(event) => {
          // A chosen field or action takes precedence over the opening focus retry.
          if (event.target !== event.currentTarget) {
            handleHide();
          }
        }}
        onKeyDown={handleDialogKeyDown}
        style={{
          maxWidth:
            menuMaxWidth === null
              ? "calc(100vw - 32px)"
              : `min(${menuMaxWidth}px, calc(100vw - 32px))`,
          width: 320,
        }}
      >
        <LinkEditor
          editor={editor}
          existingHref={context?.href ?? ""}
          inputRef={inputRef}
          onClose={handleClose}
          onValueChange={setLinkValue}
          resetToken={menuSession}
          targetPosition={context?.kind === "preview" ? context.position : undefined}
          value={linkValue}
        />
      </Box>
    </CoreBubbleMenu>
  );
};

export default LinkBubbleMenu;
