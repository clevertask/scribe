import "katex/dist/katex.css";
import BarMenu from "../Menu/BarMenu";
import { ClassValue, clsx } from "clsx";
import { html2md } from "../../utils";
import { initExtensions } from "./extension";
import { SCRIBE_TABLE_OF_CONTENTS_META } from "./extension/tableOfContents";
import type {
  ScribeTableOfContentsChangeHandler,
  ScribeTableOfContentsItem,
  ScribeTableOfContentsScrollTarget,
} from "./extension/tableOfContents";
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
  useRef,
  useState,
} from "react";
import { ListOptionBar } from "../Menu/Mobile/ListOptionBar";

export type {
  ScribeTableOfContentsChangeHandler,
  ScribeTableOfContentsItem,
  ScribeTableOfContentsScrollTarget,
} from "./extension/tableOfContents";

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
  /** @experimental The table of contents API may change while we stabilize outline behavior. */
  scrollToTableOfContentsItem: (target: ScribeTableOfContentsScrollTarget) => void;
  editor: Editor;
}

export interface ScribeProps {
  onContentChange?: (content: ScribeOnChangeContents) => void;
  /**
   * @deprecated Controlled content updates are being phased out. Prefer
   * `ScribeRef.setContent` for programmatic updates after mount.
   */
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
  /** @experimental Enables Scribe's app-owned document outline API. */
  enableTableOfContents?: boolean;
  /** @experimental Receives the current heading outline when it changes. */
  onTableOfContentsChange?: ScribeTableOfContentsChangeHandler;
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
    onTableOfContentsChange,
  } = props;
  const didSetInitialContentInEditorOptionsRef = useRef(!externalEditor && content !== undefined);
  const tableOfContentsItemsRef = useRef<ScribeTableOfContentsItem[]>([]);
  const onTableOfContentsChangeRef = useRef(onTableOfContentsChange);

  useEffect(() => {
    onTableOfContentsChangeRef.current = onTableOfContentsChange;
  }, [onTableOfContentsChange]);

  const handleTableOfContentsChange = useCallback(
    (items: ScribeTableOfContentsItem[], isCreate?: boolean) => {
      tableOfContentsItemsRef.current = items;
      onTableOfContentsChangeRef.current?.(items, isCreate);
    },
    [],
  );

  const onUpdate = useCallback(
    ({ editor, transaction }: EditorEvents["update"]) => {
      if (transaction.getMeta(SCRIBE_TABLE_OF_CONTENTS_META)) {
        return;
      }

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
        content: content ?? editorProps?.content,
        editable,
        extensions: [
          ...initExtensions({
            ...props,
            onTableOfContentsChange: handleTableOfContentsChange,
          }),
          ...(extensions ?? []),
        ],
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

  const scrollToTableOfContentsItem = useCallback(
    (target: ScribeTableOfContentsScrollTarget) => {
      const targetId = typeof target === "string" ? target : target.id;
      const item =
        tableOfContentsItemsRef.current.find((currentItem) => currentItem.id === targetId) ??
        (typeof target === "string" ? undefined : target);

      if (!item || editor.isDestroyed) {
        return;
      }

      const dom = editor.view.nodeDOM(item.pos);
      const headingElement = dom instanceof HTMLElement ? dom : item.dom;

      if (editor.isEditable) {
        const headingEndPosition = Math.max(
          0,
          Math.min(item.pos + item.node.nodeSize - 1, editor.state.doc.content.size),
        );

        editor.commands.focus(headingEndPosition, { scrollIntoView: false });
      }

      headingElement.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [editor],
  );

  useImperativeHandle(ref, () => {
    return {
      resetContent,
      setContent,
      getContent,
      scrollToTableOfContentsItem,
      editor,
    };
  }, [editor, getContent, resetContent, scrollToTableOfContentsItem, setContent]);

  useEffect(() => {
    if (content === undefined) {
      return;
    }

    if (didSetInitialContentInEditorOptionsRef.current) {
      didSetInitialContentInEditorOptionsRef.current = false;
      return;
    }

    editor.commands.setContent(content, { emitUpdate: false });
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
