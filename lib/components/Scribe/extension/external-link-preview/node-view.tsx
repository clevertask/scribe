import { NodeViewWrapper, type NodeViewProps, useEditorState } from "@tiptap/react";
import { showLinkBubbleMenu } from "../../../Menu/linkBubbleMenuPlugin";
import {
  getExternalLinkPreviewHostname,
  getExternalLinkPreviewTitle,
  normalizeExternalLinkPreviewAttributes,
} from "./attributes";
import type { ExternalLinkPreviewDisplay } from "./types";

const isSoleTextblockChildAt = (editor: NodeViewProps["editor"], position: number) => {
  const $position = editor.state.doc.resolve(position);
  const node = editor.state.doc.nodeAt(position);

  return Boolean(
    node &&
    $position.parent.isTextblock &&
    $position.parent.childCount === 1 &&
    $position.parent.content.size === node.nodeSize,
  );
};

const ExternalLinkPreviewIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16">
    <path
      d="M9.5 14.5l5-5m-7.25 7.25-1 1a3.18 3.18 0 004.5 4.5l3-3a3.18 3.18 0 000-4.5m3-7.5 1-1a3.18 3.18 0 014.5 4.5l-3 3a3.18 3.18 0 01-4.5 0"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="1.5"
    />
  </svg>
);

export const ExternalLinkPreviewNodeView = ({ editor, getPos, node }: NodeViewProps) => {
  const attributes = normalizeExternalLinkPreviewAttributes(node.attrs);
  const previewState = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => {
      const position = getPos();

      if (typeof position !== "number") {
        return {
          isEditable: currentEditor.isEditable,
          isSoleTextblockContent: false,
        };
      }

      return {
        isEditable: currentEditor.isEditable,
        isSoleTextblockContent: isSoleTextblockChildAt(currentEditor, position),
      };
    },
  });

  if (!attributes) {
    return (
      <NodeViewWrapper
        as="span"
        className="scribe-external-link-preview scribe-external-link-preview--invalid"
        data-type="external-link-preview"
      >
        Invalid external link
      </NodeViewWrapper>
    );
  }

  const effectiveDisplay: ExternalLinkPreviewDisplay =
    attributes.display === "card" && previewState.isSoleTextblockContent ? "card" : "compact";
  const title = getExternalLinkPreviewTitle(attributes, effectiveDisplay);
  const siteLabel =
    effectiveDisplay === "card"
      ? attributes.siteName || getExternalLinkPreviewHostname(attributes.href)
      : null;

  return (
    <NodeViewWrapper
      as="span"
      className={`scribe-external-link-preview scribe-external-link-preview--${effectiveDisplay}`}
      data-type="external-link-preview"
      data-display={effectiveDisplay}
      data-configured-display={attributes.display}
      contentEditable={false}
    >
      <a
        data-link-preview-target=""
        href={attributes.href}
        target="_blank"
        rel="noopener noreferrer"
        aria-haspopup={previewState.isEditable ? "dialog" : undefined}
        onClick={(event) => {
          if (!previewState.isEditable) {
            return;
          }

          event.preventDefault();

          const position = getPos();

          if (typeof position !== "number") {
            return;
          }

          if (editor.chain().focus().setNodeSelection(position).run()) {
            showLinkBubbleMenu(editor, "dialog");
          }
        }}
      >
        {effectiveDisplay === "card" && attributes.imageUrl ? (
          <img data-link-preview-image="" src={attributes.imageUrl} alt="" />
        ) : null}
        <span data-link-preview-main="">
          {effectiveDisplay === "card" && attributes.faviconUrl ? (
            <img data-link-preview-favicon="" src={attributes.faviconUrl} alt="" />
          ) : (
            <span data-link-preview-favicon-fallback="" aria-hidden="true">
              <ExternalLinkPreviewIcon />
            </span>
          )}
          <span data-link-preview-copy="">
            <span data-link-preview-title="">{title}</span>
            {siteLabel ? <span data-link-preview-site="">{siteLabel}</span> : null}
            {effectiveDisplay === "card" && attributes.description ? (
              <span data-link-preview-description="">{attributes.description}</span>
            ) : null}
          </span>
        </span>
      </a>
    </NodeViewWrapper>
  );
};
