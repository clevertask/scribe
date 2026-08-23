import { getMarkRange } from "@tiptap/core";
import type { Mark, Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { normalizeLinkUrl } from "../../../Menu/linkUrl";
import {
  EXTERNAL_LINK_PREVIEW_NODE_NAME,
  hasExternalLinkPreviewMetadata,
  normalizeExternalLinkPreviewAttributes,
  normalizeExternalLinkPreviewHref,
} from "./attributes";
import { startExternalLinkPreviewResolution } from "./resolver";
import type {
  ExternalLinkDisplay,
  ExternalLinkPreviewAttributes,
  ExternalLinkPreviewDisplay,
  InsertExternalLinkPreviewOptions,
  UpdateExternalLinkPreviewOptions,
} from "./types";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    externalLinkPreview: {
      /** Insert an enhanced external link at the current selection. */
      insertExternalLinkPreview: (options: InsertExternalLinkPreviewOptions) => ReturnType;
      /** Convert the selected enhanced link or full-line Link mark to another presentation. */
      setExternalLinkDisplay: (display: ExternalLinkDisplay, targetPosition?: number) => ReturnType;
      /** Atomically convert a preview to a Plain link while applying its edited destination. */
      convertExternalLinkPreviewToPlain: (href: string, targetPosition?: number) => ReturnType;
      /** Explicitly refresh metadata for the selected enhanced link. */
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
  isSoleTextblockContent: boolean;
}

interface PlainLinkContext {
  href: string;
  linkText: string;
  mark: Mark;
  from: number;
  to: number;
  isSoleTextblockContent: boolean;
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

  const $position = transaction.doc.resolve(position);

  return {
    attributes,
    node,
    position,
    isSoleTextblockContent:
      $position.parent.isTextblock &&
      $position.parent.childCount === 1 &&
      $position.parent.content.size === node.nodeSize,
  };
};

const getPlainLink = (transaction: Transaction): PlainLinkContext | null => {
  const linkType = transaction.doc.type.schema.marks.link;

  if (!linkType) {
    return null;
  }

  const { selection } = transaction;

  if (!selection.$from.sameParent(selection.$to) || !selection.$from.parent.isTextblock) {
    return null;
  }

  const range = getMarkRange(selection.$from, linkType);
  const parentStart = selection.$from.start();
  const parent = selection.$from.parent;

  if (!range) {
    return null;
  }

  let mark: Mark | undefined;
  let isLosslessTextLink = true;
  let linkText = "";

  transaction.doc.nodesBetween(range.from, range.to, (node, position) => {
    if (!node.isText) {
      if (node.isInline) {
        isLosslessTextLink = false;
      }
      return;
    }

    const linkMark = node.marks.find((candidate) => candidate.type === linkType);
    const overlapFrom = Math.max(range.from, position);
    const overlapTo = Math.min(range.to, position + node.nodeSize);

    if (
      !linkMark ||
      node.marks.some((candidate) => candidate.type !== linkType) ||
      (mark && linkMark.attrs.href !== mark.attrs.href)
    ) {
      isLosslessTextLink = false;
      return;
    }

    mark = linkMark;
    linkText += node.text?.slice(overlapFrom - position, overlapTo - position) ?? "";
  });

  const href = normalizeExternalLinkPreviewHref(mark?.attrs.href);

  if (!isLosslessTextLink || !mark || !href) {
    return null;
  }

  return {
    href,
    linkText: linkText || href,
    mark,
    from: range.from,
    to: range.to,
    isSoleTextblockContent:
      range.from === parentStart && range.to === parentStart + parent.content.size,
  };
};

const canConsumerPreview = (href: string, shouldPreview?: (href: string) => boolean) => {
  if (!shouldPreview) {
    return true;
  }

  try {
    return shouldPreview(href);
  } catch {
    return false;
  }
};

const setPreviewSelection = (transaction: Transaction, position: number) => {
  transaction.setSelection(NodeSelection.create(transaction.doc, position));
};

const createPreviewNode = (transaction: Transaction, attributes: ExternalLinkPreviewAttributes) => {
  const type = transaction.doc.type.schema.nodes[EXTERNAL_LINK_PREVIEW_NODE_NAME];

  return type?.create(attributes) ?? null;
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

export const createExternalLinkPreviewCommands = ({
  resolveMetadata,
  shouldPreview,
}: {
  resolveMetadata: boolean;
  shouldPreview?: (href: string) => boolean;
}) => ({
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
      const cardNeedsMetadata =
        attributes?.display === "card" && !hasExternalLinkPreviewMetadata(attributes);

      if (
        !attributes ||
        !type ||
        (cardNeedsMetadata && !resolveMetadata) ||
        !canConsumerPreview(attributes.href, shouldPreview) ||
        !selection.$from.sameParent(selection.$to) ||
        !selection.$from.parent.isTextblock ||
        (attributes.display === "card" &&
          selection.$from.parent.content.size !== selection.content().size)
      ) {
        return false;
      }

      const replacementIndex = selection.$from.index();

      if (!selection.$from.parent.canReplaceWith(replacementIndex, replacementIndex, type)) {
        return false;
      }

      if (!dispatch) {
        return true;
      }

      const node = type.create(attributes);
      const position = selection.from;

      tr.replaceRangeWith(selection.from, selection.to, node);
      setPreviewSelection(tr, position);

      if (cardNeedsMetadata) {
        startExternalLinkPreviewResolution(tr, position, attributes.href);
      }

      return true;
    },
  setExternalLinkDisplay:
    (display: ExternalLinkDisplay, targetPosition?: number) =>
    ({ dispatch, tr }: { dispatch?: (args?: unknown) => unknown; tr: Transaction }) => {
      const rejectAtomicChange = () => {
        tr.setMeta("preventDispatch", true);

        return false;
      };
      const preview = getSelectedExternalLinkPreview(tr, targetPosition);

      if (preview) {
        const cardNeedsMetadata =
          display === "card" && !hasExternalLinkPreviewMetadata(preview.attributes);

        if (display === "card" && !preview.isSoleTextblockContent) {
          return rejectAtomicChange();
        }

        if (display === "plain") {
          const linkType = tr.doc.type.schema.marks.link;
          const parent = tr.doc.resolve(preview.position).parent;

          if (!linkType || !parent.type.allowsMarkType(linkType)) {
            return rejectAtomicChange();
          }

          return dispatch ? replacePreviewWithPlainLink(tr, preview) : true;
        }

        if (display !== "compact" && display !== "card") {
          return rejectAtomicChange();
        }

        if (cardNeedsMetadata && !resolveMetadata) {
          return rejectAtomicChange();
        }

        if (!dispatch || preview.attributes.display === display) {
          return true;
        }

        tr.setNodeMarkup(preview.position, undefined, {
          ...preview.attributes,
          display,
        });
        setPreviewSelection(tr, preview.position);

        if (cardNeedsMetadata) {
          startExternalLinkPreviewResolution(tr, preview.position, preview.attributes.href);
        }

        return true;
      }

      if (typeof targetPosition === "number") {
        return rejectAtomicChange();
      }

      const link = getPlainLink(tr);

      if (
        !link ||
        display === "plain" ||
        (display === "card" && !resolveMetadata) ||
        (display === "card" && !link.isSoleTextblockContent) ||
        !canConsumerPreview(link.href, shouldPreview)
      ) {
        return display === "plain" && Boolean(link) ? true : rejectAtomicChange();
      }

      const attributes = normalizeExternalLinkPreviewAttributes({
        href: link.href,
        linkText: link.linkText,
        display: display satisfies ExternalLinkPreviewDisplay,
      });
      const node = attributes ? createPreviewNode(tr, attributes) : null;

      if (!attributes || !node) {
        return rejectAtomicChange();
      }

      if (!dispatch) {
        return true;
      }

      tr.replaceWith(link.from, link.to, node);
      setPreviewSelection(tr, link.from);

      if (display === "card") {
        startExternalLinkPreviewResolution(tr, link.from, attributes.href);
      }

      return true;
    },
  convertExternalLinkPreviewToPlain:
    (requestedHref: string, targetPosition?: number) =>
    ({ dispatch, tr }: { dispatch?: (args?: unknown) => unknown; tr: Transaction }) => {
      const rejectAtomicChange = () => {
        tr.setMeta("preventDispatch", true);

        return false;
      };
      const preview = getSelectedExternalLinkPreview(tr, targetPosition);
      const href = normalizeLinkUrl(requestedHref);

      if (!preview || !href) {
        return rejectAtomicChange();
      }

      const linkType = tr.doc.type.schema.marks.link;
      const parent = tr.doc.resolve(preview.position).parent;

      if (!linkType || !parent.type.allowsMarkType(linkType)) {
        return rejectAtomicChange();
      }

      if (!dispatch) {
        return true;
      }

      const linkText =
        preview.attributes.linkText === preview.attributes.href
          ? href
          : preview.attributes.linkText;

      return replacePreviewWithPlainLink(tr, preview, href, linkText);
    },
  refreshExternalLinkPreview:
    (targetPosition?: number) =>
    ({ dispatch, tr }: { dispatch?: (args?: unknown) => unknown; tr: Transaction }) => {
      const preview = getSelectedExternalLinkPreview(tr, targetPosition);

      if (
        !preview ||
        preview.attributes.display !== "card" ||
        !resolveMetadata ||
        !canConsumerPreview(preview.attributes.href, shouldPreview)
      ) {
        return false;
      }

      if (dispatch) {
        if (typeof targetPosition === "number") {
          setPreviewSelection(tr, preview.position);
        }
        startExternalLinkPreviewResolution(tr, preview.position, preview.attributes.href);
        tr.setMeta("addToHistory", false);
      }

      return true;
    },
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

      if (!normalizedHref || !canConsumerPreview(normalizedHref, shouldPreview)) {
        return rejectAtomicChange();
      }

      const definedUpdates = Object.fromEntries(
        Object.entries(options).filter(([, value]) => value !== undefined),
      );
      const metadataReset = hrefChanged
        ? {
            pageTitle: null,
            description: null,
            siteName: null,
            faviconUrl: null,
            imageUrl: null,
            fetchedAt: null,
          }
        : {};
      const attributes = normalizeExternalLinkPreviewAttributes({
        ...preview.attributes,
        ...metadataReset,
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

      if (hrefChanged && preview.attributes.display === "card" && resolveMetadata) {
        startExternalLinkPreviewResolution(tr, preview.position, attributes.href);
      }

      return true;
    },
});
