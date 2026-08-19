import type { MarkType, Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import {
  EXTERNAL_LINK_PREVIEW_NODE_NAME,
  normalizeExternalLinkPreviewAttributes,
} from "./attributes";

export const externalLinkPreviewPolicyPluginKey = new PluginKey("scribeExternalLinkPreviewPolicy");

const canConsumerPreview = (href: string, shouldPreview: (href: string) => boolean) => {
  try {
    return shouldPreview(href);
  } catch {
    return false;
  }
};

const createPlainLinkText = (
  state: EditorState,
  node: ProseMirrorNode,
  position: number,
  linkType: MarkType | undefined,
) => {
  const attributes = normalizeExternalLinkPreviewAttributes(node.attrs);

  if (!attributes) {
    return null;
  }

  const parent = state.doc.resolve(position).parent;
  const marks =
    linkType && parent.type.allowsMarkType(linkType)
      ? [linkType.create({ href: attributes.href })]
      : [];

  return state.schema.text(attributes.linkText, marks);
};

/** Convert previews rejected by a consumer policy into safe, ordinary link text. */
export const createExternalLinkPreviewPolicyTransaction = (
  state: EditorState,
  shouldPreview?: (href: string) => boolean,
): Transaction | null => {
  if (!shouldPreview) {
    return null;
  }

  const rejected: Array<{ node: ProseMirrorNode; position: number }> = [];

  state.doc.descendants((node, position) => {
    if (node.type.name !== EXTERNAL_LINK_PREVIEW_NODE_NAME) {
      return;
    }

    const attributes = normalizeExternalLinkPreviewAttributes(node.attrs);

    if (!attributes || !canConsumerPreview(attributes.href, shouldPreview)) {
      rejected.push({ node, position });
    }
  });

  if (!rejected.length) {
    return null;
  }

  const transaction = state.tr;
  const linkType = state.schema.marks.link;
  let changed = false;

  rejected
    .sort((left, right) => right.position - left.position)
    .forEach(({ node, position }) => {
      const text = createPlainLinkText(state, node, position, linkType);

      if (!text) {
        return;
      }

      transaction.replaceWith(position, position + node.nodeSize, text);
      changed = true;
    });

  return changed
    ? transaction.setMeta(externalLinkPreviewPolicyPluginKey, true).setMeta("addToHistory", false)
    : null;
};

export const createExternalLinkPreviewPolicyPlugin = (shouldPreview?: (href: string) => boolean) =>
  new Plugin({
    key: externalLinkPreviewPolicyPluginKey,
    appendTransaction(transactions, _oldState, newState) {
      if (
        !transactions.some((transaction) => transaction.docChanged) ||
        transactions.some((transaction) => transaction.getMeta(externalLinkPreviewPolicyPluginKey))
      ) {
        return null;
      }

      return createExternalLinkPreviewPolicyTransaction(newState, shouldPreview);
    },
  });
