import { getSelectionLinkContext } from "../lib/components/Menu/linkBubbleMenuPlugin";
import { Node } from "@tiptap/core";
import { Theme } from "@radix-ui/themes";
import type { Editor } from "@tiptap/react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  Scribe,
  type ExternalLinkPreviewOptions,
  type ScribeRef,
  type ScribeProps,
} from "../lib/main";

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
  extensions?: ScribeProps["extensions"];
}

const renderScribe = ({
  content = LINK_CONTENT,
  editable = true,
  externalLinkPreview,
  showBarMenu = false,
  showOutsideFocusTarget = false,
  extensions,
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
          extensions={extensions}
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

  it("opens an existing link for inspection without focusing an input or navigating", async () => {
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
    const dialog = screen.getByRole("dialog", { name: "Edit link" });
    await waitFor(() => expect(dialog).toHaveFocus());
    expect(urlInput).not.toHaveFocus();
    expect(urlInput).toHaveValue("https://old.example/docs");
    expect(urlInput.closest("[data-scribe-popup-root]")).not.toBeNull();

    expect(screen.getByRole("textbox", { name: "Text to display" })).toHaveValue("Example link");
    expect(screen.queryByRole("link", { name: "Open link" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Display as" })).not.toBeInTheDocument();

    fireEvent.change(urlInput, { target: { value: "updated.example/docs" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Edit link" })).not.toBeInTheDocument();
    });

    expect(getRenderedLink(editor)).toHaveAttribute("href", "https://updated.example/docs");
    expect(editor.view.dom).toHaveTextContent("Example link");
  });

  it("focuses and selects the URL through the explicit Edit URL action", async () => {
    const { editor } = renderScribe();
    const range = findLinkRange(editor);
    clickLink(editor, getRenderedLink(editor), range.from + 1);
    const dialog = await screen.findByRole("dialog", { name: "Edit link" });
    await waitFor(() => expect(dialog).toHaveFocus());
    const urlInput = screen.getByRole<HTMLInputElement>("textbox", { name: "URL" });

    fireEvent.click(screen.getByRole("button", { name: "Edit URL", exact: true }));

    expect(urlInput).toHaveFocus();
    expect(urlInput.selectionStart).toBe(0);
    expect(urlInput.selectionEnd).toBe(urlInput.value.length);
    fireEvent.keyDown(urlInput, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Edit link" })).not.toBeInTheDocument();
      expect(editor.view.dom).toHaveFocus();
    });
    expect(getRenderedLink(editor)).toHaveAttribute("href", "https://old.example/docs");
  });

  it.each(["URL", "Text to display"])(
    "keeps deliberate %s focus and caret when the opening animation frame runs late",
    async (fieldName) => {
      const { editor } = renderScribe();
      const range = findLinkRange(editor);
      const frames = new Map<number, FrameRequestCallback>();
      let frameId = 0;
      vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
        frames.set(++frameId, callback);
        return frameId;
      });
      vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
        frames.delete(id);
      });
      clickLink(editor, getRenderedLink(editor), range.from + 1);
      const input = await screen.findByRole<HTMLInputElement>("textbox", { name: fieldName });
      expect(screen.getByRole("dialog", { name: "Edit link" })).toHaveFocus();

      fireEvent.pointerDown(input);
      act(() => {
        input.focus();
        input.setSelectionRange(4, 4);
      });
      const pendingFrames = [...frames.values()];
      frames.clear();
      act(() => pendingFrames.forEach((callback) => callback(performance.now())));

      expect(input).toHaveFocus();
      expect(input.selectionStart).toBe(4);
      expect(input.selectionEnd).toBe(4);
    },
  );

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
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

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
    await waitFor(() => expect(urlInput).toHaveFocus());
    fireEvent.change(urlInput, { target: { value: "/docs?view=compact#today" } });
    expect(screen.getByRole("textbox", { name: "Text to display" })).toHaveValue("Plain");
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => {
      expect(editor.view.dom.querySelector("a")).not.toBeNull();
    });
    expect(getRenderedLink(editor)).toHaveAttribute("href", "/docs?view=compact#today");
    expect(getRenderedLink(editor)).toHaveTextContent("Plain");
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
    await waitFor(() => expect(screen.getByRole("dialog", { name: "Edit link" })).toHaveFocus());
    expect(urlInput).not.toHaveFocus();
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

  it("targets the whole link from a cursor and preserves mixed formatting for a URL-only edit", async () => {
    const { editor } = renderScribe({
      content:
        '<p>Before <a href="https://old.example/docs"><strong>Bold</strong> and <em>italic</em></a> after.</p>',
      showBarMenu: true,
    });
    const original = editor.getJSON();
    const range = findTextRange(editor, "Bold");
    act(() => {
      editor.commands.setTextSelection(range.from + 1);
      editor.view.focus();
    });
    fireEvent.click(screen.getByRole("button", { name: "Link" }));
    const url = await screen.findByRole("textbox", { name: "URL" });
    expect(screen.getByRole("textbox", { name: "Text to display" })).toHaveValue("Bold and italic");
    fireEvent.change(url, { target: { value: "https://updated.example/formatting" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(editor.getText()).toBe("Before Bold and italic after.");
    expect(editor.view.dom.querySelector("strong")).toHaveTextContent("Bold");
    expect(editor.view.dom.querySelector("em")).toHaveTextContent("italic");
    expect(editor.getHTML()).not.toContain('href="https://old.example/docs"');
    act(() => {
      editor.commands.undo();
    });
    expect(editor.getJSON()).toEqual(original);
    act(() => {
      editor.commands.redo();
    });
    expect(editor.getHTML()).toContain('href="https://updated.example/formatting"');
  });

  it("changes only the target label and destination in one undo step", async () => {
    const { editor } = renderScribe({
      content:
        '<p>Before <a href="https://old.example/docs" target="_self" rel="nofollow">First link</a> between <a href="https://old.example/docs">Second link</a> after.</p>',
    });
    const original = editor.getJSON();
    const range = findTextRange(editor, "First link");
    clickLink(editor, getRenderedLink(editor), range.from + 1);
    const url = await screen.findByRole("textbox", { name: "URL" });
    fireEvent.change(screen.getByRole("textbox", { name: "Text to display" }), {
      target: { value: "Renamed" },
    });
    fireEvent.change(url, { target: { value: "https://updated.example/target" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(editor.getText()).toBe("Before Renamed between Second link after.");
    const links = editor.view.dom.querySelectorAll("a");
    expect(links[0]).toHaveAttribute("href", "https://updated.example/target");
    expect(links[0]).toHaveAttribute("target", "_self");
    expect(links[0]).toHaveAttribute("rel", "nofollow");
    expect(links[1]).toHaveAttribute("href", "https://old.example/docs");
    act(() => {
      editor.commands.undo();
    });
    expect(editor.getJSON()).toEqual(original);
    act(() => {
      editor.commands.redo();
    });
    expect(editor.getText()).toBe("Before Renamed between Second link after.");
  });

  it.each([
    ["New label", "New label"],
    ["", "https://new.example/path"],
  ])("inserts a link at an empty cursor with display text %s", async (label, expected) => {
    const { editor } = renderScribe({ content: "<p></p>", showBarMenu: true });
    const original = editor.getJSON();
    act(() => {
      editor.commands.setTextSelection(1);
      editor.view.focus();
    });
    fireEvent.click(screen.getByRole("button", { name: "Link" }));
    const url = await screen.findByRole("textbox", { name: "URL" });
    expect(screen.getByRole("textbox", { name: "Text to display" })).toHaveValue("");
    fireEvent.change(screen.getByRole("textbox", { name: "Text to display" }), {
      target: { value: label },
    });
    fireEvent.change(url, { target: { value: "new.example/path" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(getRenderedLink(editor)).toHaveTextContent(expected);
    expect(getRenderedLink(editor)).toHaveAttribute("href", "https://new.example/path");
    act(() => {
      editor.commands.undo();
    });
    expect(editor.getJSON()).toEqual(original);
  });

  it("preserves internal inline atoms and disables label replacement across them", async () => {
    const Reference = Node.create({
      name: "testResourceReference",
      group: "inline",
      inline: true,
      atom: true,
      parseHTML: () => [{ tag: "span[data-test-reference]" }],
      renderHTML: () => ["span", { "data-test-reference": "" }, "Task reference"],
    });
    const { editor } = renderScribe({
      content: "<p>Before <span data-test-reference></span> after</p>",
      showBarMenu: true,
      extensions: [Reference],
    });
    act(() => {
      editor.commands.setTextSelection({ from: 1, to: editor.state.doc.content.size - 1 });
      editor.view.focus();
    });
    fireEvent.click(screen.getByRole("button", { name: "Link" }));
    const url = await screen.findByRole("textbox", { name: "URL" });
    expect(screen.getByRole("textbox", { name: "Text to display" })).toBeDisabled();
    fireEvent.change(url, { target: { value: "https://updated.example/text" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(editor.getJSON().content?.[0].content?.[1]).toEqual({ type: "testResourceReference" });
    expect(editor.view.dom.querySelector("[data-test-reference]")).toHaveTextContent(
      "Task reference",
    );
    expect(editor.getText()).toBe("Before  after");
  });

  it("edits a legacy link without fetching metadata and removes it in one undo step", async () => {
    const resolve = vi.fn(async () => null);
    const { editor } = renderScribe({ content: PREVIEW_CONTENT, externalLinkPreview: { resolve } });
    const original = editor.getJSON();
    fireEvent.click(await findRenderedPreviewTarget(editor));
    const url = await screen.findByRole("textbox", { name: "URL" });
    expect(screen.getByRole("textbox", { name: "Text to display" })).toHaveValue("Jacket");
    expect(screen.queryByRole("group", { name: "Display as" })).not.toBeInTheDocument();
    fireEvent.change(url, { target: { value: "https://updated.example/jacket" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Text to display" }), {
      target: { value: "Updated label" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    const updated = editor.getJSON();
    expect(updated.content?.[0].content?.[0]?.attrs).toMatchObject({
      href: "https://updated.example/jacket",
      linkText: "Updated label",
      pageTitle: "Edward Jacket",
    });
    expect(resolve).not.toHaveBeenCalled();
    act(() => {
      editor.commands.undo();
    });
    expect(editor.getJSON()).toEqual(original);
    act(() => {
      editor.commands.redo();
    });
    fireEvent.click(await findRenderedPreviewTarget(editor));
    await screen.findByRole("textbox", { name: "URL" });
    fireEvent.click(screen.getByRole("button", { name: "Remove link" }));
    expect(editor.getText()).toBe("Updated label");
    expect(editor.view.dom.querySelector("a")).toBeNull();
    act(() => {
      editor.commands.undo();
    });
    expect(editor.getJSON()).toEqual(updated);
  });

  it("converts a legacy link to an ordinary root-relative link only on Apply", async () => {
    const { editor } = renderScribe({ content: PREVIEW_CONTENT });
    const original = editor.getJSON();
    fireEvent.click(await findRenderedPreviewTarget(editor));
    fireEvent.change(await screen.findByRole("textbox", { name: "URL" }), {
      target: { value: "/documents/guide" },
    });
    expect(editor.getJSON()).toEqual(original);
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(editor.getText()).toBe("Jacket");
    expect(getRenderedLink(editor)).toHaveAttribute("href", "/documents/guide");
    expect(editor.view.dom.querySelector('[data-type="external-link-preview"]')).toBeNull();
    act(() => {
      editor.commands.undo();
    });
    expect(editor.getJSON()).toEqual(original);
  });

  it("does not treat a marked reference atom as an ordinary editable link", () => {
    const Reference = Node.create({
      name: "testResourceReference",
      group: "inline",
      inline: true,
      atom: true,
      parseHTML: () => [{ tag: "span[data-test-reference]" }],
      renderHTML: () => ["span", { "data-test-reference": "" }, "Task reference"],
    });
    const { editor } = renderScribe({
      content:
        '<p><a href="https://old.example/docs">Before <span data-test-reference></span> after</a></p>',
      extensions: [Reference],
    });
    act(() => {
      editor.commands.setNodeSelection(8);
    });
    expect(editor.state.selection.to - editor.state.selection.from).toBe(1);
    expect(getSelectionLinkContext(editor.state)).toBeNull();
    act(() => {
      editor.commands.setTextSelection(2);
    });
    expect(getSelectionLinkContext(editor.state)).toBeNull();
  });

  it("refuses label replacement when an inline reference enters the open target", async () => {
    const Reference = Node.create({
      name: "testResourceReference",
      group: "inline",
      inline: true,
      atom: true,
      parseHTML: () => [{ tag: "span[data-test-reference]" }],
      renderHTML: () => ["span", { "data-test-reference": "" }, "Task reference"],
    });
    const { editor } = renderScribe({
      content: "<p>Before Example link after.</p>",
      extensions: [Reference],
      showBarMenu: true,
    });
    const range = findTextRange(editor, "Example link");
    act(() => {
      editor.commands.setTextSelection(range);
      editor.view.focus();
    });
    fireEvent.click(screen.getByRole("button", { name: "Link" }));
    const label = await screen.findByRole("textbox", { name: "Text to display" });
    fireEvent.change(label, { target: { value: "Changed label" } });
    fireEvent.change(screen.getByRole("textbox", { name: "URL" }), {
      target: { value: "https://updated.example/text" },
    });
    act(() => {
      editor.commands.insertContentAt(
        range.from + 3,
        { type: "testResourceReference" },
        { updateSelection: false },
      );
    });
    const withReference = editor.getJSON();
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(editor.getJSON()).toEqual(withReference);
    expect(screen.getByRole("alert")).toHaveTextContent("Scribe could not save this link.");
  });
});
