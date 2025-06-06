import "katex/dist/katex.css";
import BarMenu from "../Menu/BarMenu";
import { ClassValue, clsx } from "clsx";
import { html2md } from "../../utils";
import { initExtensions } from "./extension";
import { Content, Editor, EditorContent, EditorEvents, Extension, JSONContent, UseEditorOptions } from "@tiptap/react";
import { forwardRef, KeyboardEventHandler, useCallback, useEffect, useImperativeHandle, useRef } from "react";

export type ScribeOnChangeContents = {
  jsonContent: Content;
  htmlContent: Content;
  markdownContent: string;
  source: "user" | "programmatic";
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
  darkMode?: boolean;
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
    darkMode,
  } = props;

  const editorRef = useRef<Editor | null>(externalEditor || null);
  const onUpdate = useCallback(
    ({ editor }: EditorEvents["update"]) => {
      const htmlContent = editor.getHTML();
      const jsonContent = editor.getJSON();
      const isProgrammatic = !editable;

      if (onContentChange) {
        onContentChange({
          jsonContent: editor.isEmpty ? "" : jsonContent,
          htmlContent: editor.isEmpty ? "" : htmlContent,
          markdownContent: editor.isEmpty ? "" : html2md(htmlContent),
          source: isProgrammatic ? "programmatic" : "user",
        });
      }
    },
    [editable, onContentChange]
  );

  if (!editorRef.current) {
    editorRef.current = new Editor({
      ...editorProps,
      editable,
      extensions: [...initExtensions(props), ...(extensions ?? [])],
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
    editor.off("update");
    editor.on("update", onUpdate);
    return () => {
      editor.off("update", onUpdate);
    };
  }, [onUpdate]);

  useEffect(() => {
    if (autoFocus) {
      editor?.commands.focus("end");
    }
  }, [autoFocus]);

  return (
    <div className={clsx("scribe-wrapper", mainContainerClassName)} style={mainContainerStyle}>
      <div className={clsx(editable && "rounded-lg border", darkMode ? "border-zinc-700" : "border-zinc-200")}>
        {editor && showBarMenu && <BarMenu editor={editor} darkMode={!!darkMode} />}
        <div
          className={clsx(
            "prose max-w-none",
            editable && "w-full p-[16px]",
            darkMode && "prose-invert",
            editorContentClassName
          )}
          style={editorContentStyle}
        >
          <EditorContent editor={editor} onKeyDown={onKeyDown} />
        </div>
      </div>
    </div>
  );
});
