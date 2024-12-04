import { Content, EditorContent, Extension, useEditor } from "@tiptap/react";
import "../../styles/main.css";
import { initExtensions } from "./extension";
import { EditorProps } from "@tiptap/pm/view";
import { FC, useEffect } from "react";
import BarMenu from "../Menu/BarMenu";
import { ClassValue, clsx } from "clsx";

export interface ScribeProps {
  onContentChange?: (content: { jsonContent: Content; htmlContent: Content }) => void;
  content?: string;

  editable?: boolean;
  autoFocus?: boolean;
  extensions?: Extension[];
  editorProps?: EditorProps;
  showBarMenu?: boolean;
  placeholderText?: string;
  editorContentStyle?: React.CSSProperties;
  editorContentClassName?: ClassValue;
  mainContainerStyle?: React.CSSProperties;
  mainContainerClassName?: ClassValue;
}

export const Scribe: FC<ScribeProps> = (props: ScribeProps) => {
  const {
    autoFocus = false,
    content,
    editable = true,
    editorProps,
    extensions,
    onContentChange,
    showBarMenu = true,
    editorContentStyle,
    editorContentClassName,
    mainContainerStyle,
    mainContainerClassName,
  } = props;

  const editor = useEditor(
    {
      extensions: [...initExtensions(props), ...(extensions ?? [])],
      onUpdate({ editor }) {
        const htmlContent = editor.getHTML();
        const jsonContent = editor.getJSON();

        if (onContentChange) {
          onContentChange({ jsonContent, htmlContent });
        }
      },
      editorProps: {
        attributes: {
          class: "scribe",
        },
        ...editorProps,
      },
    },
    []
  );

  useEffect(() => {
    editor?.commands.setContent(content || "");
  }, [content]);

  useEffect(() => {
    editor?.setEditable(Boolean(editable));
  }, [editable]);

  useEffect(() => {
    if (autoFocus) {
      editor?.commands.focus("end");
    }
  }, [autoFocus]);

  return (
    <div className={clsx("scribe-wrapper", mainContainerClassName)} style={mainContainerStyle} id="scribe-wrapper">
      <div className={clsx("bg-white", editable && "rounded-lg border")}>
        {editor && showBarMenu && <BarMenu editor={editor} />}
        <div className={clsx(editable && "w-full p-[16px]", editorContentClassName)} style={editorContentStyle}>
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
};
