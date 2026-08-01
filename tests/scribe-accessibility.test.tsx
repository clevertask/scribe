import { Theme } from "@radix-ui/themes";
import type { Editor } from "@tiptap/react";
import type { SuggestionKeyDownProps } from "@tiptap/suggestion";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createScribeEditor, Scribe, type ScribeProps, type ScribeRef } from "../lib/main";
import { EmojiList, type EmojiListRef } from "../lib/components/Scribe/extension/emoji/EmojiList";
import {
  SlashCommandList,
  type SlashCommandRef,
} from "../lib/components/Scribe/extension/slashCommand/SlashCommandList";
import {
  SuggestionItemType,
  type SuggestionItem,
} from "../lib/components/Scribe/extension/slashCommand/items";

const externalEditors = new Set<Editor>();

afterEach(() => {
  externalEditors.forEach((editor) => {
    if (!editor.isDestroyed) {
      editor.destroy();
    }
  });
  externalEditors.clear();
});

const renderScribe = (props: ScribeProps = {}) => {
  const scribeRef = createRef<ScribeRef>();

  render(
    <Theme>
      <Scribe ref={scribeRef} content="<p>Format me</p>" {...props} />
    </Theme>,
  );

  const editor = scribeRef.current?.editor;

  if (!editor) {
    throw new Error("Expected Scribe to expose its editor");
  }

  return editor;
};

const getTextPosition = (editor: Editor, text: string) => {
  let textPosition: number | undefined;

  editor.state.doc.descendants((node, position) => {
    if (textPosition === undefined && node.isText && node.text?.includes(text)) {
      textPosition = position + 1;
    }
  });

  if (textPosition === undefined) {
    throw new Error(`Expected to find ${text} in the editor`);
  }

  return textPosition;
};

const getListItemDepth = (editor: Editor, text: string) => {
  const resolvedPosition = editor.state.doc.resolve(getTextPosition(editor, text));
  let listItemDepth = 0;

  for (let depth = 0; depth <= resolvedPosition.depth; depth += 1) {
    if (resolvedPosition.node(depth).type.name === "listItem") {
      listItemDepth += 1;
    }
  }

  return listItemDepth;
};

