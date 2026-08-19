import { Theme } from "@radix-ui/themes";
import type { Editor } from "@tiptap/react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ExternalLinkDisplayOptions, {
  type ExternalLinkDisplay,
} from "../lib/components/Menu/ExternalLinkDisplayOptions";
import LinkEditor from "../lib/components/Menu/LinkEditor";

type EditorFixtureOptions = {
  availableDisplays?: ExternalLinkDisplay[];
  canCommandResult?: boolean;
  commandResult?: boolean;
  includeDisplayCommand?: boolean;
};

const createEditorFixture = ({
  availableDisplays = ["plain", "compact", "card"],
  canCommandResult,
  commandResult = true,
  includeDisplayCommand = true,
}: EditorFixtureOptions = {}) => {
  const resolvedCanCommandResult = canCommandResult ?? commandResult;
  const setExternalLinkDisplay = vi.fn(() => commandResult);
  const canSetExternalLinkDisplay = vi.fn((display: ExternalLinkDisplay) =>
    availableDisplays.includes(display),
  );
  const chain = {} as Record<string, ReturnType<typeof vi.fn>>;
  const canChain = {} as Record<string, ReturnType<typeof vi.fn>>;
  const chainSetLink = vi.fn(() => chain);
  const chainSetExternalLinkDisplay = vi.fn(() => chain);
  const canChainSetLink = vi.fn(() => canChain);
  const canChainSetExternalLinkDisplay = vi.fn(() => canChain);

  Object.assign(chain, {
    extendMarkRange: vi.fn(() => chain),
    focus: vi.fn(() => chain),
    run: vi.fn(() => commandResult),
    setExternalLinkDisplay: chainSetExternalLinkDisplay,
    setLink: chainSetLink,
    setNodeSelection: vi.fn(() => chain),
  });
  Object.assign(canChain, {
    extendMarkRange: vi.fn(() => canChain),
    run: vi.fn(() => resolvedCanCommandResult),
    setExternalLinkDisplay: canChainSetExternalLinkDisplay,
    setLink: canChainSetLink,
    setNodeSelection: vi.fn(() => canChain),
  });
  const editor = {
    can: () =>
      includeDisplayCommand
        ? { chain: () => canChain, setExternalLinkDisplay: canSetExternalLinkDisplay }
        : {},
    chain: () => chain,
    commands: includeDisplayCommand ? { setExternalLinkDisplay } : {},
  } as unknown as Editor;

  return {
    canSetExternalLinkDisplay,
    canChainSetExternalLinkDisplay,
    canChainSetLink,
    chainSetExternalLinkDisplay,
    chainSetLink,
    editor,
    setExternalLinkDisplay,
  };
};

const renderOptions = (
  editor: Editor,
  currentDisplay: ExternalLinkDisplay = "plain",
  onDisplayChange = vi.fn(),
  targetPosition?: number,
) => {
  render(
    <Theme>
      <ExternalLinkDisplayOptions
        currentDisplay={currentDisplay}
        editor={editor}
        onDisplayChange={onDisplayChange}
        targetPosition={targetPosition}
      />
    </Theme>,
  );

  return onDisplayChange;
};

