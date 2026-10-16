import { getMarkRange } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { normalizeLinkUrl } from "../../../Menu/linkUrl";
import {
  EXTERNAL_LINK_PREVIEW_NODE_NAME,
  normalizeExternalLinkPreviewAttributes,
  normalizeExternalLinkPreviewHref,
} from "./attributes";
import type {
  ExternalLinkDisplay,
  ExternalLinkPreviewAttributes,
  InsertExternalLinkPreviewOptions,
  UpdateExternalLinkPreviewOptions,
} from "./types";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    externalLinkPreview: {
      /** @deprecated Insert a legacy node rendered as an ordinary link; no metadata is fetched. */
      insertExternalLinkPreview: (options: InsertExternalLinkPreviewOptions) => ReturnType;
      /** @deprecated Only explicit conversion to plain is supported; compact/card return false. */
      setExternalLinkDisplay: (display: ExternalLinkDisplay, targetPosition?: number) => ReturnType;
      /** Atomically convert a preview to a Plain link while applying its edited destination. */
      convertExternalLinkPreviewToPlain: (href: string, targetPosition?: number) => ReturnType;
      /** @deprecated Metadata fetching is retired; this command returns false. */
      refreshExternalLinkPreview: (targetPosition?: number) => ReturnType;
      /** Safely update the selected preview's destination, fallback text, or metadata. */
      updateExternalLinkPreview: (
        options: UpdateExternalLinkPreviewOptions,
        targetPosition?: number,
      ) => ReturnType;
    };
  }
}

interface PreviewContext {
  attributes: ExternalLinkPreviewAttributes;
  node: ProseMirrorNode;
  position: number;
}

export const getSelectedExternalLinkPreview = (
  transaction: Transaction,
  targetPosition?: number,
): PreviewContext | null => {
  const { selection } = transaction;
  const hasExplicitTarget = typeof targetPosition === "number";

  if (
    hasExplicitTarget &&
    (!Number.isInteger(targetPosition) ||
      targetPosition < 0 ||
      targetPosition >= transaction.doc.content.size)
  ) {
    return null;
  }

  const position = hasExplicitTarget ? targetPosition : selection.from;
  const node = hasExplicitTarget
    ? transaction.doc.nodeAt(position)
    : selection instanceof NodeSelection
      ? selection.node
      : null;

  if (!node || node.type.name !== EXTERNAL_LINK_PREVIEW_NODE_NAME) {
    return null;
  }

  const attributes = normalizeExternalLinkPreviewAttributes(node.attrs);

  if (!attributes) {
    return null;
  }

  return { attributes, node, position };
};

const setPreviewSelection = (transaction: Transaction, position: number) => {
  transaction.setSelection(NodeSelection.create(transaction.doc, position));
};

const replacePreviewWithPlainLink = (
  transaction: Transaction,
  context: PreviewContext,
  href = context.attributes.href,
  linkText = context.attributes.linkText,
) => {
  const linkType = transaction.doc.type.schema.marks.link;
  const parent = transaction.doc.resolve(context.position).parent;

  if (!linkType || !parent.type.allowsMarkType(linkType)) {
    return false;
  }

  const text = transaction.doc.type.schema.text(linkText, [linkType.create({ href })]);

  transaction.replaceWith(context.position, context.position + context.node.nodeSize, text);
  transaction.setSelection(
    TextSelection.create(transaction.doc, context.position, context.position + text.nodeSize),
  );

  return true;
};

