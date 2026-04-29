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
  useRef,
  useState,
} from "react";
import { ListOptionBar } from "../Menu/Mobile/ListOptionBar";

export type ScribeOnChangeContents = {
  jsonContent: Content;
  htmlContent: Content;
  markdownContent: string;
  source: "user" | "programmatic";
};

export type ScribeTableOfContentsItem = {
  dom: HTMLHeadingElement;
  id: string;
  isActive: boolean;
  isScrolledOver: boolean;
  itemIndex: number;
  level: number;
  originalLevel: number;
  pos: number;
  textContent: string;
};

export type ScribeTableOfContentsChangeHandler = (
  items: ScribeTableOfContentsItem[],
  isCreate?: boolean,
) => void;

export type ScribeTableOfContentsScrollTarget = ScribeTableOfContentsItem | string;

export interface ScribeRef {
  resetContent: () => void;
  getContent: (contentType: "html" | "json" | "markdown") => string | JSONContent | undefined;
  setContent: (content: Content) => void;
  scrollToTableOfContentsItem: (target: ScribeTableOfContentsScrollTarget) => void;
  editor: Editor;
}

export interface ScribeProps {
  onContentChange?: (content: ScribeOnChangeContents) => void;
  onTableOfContentsChange?: ScribeTableOfContentsChangeHandler;
  content?: string;
  editable?: boolean;
  autoFocus?: boolean;
  enableTableOfContents?: boolean;
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

const getTableOfContentsItemsSignature = (items: ScribeTableOfContentsItem[]) =>
  JSON.stringify(
    items.map(
      ({ id, isActive, isScrolledOver, itemIndex, level, originalLevel, pos, textContent }) => [
        id,
        isActive,
        isScrolledOver,
        itemIndex,
        level,
        originalLevel,
        pos,
        textContent,
      ],
    ),
  );

const findTableOfContentsHeading = (editor: Editor, target: ScribeTableOfContentsScrollTarget) => {
  const id = typeof target === "string" ? target : target.id;
  const heading = Array.from(
    editor.view.dom.querySelectorAll<HTMLHeadingElement>("[data-toc-id]"),
  ).find((element) => element.dataset.tocId === id);

  if (heading) {
    return heading;
  }

  if (typeof target === "string" || !target.dom.isConnected) {
    return null;
  }

  return target.dom;
};

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
    onTableOfContentsChange,
    externalEditor,
    mobile,
  } = props;

  const enableTableOfContents = Boolean(props.enableTableOfContents);
  const initialContentRef = useRef<Content>(content ?? editorProps?.content ?? "");
  const shouldSkipInitialContentEffectRef = useRef(!externalEditor);
  const tableOfContentsChangeRef = useRef(onTableOfContentsChange);
  const lastTableOfContentsSignatureRef = useRef<string | null>(null);
  tableOfContentsChangeRef.current = onTableOfContentsChange;

  const handleTableOfContentsChange = useCallback<ScribeTableOfContentsChangeHandler>(
    (items, isCreate) => {
      const signature = getTableOfContentsItemsSignature(items);

      if (!isCreate && signature === lastTableOfContentsSignatureRef.current) {
        return;
      }

      lastTableOfContentsSignatureRef.current = signature;
      tableOfContentsChangeRef.current?.(items, isCreate);
    },
    [],
  );

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
        content: initialContentRef.current,
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

  const updateTableOfContents = useCallback(() => {
    if (!enableTableOfContents || editor.isDestroyed) {
      return;
    }

    requestAnimationFrame(() => {
      if (!editor.isDestroyed) {
        editor.commands.updateTableOfContents();
      }
    });
  }, [editor, enableTableOfContents]);

  const resetContent = useCallback(() => {
    editor.commands.setContent("");
    updateTableOfContents();
  }, [editor, updateTableOfContents]);

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
      updateTableOfContents();
    },
    [editor, updateTableOfContents],
  );

  const scrollToTableOfContentsItem = useCallback(
    (target: ScribeTableOfContentsScrollTarget) => {
      if (!enableTableOfContents || editor.isDestroyed || typeof window === "undefined") {
        return;
      }

      const heading = findTableOfContentsHeading(editor, target);

      if (!heading) {
        return;
      }

      try {
        editor.commands.focus(editor.view.posAtDOM(heading, 0), { scrollIntoView: false });
      } catch {
        editor.commands.focus(undefined, { scrollIntoView: false });
      }

      window.scrollTo({
        behavior: "smooth",
        top: Math.max(heading.getBoundingClientRect().top + window.scrollY - 16, 0),
      });
    },
    [editor, enableTableOfContents],
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
    if (shouldSkipInitialContentEffectRef.current) {
      shouldSkipInitialContentEffectRef.current = false;
      updateTableOfContents();
      return;
    }

    if (content === undefined) {
      updateTableOfContents();
      return;
    }

    editor.commands.setContent(content);
    updateTableOfContents();
  }, [content, editor, updateTableOfContents]);

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