describe("Scribe accessibility", () => {
  it("names the editor and formatting controls without test-only selectors", () => {
    renderScribe({ ariaLabel: "Document content" });

    const editorElement = screen.getByRole("textbox", { name: "Document content" });
    const toolbar = screen.getByRole("toolbar", { name: "Text formatting" });
    const toggleNames = [
      "Bold",
      "Italic",
      "Strikethrough",
      "Inline code",
      "Highlight",
      "Bulleted list",
      "Numbered list",
      "Code block",
      "Block quote",
    ];
    const actionNames = ["Link", "Insert image", "Horizontal rule"];

    expect(editorElement).toHaveAttribute("aria-multiline", "true");
    expect(editorElement).toHaveAttribute("aria-readonly", "false");

    toggleNames.forEach((name) => {
      expect(within(toolbar).getByRole("button", { name })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
    });

    actionNames.forEach((name) => {
      expect(within(toolbar).getByRole("button", { name })).not.toHaveAttribute("aria-pressed");
    });
  });

  it("preserves function-valued consumer editor attributes", () => {
    renderScribe({
      editorProps: {
        editorProps: {
          attributes: () => ({
            "aria-label": "Consumer editor",
            class: "consumer-editor",
            "data-consumer-editor": "true",
          }),
        },
      },
    });

    const editorElement = screen.getByRole("textbox", { name: "Consumer editor" });

    expect(editorElement).toHaveAttribute("data-consumer-editor", "true");
    expect(editorElement).toHaveClass("scribe");
    expect(editorElement).toHaveClass("consumer-editor");
  });

  it("does not add textbox-only states to a consumer role", () => {
    renderScribe({
      editorProps: {
        editorProps: {
          attributes: {
            role: "document",
            "aria-label": "Rendered document",
          },
        },
      },
    });

    const editorElement = screen.getByRole("document", { name: "Rendered document" });

    expect(editorElement).not.toHaveAttribute("aria-multiline");
    expect(editorElement).not.toHaveAttribute("aria-readonly");
  });

  it("keeps a changed label after editor transactions", () => {
    const scribeRef = createRef<ScribeRef>();
    const renderEditor = (ariaLabel: string) => (
      <Theme>
        <Scribe
          ref={scribeRef}
          ariaLabel={ariaLabel}
          content="<p>Label me</p>"
          editorProps={{
            editorProps: {
              attributes: () => ({ "data-dynamic-attributes": "true" }),
            },
          }}
          showBarMenu={false}
        />
      </Theme>
    );
    const { rerender } = render(renderEditor("Draft content"));

    expect(screen.getByRole("textbox", { name: "Draft content" })).toBeInTheDocument();

    rerender(renderEditor("Published content"));

    act(() => {
      scribeRef.current?.editor.commands.insertContent("!");
    });

    expect(screen.getByRole("textbox", { name: "Published content" })).toHaveAttribute(
      "data-dynamic-attributes",
      "true",
    );
  });

  it("keeps dynamic caller attributes and restores external editor ownership", () => {
    const externalEditor = createScribeEditor({
      content: "<p>Caller-owned content</p>",
      editable: false,
    });
    externalEditors.add(externalEditor);
    externalEditor.setOptions({
      editorProps: {
        ...externalEditor.options.editorProps,
        attributes: (state) => ({
          "aria-label": state.doc.textContent.includes("Updated")
            ? externalEditor.isEditable
              ? "Updated caller editor"
              : "Restored caller editor"
            : "Caller editor",
          "aria-readonly": "true",
          class: "scribe caller-editor",
        }),
      },
    });
    const callerAttributes = externalEditor.options.editorProps.attributes;

    const renderExternalEditor = (ariaLabel?: string) => (
      <Theme>
        <Scribe
          ariaLabel={ariaLabel}
          editable
          externalEditor={externalEditor}
          showBarMenu={false}
        />
      </Theme>
    );
    const { rerender, unmount } = render(renderExternalEditor("Document content"));

    expect(screen.getByRole("textbox", { name: "Document content" })).toBeInTheDocument();
    expect(externalEditor.isEditable).toBe(true);

    const handleKeyDown = vi.fn(() => false);

    act(() => {
      externalEditor.setOptions({
        editorProps: { ...externalEditor.options.editorProps, handleKeyDown },
      });
    });

    act(() => {
      externalEditor.commands.insertContent(" Updated");
    });

    expect(screen.getByRole("textbox", { name: "Document content" })).toBeInTheDocument();

    rerender(renderExternalEditor());

    expect(screen.getByRole("textbox", { name: "Updated caller editor" })).toBeInTheDocument();

    unmount();

    expect(externalEditor.isEditable).toBe(false);
    expect(externalEditor.view.dom).toHaveAttribute("aria-label", "Restored caller editor");
    expect(externalEditor.view.dom).toHaveAttribute("aria-readonly", "true");
    expect(externalEditor.options.editorProps.attributes).toBe(callerAttributes);
    expect(externalEditor.options.editorProps.handleKeyDown).toBe(handleKeyDown);
  });

  it("exposes read-only state and disables formatting controls", () => {
    renderScribe({ editable: false });

    expect(screen.getByRole("textbox", { name: "Rich text editor" })).toHaveAttribute(
      "aria-readonly",
      "true",
    );

    within(screen.getByRole("toolbar", { name: "Text formatting" }))
      .getAllByRole("button")
      .forEach((button) => expect(button).toBeDisabled());
  });

  it("runs a formatting command from native click activation", async () => {
    const editor = renderScribe();
    const boldButton = screen.getByRole("button", { name: "Bold" });

    act(() => {
      editor.commands.setTextSelection({ from: 1, to: 7 });
      editor.view.focus();
    });

    boldButton.focus();
    expect(boldButton).toHaveFocus();
    fireEvent.click(boldButton);

    await waitFor(() => {
      expect(boldButton).toHaveAttribute("aria-pressed", "true");
    });
    expect(editor.getHTML()).toContain("<strong>Format</strong>");
  });

  it("runs mobile list indentation controls from native click activation", async () => {
    const editor = renderScribe({
      content: "<ul><li><p>Parent</p><ul><li><p>Child</p></li></ul></li></ul>",
      mobile: true,
      showBarMenu: false,
    });

    act(() => {
      editor.commands.setTextSelection(getTextPosition(editor, "Child"));
      editor.view.focus();
    });

    const listControls = await screen.findByRole("group", { name: "List indentation" });
    const outdentButton = within(listControls).getByRole("button", {
      name: "Outdent list item",
    });

    expect(getListItemDepth(editor, "Child")).toBe(2);
    fireEvent.click(outdentButton);

    await waitFor(() => {
      expect(getListItemDepth(editor, "Child")).toBe(1);
    });

    fireEvent.click(within(listControls).getByRole("button", { name: "Indent list item" }));

    await waitFor(() => {
      expect(getListItemDepth(editor, "Child")).toBe(2);
    });
  });

  it("provides accessible names for toolbar popovers", async () => {
    const editor = renderScribe();

    act(() => {
      editor.commands.setTextSelection({ from: 1, to: 7 });
      editor.view.focus();
    });

    const linkButton = screen.getByRole("button", { name: "Link" });

    fireEvent.click(linkButton);
    expect(await screen.findByRole("dialog", { name: "Link settings" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "URL" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Link settings" })).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Insert image" }));
    expect(await screen.findByRole("dialog", { name: "Insert image" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Image URL" })).toBeInTheDocument();
  });
});

describe("Scribe suggestion accessibility", () => {
  it("names slash-command suggestions and exposes keyboard selection", () => {
    const slashCommandRef = createRef<SlashCommandRef>();
    const items: SuggestionItem[] = [
      {
        title: "Divider",
        description: "Insert a dividing line",
        type: SuggestionItemType.BASIC_BLOCKS,
        searchTerms: ["separator"],
        command: vi.fn(),
      },
      {
        title: "Quote",
        description: "Insert a block quote",
        type: SuggestionItemType.BASIC_BLOCKS,
        searchTerms: ["blockquote"],
        command: vi.fn(),
      },
    ];
    const props = {
      command: vi.fn(),
      items,
    } as unknown as ComponentProps<typeof SlashCommandList>;

    render(
      <Theme>
        <SlashCommandList ref={slashCommandRef} {...props} />
      </Theme>,
    );

    const suggestions = screen.getByRole("group", { name: "Block suggestions" });
    const divider = within(suggestions).getByRole("button", { name: "Divider" });
    const quote = within(suggestions).getByRole("button", { name: "Quote" });

    expect(divider).toHaveAccessibleDescription("Insert a dividing line");
    expect(divider).toHaveAttribute("aria-current", "true");

    act(() => {
      slashCommandRef.current?.onKeyDown({
        event: new KeyboardEvent("keydown", { key: "ArrowDown" }),
      } as SuggestionKeyDownProps);
    });

    expect(divider).not.toHaveAttribute("aria-current");
    expect(quote).toHaveAttribute("aria-current", "true");
  });

  it("names emoji suggestions and exposes keyboard selection", () => {
    const emojiListRef = createRef<EmojiListRef>();
    const props = {
      command: vi.fn(),
      editor: {},
      items: [
        { emoji: "😀", name: "grinning" },
        { emoji: "🎉", name: "tada" },
      ],
    } as unknown as ComponentProps<typeof EmojiList>;

    render(
      <Theme>
        <EmojiList ref={emojiListRef} {...props} />
      </Theme>,
    );

    const suggestions = screen.getByRole("group", { name: "Emoji suggestions" });
    const grinningEmoji = within(suggestions).getByRole("button", {
      name: "Insert grinning emoji",
    });
    const tadaEmoji = within(suggestions).getByRole("button", {
      name: "Insert tada emoji",
    });

    expect(grinningEmoji).toHaveAttribute("aria-current", "true");

    act(() => {
      emojiListRef.current?.onKeyDown({
        event: new KeyboardEvent("keydown", { key: "ArrowDown" }),
      } as SuggestionKeyDownProps);
    });

    expect(grinningEmoji).not.toHaveAttribute("aria-current");
    expect(tadaEmoji).toHaveAttribute("aria-current", "true");
  });
});
