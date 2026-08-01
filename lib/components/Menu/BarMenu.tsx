import {
  Box,
  Button,
  Flex,
  IconButton,
  Popover,
  Separator,
  Text,
  TextField,
} from "@radix-ui/themes";
import clsx from "clsx";
import { Editor, useEditorState } from "@tiptap/react";
import { ChangeEvent, FC, Fragment, MouseEvent, useCallback, useState } from "react";
import { getPopupMountTarget } from "../Scribe/extension/getPopupMountTarget";
import LinkEditor from "./LinkEditor";
import { hideLinkBubbleMenu } from "./linkBubbleMenuPlugin";
import {
  BlockQuoteIcon,
  BoldIcon,
  CodeBlockIcon,
  HighlightIcon,
  HorizontalLineIcon,
  ImageIcon,
  InlineCodeIcon,
  ItalicIcon,
  LinkIcon,
  OrderedListIcon,
  StrikeIcon,
  type ToolbarIconComponent,
  UnorderedListIcon,
} from "../../icons/ToolbarIcons";

export interface BarMenuProps {
  editor: Editor;
}

interface FormatItem {
  command?: () => void;
  disabled?: boolean;
  icon: ToolbarIconComponent;
  isActive: () => boolean;
  isToggle?: boolean;
  label: string;
  name: string;
  popover?: "image" | "link";
}

