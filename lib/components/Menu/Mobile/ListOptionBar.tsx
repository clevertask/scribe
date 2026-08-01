import { Button, Flex } from "@radix-ui/themes";
import { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { MouseEvent, useCallback } from "react";

type ListOptionBarProps = {
  editor: Editor;
};

export const ListOptionBar = ({ editor }: ListOptionBarProps) => {
  const editorState = useEditorState({
    editor,
    selector: ({ editor }) => {
      if (!editor) return null;
      return {
        isInsideList: editor.isActive("bulletList") || editor.isActive("orderedList"),
        isEditable: editor.isEditable,
      };
    },
  });
  const handleListMouseDown = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
  }, []);

  if (!editorState?.isInsideList || !editorState.isEditable) {
    return null;
  }

  return (
    <Flex
      align="center"
      justify="between"
      className="scribe-list-toolbar"
      gap="3"
      role="group"
      aria-label="List indentation"
    >
      <Button
        type="button"
        aria-label="Outdent list item"
        size="1"
        variant="soft"
        color="gray"
        onMouseDown={handleListMouseDown}
        onClick={() => editor.chain().focus().liftListItem("listItem").run()}
      >
        ← Outdent
      </Button>
      <Button
        type="button"
        aria-label="Indent list item"
        size="1"
        variant="soft"
        color="gray"
        onMouseDown={handleListMouseDown}
        onClick={() => editor.chain().focus().sinkListItem("listItem").run()}
      >
        Indent →
      </Button>
    </Flex>
  );
};
