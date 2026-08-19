import { Theme } from "@radix-ui/themes";
import type { Editor } from "@tiptap/react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  hideLinkBubbleMenu,
  showLinkBubbleMenu,
} from "../lib/components/Menu/linkBubbleMenuPlugin";
import { Scribe, type ExternalLinkPreviewOptions, type ScribeRef } from "../lib/main";

const LINK_CONTENT =
  '<p>Visit <a href="https://old.example/docs">Example link</a> for details.</p>';
const PREVIEW_HREF = "https://store.example/products/jacket";
const PREVIEW_CONTENT = `<p><span data-type="external-link-preview" data-href="${PREVIEW_HREF}" data-link-text="Jacket" data-display="compact" data-page-title="Edward Jacket" data-site-name="Example Store" data-fetched-at="2026-08-19T12:00:00.000Z"><a data-link-preview-target href="${PREVIEW_HREF}">Edward Jacket</a></span></p>`;
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
  externalLinkPreview?: Partial<ExternalLinkPreviewOptions>;
  showBarMenu?: boolean;
  showOutsideFocusTarget?: boolean;
}

const renderScribe = ({
  content = LINK_CONTENT,
  editable = true,
  externalLinkPreview,
  showBarMenu = false,
  showOutsideFocusTarget = false,
}: RenderScribeOptions = {}) => {
  const scribeRef = createRef<ScribeRef>();

  const result = render(
    <Theme>
      <>
        <Scribe
          ref={scribeRef}
          content={content}
          editable={editable}
          externalLinkPreview={externalLinkPreview}
          showBarMenu={showBarMenu}
        />
        {showOutsideFocusTarget ? <button type="button">Outside focus target</button> : null}
      </>
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

const findPreviewPosition = (editor: Editor) => {
  let previewPosition: number | undefined;

  editor.state.doc.descendants((node, position) => {
    if (previewPosition === undefined && node.type.name === "externalLinkPreview") {
      previewPosition = position;
    }
  });

  if (previewPosition === undefined) {
    throw new Error("Expected an external link preview");
  }

  return previewPosition;
};

const findRenderedPreviewTarget = (editor: Editor) =>
  waitFor(() => {
    const target = editor.view.dom.querySelector<HTMLAnchorElement>("a[data-link-preview-target]");

    if (!target) {
      throw new Error("Expected a rendered external link preview target");
    }

    return target;
  });

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

  const mouseUpWasNotCancelled = fireEvent.mouseUp(link, {
    button: 0,
    clientX: 8,
    clientY: 8,
  });

  fireEvent.click(link, {
    button: 0,
    clientX: 8,
    clientY: 8,
  });

  return mouseUpWasNotCancelled;
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

  it("opens the clicked link when the previous selection spans the document", async () => {
    const { editor } = renderScribe();
    const range = findLinkRange(editor);
    const link = getRenderedLink(editor);

    act(() => {
      editor.commands.selectAll();
      editor.view.focus();
    });
    vi.spyOn(editor.view, "posAtCoords").mockReturnValue({
      pos: range.from + 1,
      inside: -1,
    });
    fireEvent.mouseDown(link, { button: 0, clientX: 8, clientY: 8 });
    fireEvent.click(link, { button: 0, clientX: 8, clientY: 8 });

    expect(await screen.findByRole("textbox", { name: "URL" })).toHaveValue(
      "https://old.example/docs",
    );
    expect(editor.state.selection.from).toBe(range.from);
    expect(editor.state.selection.to).toBe(range.to);
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

  it("does not intercept an anchor that is not backed by a Link mark", () => {
    const { editor } = renderScribe({
      content: '<p><a href="https://old.example/docs">Example link</a></p>',
    });
    const customAnchor = document.createElement("a");
    const paragraph = editor.view.dom.querySelector("p");

    customAnchor.href = "https://custom-node-view.example";
    customAnchor.textContent = "Custom node view link";

    if (!paragraph) {
      throw new Error("Expected a rendered paragraph");
    }

    paragraph.append(customAnchor);

    expect(fireEvent.click(customAnchor)).toBe(true);
    expect(screen.queryByRole("dialog", { name: "Edit link" })).not.toBeInTheDocument();
  });

  it("does not open the editor after dragging across linked text", () => {
    const { editor } = renderScribe();
    const range = findLinkRange(editor);
    const link = getRenderedLink(editor);

    act(() => {
      editor.commands.setTextSelection({ from: range.from + 1, to: range.to - 1 });
      editor.view.focus();
    });
    vi.spyOn(editor.view, "posAtCoords").mockReturnValue({
      pos: range.to - 1,
      inside: -1,
    });
    fireEvent.mouseDown(link, { button: 0, clientX: 8, clientY: 8 });
    fireEvent.mouseUp(link, { button: 0, clientX: 24, clientY: 8 });
    fireEvent.click(link, { button: 0, clientX: 24, clientY: 8, detail: 1 });

    expect(screen.queryByRole("dialog", { name: "Edit link" })).not.toBeInTheDocument();
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

  it("opens one shared dialog from a preview without navigating or showing inline options", async () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const { editor } = renderScribe({
      content: PREVIEW_CONTENT,
      externalLinkPreview: { resolve: vi.fn(async () => null) },
    });
    const previewTarget = await findRenderedPreviewTarget(editor);

    expect(fireEvent.click(previewTarget)).toBe(false);
    expect(openSpy).not.toHaveBeenCalled();

    const dialog = await screen.findByRole("dialog", { name: "Edit link" });
    const urlInput = screen.getByRole("textbox", { name: "URL" });

    await waitFor(() => expect(dialog).toHaveFocus());
    expect(urlInput).not.toHaveFocus();
    expect(urlInput).toHaveValue(PREVIEW_HREF);
    expect(screen.queryByRole("button", { name: "Link options" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove link" })).not.toBeInTheDocument();
    expect(editor.state.selection.from).toBe(findPreviewPosition(editor));
  });

  it("saves an allowed preview URL and keeps a rejected update in the dialog", async () => {
    const resolve = vi.fn(async (href: string) => ({
      pageTitle: href.includes("updated") ? "Updated Jacket" : "Edward Jacket",
      siteName: "Example Store",
    }));
    const { editor } = renderScribe({
      content: PREVIEW_CONTENT,
      externalLinkPreview: {
        resolve,
        shouldPreview: (href) => !href.includes("blocked.example"),
      },
    });

    fireEvent.click(await findRenderedPreviewTarget(editor));
    let urlInput = await screen.findByRole("textbox", { name: "URL" });

    fireEvent.change(urlInput, { target: { value: "updated.example/products/jacket" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(editor.state.doc.nodeAt(findPreviewPosition(editor))?.attrs.href).toBe(
        "https://updated.example/products/jacket",
      );
    });
    await waitFor(() => {
      expect(resolve).toHaveBeenCalledWith(
        "https://updated.example/products/jacket",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    fireEvent.click(await findRenderedPreviewTarget(editor));
    urlInput = await screen.findByRole("textbox", { name: "URL" });
    fireEvent.change(urlInput, { target: { value: "https://blocked.example/products/jacket" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("can't be used as a preview");
    expect(editor.state.doc.nodeAt(findPreviewPosition(editor))?.attrs.href).toBe(
      "https://updated.example/products/jacket",
    );
    expect(screen.getByRole("dialog", { name: "Edit link" })).toBeInTheDocument();

    act(() => hideLinkBubbleMenu(editor));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Edit link" })).not.toBeInTheDocument();
    });
    act(() => showLinkBubbleMenu(editor, "dialog"));

    expect(await screen.findByRole("textbox", { name: "URL" })).toHaveValue(
      "https://updated.example/products/jacket",
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("converts a preview to Plain and reopens the ordinary link for Compact", async () => {
    const resolve = vi.fn(async () => ({ pageTitle: "Edward Jacket" }));
    const { editor } = renderScribe({
      content: PREVIEW_CONTENT,
      externalLinkPreview: { resolve },
    });

    fireEvent.click(await findRenderedPreviewTarget(editor));
    await screen.findByRole("dialog", { name: "Edit link" });
    fireEvent.click(screen.getByRole("button", { name: "Plain link", exact: true }));

    await waitFor(() => {
      expect(editor.view.dom.querySelector('[data-type="external-link-preview"]')).toBeNull();
    });

    const range = findLinkRange(editor);
    const plainLink = getRenderedLink(editor);

    clickLink(editor, plainLink, range.from + 1);
    const urlInput = await screen.findByRole("textbox", { name: "URL" });

    await waitFor(() => expect(urlInput).toHaveFocus());
    fireEvent.click(screen.getByRole("button", { name: "Compact", exact: true }));

    await waitFor(() => {
      expect(editor.view.dom.querySelector('[data-type="external-link-preview"]')).not.toBeNull();
    });
    expect(resolve).toHaveBeenCalledWith(
      PREVIEW_HREF,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("resets an abandoned URL draft whenever the same link menu reopens", async () => {
    const { editor } = renderScribe({ showOutsideFocusTarget: true });
    const range = findLinkRange(editor);

    clickLink(editor, getRenderedLink(editor), range.from + 1);
    let urlInput = await screen.findByRole("textbox", { name: "URL" });

    fireEvent.change(urlInput, { target: { value: "abandoned.example/draft" } });
    expect(urlInput).toHaveValue("abandoned.example/draft");

    const outsideFocusTarget = screen.getByRole("button", { name: "Outside focus target" });

    fireEvent.pointerDown(outsideFocusTarget);
    outsideFocusTarget.focus();
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Edit link" })).not.toBeInTheDocument();
    });
    clickLink(editor, getRenderedLink(editor), range.from + 1);

    urlInput = await screen.findByRole("textbox", { name: "URL" });
    await waitFor(() => expect(urlInput).toHaveValue("https://old.example/docs"));
  });

  it("opens a selected preview with Alt+F10 and returns focus on Escape", async () => {
    const { editor } = renderScribe({
      content: PREVIEW_CONTENT,
      externalLinkPreview: { resolve: vi.fn(async () => null) },
    });
    const previewPosition = findPreviewPosition(editor);

    act(() => {
      editor.commands.setNodeSelection(previewPosition);
      editor.view.focus();
    });
    fireEvent.keyDown(editor.view.dom, { altKey: true, key: "F10" });

    const dialog = await screen.findByRole("dialog", { name: "Edit link" });

    await waitFor(() => expect(dialog).toHaveFocus());
    expect(screen.getByRole("textbox", { name: "URL" })).not.toHaveFocus();
    fireEvent.keyDown(dialog, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Edit link" })).not.toBeInTheDocument();
    });
    await waitFor(() => expect(editor.view.dom).toHaveFocus());
  });

  it("expands a partial Plain-link selection when Alt+F10 requests its menu", async () => {
    const { editor } = renderScribe();
    const range = findLinkRange(editor);

    act(() => {
      editor.commands.setTextSelection({ from: range.from + 1, to: range.to - 1 });
      editor.view.focus();
    });
    fireEvent.keyDown(editor.view.dom, { altKey: true, key: "F10" });

    const urlInput = await screen.findByRole("textbox", { name: "URL" });

    await waitFor(() => expect(urlInput).toHaveFocus());
    expect(editor.state.selection.from).toBe(range.from);
    expect(editor.state.selection.to).toBe(range.to);
  });

  it("refreshes preview metadata and announces its loading status", async () => {
    let finishResolution: ((metadata: { pageTitle: string; siteName: string }) => void) | undefined;
    const resolve = vi.fn(
      () =>
        new Promise<{ pageTitle: string; siteName: string }>((resolveMetadata) => {
          finishResolution = resolveMetadata;
        }),
    );
    const { editor } = renderScribe({
      content: PREVIEW_CONTENT,
      externalLinkPreview: { resolve },
    });

    fireEvent.click(await findRenderedPreviewTarget(editor));
    await screen.findByRole("dialog", { name: "Edit link" });
    expect(screen.getByRole("status")).toHaveTextContent("Example Store");

    const refreshButton = screen.getByRole("button", { name: "Refresh preview" });

    refreshButton.focus();
    fireEvent.click(refreshButton);

    await waitFor(() => expect(resolve).toHaveBeenCalledOnce());
    expect(screen.getByRole("status")).toHaveTextContent("Loading preview");
    expect(refreshButton).toHaveAttribute("aria-disabled", "true");
    expect(refreshButton).toHaveFocus();

    await act(async () => {
      finishResolution?.({ pageTitle: "Updated Jacket", siteName: "Updated Store" });
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Updated Store"));
    expect(refreshButton).toHaveAttribute("aria-disabled", "false");
    expect(refreshButton).toHaveFocus();
  });
});
