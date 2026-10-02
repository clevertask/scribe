import { Button, Dialog, Flex, Text, TextField } from "@radix-ui/themes";
import { NodeSelection, type Transaction } from "@tiptap/pm/state";
import { Editor } from "@tiptap/react";
import { FC, useEffect, useId, useMemo, useRef, useState } from "react";
import { getPopupMountTarget } from "../Scribe/extension/getPopupMountTarget";
import {
  MAX_TABLE_MAX_HEIGHT,
  MIN_TABLE_MAX_HEIGHT,
  normalizeTableMaxHeight,
} from "../Scribe/extension/table-layout";
import { getSelectionTableContext } from "./tableBubbleMenuPlugin";

interface TableHeightSettingsProps {
  editor: Editor;
  maxHeight: number | null;
  canSetMaxHeight: boolean;
  onClose: () => void;
}

const TableHeightSettings: FC<TableHeightSettingsProps> = ({
  editor,
  maxHeight,
  canSetMaxHeight,
  onClose,
}) => {
  const [draft, setDraft] = useState(() => (maxHeight === null ? "" : String(maxHeight)));
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const popupContainer = useMemo(() => getPopupMountTarget(editor), [editor]);
  const selectionRef = useRef(editor.state.selection.getBookmark());
  const initialTablePosition = getSelectionTableContext(editor.state)?.position ?? null;
  const tablePositionRef = useRef(initialTablePosition);
  const tableInteriorRef = useRef(initialTablePosition === null ? null : initialTablePosition + 2);
  const sessionValid = useRef(true);
  const selectedWholeTable = useRef(
    editor.state.selection instanceof NodeSelection &&
      editor.state.selection.node.type.name === "table",
  );
  const returnFocusToEditor = useRef(true);
  const inputId = useId();
  const helpId = useId();
  const errorId = useId();

  const sameTableSelection = () => {
    if (!sessionValid.current || editor.isDestroyed || !editor.isEditable) {
      return false;
    }

    return (
      getSelectionTableContext(editor.state)?.position === tablePositionRef.current &&
      selectionRef.current.resolve(editor.state.doc).eq(editor.state.selection)
    );
  };

  useEffect(() => {
    const handleUnavailableEditor = () => {
      sessionValid.current = false;
      returnFocusToEditor.current = false;
      onClose();
    };
    const handleEditabilityChange = () => {
      if (!editor.isEditable) {
        handleUnavailableEditor();
      }
    };
    const handleTransaction = ({ transaction }: { transaction: Transaction }) => {
      selectionRef.current = selectionRef.current.map(transaction.mapping);
      if (tablePositionRef.current !== null) {
        tablePositionRef.current = transaction.mapping.map(tablePositionRef.current);
      }
      if (tableInteriorRef.current !== null) {
        const interior = transaction.mapping.mapResult(tableInteriorRef.current);
        tableInteriorRef.current = interior.pos;
        if (interior.deleted) {
          handleUnavailableEditor();
          return;
        }
      }
      // Attribute commands preserve whole-table selection after replacing its
      // opening token, which otherwise maps a NodeSelection bookmark to text.
      if (
        selectedWholeTable.current &&
        editor.state.selection instanceof NodeSelection &&
        editor.state.selection.from === tablePositionRef.current
      ) {
        selectionRef.current = editor.state.selection.getBookmark();
      }

      if (
        !editor.isEditable ||
        getSelectionTableContext(editor.state)?.position !== tablePositionRef.current ||
        !selectionRef.current.resolve(editor.state.doc).eq(editor.state.selection)
      ) {
        handleUnavailableEditor();
      }
    };

    editor.on("transaction", handleTransaction);
    editor.on("update", handleEditabilityChange);
    editor.on("destroy", handleUnavailableEditor);

    return () => {
      editor.off("transaction", handleTransaction);
      editor.off("update", handleEditabilityChange);
      editor.off("destroy", handleUnavailableEditor);
    };
  }, [editor, onClose]);

  const applyHeight = (height: number | null) => {
    if (!sameTableSelection()) {
      returnFocusToEditor.current = false;
      onClose();
      return;
    }

    if (canSetMaxHeight && editor.commands.setTableMaxHeight(height)) {
      selectionRef.current = editor.state.selection.getBookmark();
      returnFocusToEditor.current = true;
      onClose();
    }
  };

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Content
        container={popupContainer}
        size="2"
        style={{ width: "calc(100vw - 32px)", maxWidth: 360 }}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          if (sameTableSelection()) {
            inputRef.current?.focus();
            inputRef.current?.select();
          } else {
            returnFocusToEditor.current = false;
            onClose();
          }
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (returnFocusToEditor.current && sameTableSelection()) {
            editor.chain().focus().run();
          }
        }}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <Dialog.Title>Table height</Dialog.Title>
        <Dialog.Description size="2" mb="4">
          Set a maximum height. Limit height controls whether this cap is used.
        </Dialog.Description>
        <form
          noValidate
          onKeyDown={(event) => {
            if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
              event.preventDefault();
              event.currentTarget.requestSubmit();
            }
          }}
          onSubmit={(event) => {
            event.preventDefault();
            if (!sameTableSelection()) {
              returnFocusToEditor.current = false;
              onClose();
              return;
            }
            const height = normalizeTableMaxHeight(draft.trim());

            if (height === null) {
              setError(
                `Enter a whole number from ${MIN_TABLE_MAX_HEIGHT} to ${MAX_TABLE_MAX_HEIGHT}.`,
              );
              inputRef.current?.focus();
              return;
            }

            applyHeight(height);
          }}
        >
          <Flex direction="column" gap="2">
            <label htmlFor={inputId}>
              <Text size="2" weight="medium">
                Maximum height (px)
              </Text>
            </label>
            <TextField.Root
              ref={inputRef}
              id={inputId}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="Editor default"
              value={draft}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${helpId} ${errorId}` : helpId}
              onChange={(event) => {
                setDraft(event.target.value);
                setError(null);
              }}
            />
            <Text id={helpId} size="1" color="gray">
              {MIN_TABLE_MAX_HEIGHT}–{MAX_TABLE_MAX_HEIGHT} pixels. Use default follows the editor's
              configured height.
            </Text>
            {error ? (
              <Text id={errorId} size="1" color="red" role="alert">
                {error}
              </Text>
            ) : null}
          </Flex>
          <Flex mt="4" gap="2" justify="between" wrap="wrap">
            <Button
              type="button"
              variant="soft"
              color="gray"
              disabled={!canSetMaxHeight}
              onClick={() => applyHeight(null)}
            >
              Use default
            </Button>
            <Flex gap="2">
              <Button type="button" variant="soft" color="gray" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={!canSetMaxHeight}>
                Apply
              </Button>
            </Flex>
          </Flex>
        </form>
      </Dialog.Content>
    </Dialog.Root>
  );
};

export default TableHeightSettings;
