import clsx from "clsx";
import { Editor } from "@tiptap/react";
import { FC, Fragment, useCallback } from "react";
import BoldIcon from "../../icons/bold.svg";
import ItalicIcon from "../../icons/italic.svg";
import StrikeIcon from "../../icons/text-strike.svg";
import InlineCodeIcon from "../../icons/inline-code.svg";
import HighlightIcon from "../../icons/highlight.svg";
import UnorderedListIcon from "../../icons/unordered-list.svg";
import OrderedListIcon from "../../icons/ordered-list.svg";
import LinkIcon from "../../icons/link.svg";
import ImageIcon from "../../icons/image.svg";
import CodeBlockIcon from "../../icons/code-block.svg";
import BlockQuoteIcon from "../../icons/block-quote.svg";
import HorizontalLineIcon from "../../icons/horizontal-line.svg";

export interface BarMenuProps {
  editor: Editor;
  darkMode: boolean;
}

const BarMenu: FC<BarMenuProps> = ({ editor, darkMode }) => {
  const handleSetLink = useCallback(() => {
    const previousUrl = editor.getAttributes("link").href;
    // const selectedText = editor.commands.getSelectedText() as unknown as
    //   | string
    //   | null;
    const url = window.prompt("Link", previousUrl);
    // const text = window.prompt('Text', selectedText || '');

    // cancelled
    if (url === null) {
      return;
    }

    // empty
    if (url === "") {
      editor
        .chain()
        .focus()
        .extendMarkRange("link")
        .unsetLink()
        // .command(({ tr }) => {
        //   tr.insertText(text || url);
        //   return true;
        // })
        .run();

      return;
    }

    // update link
    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: url })
      // .command(({ tr }) => {
      //   tr.insertText(text || url);
      //   return true;
      // })
      .selectTextblockEnd()
      .run();
  }, [editor]);

  const handleSetImage = useCallback(() => {
    const existingImage = editor.getAttributes("image").src;

    const url = window.prompt(existingImage ? "Update Image URL" : "Image URL", existingImage);
    if (!url) {
      return;
    }

    editor.chain().focus().setImage({ src: url }).run();
  }, [editor]);

  const Formats = [
    [
      {
        name: "bold",
        icon: BoldIcon,
        command: () => editor.chain().focus().toggleBold().run(),
        isActive: () => editor.isActive("bold"),
      },
      {
        name: "italic",
        icon: ItalicIcon,
        command: () => editor.chain().focus().toggleItalic().run(),
        isActive: () => editor.isActive("italic"),
      },
      {
        name: "strike",
        icon: StrikeIcon,
        command: () => editor.chain().focus().toggleStrike().run(),
        isActive: () => editor.isActive("strike"),
      },
    ],
    [
      {
        name: "inline-code",
        icon: InlineCodeIcon,
        command: () => editor.chain().focus().toggleCode().run(),
        isActive: () => editor.isActive("code"),
      },
      {
        name: "highlight",
        icon: HighlightIcon,
        command: () => editor.chain().focus().toggleHighlight().run(),
        isActive: () => editor.isActive("highlight"),
      },
    ],
    [
      {
        name: "unordered-list",
        icon: UnorderedListIcon,
        command: () => editor.chain().focus().toggleBulletList().run(),
        isActive: () => editor.isActive("bulletList"),
      },
      {
        name: "ordered-list",
        icon: OrderedListIcon,
        command: () => editor.chain().focus().toggleOrderedList().run(),
        isActive: () => editor.isActive("orderedList"),
      },
    ],
    [
      {
        name: "link",
        icon: LinkIcon,
        command: () => handleSetLink(),
        isActive: () => editor.isActive("link"),
      },
      {
        name: "image",
        icon: ImageIcon,
        command: () => handleSetImage(),
        isActive: () => editor.isActive("image"),
        disabled: false,
      },
      {
        name: "code-block",
        icon: CodeBlockIcon,
        command: () => editor.chain().focus().toggleCodeBlock().run(),
        isActive: () => editor.isActive("codeBlock"),
      },
      {
        name: "block-quote",
        icon: BlockQuoteIcon,
        command: () => editor.chain().focus().toggleBlockquote().run(),
        isActive: () => editor.isActive("blockquote"),
      },
      {
        name: "horizontal-line",
        icon: HorizontalLineIcon,
        command: () => editor.chain().focus().setHorizontalRule().run(),
        isActive: () => false,
      },
    ],
  ];

  return (
    <div className={clsx("flex flex-row gap-4 border-b p-[8px]", darkMode ? "border-zinc-700" : "border-zinc-200")}>
      {Formats.map((format, index) => {
        return (
          <Fragment key={`format-group-${index}`}>
            <div className="flex gap-2">
              {format.map((item) => {
                return (
                  <button
                    title={item.name}
                    disabled={item?.disabled}
                    key={item.name}
                    className={clsx(
                      "rounded-md",
                      item.isActive() ? (darkMode ? "bg-zinc-700" : "bg-zinc-200") : "",
                      item?.disabled ? "cursor-not-allowed bg-opacity-50" : ""
                    )}
                    onClick={item.command}
                  >
                    <img src={item.icon} alt={item.name} style={{ filter: `invert(${darkMode ? 1 : 0})` }} />
                  </button>
                );
              })}
            </div>
            {index !== Formats.length - 1 && (
              <div className={clsx("border-l", darkMode ? "border-zinc-700" : "border-zinc-200")}></div>
            )}
          </Fragment>
        );
      })}
    </div>
  );
};

export default BarMenu;
