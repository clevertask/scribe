import { Theme } from "@radix-ui/themes";
import type { Editor } from "@tiptap/react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Scribe, type ScribeRef } from "../lib/main";

const LINK_CONTENT =
  '<p>Visit <a href="https://old.example/docs">Example link</a> for details.</p>';
const liveEditors = new Set<Editor>();

afterEach(() => {
  liveEditors.forEach((editor) => {
    if (!editor.isDestroyed) {
      editor.destroy();
    }
  });
  liveEditors.clear();
});

interface RenderScribeOptions {
  content?: string;
  editable?: boolean;
  showBarMenu?: boolean;
}

const renderScribe = ({
  content = LINK_CONTENT,
  editable = true,
  showBarMenu = false,
}: RenderScribeOptions = {}) => {
  const scribeRef = createRef<ScribeRef>();

  const result = render(
    <Theme>
      <Scribe ref={scribeRef} content={content} editable={editable} showBarMenu={showBarMenu} />
    </Theme>,
  );

  const editor = scribeRef.current?.editor;

  if (!editor) {
    throw new Error("Expected Scribe to expose its editor");
  }

  liveEditors.add(editor);

  return { editor, ...result };
};

const findTextRange = (editor: Editor, text: string) => {
  let range: { from: number; to: number } | undefined;

  editor.state.doc.descendants((node, position) => {
    const textPosition = node.isText ? node.text?.indexOf(text) : -1;

    if (range || textPosition === undefined || textPosition < 0) {
      return;
    }

    range = {
      from: position + textPosition,
      to: position + textPosition + text.length,
    };
  });

  if (!range) {
    throw new Error(`Expected to find text: ${text}`);
  }

  return range;
};

const findLinkRange = (editor: Editor) => {
  let range: { from: number; to: number } | undefined;

  editor.state.doc.descendants((node, position) => {
    if (range || !node.isText || !node.marks.some((mark) => mark.type.name === "link")) {
      return;
    }

    range = {
      from: position,
      to: position + node.nodeSize,
    };
  });

  if (!range) {
    throw new Error("Expected linked text");
  }

  return range;
};

const getRenderedLink = (editor: Editor) => {
  const link = editor.view.dom.querySelector<HTMLAnchorElement>("a");

  if (!link) {
    throw new Error("Expected a rendered link");
  }

  return link;
};

const clickLink = (editor: Editor, link: HTMLAnchorElement, position: number) => {
  vi.spyOn(editor.view, "posAtCoords").mockReturnValue({
    pos: position,
    inside: -1,
  });

  act(() => {
    editor.commands.setTextSelection(position);
    editor.view.focus();
  });

  fireEvent.mouseDown(link, {
    button: 0,
    clientX: 8,
    clientY: 8,
  });

  return fireEvent.mouseUp(link, {
    button: 0,
    clientX: 8,
    clientY: 8,
  });
};

describe("link editing", () => {
  it("registers one non-opening, click-selectable Link extension", () => {
    const { editor } = renderScribe();
    const linkExtensions = editor.extensionManager.extensions.filter(
      (extension) => extension.name === "link",
    );

    expect(linkExtensions).toHaveLength(1);
    expect(linkExtensions[0]?.options).toMatchObject({
      enableClickSelection: true,
      openOnClick: false,
    });
  });

  it("opens the editor instead of navigating and saves a normalized URL", async () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const { editor } = renderScribe();
    const range = findLinkRange(editor);
    const link = getRenderedLink(editor);

    const mouseUpWasNotCancelled = clickLink(editor, link, range.from + 1);

    expect(mouseUpWasNotCancelled).toBe(false);
    expect(openSpy).not.toHaveBeenCalled();
    expect(editor.state.selection.from).toBe(range.from);
    expect(editor.state.selection.to).toBe(range.to);

    const urlInput = await screen.findByRole("textbox", { name: "URL" });
    expect(urlInput).toHaveValue("https://old.example/docs");
    expect(urlInput.closest("[data-scribe-popup-root]")).not.toBeNull();

    const openAction = screen.getByRole("link", { name: "Open link" });
    expect(openAction).toHaveAttribute("href", "https://old.example/docs");
    expect(openAction).toHaveAttribute("target", "_blank");
    expect(openAction).toHaveAttribute("rel", "noopener noreferrer");

    fireEvent.change(urlInput, { target: { value: "updated.example/docs" } });
    expect(openAction).toHaveAttribute("href", "https://updated.example/docs");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Edit link" })).not.toBeInTheDocument();
    });

    expect(getRenderedLink(editor)).toHaveAttribute("href", "https://updated.example/docs");
    expect(editor.view.dom).toHaveTextContent("Example link");
  });

  it("removes the mark without removing its text", async () => {
    const { editor } = renderScribe();
    const range = findLinkRange(editor);

    clickLink(editor, getRenderedLink(editor), range.from + 1);
    await screen.findByRole("textbox", { name: "URL" });
    fireEvent.click(screen.getByRole("button", { name: "Remove link" }));

    await waitFor(() => {
      expect(editor.view.dom.querySelector("a")).toBeNull();
    });
    expect(editor.view.dom).toHaveTextContent("Example link");
  });

  it("rejects unsafe URLs and closes without changes on Escape", async () => {
    const { editor } = renderScribe();
    const range = findLinkRange(editor);

    clickLink(editor, getRenderedLink(editor), range.from + 1);
    const urlInput = await screen.findByRole("textbox", { name: "URL" });

    fireEvent.change(urlInput, { target: { value: "javascript:alert(1)" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    const errorMessage = await screen.findByRole("alert");

    expect(errorMessage).toHaveTextContent("valid web address or root-relative path");
    expect(urlInput).toHaveAttribute("aria-invalid", "true");
    expect(urlInput).toHaveAccessibleDescription(
      "Enter a valid web address or root-relative path.",
    );
    expect(getRenderedLink(editor)).toHaveAttribute("href", "https://old.example/docs");

    fireEvent.keyDown(urlInput, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Edit link" })).not.toBeInTheDocument();
    });
    expect(getRenderedLink(editor)).toHaveAttribute("href", "https://old.example/docs");
  });

  it("does not show the editor for a read-only link", () => {
    const { editor } = renderScribe({ editable: false });
    const range = findLinkRange(editor);
    const link = getRenderedLink(editor);

    const mouseUpWasNotCancelled = clickLink(editor, link, range.from + 1);

    expect(mouseUpWasNotCancelled).toBe(true);
    expect(screen.queryByRole("dialog", { name: "Edit link" })).not.toBeInTheDocument();
    expect(link).toHaveAttribute("href", "https://old.example/docs");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("keeps the toolbar flow and preserves a root-relative link", async () => {
    const { editor } = renderScribe({ content: "<p>Plain text</p>", showBarMenu: true });
    const range = findTextRange(editor, "Plain");

    act(() => {
      editor.commands.setTextSelection(range);
      editor.view.focus();
    });

    fireEvent.click(screen.getByRole("button", { name: "Link" }));
    const urlInput = await screen.findByRole("textbox", { name: "URL" });
    fireEvent.change(urlInput, { target: { value: "/docs?view=compact#today" } });
    expect(screen.getByRole("link", { name: "Open link" })).toHaveAttribute(
      "href",
      "/docs?view=compact#today",
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(editor.view.dom.querySelector("a")).not.toBeNull();
    });
    expect(getRenderedLink(editor)).toHaveAttribute("href", "/docs?view=compact#today");
    expect(getRenderedLink(editor)).toHaveTextContent("Plain");
  });
});
