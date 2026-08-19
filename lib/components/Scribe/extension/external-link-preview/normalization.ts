import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorState } from "@tiptap/pm/state";
import { EXTERNAL_LINK_PREVIEW_NODE_NAME } from "./attributes";

export const externalLinkPreviewNormalizationPluginKey = new PluginKey(
  "scribeExternalLinkPreviewNormalization",
);

export const createExternalLinkPreviewNormalizationTransaction = (state: EditorState) => {
  const transaction = state.tr;
  let changed = false;

  state.doc.descendants((node, position) => {
    if (node.type.name !== EXTERNAL_LINK_PREVIEW_NODE_NAME || node.attrs.display !== "card") {
      return;
    }

    const $position = state.doc.resolve(position);
    const isSoleTextblockContent =
      $position.parent.isTextblock &&
      $position.parent.childCount === 1 &&
      $position.parent.content.size === node.nodeSize;

    if (isSoleTextblockContent) {
      return;
    }

    transaction.setNodeMarkup(position, undefined, {
      ...node.attrs,
      display: "compact",
    });
    changed = true;
  });

  return changed ? transaction.setMeta(externalLinkPreviewNormalizationPluginKey, true) : null;
};

/** Keep the persisted display contract aligned with Card's sole-textblock requirement. */
export const createExternalLinkPreviewNormalizationPlugin = () =>
  new Plugin({
    key: externalLinkPreviewNormalizationPluginKey,
    appendTransaction(transactions, _oldState, newState) {
      if (
        !transactions.some((transaction) => transaction.docChanged) ||
        transactions.some((transaction) =>
          transaction.getMeta(externalLinkPreviewNormalizationPluginKey),
        )
      ) {
        return null;
      }

      return createExternalLinkPreviewNormalizationTransaction(newState);
    },
  });
