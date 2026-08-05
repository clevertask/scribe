import { PluginKey } from "@tiptap/pm/state";
import { Editor } from "@tiptap/react";

export const linkBubbleMenuPluginKey = new PluginKey("scribeLinkBubbleMenu");

export const showLinkBubbleMenu = (editor: Editor) => {
  if (editor.isDestroyed) {
    return;
  }

  editor.view.dispatch(editor.state.tr.setMeta(linkBubbleMenuPluginKey, "show"));

  // BubbleMenu tries to position itself before `show` attaches it.
  if (editor.isDestroyed) {
    return;
  }

  editor.view.dispatch(editor.state.tr.setMeta(linkBubbleMenuPluginKey, "updatePosition"));
};

export const hideLinkBubbleMenu = (editor: Editor) => {
  if (editor.isDestroyed) {
    return;
  }

  editor.view.dispatch(editor.state.tr.setMeta(linkBubbleMenuPluginKey, "hide"));
};
