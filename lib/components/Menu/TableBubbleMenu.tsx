import { Flex, IconButton, Separator } from "@radix-ui/themes";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Editor, useEditorState } from "@tiptap/react";
import {
  BubbleMenu as CoreBubbleMenu,
  type BubbleMenuProps as CoreBubbleMenuProps,
} from "@tiptap/react/menus";
import {
  FC,
  KeyboardEventHandler,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getPopupMountTarget } from "../Scribe/extension/getPopupMountTarget";
import { getSelectionContextualMenuOwner } from "./contextualMenuOwner";
import { getSelectionTableContext, tableBubbleMenuPluginKey } from "./tableBubbleMenuPlugin";

export interface TableBubbleMenuProps {
  editor: Editor;
}

type TableBubbleMenuShouldShow = NonNullable<CoreBubbleMenuProps["shouldShow"]>;
type TableControlIconName =
  | "add-row-above"
  | "add-row-below"
  | "delete-row"
  | "add-column-before"
  | "add-column-after"
  | "delete-column"
  | "toggle-header-row"
  | "delete-table";
type TableCommandName =
  | "addColumnAfter"
  | "addColumnBefore"
  | "addRowAfter"
  | "addRowBefore"
  | "deleteColumn"
  | "deleteRow"
  | "deleteTable"
  | "toggleHeaderRow";

const TABLE_COMMAND_NAMES: TableCommandName[] = [
  "addColumnAfter",
  "addColumnBefore",
  "addRowAfter",
  "addRowBefore",
  "deleteColumn",
  "deleteRow",
  "deleteTable",
  "toggleHeaderRow",
];
const UNAVAILABLE_TABLE_STATE = {
  canAddColumnAfter: false,
  canAddColumnBefore: false,
  canAddRowAfter: false,
  canAddRowBefore: false,
  canDeleteColumn: false,
  canDeleteRow: false,
  canDeleteTable: false,
  canToggleHeaderRow: false,
  hasHeaderRow: false,
};
const SCROLLABLE_OVERFLOW = /auto|overlay|scroll/;

const getScrollableAncestors = (element: HTMLElement) => {
  const ownerWindow = element.ownerDocument.defaultView;

  if (!ownerWindow) {
    return [];
  }

  const ancestors: HTMLElement[] = [];
  let ancestor = element.parentElement;

  while (
    ancestor &&
    ancestor !== element.ownerDocument.body &&
    ancestor !== element.ownerDocument.documentElement
  ) {
    const style = ownerWindow.getComputedStyle(ancestor);

    if (SCROLLABLE_OVERFLOW.test(`${style.overflow} ${style.overflowX} ${style.overflowY}`)) {
      ancestors.push(ancestor);
    }

    ancestor = ancestor.parentElement;
  }

  return ancestors;
};

const tableHasHeaderRow = (table: ProseMirrorNode) => {
  const firstRow = table.firstChild;

  if (!firstRow || firstRow.childCount === 0) {
    return false;
  }

  let hasOnlyHeaderCells = true;

  firstRow.forEach((cell) => {
    if (cell.type.name !== "tableHeader") {
      hasOnlyHeaderCells = false;
    }
  });

  return hasOnlyHeaderCells;
};

