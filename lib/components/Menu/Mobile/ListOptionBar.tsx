import { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";

type ListOptionBarProps = {
  editor: Editor;
};

export const ListOptionBar = ({ editor }: ListOptionBarProps) => {
  const editorState = useEditorState({
    editor,
    selector: ({ editor }) => {
      if (!editor) return null;
      return {
        isInsideList:
          editor.isActive("bulletList") || editor.isActive("orderedList"),
      };
    },
  });

  if (!editorState?.isInsideList) {
    return null;
  }

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "1rem",
        paddingTop: "0rem",
      }}
    >
      <button
        onClick={() => editor.chain().focus().liftListItem("listItem").run()}
      >
        ← Outdent
      </button>
      <button
        onClick={() => editor.chain().focus().sinkListItem("listItem").run()}
      >
        Indent →
      </button>
    </div>
  );
};
