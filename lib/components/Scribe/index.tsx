import "katex/dist/katex.css";
import BarMenu from "../Menu/BarMenu";
import { ClassValue, clsx } from "clsx";
import { html2md } from "../../utils";
import { initExtensions } from "./extension";
import {
  Content,
  Editor,
  EditorContent,
  EditorEvents,
  Extension,
  JSONContent,
  UseEditorOptions,
} from "@tiptap/react";
import {
  forwardRef,
  KeyboardEventHandler,
  useCallback,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";
import { ListOptionBar } from "../Menu/Mobile/ListOptionBar";

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
  mobile?: boolean;
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
    mobile,
  } = props;

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
    [editable, onContentChange],
  );
  const [editor] = useState(() => {
    return (
      externalEditor ??
      new Editor({
        ...editorProps,
        editable,
        extensions: [...initExtensions(props), ...(extensions ?? [])],
        editorProps: {
          attributes: {
            class: "scribe",
          },
          ...editorProps?.editorProps,
        },
      })
    );
  });

  const resetContent = useCallback(() => {
    editor.commands.setContent("");
  }, [editor]);

  const getContent = useCallback(
    (contentType: "html" | "json" | "markdown") => {
      const options = {
        html: () => editor.getHTML(),
        json: () => editor.getJSON(),
        markdown: () => html2md(editor.getHTML()),
      };
      return editor.isEmpty ? "" : options[contentType]?.();
    },
    [editor],
  );

  const setContent = useCallback(
    (content: Content) => {
      editor.commands.setContent(content);
    },
    [editor],
  );

  useImperativeHandle(ref, () => {
    return {
      resetContent,
      setContent,
      getContent,
      editor,
    };
  }, [editor, getContent, resetContent, setContent]);

  useEffect(() => {
    editor.commands.setContent(content || "");
  }, [content, editor]);

  useEffect(() => {
    editor.setEditable(Boolean(editable));
  }, [editable, editor]);

  useEffect(() => {
    editor.off("update");
    editor.on("update", onUpdate);
    return () => {
      editor.off("update", onUpdate);
    };
  }, [editor, onUpdate]);

  useEffect(() => {
    if (autoFocus) {
      editor.commands.focus("end");
    }
  }, [autoFocus, editor]);

  return (
    <div
      className={clsx("scribe-wrapper", "scribe-root", mainContainerClassName)}
      data-scribe-root
      style={mainContainerStyle}
    >
      <div className={clsx("scribe-frame", editable && "scribe-frame--editable")}>
        {editor && showBarMenu ? <BarMenu editor={editor} /> : null}
        <div
          className={clsx(
            "scribe-content",
            editable && "scribe-content--editable",
            editorContentClassName,
          )}
          style={editorContentStyle}
        >
          <EditorContent editor={editor} onKeyDown={onKeyDown} />
        </div>

        {mobile ? <ListOptionBar editor={editor} /> : null}
      </div>
      <div className="scribe-popup-root" data-scribe-popup-root />
    </div>
  );
});