const TableControlIcon: FC<{ name: TableControlIconName }> = ({ name }) => {
  const sharedProps = {
    "aria-hidden": true,
    fill: "none",
    height: 18,
    viewBox: "0 0 20 20",
    width: 18,
  } as const;
  const strokeProps = {
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.35,
  };

  if (name === "add-row-above" || name === "add-row-below") {
    const plusY = name === "add-row-above" ? 3.5 : 16.5;

    return (
      <svg {...sharedProps}>
        <path d="M3.5 6.5h13v7h-13zM3.5 10h13M10 6.5v7" {...strokeProps} />
        <path d={`M7.75 ${plusY}h4.5M10 ${plusY - 2.25}v4.5`} {...strokeProps} />
      </svg>
    );
  }

  if (name === "add-column-before" || name === "add-column-after") {
    const plusX = name === "add-column-before" ? 3.5 : 16.5;

    return (
      <svg {...sharedProps}>
        <path d="M6.5 3.5h7v13h-7zM10 3.5v13M6.5 10h7" {...strokeProps} />
        <path d={`M${plusX - 2.25} 10h4.5M${plusX} 7.75v4.5`} {...strokeProps} />
      </svg>
    );
  }

  if (name === "delete-row") {
    return (
      <svg {...sharedProps}>
        <path d="M3.5 4h13v12h-13zM3.5 8h13M3.5 12h13M10 4v12" {...strokeProps} />
        <path d="M6.75 10h6.5" stroke="currentColor" strokeWidth="2.2" />
      </svg>
    );
  }

  if (name === "delete-column") {
    return (
      <svg {...sharedProps}>
        <path d="M4 3.5h12v13h-12zM8 3.5v13M12 3.5v13M4 10h12" {...strokeProps} />
        <path d="M10 6.75v6.5" stroke="currentColor" strokeWidth="2.2" />
      </svg>
    );
  }

  if (name === "toggle-header-row") {
    return (
      <svg {...sharedProps}>
        <path d="M3.5 4h13v12h-13zM3.5 8h13M10 4v12" {...strokeProps} />
        <path d="M4.2 4.7h11.6v2.6H4.2z" fill="currentColor" opacity="0.45" />
      </svg>
    );
  }

  return (
    <svg {...sharedProps}>
      <path d="M3.5 4h13v12h-13zM3.5 8h13M10 4v12" {...strokeProps} />
      <path d="m6.75 7 6.5 6.5m0-6.5-6.5 6.5" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
};

const TableBubbleMenu: FC<TableBubbleMenuProps> = ({ editor }) => {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [menuMaxWidth, setMenuMaxWidth] = useState<number | null>(null);
  const hasTableCommands = useMemo(
    () => TABLE_COMMAND_NAMES.every((name) => typeof editor.commands[name] === "function"),
    [editor],
  );
  const tableState = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => {
      if (!hasTableCommands) {
        return UNAVAILABLE_TABLE_STATE;
      }

      const tableContext = getSelectionTableContext(currentEditor.state);
      const can = currentEditor.can();

      return {
        canAddColumnAfter: can.addColumnAfter(),
        canAddColumnBefore: can.addColumnBefore(),
        canAddRowAfter: can.addRowAfter(),
        canAddRowBefore: can.addRowBefore(),
        canDeleteColumn: can.deleteColumn(),
        canDeleteRow: can.deleteRow(),
        canDeleteTable: can.deleteTable(),
        canToggleHeaderRow: can.toggleHeaderRow(),
        hasHeaderRow: tableContext ? tableHasHeaderRow(tableContext.node) : false,
      };
    },
  });

  const handleShouldShow = useCallback<TableBubbleMenuShouldShow>(
    ({ editor: currentEditor, element, state, view }) => {
      const hasFocus = view.hasFocus() || element.contains(element.ownerDocument.activeElement);

      return (
        hasTableCommands &&
        currentEditor.isEditable &&
        hasFocus &&
        getSelectionContextualMenuOwner(state) === "table"
      );
    },
    [hasTableCommands],
  );
  const getReferencedVirtualElement = useCallback(() => {
    if (editor.isDestroyed) {
      return null;
    }

    const tableContext = getSelectionTableContext(editor.state);

    if (!tableContext) {
      return null;
    }

    const tableDom = editor.view.nodeDOM(tableContext.position);

    if (!(tableDom instanceof HTMLElement)) {
      return null;
    }

    return (
      tableDom.closest<HTMLElement>(".tableWrapper") ??
      tableDom.querySelector<HTMLElement>(".tableWrapper") ??
      tableDom
    );
  }, [editor]);
  const appendTo = useCallback(() => getPopupMountTarget(editor), [editor]);

  useEffect(() => {
    const ownerWindow = editor.view.dom.ownerDocument.defaultView;

    if (!ownerWindow) {
      return;
    }

    const scrollableAncestors = getScrollableAncestors(editor.view.dom);
    let positionFrame: number | null = null;
    const updatePosition = () => {
      if (positionFrame !== null) {
        return;
      }

      positionFrame = ownerWindow.requestAnimationFrame(() => {
        positionFrame = null;

        if (!editor.isDestroyed) {
          editor.view.dispatch(editor.state.tr.setMeta(tableBubbleMenuPluginKey, "updatePosition"));
        }
      });
    };

    scrollableAncestors.forEach((ancestor) => {
      ancestor.addEventListener("scroll", updatePosition, { passive: true });
    });

    return () => {
      if (positionFrame !== null) {
        ownerWindow.cancelAnimationFrame(positionFrame);
      }

      scrollableAncestors.forEach((ancestor) => {
        ancestor.removeEventListener("scroll", updatePosition);
      });
    };
  }, [editor]);

  useEffect(() => {
    const editorRoot = editor.view.dom.closest<HTMLElement>("[data-scribe-root]");
    const ownerWindow = editor.view.dom.ownerDocument.defaultView;

    if (!editorRoot || !ownerWindow) {
      return;
    }

    const updateMenuWidth = () => {
      const editorWidth = editorRoot.getBoundingClientRect().width;

      setMenuMaxWidth(editorWidth > 0 ? Math.max(editorWidth - 16, 0) : null);
    };

    updateMenuWidth();

    if (!ownerWindow.ResizeObserver) {
      return;
    }

    const resizeObserver = new ownerWindow.ResizeObserver(updateMenuWidth);

    resizeObserver.observe(editorRoot);

    return () => resizeObserver.disconnect();
  }, [editor]);

  useEffect(() => {
    const editorDom = editor.view.dom;
    const handleEditorKeyDown = (event: KeyboardEvent) => {
      if (
        event.key !== "F10" ||
        !event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        !editor.isEditable ||
        getSelectionContextualMenuOwner(editor.state) !== "table"
      ) {
        return;
      }

      const firstControl =
        toolbarRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)");

      if (!firstControl) {
        return;
      }

      event.preventDefault();
      firstControl.focus();
    };

    editorDom.addEventListener("keydown", handleEditorKeyDown, true);

    return () => editorDom.removeEventListener("keydown", handleEditorKeyDown, true);
  }, [editor]);

  const handleToolbarKeyDown = useCallback<KeyboardEventHandler<HTMLDivElement>>(
    (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        editor.chain().focus().run();
        return;
      }

      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
        return;
      }

      const controls = Array.from(
        event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
      );

      if (controls.length === 0) {
        return;
      }

      const activeElement = event.currentTarget.ownerDocument.activeElement;
      const activeIndex = controls.findIndex((control) => control === activeElement);
      let targetIndex = activeIndex;

      if (event.key === "Home") {
        targetIndex = 0;
      } else if (event.key === "End") {
        targetIndex = controls.length - 1;
      } else if (event.key === "ArrowLeft") {
        targetIndex = activeIndex <= 0 ? controls.length - 1 : activeIndex - 1;
      } else {
        targetIndex = activeIndex < 0 || activeIndex === controls.length - 1 ? 0 : activeIndex + 1;
      }

      event.preventDefault();
      controls[targetIndex]?.focus();
    },
    [editor],
  );

  const options = useMemo<NonNullable<CoreBubbleMenuProps["options"]>>(
    () => ({
      strategy: "fixed",
      placement: "top-start",
      offset: 8,
      flip: {},
      shift: { padding: 8 },
    }),
    [],
  );
  const groups = useMemo<
    Array<
      Array<{
        ariaPressed?: boolean;
        command: () => void;
        disabled: boolean;
        icon: ReactNode;
        label: string;
      }>
    >
  >(
    () => [
      [
        {
          label: "Add row above",
          command: () => editor.chain().focus().addRowBefore().run(),
          disabled: !tableState.canAddRowBefore,
          icon: <TableControlIcon name="add-row-above" />,
        },
        {
          label: "Add row below",
          command: () => editor.chain().focus().addRowAfter().run(),
          disabled: !tableState.canAddRowAfter,
          icon: <TableControlIcon name="add-row-below" />,
        },
        {
          label: "Delete row",
          command: () => editor.chain().focus().deleteRow().run(),
          disabled: !tableState.canDeleteRow,
          icon: <TableControlIcon name="delete-row" />,
        },
      ],
      [
        {
          label: "Add column before",
          command: () => editor.chain().focus().addColumnBefore().run(),
          disabled: !tableState.canAddColumnBefore,
          icon: <TableControlIcon name="add-column-before" />,
        },
        {
          label: "Add column after",
          command: () => editor.chain().focus().addColumnAfter().run(),
          disabled: !tableState.canAddColumnAfter,
          icon: <TableControlIcon name="add-column-after" />,
        },
        {
          label: "Delete column",
          command: () => editor.chain().focus().deleteColumn().run(),
          disabled: !tableState.canDeleteColumn,
          icon: <TableControlIcon name="delete-column" />,
        },
      ],
      [
        {
          label: "Toggle header row",
          command: () => editor.chain().focus().toggleHeaderRow().run(),
          disabled: !tableState.canToggleHeaderRow,
          icon: <TableControlIcon name="toggle-header-row" />,
          ariaPressed: tableState.hasHeaderRow,
        },
      ],
      [
        {
          label: "Delete table",
          command: () => editor.chain().focus().deleteTable().run(),
          disabled: !tableState.canDeleteTable,
          icon: <TableControlIcon name="delete-table" />,
        },
      ],
    ],
    [editor, tableState],
  );

  return (
    <CoreBubbleMenu
      editor={editor}
      pluginKey={tableBubbleMenuPluginKey}
      updateDelay={0}
      resizeDelay={0}
      appendTo={appendTo}
      shouldShow={handleShouldShow}
      getReferencedVirtualElement={getReferencedVirtualElement}
      options={options}
    >
      <Flex
        ref={toolbarRef}
        className="scribe-table-bubble-menu"
        role="toolbar"
        aria-label="Table controls"
        aria-keyshortcuts="Alt+F10"
        align="center"
        gap="2"
        onKeyDown={handleToolbarKeyDown}
        style={menuMaxWidth === null ? undefined : { maxWidth: menuMaxWidth }}
      >
        {groups.map((group, groupIndex) => (
          <Flex key={group[0]?.label} align="center" gap="1">
            {groupIndex > 0 ? (
              <Separator orientation="vertical" decorative style={{ height: 20 }} />
            ) : null}
            {group.map((item) => (
              <IconButton
                key={item.label}
                type="button"
                size="1"
                radius="medium"
                color={item.label === "Delete table" ? "red" : "gray"}
                variant={item.ariaPressed ? "soft" : "ghost"}
                aria-label={item.label}
                aria-pressed={item.ariaPressed}
                disabled={item.disabled}
                title={item.label}
                onClick={item.command}
              >
                {item.icon}
              </IconButton>
            ))}
          </Flex>
        ))}
      </Flex>
    </CoreBubbleMenu>
  );
};

export default TableBubbleMenu;
