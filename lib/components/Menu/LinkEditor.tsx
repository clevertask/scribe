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
import { normalizeLinkUrl } from "./linkUrl";

export interface LinkEditorProps {
  editor: Editor;
  existingHref: string;
  inputRef?: RefObject<HTMLInputElement | null>;
  onClose: () => void;
  onValueChange: (value: string) => void;
  selectTextblockEndAfterSave?: boolean;
  value: string;
}

const LinkEditor: FC<LinkEditorProps> = ({
  editor,
  existingHref,
  inputRef,
  onClose,
  onValueChange,
  selectTextblockEndAfterSave = false,
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
  }, [existingHref]);

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

      const href = normalizeLinkUrl(value);

      if (!href) {
        setErrorMessage("Enter a valid HTTP or HTTPS URL.");
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
    [editor, handleClose, selectTextblockEndAfterSave, value],
  );

  const handleRemove = useCallback(() => {
    const didRemove = editor.chain().focus().extendMarkRange("link").unsetLink().run();

    if (!didRemove) {
      setErrorMessage("Scribe could not remove this link.");
      return;
    }

    handleClose();
  }, [editor, handleClose]);

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
        <Flex justify="between" gap="3" wrap="wrap">
          <Button
            type="button"
            color="red"
            variant="soft"
            disabled={!existingHref}
            onClick={handleRemove}
          >
            Remove link
          </Button>
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