describe("external link display options", () => {
  it("labels every display choice and exposes the current choice", () => {
    const { editor } = createEditorFixture();

    renderOptions(editor);

    const displayGroup = screen.getByRole("group", { name: "Display as" });
    const plainOption = within(displayGroup).getByRole("button", {
      name: "Plain link",
      exact: true,
    });
    const compactOption = within(displayGroup).getByRole("button", {
      name: "Compact",
      exact: true,
    });
    const cardOption = within(displayGroup).getByRole("button", {
      name: "Preview card",
      exact: true,
    });

    expect(screen.getByText("Display as")).toBeInTheDocument();
    expect(plainOption).toHaveAttribute("aria-pressed", "true");
    expect(compactOption).toHaveAttribute("aria-pressed", "false");
    expect(cardOption).toHaveAttribute("aria-pressed", "false");
    expect(plainOption).toHaveAccessibleDescription("Show a regular text link.");
    expect(compactOption).toHaveAccessibleDescription("Show the page title and site icon.");
    expect(cardOption).toHaveAccessibleDescription("Show an image, title, and description.");
    expect(displayGroup).toHaveTextContent("Show a regular text link.");
    expect(displayGroup).toHaveTextContent("Show the page title and site icon.");
    expect(displayGroup).toHaveTextContent("Show an image, title, and description.");
  });

  it("runs a display command and reports a successful change", () => {
    const onDisplayChange = vi.fn();
    const { editor, setExternalLinkDisplay } = createEditorFixture();

    renderOptions(editor, "plain", onDisplayChange);
    fireEvent.click(screen.getByRole("button", { name: "Compact", exact: true }));

    expect(setExternalLinkDisplay).toHaveBeenCalledWith("compact");
    expect(onDisplayChange).toHaveBeenCalledWith("compact");
  });

  it("checks and changes an existing preview at its explicit position", () => {
    const onDisplayChange = vi.fn();
    const {
      canChainSetExternalLinkDisplay,
      canSetExternalLinkDisplay,
      chainSetExternalLinkDisplay,
      editor,
    } = createEditorFixture();

    renderOptions(editor, "compact", onDisplayChange, 17);

    expect(canSetExternalLinkDisplay).toHaveBeenCalledWith("card", 17);
    expect(canChainSetExternalLinkDisplay).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Preview card", exact: true }));
    expect(chainSetExternalLinkDisplay).toHaveBeenCalledWith("card", 17);
    expect(onDisplayChange).toHaveBeenCalledWith("card");
  });

  it("disables the card when the command cannot run", () => {
    const { editor } = createEditorFixture({ availableDisplays: ["plain", "compact"] });

    renderOptions(editor);

    const cardOption = screen.getByRole("button", { name: "Preview card", exact: true });

    expect(cardOption).toBeDisabled();
    expect(cardOption).toHaveAccessibleDescription("Preview card needs its own line.");
    expect(screen.getByRole("button", { name: "Compact", exact: true })).toBeEnabled();
  });

  it("keeps the controls visible for an existing preview", () => {
    const { editor } = createEditorFixture({ availableDisplays: ["plain", "compact"] });

    renderOptions(editor, "compact");

    expect(screen.getByRole("group", { name: "Display as" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Compact", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Preview card", exact: true })).toBeDisabled();
  });

  it("hides the section when preview conversion is unavailable", () => {
    const { editor } = createEditorFixture({
      availableDisplays: ["plain"],
    });

    renderOptions(editor);

    expect(screen.queryByRole("group", { name: "Display as" })).not.toBeInTheDocument();
  });

  it("hides the section when the editor does not register the display command", () => {
    const { editor } = createEditorFixture({ includeDisplayCommand: false });

    renderOptions(editor);

    expect(screen.queryByRole("group", { name: "Display as" })).not.toBeInTheDocument();
  });

  it("does not report a change when the command fails", () => {
    const onDisplayChange = vi.fn();
    const { editor } = createEditorFixture({ commandResult: false });

    renderOptions(editor, "plain", onDisplayChange);
    fireEvent.click(screen.getByRole("button", { name: "Compact", exact: true }));

    expect(onDisplayChange).not.toHaveBeenCalled();
  });

  it("integrates with the existing link editor and closes after conversion", () => {
    const onClose = vi.fn();
    const { editor, setExternalLinkDisplay } = createEditorFixture();

    render(
      <Theme>
        <LinkEditor
          editor={editor}
          existingHref="https://example.com"
          onClose={onClose}
          onValueChange={vi.fn()}
          value="https://example.com"
        />
      </Theme>,
    );

    expect(screen.getByRole("textbox", { name: "URL" })).toHaveValue("https://example.com");
    expect(screen.getByRole("button", { name: "Remove link" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Preview card", exact: true }));

    expect(setExternalLinkDisplay).toHaveBeenCalledWith("card");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("saves a changed URL before converting its display", () => {
    const onClose = vi.fn();
    const { chainSetExternalLinkDisplay, chainSetLink, editor } = createEditorFixture();

    render(
      <Theme>
        <LinkEditor
          editor={editor}
          existingHref="https://old.example/product"
          onClose={onClose}
          onValueChange={vi.fn()}
          value="new.example/product"
        />
      </Theme>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Compact", exact: true }));

    expect(chainSetLink).toHaveBeenCalledWith({ href: "https://new.example/product" });
    expect(chainSetExternalLinkDisplay).toHaveBeenCalledWith("compact");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("reports a changed URL conversion failure without closing", () => {
    const onClose = vi.fn();
    const { chainSetLink, editor } = createEditorFixture({
      commandResult: false,
    });

    render(
      <Theme>
        <LinkEditor
          editor={editor}
          existingHref="https://old.example/product"
          onClose={onClose}
          onValueChange={vi.fn()}
          value="/internal/product"
        />
      </Theme>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Compact", exact: true }));

    expect(chainSetLink).toHaveBeenCalledWith({ href: "/internal/product" });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "This link can't use Compact or Preview card.",
    );
  });
});
