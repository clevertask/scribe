import { Button, Flex, Link, Text, TextField } from "@radix-ui/themes";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { closeHistory } from "@tiptap/pm/history";
import { TextSelection, type Transaction } from "@tiptap/pm/state";
import { Editor } from "@tiptap/react";
import {
  FC,
  FormEvent,
  KeyboardEvent,
  RefObject,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { getSelectionLinkContext } from "./linkBubbleMenuPlugin";
import { normalizeLinkUrl } from "./linkUrl";

export interface LinkEditorProps {
  editor: Editor;
  existingHref: string;
  inputRef?: RefObject<HTMLInputElement | null>;
  onClose: () => void;
  onValueChange: (value: string) => void;
  resetToken?: number;
  selectTextblockEndAfterSave?: boolean;
  targetPosition?: number;
  value: string;
}

const isEditableTextRange = (doc: ProseMirrorNode, from: number, to: number) => {
  if (from < 0 || from > to || to > doc.content.size) {
    return false;
  }
  const $from = doc.resolve(from);
  const $to = doc.resolve(to);
  let editable = $from.sameParent($to) && $from.parent.isTextblock;
  doc.nodesBetween(from, to, (node) => {
    if (node.isInline && !node.isText) {
      editable = false;
    }
  });
  return editable;
};

const getEditTarget = (editor: Editor) => {
  const { doc, selection } = editor.state;
  const context = getSelectionLinkContext(editor.state);
  const from = context?.from ?? selection.from;
  const to = context?.to ?? selection.to;

  if (context?.kind === "preview") {
    return { from, to, text: context.attributes.linkText, editableText: true, preview: true };
  }

  return {
    from,
    to,
    text: doc.textBetween(from, to, "\n", "\uFFFC"),
    editableText: isEditableTextRange(doc, from, to),
    preview: false,
  };
};

const LinkEditor: FC<LinkEditorProps> = ({
  editor,
  existingHref,
  inputRef,
  onClose,
  onValueChange,
  resetToken,
  selectTextblockEndAfterSave = false,
  targetPosition,
  value,
}) => {
  const initialTarget = getEditTarget(editor);
  const targetRef = useRef(initialTarget);
  const [textValue, setTextValue] = useState(initialTarget.text);
  const [canEditText, setCanEditText] = useState(initialTarget.editableText);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const errorMessageId = useId();
  const urlInputId = useId();
  const openHref = normalizeLinkUrl(value);

  useEffect(() => {
    const target = getEditTarget(editor);
    targetRef.current = target;
    // Reset drafts when the dialog opens or moves to a different link.
    // oxlint-disable-next-line react/set-state-in-effect
    setTextValue(target.text);
    setCanEditText(target.editableText);
    setErrorMessage(null);

    const mapTarget = ({ transaction }: { transaction: Transaction }) => {
      targetRef.current = {
        ...targetRef.current,
        from: transaction.mapping.map(targetRef.current.from, 1),
        to: transaction.mapping.map(
          targetRef.current.to,
          targetRef.current.from === targetRef.current.to ? 1 : -1,
        ),
      };
    };

    editor.on("transaction", mapTarget);
    return () => {
      editor.off("transaction", mapTarget);
    };
  }, [editor, existingHref, resetToken, targetPosition]);

  const handleClose = useCallback(() => {
    setErrorMessage(null);
    onClose();
  }, [onClose]);

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const href = normalizeLinkUrl(value);

      if (!href) {
        setErrorMessage("Enter a valid web address or root-relative path.");
        return;
      }

      const target = targetRef.current;
      const label = textValue.trim() ? textValue : href;
      let didUpdate = false;

      if (target.preview && href.startsWith("/")) {
        // Legacy preview attributes require absolute URLs. An explicit relative edit
        // becomes an ordinary link while leaving untouched legacy content readable.
        didUpdate = editor
          .chain()
          .focus()
          .command(({ tr, state }) => {
            const linkType = state.schema.marks.link;
            const node = tr.doc.nodeAt(target.from);
            if (
              !linkType ||
              node?.type.name !== "externalLinkPreview" ||
              !tr.doc.resolve(target.from).parent.type.allowsMarkType(linkType)
            ) {
              return false;
            }
            closeHistory(tr);
            tr.setMeta("preventAutolink", true);
            const marks = [
              ...node.marks.filter((mark) => mark.type !== linkType),
              linkType.create({ href }),
            ];
            tr.replaceWith(
              target.from,
              target.from + node.nodeSize,
              state.schema.text(label, marks),
            );
            tr.setSelection(TextSelection.create(tr.doc, target.from + label.length));
            return true;
          })
          .run();
      } else if (target.preview) {
        didUpdate =
          editor.can().updateExternalLinkPreview({ href, linkText: label }, target.from) &&
          editor
            .chain()
            .focus()
            .command(({ tr }) => {
              closeHistory(tr);
              return true;
            })
            .updateExternalLinkPreview({ href, linkText: label }, target.from)
            .run();
      } else {
        didUpdate = editor
          .chain()
          .focus()
          .command(({ tr, state }) => {
            const linkType = state.schema.marks.link;
            const { from, to } = target;

            if (!linkType || from > to || to > tr.doc.content.size) {
              return false;
            }

            closeHistory(tr);
            tr.setMeta("preventAutolink", true);

            if (from === to || textValue !== target.text) {
              if (
                !isEditableTextRange(tr.doc, from, to) ||
                !tr.doc.resolve(from).parent.type.allowsMarkType(linkType)
              ) {
                return false;
              }
              const currentMarks =
                from === to
                  ? (state.storedMarks ?? tr.doc.resolve(from).marks())
                  : (tr.doc.nodeAt(from)?.marks ?? []);
              const oldLink = currentMarks.find((mark) => mark.type === linkType);
              const marks = [
                ...currentMarks.filter((mark) => mark.type !== linkType),
                linkType.create({ ...oldLink?.attrs, href }),
              ];
              tr.replaceWith(from, to, state.schema.text(label, marks));
              tr.setSelection(TextSelection.create(tr.doc, from + label.length));
            } else {
              let applied = false;
              tr.doc.nodesBetween(from, to, (node, position, parent) => {
                if (!node.isText || !parent?.type.allowsMarkType(linkType)) {
                  return;
                }
                const oldLink = node.marks.find((mark) => mark.type === linkType);
                tr.addMark(
                  Math.max(from, position),
                  Math.min(to, position + node.nodeSize),
                  linkType.create({ ...oldLink?.attrs, href }),
                );
                applied = true;
              });
              if (!applied) {
                return false;
              }
              tr.setSelection(TextSelection.create(tr.doc, to));
            }
            return true;
          })
          .run();
      }

      if (!didUpdate) {
        setErrorMessage("Scribe could not save this link.");
        return;
      }

      if (selectTextblockEndAfterSave) {
        editor.commands.selectTextblockEnd();
      }
      handleClose();
    },
    [editor, handleClose, selectTextblockEndAfterSave, textValue, value],
  );

  const handleRemove = useCallback(() => {
    const target = targetRef.current;
    const didRemove = editor
      .chain()
      .focus()
      .command(({ tr, state }) => {
        const linkType = state.schema.marks.link;
        if (!linkType || target.from > target.to || target.to > tr.doc.content.size) {
          return false;
        }
        closeHistory(tr);
        tr.setMeta("preventAutolink", true);
        if (target.preview) {
          tr.replaceWith(target.from, target.to, state.schema.text(target.text));
          tr.setSelection(TextSelection.create(tr.doc, target.from + target.text.length));
        } else {
          tr.removeMark(target.from, target.to, linkType);
          tr.setSelection(TextSelection.create(tr.doc, target.to));
        }
        return true;
      })
      .run();

    if (!didRemove) {
      setErrorMessage("Scribe could not remove this link.");
      return;
    }
    handleClose();
  }, [editor, handleClose]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLFormElement>) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        handleClose();
      }
    },
    [handleClose],
  );

  return (
    <form onKeyDown={handleKeyDown} onSubmit={handleSubmit}>
      <Flex direction="column" gap="4">
        <label>
          <Flex direction="column" gap="2">
            <Text as="span" size="2" weight="medium">
              Text to display
            </Text>
            <TextField.Root
              value={textValue}
              disabled={!canEditText}
              onChange={(event) => {
                setErrorMessage(null);
                setTextValue(event.target.value);
              }}
            />
          </Flex>
        </label>
        <Flex direction="column" gap="2">
          <Flex align="center" justify="between" gap="2">
            <Text as="label" htmlFor={urlInputId} size="2" weight="medium">
              URL
            </Text>
            <Link
              role="link"
              href={openHref ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
              title="Open link in a new tab"
              aria-disabled={!openHref}
              tabIndex={openHref ? undefined : -1}
              color={openHref ? undefined : "gray"}
              size="2"
            >
              Open link <span aria-hidden="true">↗</span>
            </Link>
          </Flex>
          <TextField.Root
            id={urlInputId}
            ref={inputRef}
            aria-describedby={errorMessage ? errorMessageId : undefined}
            aria-invalid={Boolean(errorMessage)}
            autoFocus={!inputRef}
            placeholder="https://example.com"
            value={value}
            onChange={(event) => {
              setErrorMessage(null);
              onValueChange(event.target.value);
            }}
          />
        </Flex>
        {errorMessage ? (
          <Text id={errorMessageId} as="p" role="alert" size="2" color="red">
            {errorMessage}
          </Text>
        ) : null}
        <Flex justify="between" gap="3">
          <Button
            type="button"
            color="red"
            variant="soft"
            disabled={!existingHref}
            onClick={handleRemove}
          >
            Remove link
          </Button>
          <Button type="submit" disabled={value.trim().length === 0}>
            Apply
          </Button>
        </Flex>
      </Flex>
    </form>
  );
};

export default LinkEditor;
