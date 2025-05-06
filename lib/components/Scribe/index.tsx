import "katex/dist/katex.css";
import BarMenu from "../Menu/BarMenu";
import { ClassValue, clsx } from "clsx";
import { html2md } from "../../utils";
import { initExtensions } from "./extension";
import { Content, Editor, EditorContent, Extension, JSONContent, UseEditorOptions } from "@tiptap/react";
import { forwardRef, KeyboardEventHandler, useCallback, useEffect, useImperativeHandle, useRef } from "react";

export type ScribeOnChangeContents = {
  jsonContent: Content;
  htmlContent: Content;
  markdownContent: string;
};

export interface ScribeRef {
  resetContent: () => void;
  getContent: (contentType: "html" | "json" | "markdown") => string | JSONContent | undefined;
  setContent: (content: Content) => void;
  editor: Editor;
}

export interface ScribeProps {
  onContentChange?: (content: ScribeOnChangeContents) => void;
  content?: string;
  editable?: boolean;
  autoFocus?: boolean;
  extensions?: Extension[];
  externalEditor?: Editor;
  editorProps?: UseEditorOptions;
  showBarMenu?: boolean;
  placeholderText?: string;
  editorContentStyle?: React.CSSProperties;
  editorContentClassName?: ClassValue;
  mainContainerStyle?: React.CSSProperties;
  mainContainerClassName?: ClassValue;
  onKeyDown?: KeyboardEventHandler;
}

export const Scribe = forwardRef<ScribeRef, ScribeProps>((props, ref) => {
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
    onKeyDown,
    externalEditor,
  } = props;

  const editorRef = useRef<Editor | null>(externalEditor || null);

  if (!editorRef.current) {
    editorRef.current = new Editor({
      ...editorProps,
      editable,
      extensions: [...initExtensions(props), ...(extensions ?? [])],
      onUpdate({ editor }) {
        const htmlContent = editor.getHTML();
        const jsonContent = editor.getJSON();

        if (onContentChange) {
          onContentChange({
            jsonContent,
            htmlContent,
            markdownContent: html2md(htmlContent),
          });
        }
      },
      editorProps: {
        attributes: {
          class: "scribe",
        },
        ...editorProps?.editorProps,
      },
    });
  }

  const editor = editorRef.current!;

  const resetContent = useCallback(() => {
    editor?.commands.setContent("");
  }, []);

  const getContent = useCallback((contentType: "html" | "json" | "markdown") => {
    const options = {
      html: () => editor?.getHTML(),
      json: () => editor?.getJSON(),
      markdown: () => html2md(editor?.getHTML() || ""),
    };
    return editor?.isEmpty ? "" : options[contentType]?.();
  }, []);

  const setContent = useCallback((content: Content) => {
    editor?.commands.setContent(content);
  }, []);

  useImperativeHandle(ref, () => {
    return {
      resetContent,
      setContent,
      getContent,
      editor,
    };
  }, [resetContent]);

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
        <div
          className={clsx("prose max-w-none", editable && "w-full p-[16px]", editorContentClassName)}
          style={editorContentStyle}
        >
          <EditorContent editor={editor} onKeyDown={onKeyDown} />
        </div>
      </div>
    </div>
  );
});
