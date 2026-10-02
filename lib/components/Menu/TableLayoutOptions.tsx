import { DropdownMenu, IconButton } from "@radix-ui/themes";
import { Editor } from "@tiptap/react";
import { FC, useId, useRef } from "react";
import { getPopupMountTarget } from "../Scribe/extension/getPopupMountTarget";
import type { ScribeTableLayout } from "../Scribe/extension/resizable-table";
import TableHeightSettings from "./TableHeightSettings";

interface TableLayoutOptionsProps {
  editor: Editor;
  layout: ScribeTableLayout;
  limitHeight: boolean;
  maxHeight: number | null;
  stickyHeaderRow: boolean;
  hasHeaderRow: boolean;
  canSetLayout: boolean;
  canSetHeightLimit: boolean;
  hasMaxHeightCommand: boolean;
  canSetMaxHeight: boolean;
  hasStickyHeaderCommand: boolean;
  canSetStickyHeaderRow: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  heightSettingsOpen: boolean;
  onHeightSettingsOpenChange: (open: boolean) => void;
}

const TABLE_LAYOUT_OPTIONS: Array<{ value: ScribeTableLayout; label: string }> = [
  { value: "auto", label: "Auto" },
  { value: "fit", label: "Fit to width" },
  { value: "scroll", label: "Scroll horizontally" },
];

const TableLayoutOptions: FC<TableLayoutOptionsProps> = ({
  editor,
  layout,
  limitHeight,
  maxHeight,
  stickyHeaderRow,
  hasHeaderRow,
  canSetLayout,
  canSetHeightLimit,
  hasMaxHeightCommand,
  canSetMaxHeight,
  hasStickyHeaderCommand,
  canSetStickyHeaderRow,
  open,
  onOpenChange,
  heightSettingsOpen,
  onHeightSettingsOpenChange,
}) => {
  const returnFocusToEditor = useRef(false);
  const openingHeightSettings = useRef(false);
  const popupContainer = editor.isDestroyed ? undefined : getPopupMountTarget(editor);
  const stickyHeaderHelpId = useId();
  const stickyHeaderHelp = !hasHeaderRow ? "Requires a header row." : undefined;

  return (
    <>
      <DropdownMenu.Root
        modal={false}
        open={open}
        onOpenChange={(nextOpen) => {
          if (nextOpen) {
            returnFocusToEditor.current = false;
          }

          onOpenChange(nextOpen);
        }}
      >
        <DropdownMenu.Trigger>
          <IconButton
            type="button"
            size="1"
            radius="medium"
            color="gray"
            variant={open ? "soft" : "ghost"}
            aria-label="Table layout"
            title="Table layout"
          >
            <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 20 20" width="18">
              <path
                d="M3.5 3.5h13v8h-13zM3.5 7.5h13M8 3.5v8M12 3.5v8M3.5 16h13M5.5 14l-2 2 2 2M14.5 14l2 2-2 2"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.35"
              />
            </svg>
          </IconButton>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content
          aria-label="Table layout"
          container={popupContainer}
          size="2"
          side="bottom"
          align="start"
          collisionPadding={8}
          onKeyDown={(event) => event.stopPropagation()}
          onEscapeKeyDown={(event) => {
            event.stopPropagation();
            returnFocusToEditor.current = true;
          }}
          onCloseAutoFocus={(event) => {
            if (openingHeightSettings.current) {
              event.preventDefault();
              openingHeightSettings.current = false;
              return;
            }
            if (returnFocusToEditor.current && !editor.isDestroyed) {
              event.preventDefault();
              editor.chain().focus().run();
            }
          }}
        >
          <DropdownMenu.Label>Width</DropdownMenu.Label>
          <DropdownMenu.RadioGroup
            aria-label="Table width"
            value={layout}
            onValueChange={(value) => {
              const nextLayout = TABLE_LAYOUT_OPTIONS.find(
                (option) => option.value === value,
              )?.value;

              if (nextLayout) {
                returnFocusToEditor.current = true;
                editor.commands.setTableLayout(nextLayout);
              }
            }}
          >
            {TABLE_LAYOUT_OPTIONS.map((option) => (
              <DropdownMenu.RadioItem
                key={option.value}
                value={option.value}
                disabled={!canSetLayout}
              >
                {option.label}
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
          <DropdownMenu.Separator />
          <DropdownMenu.CheckboxItem
            checked={limitHeight}
            disabled={!canSetHeightLimit}
            onCheckedChange={(checked) => {
              returnFocusToEditor.current = true;
              editor.commands.setTableHeightLimit(checked);
            }}
          >
            Limit height
          </DropdownMenu.CheckboxItem>
          {hasMaxHeightCommand ? (
            <DropdownMenu.Item
              disabled={!canSetMaxHeight}
              onSelect={() => {
                openingHeightSettings.current = true;
                onHeightSettingsOpenChange(true);
              }}
            >
              Maximum height…
            </DropdownMenu.Item>
          ) : null}
          {hasStickyHeaderCommand ? (
            <>
              <DropdownMenu.CheckboxItem
                checked={stickyHeaderRow}
                disabled={!canSetStickyHeaderRow}
                aria-describedby={stickyHeaderHelp ? stickyHeaderHelpId : undefined}
                onCheckedChange={(checked) => {
                  returnFocusToEditor.current = true;
                  editor.commands.setTableStickyHeaderRow(checked);
                }}
              >
                Sticky header row
              </DropdownMenu.CheckboxItem>
              {stickyHeaderHelp ? (
                <DropdownMenu.Label
                  id={stickyHeaderHelpId}
                  style={{ height: "auto", maxWidth: 220, whiteSpace: "normal" }}
                >
                  {stickyHeaderHelp}
                </DropdownMenu.Label>
              ) : null}
            </>
          ) : null}
        </DropdownMenu.Content>
      </DropdownMenu.Root>
      {heightSettingsOpen ? (
        <TableHeightSettings
          editor={editor}
          maxHeight={maxHeight}
          canSetMaxHeight={canSetMaxHeight}
          onClose={() => onHeightSettingsOpenChange(false)}
        />
      ) : null}
    </>
  );
};

export default TableLayoutOptions;
