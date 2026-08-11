import "katex/dist/katex.css";
import BarMenu from "../Menu/BarMenu";
import LinkBubbleMenu from "../Menu/LinkBubbleMenu";
import TableBubbleMenu from "../Menu/TableBubbleMenu";
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
import type { EditorState } from "@tiptap/pm/state";
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

const DEFAULT_EDITOR_ARIA_LABEL = "Rich text editor";
const EDITOR_ACCESSIBILITY_ATTRIBUTE_NAMES = [
  "role",
  "aria-label",
  "aria-multiline",
  "aria-readonly",
] as const;

const getAccessibleEditorAttributes = (
  attributes: Record<string, string>,
  ariaLabel: string | undefined,
  editable: boolean,
) => {
  const role = attributes.role ?? "textbox";

  return {
    ...attributes,
    role,
    class: clsx("scribe", attributes.class),
    "aria-label": ariaLabel ?? attributes["aria-label"] ?? DEFAULT_EDITOR_ARIA_LABEL,
    ...(role === "textbox"
      ? {
          "aria-multiline": "true",
          "aria-readonly": String(!editable),
        }
      : {}),
  };
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
  /** Accessible name for the rich-text editing surface. */
  ariaLabel?: string;
  editable?: boolean;
  autoFocus?: boolean;
  extensions?: Extension[];
  /**
   * A caller-owned editor. Scribe attaches it without taking responsibility
   * for destroying it. Its extension and plugin lifecycle, including table
   * resizing, also remains caller-owned.
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
    ariaLabel,
    autoFocus = false,
    content,
    editable = true,
    editor,
    editorProps,
    externalEditor,
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
  const accessibilityPropsRef = useRef({ ariaLabel, editable });
  const externalEditorAccessibilityRef = useRef<{
    editor: Editor;
    attributes: Record<string, string>;
  } | null>(null);

  accessibilityPropsRef.current = { ariaLabel, editable };
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
    if (!externalEditor) {
      externalEditorAccessibilityRef.current = null;
      return;
    }

    const editorElement = editor.view.dom;
    const originalDomAttributes = Object.fromEntries(
      EDITOR_ACCESSIBILITY_ATTRIBUTE_NAMES.map((name) => [name, editorElement.getAttribute(name)]),
    ) as Record<(typeof EDITOR_ACCESSIBILITY_ATTRIBUTE_NAMES)[number], string | null>;
    const originalEditable = editor.options.editable;
    const originalEditorProps = editor.options.editorProps ?? {};
    const originalEditorAttributes = originalEditorProps.attributes;
    const managedAttributeNames = new Set<string>();
    const getConfiguredEditorAttributes = (state: EditorState, thisArg: unknown) => {
      const attributes =
        typeof originalEditorAttributes === "function"
          ? originalEditorAttributes.call(thisArg, state)
          : originalEditorAttributes;

      Object.keys(attributes ?? {}).forEach((name) => managedAttributeNames.add(name));

      return attributes ?? {};
    };
    const getCallerEditorAttributes = (state: EditorState, thisArg: unknown) => {
      const configuredAttributes = getConfiguredEditorAttributes(state, thisArg);
      const directDomAttributes: Record<string, string> = {};

      EDITOR_ACCESSIBILITY_ATTRIBUTE_NAMES.forEach((name) => {
        const value = originalDomAttributes[name];

        if (!managedAttributeNames.has(name) && value !== null) {
          directDomAttributes[name] = value;
        }
      });

      return {
        ...directDomAttributes,
        ...configuredAttributes,
      };
    };
    const initialCallerAttributes = getCallerEditorAttributes(editor.state, originalEditorProps);

    externalEditorAccessibilityRef.current = {
      editor,
      attributes: initialCallerAttributes,
    };

    const accessibleExternalEditorAttributes = function (this: unknown, state: EditorState) {
      const callerAttributes = getCallerEditorAttributes(state, this);

      if (externalEditorAccessibilityRef.current?.editor === editor) {
        externalEditorAccessibilityRef.current.attributes = callerAttributes;
      }

      const currentAccessibilityProps = accessibilityPropsRef.current;

      return getAccessibleEditorAttributes(
        callerAttributes,
        currentAccessibilityProps.ariaLabel,
        currentAccessibilityProps.editable,
      );
    };

    editor.setOptions({
      editorProps: {
        ...originalEditorProps,
        attributes: accessibleExternalEditorAttributes,
      },
    });

    return () => {
      if (!editor.isDestroyed) {
        const currentEditorProps = editor.options.editorProps ?? {};
        const attributesAreWrapped =
          currentEditorProps.attributes === accessibleExternalEditorAttributes;

        if (attributesAreWrapped) {
          const restoredEditorProps = { ...currentEditorProps };

          if (originalEditorAttributes === undefined) {
            delete restoredEditorProps.attributes;
          } else {
            restoredEditorProps.attributes = originalEditorAttributes;
          }

          editor.setOptions({ editorProps: restoredEditorProps });
        }

        editor.setEditable(Boolean(originalEditable), false);

        const configuredAttributes = attributesAreWrapped
          ? getConfiguredEditorAttributes(editor.state, originalEditorProps)
          : null;

        if (configuredAttributes) {
          EDITOR_ACCESSIBILITY_ATTRIBUTE_NAMES.forEach((name) => {
            const value =
              name in configuredAttributes
                ? configuredAttributes[name]
                : managedAttributeNames.has(name)
                  ? null
                  : originalDomAttributes[name];

            if (value === null || value === undefined) {
              editorElement.removeAttribute(name);
              return;
            }

            editorElement.setAttribute(name, value);
          });
        }
      }

      if (externalEditorAccessibilityRef.current?.editor === editor) {
        externalEditorAccessibilityRef.current = null;
      }
    };
  }, [editor, externalEditor]);

  useEffect(() => {
    editor.setEditable(Boolean(editable));

    const editorElement = editor.view.dom;
    const configuredEditorAttributes = externalEditor
      ? externalEditorAccessibilityRef.current?.attributes
      : typeof editorProps?.editorProps?.attributes === "function"
        ? editorProps.editorProps.attributes.call(editorProps.editorProps, editor.state)
        : editorProps?.editorProps?.attributes;
    const accessibleEditorAttributes = getAccessibleEditorAttributes(
      configuredEditorAttributes ?? {},
      ariaLabel,
      editable,
    );

    EDITOR_ACCESSIBILITY_ATTRIBUTE_NAMES.forEach((name) => {
      const value = accessibleEditorAttributes[name];

      if (value === undefined) {
        editorElement.removeAttribute(name);
        return;
      }

      editorElement.setAttribute(name, value);
    });
  }, [ariaLabel, editable, editor, editorProps, externalEditor]);

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
          {editable && editor.schema.nodes.table ? <TableBubbleMenu editor={editor} /> : null}
        </div>

        {mobile ? <ListOptionBar editor={editor} /> : null}
      </div>
      <div className="scribe-popup-root" data-scribe-popup-root />
    </div>
  );
});

ScribeEditor.displayName = "ScribeEditor";

const OwnedScribe = forwardRef<ScribeRef, ScribeProps>((props, ref) => {
  const {
    ariaLabel,
    content,
    editable = true,
    editorProps,
    extensions,
    onTableOfContentsChange,
  } = props;
  const { handleTableOfContentsChange, tableOfContentsItemsRef } =
    useTableOfContentsBridge(onTableOfContentsChange);
  const editorAttributes = editorProps?.editorProps?.attributes;
  const accessibilityPropsRef = useRef({ ariaLabel, editable });

  accessibilityPropsRef.current = { ariaLabel, editable };

  const accessibleEditorAttributes =
    typeof editorAttributes === "function"
      ? function (this: unknown, state: EditorState) {
          const currentAccessibilityProps = accessibilityPropsRef.current;

          return getAccessibleEditorAttributes(
            editorAttributes.call(this, state),
            currentAccessibilityProps.ariaLabel,
            currentAccessibilityProps.editable,
          );
        }
      : getAccessibleEditorAttributes(editorAttributes ?? {}, ariaLabel, editable);
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
      ...editorProps?.editorProps,
      attributes: accessibleEditorAttributes,
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