const BarMenu: FC<BarMenuProps> = ({ editor }) => {
  const [linkPopoverOpen, setLinkPopoverOpen] = useState(false);
  const [imagePopoverOpen, setImagePopoverOpen] = useState(false);
  const [linkValue, setLinkValue] = useState("");
  const [imageValue, setImageValue] = useState("");
  const popupContainer = getPopupMountTarget(editor);
  const editorState = useEditorState({
    editor,
    selector: ({ editor }) => {
      if (!editor) {
        return null;
      }

      return {
        isBold: editor.isActive("bold"),
        isItalic: editor.isActive("italic"),
        isStrike: editor.isActive("strike"),
        isCode: editor.isActive("code"),
        isHighlight: editor.isActive("highlight"),
        isBulletList: editor.isActive("bulletList"),
        isOrderedList: editor.isActive("orderedList"),
        isLink: editor.isActive("link"),
        isImage: editor.isActive("image"),
        isCodeBlock: editor.isActive("codeBlock"),
        isBlockquote: editor.isActive("blockquote"),
      };
    },
  });

  const handleLinkPopoverOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        hideLinkBubbleMenu(editor);
        const previousUrl = (editor.getAttributes("link").href as string | undefined) ?? "";
        setLinkValue(previousUrl);
        setImagePopoverOpen(false);
      }

      setLinkPopoverOpen(open);
    },
    [editor],
  );

  const handleImagePopoverOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        hideLinkBubbleMenu(editor);
        const previousUrl = (editor.getAttributes("image").src as string | undefined) ?? "";
        setImageValue(previousUrl);
        setLinkPopoverOpen(false);
      }

      setImagePopoverOpen(open);
    },
    [editor],
  );

  const handleApplyImage = useCallback(() => {
    const url = imageValue.trim();

    if (!url) {
      return;
    }

    editor.chain().focus().setImage({ src: url }).run();
    setImagePopoverOpen(false);
  }, [editor, imageValue]);

  const handleToolbarMouseDown = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
  }, []);

  const handleImageValueChange = useCallback(
    ({ target: { value } }: ChangeEvent<HTMLInputElement>) => {
      setImageValue(value);
    },
    [],
  );

  const Formats: FormatItem[][] = [
    [
      {
        name: "bold",
        icon: BoldIcon,
        command: () => editor.chain().focus().toggleBold().run(),
        isActive: () => Boolean(editorState?.isBold),
        isToggle: true,
        label: "Bold",
      },
      {
        name: "italic",
        icon: ItalicIcon,
        command: () => editor.chain().focus().toggleItalic().run(),
        isActive: () => Boolean(editorState?.isItalic),
        isToggle: true,
        label: "Italic",
      },
      {
        name: "strike",
        icon: StrikeIcon,
        command: () => editor.chain().focus().toggleStrike().run(),
        isActive: () => Boolean(editorState?.isStrike),
        isToggle: true,
        label: "Strikethrough",
      },
    ],
    [
      {
        name: "inline-code",
        icon: InlineCodeIcon,
        command: () => editor.chain().focus().toggleCode().run(),
        isActive: () => Boolean(editorState?.isCode),
        isToggle: true,
        label: "Inline code",
      },
      {
        name: "highlight",
        icon: HighlightIcon,
        command: () => editor.chain().focus().toggleHighlight().run(),
        isActive: () => Boolean(editorState?.isHighlight),
        isToggle: true,
        label: "Highlight",
      },
    ],
    [
      {
        name: "unordered-list",
        icon: UnorderedListIcon,
        command: () => editor.chain().focus().toggleBulletList().run(),
        isActive: () => Boolean(editorState?.isBulletList),
        isToggle: true,
        label: "Bulleted list",
      },
      {
        name: "ordered-list",
        icon: OrderedListIcon,
        command: () => editor.chain().focus().toggleOrderedList().run(),
        isActive: () => Boolean(editorState?.isOrderedList),
        isToggle: true,
        label: "Numbered list",
      },
    ],
    [
      {
        name: "link",
        icon: LinkIcon,
        isActive: () => Boolean(editorState?.isLink),
        label: "Link",
        popover: "link",
      },
      {
        name: "image",
        icon: ImageIcon,
        isActive: () => Boolean(editorState?.isImage),
        disabled: false,
        label: "Insert image",
        popover: "image",
      },
      {
        name: "code-block",
        icon: CodeBlockIcon,
        command: () => editor.chain().focus().toggleCodeBlock().run(),
        isActive: () => Boolean(editorState?.isCodeBlock),
        isToggle: true,
        label: "Code block",
      },
      {
        name: "block-quote",
        icon: BlockQuoteIcon,
        command: () => editor.chain().focus().toggleBlockquote().run(),
        isActive: () => Boolean(editorState?.isBlockquote),
        isToggle: true,
        label: "Block quote",
      },
      {
        name: "horizontal-line",
        icon: HorizontalLineIcon,
        command: () => editor.chain().focus().setHorizontalRule().run(),
        isActive: () => false,
        label: "Horizontal rule",
      },
    ],
  ];

  return (
    <Box className="scribe-toolbar" role="toolbar" aria-label="Text formatting">
      <Flex align="center" gap="3" wrap="wrap">
        {Formats.map((format, index) => {
          return (
            <Fragment key={`format-group-${index}`}>
              <Flex align="center" gap="2" wrap="wrap">
                {format.map((item, idx) => {
                  if (item.popover === "link") {
                    return (
                      <Popover.Root
                        key={`${item.name}-${idx}`}
                        open={linkPopoverOpen}
                        onOpenChange={handleLinkPopoverOpenChange}
                      >
                        <Popover.Trigger>
                          <IconButton
                            type="button"
                            aria-label={item.label}
                            radius="medium"
                            color="gray"
                            variant={item.isActive() ? "soft" : "ghost"}
                            disabled={item.disabled || !editor.isEditable}
                            title={item.label}
                            onMouseDown={handleToolbarMouseDown}
                            className={clsx(item.disabled && "scribe-toolbar-button--disabled")}
                          >
                            <item.icon className="scribe-toolbar-icon" />
                          </IconButton>
                        </Popover.Trigger>
                        <Popover.Content
                          aria-label="Link settings"
                          container={popupContainer}
                          size="2"
                          side="bottom"
                          align="start"
                          style={{ maxWidth: "calc(100vw - 32px)", width: 320 }}
                        >
                          <LinkEditor
                            editor={editor}
                            existingHref={
                              (editor.getAttributes("link").href as string | undefined) ?? ""
                            }
                            onClose={() => setLinkPopoverOpen(false)}
                            onValueChange={setLinkValue}
                            selectTextblockEndAfterSave
                            value={linkValue}
                          />
                        </Popover.Content>
                      </Popover.Root>
                    );
                  }

                  if (item.popover === "image") {
                    return (
                      <Popover.Root
                        key={`${item.name}-${idx}`}
                        open={imagePopoverOpen}
                        onOpenChange={handleImagePopoverOpenChange}
                      >
                        <Popover.Trigger>
                          <IconButton
                            type="button"
                            aria-label={item.label}
                            radius="medium"
                            color="gray"
                            variant={item.isActive() ? "soft" : "ghost"}
                            disabled={item.disabled || !editor.isEditable}
                            title={item.label}
                            onMouseDown={handleToolbarMouseDown}
                            className={clsx(item.disabled && "scribe-toolbar-button--disabled")}
                          >
                            <item.icon className="scribe-toolbar-icon" />
                          </IconButton>
                        </Popover.Trigger>
                        <Popover.Content
                          aria-label="Insert image"
                          container={popupContainer}
                          size="2"
                          side="bottom"
                          align="start"
                          style={{ maxWidth: "calc(100vw - 32px)", width: 320 }}
                        >
                          <Flex direction="column" gap="4">
                            <Box>
                              <Text as="p" size="3" weight="medium">
                                Image
                              </Text>
                              <Text as="p" size="2" color="gray">
                                Insert an image from a URL.
                              </Text>
                            </Box>
                            <label>
                              <Flex direction="column" gap="2">
                                <Text as="span" size="2" weight="medium">
                                  Image URL
                                </Text>
                                <TextField.Root
                                  autoFocus
                                  placeholder="https://example.com/image.png"
                                  value={imageValue}
                                  onChange={handleImageValueChange}
                                />
                              </Flex>
                            </label>
                            <Flex justify="end" gap="2">
                              <Popover.Close>
                                <Button type="button" variant="soft" color="gray">
                                  Cancel
                                </Button>
                              </Popover.Close>
                              <Button
                                type="button"
                                disabled={imageValue.trim().length === 0}
                                onClick={handleApplyImage}
                              >
                                Save
                              </Button>
                            </Flex>
                          </Flex>
                        </Popover.Content>
                      </Popover.Root>
                    );
                  }

                  return (
                    <IconButton
                      key={`${item.name}-${idx}`}
                      type="button"
                      aria-label={item.label}
                      aria-pressed={item.isToggle ? item.isActive() : undefined}
                      radius="medium"
                      color="gray"
                      variant={item.isActive() ? "soft" : "ghost"}
                      disabled={item.disabled || !editor.isEditable}
                      title={item.label}
                      onMouseDown={handleToolbarMouseDown}
                      onClick={item.command}
                      className={clsx(item.disabled && "scribe-toolbar-button--disabled")}
                    >
                      <item.icon className="scribe-toolbar-icon" />
                    </IconButton>
                  );
                })}
              </Flex>
              {index !== Formats.length - 1 ? (
                <Separator orientation="vertical" decorative style={{ height: 20 }} />
              ) : null}
            </Fragment>
          );
        })}
      </Flex>
    </Box>
  );
};

export default BarMenu;
