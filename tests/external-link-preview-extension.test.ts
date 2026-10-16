import { Editor, type Content, generateHTML, generateJSON } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it, vi } from "vitest";
import Link from "../lib/components/Scribe/extension/extension-link";
import {
  ExternalLinkPreview,
  type ExternalLinkPreviewOptions,
} from "../lib/components/Scribe/extension/external-link-preview";
import { createScribeSchemaExtensions } from "../lib/schema";

const editors = new Set<Editor>();
const attrs = {
  href: "https://example.com/product?color=navy#details",
  linkText: "Authored product label",
  display: "card" as const,
  pageTitle: "Provider title",
  description: "Stored description",
  siteName: "Example",
  faviconUrl: "https://example.com/favicon.png",
  imageUrl: "/api/media/product.png",
  fetchedAt: "2026-08-19T06:00:00.000Z",
};
const saved = (display: "compact" | "card" = "card"): Content => ({
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Before " },
        { type: "externalLinkPreview", attrs: { ...attrs, display } },
        { type: "text", text: " after" },
      ],
    },
  ],
});
const createEditor = (content: Content = "<p></p>", options: ExternalLinkPreviewOptions = {}) => {
  const editor = new Editor({
    content,
    extensions: [
      StarterKit.configure({ link: false }),
      Link,
      ExternalLinkPreview.configure(options),
    ],
  });
  editors.add(editor);
  return editor;
};
afterEach(() => {
  editors.forEach((editor) => editor.destroy());
  editors.clear();
});

describe("legacy external links", () => {
  it.each(["compact", "card"] as const)(
    "reads %s as plain authored text without changing saved data",
    async (display) => {
      const resolve = vi.fn();
      const shouldPreview = vi.fn(() => false);
      const content = saved(display);
      const editor = createEditor(content, { resolve, shouldPreview, autoPreviewOnPaste: true });
      const before = editor.getJSON();
      await new Promise((resolve) => setTimeout(resolve, 0));
      editor.view.dispatch(editor.state.tr);
      expect(editor.getJSON()).toEqual(before);
      expect(editor.getJSON().content?.[0].content?.[1].attrs).toEqual({ ...attrs, display });
      const link = editor.view.dom.querySelector("a");
      expect(link).toHaveTextContent(attrs.linkText);
      expect(link).toHaveAttribute("href", attrs.href);
      expect(editor.view.dom.querySelector("img, button, [data-link-preview-title]")).toBeNull();
      expect(resolve).not.toHaveBeenCalled();
      expect(shouldPreview).not.toHaveBeenCalled();
    },
  );

  it.each(["compact", "card"] as const)(
    "round-trips all %s attributes through HTML in both schemas",
    (display) => {
      const editor = createEditor(saved(display));
      const before = editor.getJSON();
      const html = editor.getHTML();
      expect(html).not.toContain("<img");
      expect(html).toContain(`>${attrs.linkText}</a>`);
      const reloaded = createEditor(html);
      expect(reloaded.getJSON()).toEqual(before);
      const extensions = createScribeSchemaExtensions({ enableUndoRedo: false });
      expect(generateJSON(html, extensions)).toEqual(before);
      expect(generateJSON(generateHTML(before, extensions), extensions)).toEqual(before);
    },
  );

  it("reads attribute-only HTML without dropping its authored link or metadata", () => {
    const editor = createEditor(
      '<p><span data-type="external-link-preview" data-href="https://example.com/old" data-link-text="Saved label" data-display="card" data-page-title="Saved metadata"></span></p>',
    );
    expect(editor.view.dom.querySelector("a")).toHaveTextContent("Saved label");
    expect(editor.getJSON().content?.[0].content?.[0].attrs).toMatchObject({
      href: "https://example.com/old",
      linkText: "Saved label",
      display: "card",
      pageTitle: "Saved metadata",
    });
  });

  it("retains legacy insert/update signatures and node shape without fetching", () => {
    const resolve = vi.fn();
    const editor = createEditor("<p></p>", { resolve });
    expect(editor.commands.insertExternalLinkPreview(attrs)).toBe(true);
    expect(editor.getJSON().content?.[0].content?.[0]).toMatchObject({
      type: "externalLinkPreview",
      attrs,
    });
    expect(
      editor.commands.updateExternalLinkPreview({
        href: "https://example.com/new",
        linkText: "New label",
      }),
    ).toBe(true);
    expect(editor.getJSON().content?.[0].content?.[0].attrs).toEqual({
      ...attrs,
      href: "https://example.com/new",
      linkText: "New label",
    });
    expect(editor.commands.updateExternalLinkPreview({ description: null })).toBe(true);
    expect(editor.getJSON().content?.[0].content?.[0].attrs?.description).toBeNull();
    expect(resolve).not.toHaveBeenCalled();
  });

  it.each(["compact", "card"] as const)(
    "retires %s creation and refresh without partial chain changes",
    (display) => {
      const editor = createEditor('<p><a href="https://example.com">Original</a></p>');
      editor.commands.setTextSelection(1);
      const before = editor.getJSON();
      expect(editor.can().setExternalLinkDisplay(display)).toBe(false);
      expect(editor.chain().insertContent("Unexpected").setExternalLinkDisplay(display).run()).toBe(
        false,
      );
      expect(editor.getJSON()).toEqual(before);
      expect(editor.commands.refreshExternalLinkPreview()).toBe(false);
    },
  );

  it("converts a legacy node only on explicit request and undo restores every attribute", () => {
    const editor = createEditor(saved());
    const before = editor.getJSON();
    editor.commands.setNodeSelection(8);
    expect(editor.commands.convertExternalLinkPreviewToPlain("/documents/saved", 8)).toBe(true);
    expect(editor.getText()).toBe("Before Authored product label after");
    expect(editor.getHTML()).toContain('href="/documents/saved"');
    expect(editor.getHTML()).not.toContain('data-type="external-link-preview"');
    expect(editor.commands.undo()).toBe(true);
    expect(editor.getJSON()).toEqual(before);
  });

  it.each(["javascript:alert(1)", "data:text/html,unsafe", "file:///tmp/test"])(
    "rejects unsafe legacy update/conversion: %s",
    (href) => {
      const editor = createEditor(saved());
      const before = editor.getJSON();
      expect(editor.commands.updateExternalLinkPreview({ href }, 8)).toBe(false);
      expect(editor.commands.convertExternalLinkPreviewToPlain(href, 8)).toBe(false);
      expect(editor.getJSON()).toEqual(before);
    },
  );
});
