import type { NodeType } from "@tiptap/pm/model";
import { NodeSelection, Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { normalizeLinkUrl } from "../../../Menu/linkUrl";
import {
  normalizeExternalLinkPreviewAttributes,
  normalizeExternalLinkPreviewHref,
} from "./attributes";
import { startExternalLinkPreviewResolution } from "./resolver";

const externalLinkPreviewPastePluginKey = new PluginKey("scribeExternalLinkPreviewPaste");

const getExactClipboardText = (event: ClipboardEvent) => {
  const clipboardText = event.clipboardData?.getData("text/plain");

  if (!clipboardText) {
    return null;
  }

  const trimmedText = clipboardText.trim();

  return trimmedText && !/[\r\n]/.test(trimmedText) ? trimmedText : null;
};

const applyUrlToSelectedText = (view: EditorView, href: string) => {
  const { selection, schema } = view.state;
  const linkType = schema.marks.link;

  if (selection.empty || !linkType) {
    return false;
  }

  const transaction = view.state.tr.setMeta("preventAutolink", true);
  let applied = false;

  view.state.doc.nodesBetween(selection.from, selection.to, (node, position, parent) => {
    if (!node.isText || !parent?.isTextblock || !parent.type.allowsMarkType(linkType)) {
      return;
    }

    const from = Math.max(position, selection.from);
    const to = Math.min(position + node.nodeSize, selection.to);

    if (from < to) {
      transaction.addMark(from, to, linkType.create({ href }));
      applied = true;
    }
  });

  if (!applied) {
    return false;
  }

  view.dispatch(transaction);

  return true;
};

const canInsertStandalonePreview = (view: EditorView, type: NodeType) => {
  const { selection } = view.state;
  let containsOnlyWhitespaceText = true;

  selection.$from.parent.forEach((child) => {
    if (!child.isText || child.textContent.trim()) {
      containsOnlyWhitespaceText = false;
    }
  });

  if (
    !selection.empty ||
    selection.$from.parent.type.name !== "paragraph" ||
    !containsOnlyWhitespaceText
  ) {
    return false;
  }

  return selection.$from.parent.canReplaceWith(0, selection.$from.parent.childCount, type);
};

export const createExternalLinkPreviewPastePlugin = ({
  previewType,
  resolveMetadata,
  shouldPreview,
}: {
  previewType: NodeType;
  resolveMetadata: boolean;
  shouldPreview?: (href: string) => boolean;
}) =>
  new Plugin({
    key: externalLinkPreviewPastePluginKey,
    props: {
      handlePaste(view, event) {
        const clipboardText = getExactClipboardText(event);

        if (!clipboardText) {
          return false;
        }

        const selectedTextHref = normalizeLinkUrl(clipboardText);

        if (!view.state.selection.empty && selectedTextHref) {
          const applied = applyUrlToSelectedText(view, selectedTextHref);

          if (applied) {
            event.preventDefault();
          }

          return applied;
        }

        const href = normalizeExternalLinkPreviewHref(clipboardText);

        if (!resolveMetadata || !href || !canInsertStandalonePreview(view, previewType)) {
          return false;
        }

        try {
          if (shouldPreview && !shouldPreview(href)) {
            return false;
          }
        } catch {
          return false;
        }

        const attributes = normalizeExternalLinkPreviewAttributes({
          href,
          linkText: clipboardText,
          display: "compact",
        });

        if (!attributes) {
          return false;
        }

        event.preventDefault();
        const paragraphStart = view.state.selection.$from.start();
        const paragraphEnd = paragraphStart + view.state.selection.$from.parent.content.size;
        const position = paragraphStart;
        const transaction = view.state.tr.replaceWith(
          paragraphStart,
          paragraphEnd,
          previewType.create(attributes),
        );

        transaction.setSelection(NodeSelection.create(transaction.doc, position));

        if (resolveMetadata) {
          startExternalLinkPreviewResolution(transaction, position, href);
        }

        view.dispatch(transaction.scrollIntoView());

        return true;
      },
    },
  });
