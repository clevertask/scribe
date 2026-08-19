import { Button, Flex, Popover, Text } from "@radix-ui/themes";
import { NodeViewWrapper, type NodeViewProps, useEditorState } from "@tiptap/react";
import ExternalLinkDisplayOptions from "../../../Menu/ExternalLinkDisplayOptions";
import { getPopupMountTarget } from "../getPopupMountTarget";
import {
  getExternalLinkPreviewHostname,
  getExternalLinkPreviewTitle,
  normalizeExternalLinkPreviewAttributes,
} from "./attributes";
import { getExternalLinkPreviewResolutionStatus } from "./resolver";
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
          canRefresh: false,
          isEditable: currentEditor.isEditable,
          isSoleTextblockContent: false,
          status: "idle" as const,
        };
      }

      return {
        canRefresh: currentEditor.can().refreshExternalLinkPreview(position),
        isEditable: currentEditor.isEditable,
        isSoleTextblockContent: isSoleTextblockChildAt(currentEditor, position),
        status: getExternalLinkPreviewResolutionStatus(currentEditor.state, position),
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
  const title = getExternalLinkPreviewTitle(attributes);
  const siteLabel = attributes.siteName || getExternalLinkPreviewHostname(attributes.href);
  const popupContainer = getPopupMountTarget(editor);
  const targetPosition = getPos();

  const refresh = () => {
    const position = getPos();

    if (typeof position !== "number") {
      return;
    }

    editor.chain().focus().refreshExternalLinkPreview(position).run();
  };

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
        onClick={(event) => {
          if (previewState.isEditable) {
            event.preventDefault();
          }
        }}
      >
        {effectiveDisplay === "card" && attributes.imageUrl ? (
          <img data-link-preview-image="" src={attributes.imageUrl} alt="" />
        ) : null}
        <span data-link-preview-main="">
          {attributes.faviconUrl ? (
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

      {previewState.isEditable ? (
        <Popover.Root>
          <Popover.Trigger>
            <Button
              type="button"
              className="scribe-external-link-preview__options"
              color="gray"
              size="2"
              variant="soft"
            >
              Link options
            </Button>
          </Popover.Trigger>
          <Popover.Content
            aria-label="Link options"
            className="scribe-external-link-preview__popover"
            container={popupContainer}
            size="2"
            side="bottom"
            align="start"
            style={{ maxWidth: "calc(100vw - 32px)", width: 320 }}
          >
            <Flex direction="column" gap="3">
              <ExternalLinkDisplayOptions
                currentDisplay={effectiveDisplay}
                editor={editor}
                targetPosition={typeof targetPosition === "number" ? targetPosition : undefined}
              />
              <Flex align="center" justify="between" gap="2" wrap="wrap">
                <Text
                  as="span"
                  role="status"
                  aria-live="polite"
                  size="1"
                  color={previewState.status === "error" ? "red" : "gray"}
                >
                  {previewState.status === "loading"
                    ? "Loading preview…"
                    : previewState.status === "error"
                      ? "Preview unavailable"
                      : siteLabel}
                </Text>
                {previewState.canRefresh ? (
                  <Button
                    type="button"
                    color="gray"
                    variant="soft"
                    disabled={previewState.status === "loading"}
                    onClick={refresh}
                  >
                    Refresh preview
                  </Button>
                ) : null}
              </Flex>
              <Button asChild color="gray" variant="soft">
                <a href={attributes.href} target="_blank" rel="noopener noreferrer">
                  Open link
                </a>
              </Button>
            </Flex>
          </Popover.Content>
        </Popover.Root>
      ) : null}
    </NodeViewWrapper>
  );
};
