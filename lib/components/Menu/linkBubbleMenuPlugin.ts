import { getMarkRange } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";
import { NodeSelection, PluginKey } from "@tiptap/pm/state";
import { Editor } from "@tiptap/react";
import {
  EXTERNAL_LINK_PREVIEW_NODE_NAME,
  normalizeExternalLinkPreviewAttributes,
} from "../Scribe/extension/external-link-preview/attributes";
import type {
  ExternalLinkPreviewAttributes,
  ExternalLinkPreviewDisplay,
} from "../Scribe/extension/external-link-preview/types";

export type LinkBubbleMenuFocusTarget = "dialog" | "url";

export type LinkBubbleMenuContext =
  | {
      display: "plain";
      from: number;
      href: string;
      kind: "plain";
      to: number;
    }
  | {
      attributes: ExternalLinkPreviewAttributes;
      display: ExternalLinkPreviewDisplay;
      from: number;
      href: string;
      kind: "preview";
      position: number;
      to: number;
    };

export const linkBubbleMenuPluginKey = new PluginKey("scribeLinkBubbleMenu");
const linkBubbleMenuFocusTargets = new WeakMap<Editor, LinkBubbleMenuFocusTarget>();

export const getPlainLinkContextAtPosition = (
  state: EditorState,
  position: number,
): Extract<LinkBubbleMenuContext, { kind: "plain" }> | null => {
  const linkType = state.schema.marks.link;

  if (
    !linkType ||
    !Number.isInteger(position) ||
    position < 0 ||
    position > state.doc.content.size
  ) {
    return null;
  }

  const $position = state.doc.resolve(position);

  if (!$position.parent.isTextblock) {
    return null;
  }

  const range = getMarkRange($position, linkType);

  if (!range) {
    return null;
  }

  const linkNode = state.doc.nodeAt(range.from);
  const linkMark = linkNode?.marks.find((mark) => mark.type === linkType);
  const href = typeof linkMark?.attrs.href === "string" ? linkMark.attrs.href : "";

  return href
    ? {
        display: "plain",
        from: range.from,
        href,
        kind: "plain",
        to: range.to,
      }
    : null;
};

export const getSelectionLinkContext = (state: EditorState): LinkBubbleMenuContext | null => {
  const { selection } = state;

  if (
    selection instanceof NodeSelection &&
    selection.node.type.name === EXTERNAL_LINK_PREVIEW_NODE_NAME
  ) {
    const attributes = normalizeExternalLinkPreviewAttributes(selection.node.attrs);

    return attributes
      ? {
          attributes,
          display: attributes.display,
          from: selection.from,
          href: attributes.href,
          kind: "preview",
          position: selection.from,
          to: selection.to,
        }
      : null;
  }

  if (!selection.$from.sameParent(selection.$to)) {
    return null;
  }

  const context = getPlainLinkContextAtPosition(state, selection.from);

  if (!context || selection.from < context.from || selection.to > context.to) {
    return null;
  }

  return context;
};

export const consumeLinkBubbleMenuFocusTarget = (editor: Editor) => {
  const target = linkBubbleMenuFocusTargets.get(editor) ?? "url";

  linkBubbleMenuFocusTargets.delete(editor);

  return target;
};

export const showLinkBubbleMenu = (
  editor: Editor,
  focusTarget: LinkBubbleMenuFocusTarget = "url",
) => {
  if (editor.isDestroyed) {
    return;
  }

  linkBubbleMenuFocusTargets.set(editor, focusTarget);
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
