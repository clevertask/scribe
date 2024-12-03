import { Content, EditorContent, Extension, useEditor } from "@tiptap/react";
import "../../styles/main.css";
import { extensions as defaultExtensions } from "./extension";
import { EditorProps } from "@tiptap/pm/view";
import { FC, useEffect } from "react";
import BarMenu from "../Menu/BarMenu";

export interface ScribeProps {
  onContentChange?: (content: { jsonContent: Content; htmlContent: Content }) => void;
  content?: string;
  className?: string;
  editable?: boolean;
  autoFocus?: boolean;
  extensions?: Extension[];
  editorProps?: EditorProps;
  showBarMenu?: boolean;
}

export const Scribe: FC<ScribeProps> = ({
  autoFocus = false,
  className,
  content,
  editable = true,
  editorProps,
  extensions,
  onContentChange,
  showBarMenu = true,
}) => {
  const editor = useEditor(
    {
      extensions: [...defaultExtensions, ...(extensions ?? [])],
      onUpdate({ editor }) {
        const htmlContent = editor.getHTML();
        const jsonContent = editor.getJSON();

        if (onContentChange) {
          onContentChange({ jsonContent, htmlContent });
        }
      },
      editorProps: {
        attributes: {
          class: "block-editor",
        },
        ...editorProps,
      },
      autofocus: false,
      editable,
      content: content,
    },
    [content, autoFocus, editable]
  );

  useEffect(() => {
    editor?.setEditable(Boolean(editable));
  }, [editor, editable]);

  useEffect(() => {
    if (autoFocus) {
      editor?.commands.focus("end");
    }
  }, [editor, autoFocus]);

  return (
    <div className={`block-editor-wrapper ${className}`} id="block-editor-wrapper">
      <div className={editable ? "m-[40px] rounded-lg border min-h-[300px]" : ""}>
        {editor && showBarMenu && <BarMenu editor={editor} />}
        <div className={editable ? "h-full w-full p-[16px]" : ""}>
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
};
