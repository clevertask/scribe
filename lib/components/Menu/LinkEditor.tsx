import { Box, Button, Flex, Text, TextField } from "@radix-ui/themes";
import { Editor } from "@tiptap/react";
import {
  FC,
  FormEvent,
  KeyboardEvent,
  RefObject,
  useCallback,
  useEffect,
  useId,
  useState,
} from "react";
import type { ExternalLinkPreviewResolutionStatus } from "../Scribe/extension/external-link-preview/types";
import ExternalLinkDisplayOptions from "./ExternalLinkDisplayOptions";
import type { ExternalLinkDisplay } from "./ExternalLinkDisplayOptions";
import { normalizeLinkUrl } from "./linkUrl";

export interface LinkEditorProps {
  canRefreshPreview?: boolean;
  currentDisplay?: ExternalLinkDisplay;
  editor: Editor;
  existingHref: string;
  inputRef?: RefObject<HTMLInputElement | null>;
  onClose: () => void;
  onRefreshPreview?: () => void;
  onValueChange: (value: string) => void;
  previewStatus?: ExternalLinkPreviewResolutionStatus;
  previewStatusLabel?: string;
  resetToken?: number;
  selectTextblockEndAfterSave?: boolean;
  targetPosition?: number;
  value: string;
}

const LinkEditor: FC<LinkEditorProps> = ({
  canRefreshPreview = false,
  currentDisplay = "plain",
  editor,
  existingHref,
  inputRef,
  onClose,
  onRefreshPreview,
  onValueChange,
  previewStatus = "idle",
  previewStatusLabel,
  resetToken,
  selectTextblockEndAfterSave = false,
  targetPosition,
  value,
}) => {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const errorMessageId = useId();
  const openHref = normalizeLinkUrl(value);

  const handleClose = useCallback(() => {
    setErrorMessage(null);
    onClose();
  }, [onClose]);

  useEffect(() => {
    setErrorMessage(null);
  }, [existingHref, resetToken]);

  const handleValueChange = useCallback(
    (nextValue: string) => {
      setErrorMessage(null);
      onValueChange(nextValue);
    },
    [onValueChange],
  );

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const href =
        currentDisplay !== "plain" && value === existingHref
          ? existingHref
          : normalizeLinkUrl(value);

      if (!href) {
        setErrorMessage("Enter a valid web address or root-relative path.");
        return;
      }

      if (currentDisplay !== "plain") {
        const canUpdate = editor.can().updateExternalLinkPreview({ href }, targetPosition);
        const didUpdate =
          canUpdate &&
          editor.chain().focus().updateExternalLinkPreview({ href }, targetPosition).run();

        if (!didUpdate) {
          setErrorMessage(
            "This URL can't be used as a preview. Choose Plain link to keep this destination.",
          );
          return;
        }

        handleClose();
        return;
      }

      const chain = editor.chain().focus().extendMarkRange("link").setLink({ href });

      if (selectTextblockEndAfterSave) {
        chain.selectTextblockEnd();
      }

      if (!chain.run()) {
        setErrorMessage("Scribe could not save this link.");
        return;
      }

      handleClose();
    },
    [
      currentDisplay,
      editor,
      existingHref,
      handleClose,
      selectTextblockEndAfterSave,
      targetPosition,
      value,
    ],
  );

  const handleRemove = useCallback(() => {
    const didRemove = editor.chain().focus().extendMarkRange("link").unsetLink().run();

    if (!didRemove) {
      setErrorMessage("Scribe could not remove this link.");
      return;
    }

    handleClose();
  }, [editor, handleClose]);

  const hasPendingHrefChange = value !== existingHref;
  const isRefreshDisabled = previewStatus === "loading" || hasPendingHrefChange;
  const handleRefresh = useCallback(() => {
    if (!isRefreshDisabled) {
      onRefreshPreview?.();
    }
  }, [isRefreshDisabled, onRefreshPreview]);
  const handlePendingDisplayChange = useCallback(
    (display: ExternalLinkDisplay) => {
      const href = normalizeLinkUrl(value);

      if (!href) {
        setErrorMessage("Enter a valid external web address before changing its display.");
        return false;
      }

      let didChangeDisplay = false;

      if (currentDisplay === "plain") {
        didChangeDisplay = editor
          .chain()
          .focus()
          .extendMarkRange("link")
          .setLink({ href })
          .setExternalLinkDisplay(display)
          .run();
      } else if (display === "plain") {
        didChangeDisplay = editor.commands.convertExternalLinkPreviewToPlain(href, targetPosition);
      } else {
        const canUpdate = editor.can().updateExternalLinkPreview({ href }, targetPosition);

        didChangeDisplay =
          canUpdate &&
          editor
            .chain()
            .focus()
            .updateExternalLinkPreview({ href }, targetPosition)
            .setExternalLinkDisplay(display, targetPosition)
            .run();
      }

      if (!didChangeDisplay) {
        setErrorMessage(
          display === "plain"
            ? "Scribe could not update this link."
            : "This link can't use Compact or Preview card.",
        );
        return false;
      }

      return true;
    },
    [currentDisplay, editor, targetPosition, value],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLFormElement>) => {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      handleClose();
    },
    [handleClose],
  );

  return (
    <form onKeyDown={handleKeyDown} onSubmit={handleSubmit}>
      <Flex direction="column" gap="4">
        <Box>
          <Text as="p" size="3" weight="medium">
            Link
          </Text>
          <Text as="p" size="2" color="gray">
            Add or update a link for the current selection.
          </Text>
        </Box>
        <label>
          <Flex direction="column" gap="2">
            <Text as="span" size="2" weight="medium">
              URL
            </Text>
            <TextField.Root
              ref={inputRef}
              aria-describedby={errorMessage ? errorMessageId : undefined}
              aria-invalid={Boolean(errorMessage)}
              autoFocus={!inputRef}
              placeholder="https://example.com"
              value={value}
              onChange={(event) => handleValueChange(event.target.value)}
            />
          </Flex>
        </label>
        {errorMessage ? (
          <Text id={errorMessageId} as="p" role="alert" size="2" color="red">
            {errorMessage}
          </Text>
        ) : null}
        <ExternalLinkDisplayOptions
          currentDisplay={currentDisplay}
          editor={editor}
          executeDisplayChange={hasPendingHrefChange ? handlePendingDisplayChange : undefined}
          onDisplayChange={handleClose}
          targetPosition={targetPosition}
        />
        {currentDisplay !== "plain" ? (
          <Flex align="center" justify="between" gap="2" wrap="wrap">
            <Text
              as="span"
              role="status"
              aria-live="polite"
              size="1"
              color={previewStatus === "error" ? "red" : "gray"}
            >
              {previewStatus === "loading"
                ? "Loading preview…"
                : previewStatus === "error"
                  ? "Preview unavailable"
                  : previewStatusLabel}
            </Text>
            {canRefreshPreview && onRefreshPreview ? (
              <Button
                type="button"
                color="gray"
                variant="soft"
                aria-disabled={isRefreshDisabled}
                data-disabled={isRefreshDisabled ? "" : undefined}
                onClick={handleRefresh}
              >
                Refresh preview
              </Button>
            ) : null}
          </Flex>
        ) : null}
        <Flex justify="between" gap="3" wrap="wrap">
          {currentDisplay === "plain" ? (
            <Button
              type="button"
              color="red"
              variant="soft"
              disabled={!existingHref}
              onClick={handleRemove}
            >
              Remove link
            </Button>
          ) : null}
          <Flex gap="2" justify="end" style={{ marginLeft: "auto" }} wrap="wrap">
            {openHref ? (
              <Button asChild variant="soft" color="gray">
                <a href={openHref} target="_blank" rel="noopener noreferrer">
                  Open link
                </a>
              </Button>
            ) : (
              <Button type="button" variant="soft" color="gray" disabled>
                Open link
              </Button>
            )}
            <Button type="button" variant="soft" color="gray" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={value.trim().length === 0}>
              Save
            </Button>
          </Flex>
        </Flex>
      </Flex>
    </form>
  );
};

export default LinkEditor;
