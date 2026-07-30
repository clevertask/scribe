import { Box } from "@radix-ui/themes";
import { Editor, useEditorState } from "@tiptap/react";
import {
  BubbleMenu as CoreBubbleMenu,
  type BubbleMenuProps as CoreBubbleMenuProps,
} from "@tiptap/react/menus";
import { FC, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getPopupMountTarget } from "../Scribe/extension/getPopupMountTarget";
import LinkEditor from "./LinkEditor";
import { hideLinkBubbleMenu, linkBubbleMenuPluginKey } from "./linkBubbleMenuPlugin";

export interface LinkBubbleMenuProps {
  editor: Editor;
}

type LinkBubbleMenuShouldShow = NonNullable<CoreBubbleMenuProps["shouldShow"]>;

const LinkBubbleMenu: FC<LinkBubbleMenuProps> = ({ editor }) => {
  const [linkValue, setLinkValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const focusFrameRef = useRef<number | null>(null);
  const linkState = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => {
      const { from, to } = currentEditor.state.selection;

      return {
        from,
        href: (currentEditor.getAttributes("link").href as string | undefined) ?? "",
        to,
      };
    },
  });

  useEffect(() => {
    setLinkValue(linkState.href);
  }, [linkState.from, linkState.href, linkState.to]);

  useEffect(() => {
    return () => {
      if (focusFrameRef.current !== null) {
        window.cancelAnimationFrame(focusFrameRef.current);
      }
    };
  }, []);

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

    focusFrameRef.current = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
      focusFrameRef.current = null;
    });
  }, []);

  const handleShouldShow = useCallback<LinkBubbleMenuShouldShow>(
    ({ editor: currentEditor, element, from, to, view }) => {
      const hasMenuFocus = element.contains(element.ownerDocument.activeElement);

      return (
        currentEditor.isEditable &&
        from !== to &&
        currentEditor.isActive("link") &&
        (view.hasFocus() || hasMenuFocus)
      );
    },
    [],
  );

  const appendTo = useCallback(() => getPopupMountTarget(editor), [editor]);
  const options = useMemo<NonNullable<CoreBubbleMenuProps["options"]>>(
    () => ({
      strategy: "fixed",
      placement: "bottom",
      offset: 8,
      flip: {},
      shift: { padding: 8 },
      inline: true,
      onShow: handleShow,
    }),
    [handleShow],
  );

  return (
    <CoreBubbleMenu
      editor={editor}
      pluginKey={linkBubbleMenuPluginKey}
      updateDelay={0}
      appendTo={appendTo}
      shouldShow={handleShouldShow}
      options={options}
    >
      <Box
        className="scribe-link-popover"
        role="dialog"
        aria-label="Edit link"
        style={{ maxWidth: "calc(100vw - 32px)", width: 320 }}
      >
        <LinkEditor
          editor={editor}
          existingHref={linkState.href}
          inputRef={inputRef}
          onClose={handleClose}
          onValueChange={setLinkValue}
          value={linkValue}
        />
      </Box>
    </CoreBubbleMenu>
  );
};

export default LinkBubbleMenu;
