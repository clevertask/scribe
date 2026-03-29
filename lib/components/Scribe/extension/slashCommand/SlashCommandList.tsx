import { SuggestionKeyDownProps, SuggestionProps } from "@tiptap/suggestion";
import { Box, ScrollArea, Text, Theme } from "@radix-ui/themes";
import { isEmpty, noop } from "lodash";
import { forwardRef, useCallback, useImperativeHandle, useState } from "react";
import { SuggestionItem } from "./items";

export interface SlashCommandRef {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

type SlashCommandListProps = SuggestionProps & {
  darkMode?: boolean;
  items: SuggestionItem[];
};

export const SlashCommandList = forwardRef<SlashCommandRef, SlashCommandListProps>((props, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const { items, command } = props;
  const resolvedSelectedIndex = items.length === 0 ? 0 : Math.min(selectedIndex, items.length - 1);

  const selectItem = useCallback(
    (index: number) => {
      const item = items[index];

      if (item) {
        command(item);
      }
    },
    [command, items],
  );

  useImperativeHandle(
    ref,
    () => ({
      onKeyDown: ({ event }) => {
        if (event.key === "ArrowUp") {
          if (items.length === 0) {
            return false;
          }

          setSelectedIndex((previousIndex) => {
            const newIndex = (previousIndex + items.length - 1) % items.length;
            const commandListing = document.getElementById(`editor-command-${newIndex}`);
            if (commandListing) {
              commandListing.scrollIntoView({ block: "nearest" });
            }

            return newIndex;
          });

          return true;
        }

        if (event.key === "ArrowDown") {
          if (items.length === 0) {
            return false;
          }

          setSelectedIndex((previousIndex) => {
            const newIndex = (previousIndex + 1) % items.length;
            const commandListing = document.getElementById(`editor-command-${newIndex}`);
            if (commandListing) {
              commandListing.scrollIntoView({ block: "nearest" });
            }

            return newIndex;
          });

          return true;
        }

        if (event.key === "Enter") {
          selectItem(resolvedSelectedIndex);

          return true;
        }

        return false;
      },
    }),
    [items, resolvedSelectedIndex, selectItem],
  );

  if (isEmpty(items)) {
    return null;
  }

  return (
    <Theme appearance={props.darkMode ? "dark" : "light"} panelBackground="solid">
      <Box className="scribe-popup" style={{ width: 320 }}>
        <ScrollArea type="auto" scrollbars="vertical" style={{ maxHeight: 300 }}>
          <div className="scribe-popup-list">
            {items.map((item, index) => {
              const previousItem = items[index - 1];
              const showGroupLabel = index === 0 || previousItem?.type !== item.type;

              return (
                <div key={`${item.title}-${index}`}>
                  {showGroupLabel ? (
                    <Text as="div" size="1" className="scribe-popup-group-label">
                      {item.type}
                    </Text>
                  ) : null}
                  <button
                    type="button"
                    className="scribe-popup-item scribe-popup-item--command"
                    data-selected={index === resolvedSelectedIndex}
                    id={`editor-command-${index}`}
                    onClick={() => selectItem(index)}
                    onKeyDown={noop}
                  >
                    <span className="scribe-popup-item-icon" aria-hidden="true">
                      {item.icon}
                    </span>
                    <span className="scribe-popup-item-copy">
                      <Text as="span" size="2" className="scribe-popup-item-title">
                        {item.title}
                      </Text>
                      <Text as="span" size="1" color="gray">
                        {item.description}
                      </Text>
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </Box>
    </Theme>
  );
});
