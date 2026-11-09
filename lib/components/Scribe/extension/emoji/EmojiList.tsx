import { Box, ScrollArea, Text } from "@radix-ui/themes";
import { Editor } from "@tiptap/react";
import { SuggestionKeyDownProps } from "@tiptap/suggestion";
import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";

interface EmojiSuggestionItem {
  emoji?: string;
  fallbackImage?: string;
  name: string;
}

interface EmojiListProps {
  command: (payload: { name: string }) => void;
  editor: Editor;
  items: EmojiSuggestionItem[];
}

export interface EmojiListRef {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

export const EmojiList = forwardRef<EmojiListRef, EmojiListProps>((props, ref) => {
  const { command, items } = props;
  const viewportRef = useRef<HTMLDivElement>(null);
  const selectedItemRef = useRef<HTMLButtonElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const resolvedSelectedIndex = items.length === 0 ? 0 : Math.min(selectedIndex, items.length - 1);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const item = selectedItemRef.current;

    if (!viewport || !item) {
      return;
    }

    const viewportRect = viewport.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    const top = viewportRect.top + viewport.clientTop;
    const bottom = top + viewport.clientHeight;

    // Scroll only the popup, preserving the editor's caret and page position.
    if (itemRect.top < top) {
      viewport.scrollTop -= top - itemRect.top;
    } else if (itemRect.bottom > bottom) {
      viewport.scrollTop += itemRect.bottom - bottom;
    }
  }, [items, resolvedSelectedIndex]);

  useImperativeHandle(ref, () => {
    return {
      onKeyDown: (x) => {
        if (x.event.key === "ArrowUp") {
          if (items.length === 0) {
            return false;
          }

          setSelectedIndex((previousIndex) => {
            return (Math.min(previousIndex, items.length - 1) + items.length - 1) % items.length;
          });
          return true;
        }

        if (x.event.key === "ArrowDown") {
          if (items.length === 0) {
            return false;
          }

          setSelectedIndex((previousIndex) => {
            return (Math.min(previousIndex, items.length - 1) + 1) % items.length;
          });
          return true;
        }

        if (x.event.key === "Enter") {
          const item = items[resolvedSelectedIndex];

          if (item) {
            command({ name: item.name });
          }

          return true;
        }

        return false;
      },
    };
  }, [command, items, resolvedSelectedIndex]);

  if (items.length === 0) {
    return null;
  }

  return (
    <Box className="scribe-popup" style={{ width: 240 }}>
      <ScrollArea ref={viewportRef} type="auto" scrollbars="vertical" style={{ maxHeight: 240 }}>
        <div className="scribe-popup-list" role="group" aria-label="Emoji suggestions">
          {items.map((item, index) => (
            <button
              key={item.name}
              ref={index === resolvedSelectedIndex ? selectedItemRef : undefined}
              type="button"
              aria-current={index === resolvedSelectedIndex ? "true" : undefined}
              aria-label={`Insert ${item.name} emoji`}
              className="scribe-popup-item"
              data-selected={index === resolvedSelectedIndex}
              onClick={() => command({ name: item.name })}
            >
              <span className="scribe-emoji-preview" aria-hidden="true">
                {item.fallbackImage ? (
                  <img
                    alt=""
                    src={item.fallbackImage}
                    style={{ display: "block", height: 18, width: 18 }}
                  />
                ) : (
                  item.emoji
                )}
              </span>
              <Text size="2">:{item.name}:</Text>
            </button>
          ))}
        </div>
      </ScrollArea>
    </Box>
  );
});