export const createExternalLinkPreviewCommands = () => ({
  insertExternalLinkPreview:
    (options: InsertExternalLinkPreviewOptions) =>
    ({ dispatch, tr }: { dispatch?: (args?: unknown) => unknown; tr: Transaction }) => {
      const attributes = normalizeExternalLinkPreviewAttributes({
        ...options,
        linkText: options.linkText ?? options.href,
        display: options.display ?? "compact",
      });
      const type = tr.doc.type.schema.nodes[EXTERNAL_LINK_PREVIEW_NODE_NAME];
      const { selection } = tr;

      if (
        !attributes ||
        !type ||
        !selection.$from.sameParent(selection.$to) ||
        !selection.$from.parent.isTextblock ||
        !selection.$from.parent.canReplaceWith(selection.$from.index(), selection.$to.index(), type)
      ) {
        return false;
      }

      if (dispatch) {
        const position = selection.from;
        tr.replaceRangeWith(selection.from, selection.to, type.create(attributes));
        setPreviewSelection(tr, position);
      }
      return true;
    },
  setExternalLinkDisplay:
    (display: ExternalLinkDisplay, targetPosition?: number) =>
    ({ dispatch, tr }: { dispatch?: (args?: unknown) => unknown; tr: Transaction }) => {
      if (display !== "plain") {
        tr.setMeta("preventDispatch", true);
        return false;
      }
      const preview = getSelectedExternalLinkPreview(tr, targetPosition);
      if (preview) {
        const linkType = tr.doc.type.schema.marks.link;
        const parent = tr.doc.resolve(preview.position).parent;
        return (
          Boolean(linkType && parent.type.allowsMarkType(linkType)) &&
          (!dispatch || replacePreviewWithPlainLink(tr, preview))
        );
      }
      const linkType = tr.doc.type.schema.marks.link;
      return (
        typeof targetPosition !== "number" &&
        Boolean(linkType && getMarkRange(tr.selection.$from, linkType))
      );
    },
  convertExternalLinkPreviewToPlain:
    (requestedHref: string, targetPosition?: number) =>
    ({ dispatch, tr }: { dispatch?: (args?: unknown) => unknown; tr: Transaction }) => {
      const preview = getSelectedExternalLinkPreview(tr, targetPosition);
      const href = normalizeLinkUrl(requestedHref);
      const linkType = tr.doc.type.schema.marks.link;
      if (
        !preview ||
        !href ||
        !linkType ||
        !tr.doc.resolve(preview.position).parent.type.allowsMarkType(linkType)
      ) {
        tr.setMeta("preventDispatch", true);
        return false;
      }
      const text =
        preview.attributes.linkText === preview.attributes.href
          ? href
          : preview.attributes.linkText;
      return !dispatch || replacePreviewWithPlainLink(tr, preview, href, text);
    },
  refreshExternalLinkPreview: (_targetPosition?: number) => () => false,
  updateExternalLinkPreview:
    (options: UpdateExternalLinkPreviewOptions, targetPosition?: number) =>
    ({ dispatch, tr }: { dispatch?: (args?: unknown) => unknown; tr: Transaction }) => {
      const rejectAtomicChange = () => {
        tr.setMeta("preventDispatch", true);

        return false;
      };
      const preview = getSelectedExternalLinkPreview(tr, targetPosition);

      if (!preview) {
        return rejectAtomicChange();
      }

      const requestedHref = options.href ?? preview.attributes.href;
      const normalizedHref = normalizeExternalLinkPreviewHref(requestedHref);
      const hrefChanged = normalizedHref !== preview.attributes.href;

      if (!normalizedHref) {
        return rejectAtomicChange();
      }

      const definedUpdates = Object.fromEntries(
        Object.entries(options).filter(([, value]) => value !== undefined),
      );
      const attributes = normalizeExternalLinkPreviewAttributes({
        ...preview.attributes,
        ...definedUpdates,
        href: normalizedHref,
        linkText:
          options.linkText ??
          (hrefChanged && preview.attributes.linkText === preview.attributes.href
            ? normalizedHref
            : preview.attributes.linkText),
      });

      if (!attributes) {
        return rejectAtomicChange();
      }

      const hasChanges = Object.entries(attributes).some(
        ([key, value]) => preview.attributes[key as keyof ExternalLinkPreviewAttributes] !== value,
      );

      if (!hasChanges) {
        return true;
      }

      if (!dispatch) {
        return true;
      }

      tr.setNodeMarkup(preview.position, undefined, attributes);
      setPreviewSelection(tr, preview.position);

      return true;
    },
});
