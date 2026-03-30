import { Editor } from "@tiptap/react";

const SCRIBE_ROOT_SELECTOR = "[data-scribe-root]";
const SCRIBE_POPUP_ROOT_SELECTOR = "[data-scribe-popup-root]";
const RADIX_DIALOG_CONTENT_SELECTOR = ".rt-BaseDialogContent";
const RADIX_DIALOG_OVERLAY_SELECTOR = ".rt-BaseDialogOverlay";
const RADIX_THEME_SELECTOR = ".radix-themes";

export const getPopupMountTarget = (editor: Editor): HTMLElement => {
  const editorElement = editor.view.dom as HTMLElement | null;
  const scribeRoot = editorElement?.closest(SCRIBE_ROOT_SELECTOR);
  const scribePopupRoot = scribeRoot?.querySelector(SCRIBE_POPUP_ROOT_SELECTOR);

  if (scribePopupRoot instanceof HTMLElement) {
    return scribePopupRoot;
  }

  const dialogContent = editorElement?.closest(RADIX_DIALOG_CONTENT_SELECTOR);

  if (dialogContent instanceof HTMLElement) {
    return dialogContent;
  }

  const dialogOverlay = editorElement?.closest(RADIX_DIALOG_OVERLAY_SELECTOR);

  if (dialogOverlay instanceof HTMLElement) {
    return dialogOverlay;
  }

  const themeContainer = editorElement?.closest(RADIX_THEME_SELECTOR);

  if (themeContainer instanceof HTMLElement) {
    return themeContainer;
  }

  return editorElement?.ownerDocument?.body ?? document.body;
};
