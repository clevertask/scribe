import {
  Box,
  Button,
  Dialog,
  Flex,
  IconButton,
  Separator,
  Text,
  TextField,
} from "@radix-ui/themes";
import clsx from "clsx";
import { Editor, useEditorState } from "@tiptap/react";
import {
  ChangeEvent,
  ComponentPropsWithoutRef,
  FC,
  Fragment,
  MouseEvent,
  useCallback,
  useState,
} from "react";
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
  UnorderedListIcon,
} from "../../icons/ToolbarIcons";

export interface BarMenuProps {
  editor: Editor;
}

interface FormatItem {
  command: () => void;
  disabled?: boolean;
  icon: FC<ComponentPropsWithoutRef<"svg">>;
  isActive: () => boolean;
  name: string;
}

const BarMenu: FC<BarMenuProps> = ({ editor }) => {
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [imageDialogOpen, setImageDialogOpen] = useState(false);
  const [linkValue, setLinkValue] = useState("");
  const [imageValue, setImageValue] = useState("");
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

  const handleOpenLinkDialog = useCallback(() => {
    const previousUrl = (editor.getAttributes("link").href as string | undefined) ?? "";
    setLinkValue(previousUrl);
    setLinkDialogOpen(true);
  }, [editor]);

  const handleOpenImageDialog = useCallback(() => {
    const previousUrl = (editor.getAttributes("image").src as string | undefined) ?? "";
    setImageValue(previousUrl);
    setImageDialogOpen(true);
  }, [editor]);

  const handleApplyLink = useCallback(() => {
    const url = linkValue.trim();

    if (url.length === 0) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      setLinkDialogOpen(false);
      return;
    }

    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: url })
      .selectTextblockEnd()
      .run();
    setLinkDialogOpen(false);
  }, [editor, linkValue]);

  const handleRemoveLink = useCallback(() => {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    setLinkDialogOpen(false);
  }, [editor]);

  const handleApplyImage = useCallback(() => {
    const url = imageValue.trim();

    if (!url) {
      return;
    }

    editor.chain().focus().setImage({ src: url }).run();
    setImageDialogOpen(false);
  }, [editor, imageValue]);

  const handleToolbarMouseDown = useCallback(
    (event: MouseEvent<HTMLButtonElement>, command: () => void) => {
      event.preventDefault();
      command();
    },
    [],
  );

  const handleLinkValueChange = useCallback(
    ({ target: { value } }: ChangeEvent<HTMLInputElement>) => {
      setLinkValue(value);
    },
    [],
  );

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
      },
      {
        name: "italic",
        icon: ItalicIcon,
        command: () => editor.chain().focus().toggleItalic().run(),
        isActive: () => Boolean(editorState?.isItalic),
      },
      {
        name: "strike",
        icon: StrikeIcon,
        command: () => editor.chain().focus().toggleStrike().run(),
        isActive: () => Boolean(editorState?.isStrike),
      },
    ],
    [
      {
        name: "inline-code",
        icon: InlineCodeIcon,
        command: () => editor.chain().focus().toggleCode().run(),
        isActive: () => Boolean(editorState?.isCode),
      },
      {
        name: "highlight",
        icon: HighlightIcon,
        command: () => editor.chain().focus().toggleHighlight().run(),
        isActive: () => Boolean(editorState?.isHighlight),
      },
    ],
    [
      {
        name: "unordered-list",
        icon: UnorderedListIcon,
        command: () => editor.chain().focus().toggleBulletList().run(),
        isActive: () => Boolean(editorState?.isBulletList),
      },
      {
        name: "ordered-list",
        icon: OrderedListIcon,
        command: () => editor.chain().focus().toggleOrderedList().run(),
        isActive: () => Boolean(editorState?.isOrderedList),
      },
    ],
    [
      {
        name: "link",
        icon: LinkIcon,
        command: handleOpenLinkDialog,
        isActive: () => Boolean(editorState?.isLink),
      },
      {
        name: "image",
        icon: ImageIcon,
        command: handleOpenImageDialog,
        isActive: () => Boolean(editorState?.isImage),
        disabled: false,
      },
      {
        name: "code-block",
        icon: CodeBlockIcon,
        command: () => editor.chain().focus().toggleCodeBlock().run(),
        isActive: () => Boolean(editorState?.isCodeBlock),
      },
      {
        name: "block-quote",
        icon: BlockQuoteIcon,
        command: () => editor.chain().focus().toggleBlockquote().run(),
        isActive: () => Boolean(editorState?.isBlockquote),
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
    <>
      <Box className="scribe-toolbar">
        <Flex align="center" gap="3" wrap="wrap">
          {Formats.map((format, index) => {
            return (
              <Fragment key={`format-group-${index}`}>
                <Flex align="center" gap="2" wrap="wrap">
                  {format.map((item) => {
                    return (
                      <IconButton
                        type="button"
                        radius="medium"
                        color="gray"
                        variant={item.isActive() ? "soft" : "ghost"}
                        disabled={item.disabled || !editor.isEditable}
                        title={item.name}
                        onMouseDown={(event) => handleToolbarMouseDown(event, item.command)}
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

      <Dialog.Root open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <Dialog.Content style={{ maxWidth: 420 }}>
          <Flex direction="column" gap="4">
            <Box>
              <Dialog.Title>Link</Dialog.Title>
              <Dialog.Description size="2">
                Add or update a link for the current selection.
              </Dialog.Description>
            </Box>
            <label>
              <Flex direction="column" gap="2">
                <Text as="span" size="2" weight="medium">
                  URL
                </Text>
                <TextField.Root
                  autoFocus
                  placeholder="https://example.com"
                  value={linkValue}
                  onChange={handleLinkValueChange}
                />
              </Flex>
            </label>
            <Flex justify="between" gap="3" wrap="wrap">
              <Button
                type="button"
                color="red"
                variant="soft"
                disabled={
                  !(
                    ((editor.getAttributes("link").href as string | undefined) ?? "").trim() ||
                    linkValue.trim()
                  )
                }
                onClick={handleRemoveLink}
              >
                Remove link
              </Button>
              <Flex gap="2" justify="end" style={{ marginLeft: "auto" }}>
                <Dialog.Close>
                  <Button type="button" variant="soft" color="gray">
                    Cancel
                  </Button>
                </Dialog.Close>
                <Button
                  type="button"
                  disabled={linkValue.trim().length === 0}
                  onClick={handleApplyLink}
                >
                  Save
                </Button>
              </Flex>
            </Flex>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>

      <Dialog.Root open={imageDialogOpen} onOpenChange={setImageDialogOpen}>
        <Dialog.Content style={{ maxWidth: 420 }}>
          <Flex direction="column" gap="4">
            <Box>
              <Dialog.Title>Image</Dialog.Title>
              <Dialog.Description size="2">Insert an image from a URL.</Dialog.Description>
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
              <Dialog.Close>
                <Button type="button" variant="soft" color="gray">
                  Cancel
                </Button>
              </Dialog.Close>
              <Button
                type="button"
                disabled={imageValue.trim().length === 0}
                onClick={handleApplyImage}
              >
                Save
              </Button>
            </Flex>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>
    </>
  );
};

export default BarMenu;
