import clsx from "clsx";
import { forwardRef, useEffect, useImperativeHandle, useState } from "react";

export const EmojiList = forwardRef((props, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const selectItem = (index) => {
    const item = props.items[index];

    if (item) {
      props.command({ name: item.name });
    }
  };

  const upHandler = () => {
    setSelectedIndex((selectedIndex + props.items.length - 1) % props.items.length);
  };

  const downHandler = () => {
    setSelectedIndex((selectedIndex + 1) % props.items.length);
  };

  const enterHandler = () => {
    selectItem(selectedIndex);
  };

  useEffect(() => setSelectedIndex(0), [props.items]);

  useImperativeHandle(ref, () => {
    return {
      onKeyDown: (x) => {
        if (x.event.key === "ArrowUp") {
          upHandler();
          return true;
        }

        if (x.event.key === "ArrowDown") {
          downHandler();
          return true;
        }

        if (x.event.key === "Enter") {
          enterHandler();
          return true;
        }

        return false;
      },
    };
  }, [upHandler, downHandler, enterHandler]);

  return (
    <div className={clsx(props.darkMode ? "dark:bg-gray-800" : "bg-white", "p-3", "rounded-md", "shadow-md")}>
      {props.items.map((item, index) => (
        <button
          className={
            index === selectedIndex ? clsx(props.darkMode ? "dark:bg-gray-700" : "bg-gray-200", "w-full", "p-1") : ""
          }
          key={index}
          style={{ display: "flex", alignItems: "center", gap: ".5rem" }}
          onClick={() => selectItem(index)}
        >
          {item.fallbackImage ? <img style={{ width: "1rem", height: "1rem" }} src={item.fallbackImage} /> : item.emoji}
          :{item.name}:
        </button>
      ))}
    </div>
  );
});
