import "katex/dist/katex.css";
import BarMenu from "../Menu/BarMenu";
import LinkBubbleMenu from "../Menu/LinkBubbleMenu";
import { ClassValue, clsx } from "clsx";
import { html2md } from "../../utils";
import { initExtensions } from "./extension";
import type { ScribeSlashCommandOptions } from "./extension/slashCommand";
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
  useEditor,
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
  ScribeSlashCommandOptions,
  SlashCommandContext,
  SlashCommandItemsProvider,
  SlashCommandItemsProviderProps,
  SuggestionItem,
} from "./extension/slashCommand";
export { SuggestionItemType } from "./extension/slashCommand/items";
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
  /** @experimental The table of contents API may change while we stabilize this behavior. */
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
  /**
   * A caller-owned editor. Scribe attaches it without taking responsibility
   * for destroying it.
   */
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
  /**
   * Allows callers to customize Scribe's slash command menu while keeping
   * Scribe's default command list available.
   */
  slashCommand?: ScribeSlashCommandOptions;
  /** @experimental Enables Scribe's app-owned table-of-contents API. */
  enableTableOfContents?: boolean;
  /** @experimental Receives the current table-of-contents items when they change. */
  onTableOfContentsChange?: ScribeTableOfContentsChangeHandler;
}

const useTableOfContentsBridge = (onTableOfContentsChange?: ScribeTableOfContentsChangeHandler) => {
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

  return {
    handleTableOfContentsChange,
    tableOfContentsItemsRef,
  };
};

type ScribeEditorProps = ScribeProps & {
  editor: Editor;
  initialContentWasApplied: boolean;
  tableOfContentsItemsRef: ReturnType<typeof useTableOfContentsBridge>["tableOfContentsItemsRef"];
};

const ScribeEditor = forwardRef<ScribeRef, ScribeEditorProps>((props, ref) => {
  const {
    autoFocus = false,
    content,
    editable = true,
    editor,
    initialContentWasApplied,
    onContentChange,
    showBarMenu = true,
    editorContentStyle,
    editorContentClassName,
    mainContainerStyle,
    mainContainerClassName,
    onKeyDown,
    mobile,
    tableOfContentsItemsRef,
  } = props;

  // Initial content is passed into the editor constructor, so the deprecated
  // content sync effect skips its first run to avoid re-applying the same doc.
  const didSetInitialContentInEditorOptionsRef = useRef(
    initialContentWasApplied && content !== undefined,
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
    [editor, tableOfContentsItemsRef],
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
          {editable ? <LinkBubbleMenu editor={editor} /> : null}
        </div>

        {mobile ? <ListOptionBar editor={editor} /> : null}
      </div>
      <div className="scribe-popup-root" data-scribe-popup-root />
    </div>
  );
});

ScribeEditor.displayName = "ScribeEditor";

const OwnedScribe = forwardRef<ScribeRef, ScribeProps>((props, ref) => {
  const { content, editable = true, editorProps, extensions, onTableOfContentsChange } = props;
  const { handleTableOfContentsChange, tableOfContentsItemsRef } =
    useTableOfContentsBridge(onTableOfContentsChange);
  const [initialEditorOptions] = useState<UseEditorOptions>(() => ({
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
    shouldRerenderOnTransaction: editorProps?.shouldRerenderOnTransaction ?? false,
  }));
  const editor = useEditor(initialEditorOptions);

  if (!editor) {
    return null;
  }

  return (
    <ScribeEditor
      {...props}
      ref={ref}
      editor={editor}
      initialContentWasApplied
      tableOfContentsItemsRef={tableOfContentsItemsRef}
    />
  );
});

OwnedScribe.displayName = "OwnedScribe";

const ExternalScribe = forwardRef<ScribeRef, ScribeProps>((props, ref) => {
  const { externalEditor, onTableOfContentsChange } = props;
  const { tableOfContentsItemsRef } = useTableOfContentsBridge(onTableOfContentsChange);

  if (!externalEditor) {
    return null;
  }

  return (
    <ScribeEditor
      {...props}
      ref={ref}
      editor={externalEditor}
      initialContentWasApplied={false}
      tableOfContentsItemsRef={tableOfContentsItemsRef}
    />
  );
});

ExternalScribe.displayName = "ExternalScribe";

export const Scribe = forwardRef<ScribeRef, ScribeProps>((props, ref) =>
  props.externalEditor ? (
    <ExternalScribe {...props} ref={ref} />
  ) : (
    <OwnedScribe {...props} ref={ref} />
  ),
);

Scribe.displayName = "Scribe";
