import { Editor } from "@tiptap/react";

const RADIX_DIALOG_OVERLAY_SELECTOR = ".rt-BaseDialogOverlay";
const RADIX_THEME_SELECTOR = ".radix-themes";

export const getPopupMountTarget = (editor: Editor): HTMLElement => {
  const editorElement = editor.view.dom as HTMLElement | null;
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
