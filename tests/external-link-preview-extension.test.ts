import { Editor, Node, type Content, type NodeViewRenderer } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import { closeHistory } from "@tiptap/pm/history";
import { AllSelection, NodeSelection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import { fireEvent, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Link from "../lib/components/Scribe/extension/extension-link";
import {
  ExternalLinkPreview,
  type ExternalLinkPreviewMetadata,
  type ExternalLinkPreviewResolver,
} from "../lib/components/Scribe/extension/external-link-preview";
import {
  normalizeExternalLinkPreviewHref,
  normalizeExternalLinkPreviewMediaUrl,
} from "../lib/components/Scribe/extension/external-link-preview/attributes";
import { getExternalLinkPreviewResolutionStatus } from "../lib/components/Scribe/extension/external-link-preview/resolver";

const editors = new Set<Editor>();

const CoreExternalLinkPreview = ExternalLinkPreview.extend({
  addNodeView(): NodeViewRenderer {
    return ({ node }) => {
      const dom = document.createElement("span");

      dom.dataset.type = "external-link-preview";
      dom.textContent = String(node.attrs.pageTitle || node.attrs.href);

      return { dom };
    };
  },
});

const TestInlineAtom = Node.create({
  name: "testInlineAtom",
  group: "inline",
  inline: true,
  atom: true,
  parseHTML: () => [{ tag: "span[data-test-inline-atom]" }],
  renderHTML: () => ["span", { "data-test-inline-atom": "" }],
});

const createEditor = ({
  content = "<p></p>",
  resolve,
  shouldPreview,
}: {
  content?: Content;
  resolve?: ExternalLinkPreviewResolver;
  shouldPreview?: (href: string) => boolean;
} = {}) => {
  const editor = new Editor({
    content,
    extensions: [
      StarterKit.configure({ link: false }),
      Link,
      Image.configure({ inline: true }),
      TestInlineAtom,
      CoreExternalLinkPreview.configure({ resolve, shouldPreview }),
    ],
  });

  editors.add(editor);

  return editor;
};

const findTextPosition = (editor: Editor, text: string) => {
  let position: number | undefined;

  editor.state.doc.descendants((node, nodePosition) => {
    if (position === undefined && node.isText && node.text?.includes(text)) {
      position = nodePosition;
    }
  });

  if (position === undefined) {
    throw new Error(`Could not find text: ${text}`);
  }

  return position;
};

const findNodePosition = (editor: Editor, typeName: string) => {
  let position: number | undefined;

  editor.state.doc.descendants((node, nodePosition) => {
    if (position === undefined && node.type.name === typeName) {
      position = nodePosition;
    }
  });

  if (position === undefined) {
    throw new Error(`Could not find node: ${typeName}`);
  }

  return position;
};

const paste = (editor: Editor, text: string, html = "") => {
  fireEvent.paste(editor.view.dom, {
    clipboardData: {
      getData: (type: string) => {
        if (type === "text/plain") {
          return text;
        }

        if (type === "text/html") {
          return html;
        }

        return "";
      },
    },
  });
};

const hasNodeType = (editor: Editor, typeName: string) => {
  let found = false;

  editor.state.doc.descendants((node) => {
    if (node.type.name === typeName) {
      found = true;
    }
  });

  return found;
};

const createDeferred = <Value>() => {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((nextResolve) => {
    resolve = nextResolve;
  });

  return { promise, resolve };
};

afterEach(() => {
  editors.forEach((editor) => {
    if (!editor.isDestroyed) {
      editor.destroy();
    }
  });
  editors.clear();
});

describe("ExternalLinkPreview core", () => {
  it("changes a full-line list link between Compact, Card, and Plain without lifting it", () => {
    const href = "https://shop.example/item?campaign=wishlist&color=navy";
    const editor = createEditor({
      content: `<ul><li><p><a href="${href}">${href}</a></p></li></ul>`,
      resolve: async () => null,
    });

    editor.commands.setTextSelection(findTextPosition(editor, href));

    expect(editor.commands.setExternalLinkDisplay("compact")).toBe(true);
    expect(editor.getJSON().content?.[0]).toMatchObject({
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "externalLinkPreview",
                  attrs: { display: "compact", href, linkText: href },
                },
              ],
            },
          ],
        },
      ],
    });

    expect(editor.commands.setExternalLinkDisplay("card")).toBe(true);
    expect(editor.getHTML()).toContain('data-display="card"');
    expect(editor.getHTML()).toContain(`<li><p><span`);

    expect(editor.commands.setExternalLinkDisplay("plain")).toBe(true);
    expect(editor.getHTML()).toContain(`<li><p><a`);
    expect(editor.getHTML()).toContain(href.replaceAll("&", "&amp;"));
  });

  it("changes one lossless link inside prose to Compact while keeping Card unavailable", () => {
    const href = "https://example.com/inline?query=preserved";
    const editor = createEditor({
      content: `<p>Before <a href="${href}">inline destination</a> after.</p>`,
      resolve: async () => null,
    });

    editor.commands.setTextSelection(findTextPosition(editor, "inline destination"));

    expect(editor.commands.setExternalLinkDisplay("compact")).toBe(true);
    expect(editor.getJSON().content?.[0].content).toMatchObject([
      { type: "text", text: "Before " },
      {
        type: "externalLinkPreview",
        attrs: { display: "compact", href, linkText: "inline destination" },
      },
      { type: "text", text: " after." },
    ]);
    expect(editor.can().setExternalLinkDisplay("card")).toBe(false);
    expect(editor.commands.setExternalLinkDisplay("card")).toBe(false);

    expect(editor.commands.setExternalLinkDisplay("plain")).toBe(true);
    expect(editor.getText()).toBe("Before inline destination after.");
    expect(editor.getHTML()).toContain(`<a target="_blank"`);
  });

  it.each([
    [
      "updates a URL-derived label",
      "https://shop.example/products/original",
      "/documents:recent/product",
      "/documents:recent/product",
    ],
    [
      "preserves a custom label",
      "Saved jacket",
      "https://shop.example/products/replacement?color=navy#details",
      "Saved jacket",
    ],
  ])("atomically converts a preview to Plain and %s", (_label, linkText, href, expectedText) => {
    const oldHref = "https://shop.example/products/original";
    const editor = createEditor({
      content: `<p><span data-type="external-link-preview" data-href="${oldHref}" data-link-text="${linkText}" data-display="compact"><a data-link-preview-target href="${oldHref}">${linkText}</a></span></p>`,
    });
    const previewPosition = findNodePosition(editor, "externalLinkPreview");

    expect(editor.can().convertExternalLinkPreviewToPlain(href, previewPosition)).toBe(true);
    expect(editor.commands.convertExternalLinkPreviewToPlain(href, previewPosition)).toBe(true);
    expect(hasNodeType(editor, "externalLinkPreview")).toBe(false);
    expect(editor.getJSON().content?.[0].content?.[0]).toMatchObject({
      type: "text",
      text: expectedText,
      marks: [{ type: "link", attrs: { href } }],
    });
  });

  it("rejects an unsafe preview-to-Plain conversion without dispatching earlier changes", () => {
    const href = "https://shop.example/products/original";
    const editor = createEditor({
      content: `<p><span data-type="external-link-preview" data-href="${href}" data-link-text="${href}" data-display="compact"><a data-link-preview-target href="${href}">${href}</a></span></p><p>Elsewhere</p>`,
    });
    const previewPosition = findNodePosition(editor, "externalLinkPreview");
    const elsewherePosition = findTextPosition(editor, "Elsewhere");
    const before = editor.getJSON();

    expect(
      editor
        .chain()
        .insertContentAt(elsewherePosition, "Unexpected ")
        .convertExternalLinkPreviewToPlain("javascript:alert(1)", previewPosition)
        .run(),
    ).toBe(false);
    expect(editor.getJSON()).toEqual(before);
  });

  it("does not offer enhanced modes for an ordinary link without a configured resolver", () => {
    const editor = createEditor({
      content: '<p>Before <a href="https://example.com/opt-in">ordinary link</a> after.</p>',
    });

    editor.commands.setTextSelection(findTextPosition(editor, "ordinary link"));

    expect(editor.can().setExternalLinkDisplay("compact")).toBe(false);
    expect(editor.commands.setExternalLinkDisplay("compact")).toBe(false);
    expect(editor.can().setExternalLinkDisplay("card")).toBe(false);
    expect(editor.getHTML()).not.toContain("external-link-preview");
  });

  it("does not partially save a policy-rejected pending URL before conversion", () => {
    const oldHref = "https://store.example/products/original";
    const rejectedHref = "https://clevertask.example/documents/internal";
    const resolver = vi.fn<ExternalLinkPreviewResolver>();
    const editor = createEditor({
      content: `<p><a href="${oldHref}">Product</a></p>`,
      resolve: resolver,
      shouldPreview: (href) => !href.startsWith("https://clevertask.example/"),
    });

    editor.commands.setTextSelection(findTextPosition(editor, "Product"));

    expect(
      editor
        .chain()
        .extendMarkRange("link")
        .setLink({ href: rejectedHref })
        .setExternalLinkDisplay("compact")
        .run(),
    ).toBe(false);
    expect(editor.getAttributes("link").href).toBe(oldHref);
    expect(editor.getHTML()).not.toContain(rejectedHref);
    expect(editor.getHTML()).not.toContain("external-link-preview");
    expect(resolver).not.toHaveBeenCalled();
  });

  it("does not discard other formatting when converting an ordinary link", () => {
    const editor = createEditor({
      content: '<p><strong><a href="https://example.com/formatted">Formatted link</a></strong></p>',
      resolve: async () => null,
    });

    editor.commands.setTextSelection(findTextPosition(editor, "Formatted link"));

    expect(editor.commands.setExternalLinkDisplay("compact")).toBe(false);
    expect(editor.getHTML()).toContain("<strong>");
    expect(editor.getHTML()).not.toContain("external-link-preview");
  });

  it("uses ordinary Ctrl+V to link selected text even when the clipboard also has HTML", () => {
    const editor = createEditor({ content: "<p>Selected words stay here.</p>" });
    const from = findTextPosition(editor, "Selected words");

    editor.commands.setTextSelection({ from, to: from + "Selected words".length });
    paste(
      editor,
      "https://example.com/reference?from=clipboard",
      '<a href="https://different.example">Rich clipboard payload</a>',
    );

    expect(editor.getText()).toBe("Selected words stay here.");
    expect(editor.getHTML()).toContain(
      '<a target="_blank" rel="noopener noreferrer nofollow" href="https://example.com/reference?from=clipboard">Selected words</a>',
    );
  });

  it("links a single text block selected with Select all without replacing its label", () => {
    const editor = createEditor({ content: "<p>Selected words stay here.</p>" });

    editor.commands.selectAll();
    expect(editor.state.selection).toBeInstanceOf(AllSelection);

    paste(editor, "https://example.com/select-all");

    expect(editor.getText()).toBe("Selected words stay here.");
    expect(editor.getHTML()).toContain(
      '<a target="_blank" rel="noopener noreferrer nofollow" href="https://example.com/select-all">Selected words stay here.</a>',
    );
  });

  it("links text across a Select all range while leaving inline atoms untouched", () => {
    const editor = createEditor({
      content: "<p>First <span data-test-inline-atom></span> line.</p><p>Second line.</p>",
    });

    editor.commands.selectAll();
    paste(editor, "https://example.com/select-all-across-blocks");

    expect(editor.getText()).toBe("First  line.\n\nSecond line.");
    expect(editor.getHTML()).toContain('<span data-test-inline-atom=""></span>');
    expect(
      editor.getHTML().match(/href="https:\/\/example.com\/select-all-across-blocks"/g),
    ).toHaveLength(3);
    expect(editor.getJSON().content?.[0].content?.[1]).toMatchObject({
      type: "testInlineAtom",
    });
    expect(editor.getJSON().content?.[0].content?.[1]?.marks).toBeUndefined();
  });

  it("keeps resolver metadata out of undo history", async () => {
    const resolver = vi.fn<ExternalLinkPreviewResolver>().mockResolvedValue({
      pageTitle: "Resolved product",
      siteName: "Example shop",
      fetchedAt: "2026-08-19T06:00:00.000Z",
    });
    const editor = createEditor({ resolve: resolver });

    expect(
      editor.commands.insertExternalLinkPreview({
        href: "https://shop.example/product?tracking=preserved",
      }),
    ).toBe(true);

    await waitFor(() => {
      expect(editor.getJSON().content?.[0].content?.[0].attrs).toMatchObject({
        href: "https://shop.example/product?tracking=preserved",
        pageTitle: "Resolved product",
        siteName: "Example shop",
      });
    });

    expect(editor.commands.undo()).toBe(true);
    expect(editor.getJSON().content).toEqual([{ type: "paragraph" }]);
  });

  it("does not resolve persisted previews merely because a document mounted", async () => {
    const source = createEditor({ resolve: async () => null });

    source.commands.insertExternalLinkPreview({ href: "https://example.com/persisted" });
    const persistedHtml = source.getHTML();
    source.destroy();
    editors.delete(source);

    const resolver = vi.fn<ExternalLinkPreviewResolver>().mockResolvedValue({
      pageTitle: "Should not be requested",
    });
    const restored = createEditor({ content: persistedHtml, resolve: resolver });

    await Promise.resolve();
    await Promise.resolve();

    expect(resolver).not.toHaveBeenCalled();
    expect(restored.getJSON().content?.[0].content?.[0]).toMatchObject({
      type: "externalLinkPreview",
      attrs: { href: "https://example.com/persisted" },
    });
  });

  it("treats canonical outer metadata as authoritative when parsing HTML", () => {
    const editor = createEditor({
      content: `<p><span data-type="external-link-preview" data-href="https://example.com/canonical" data-link-text="Canonical fallback" data-display="compact"><a data-link-preview-target href="https://example.com/canonical"><img data-link-preview-favicon src="https://spoof.example/favicon.png"><span data-link-preview-title>Rendered title</span><span data-link-preview-site>Rendered site</span></a></span></p>`,
    });

    expect(editor.getJSON().content?.[0].content?.[0]).toMatchObject({
      type: "externalLinkPreview",
      attrs: {
        href: "https://example.com/canonical",
        linkText: "Canonical fallback",
        pageTitle: null,
        siteName: null,
        faviconUrl: null,
        imageUrl: null,
      },
    });
  });

  it("converts policy-rejected previews from initial HTML to ordinary links", async () => {
    const resolver = vi.fn<ExternalLinkPreviewResolver>();
    const href = "https://clevertask.example/documents/internal";
    const editor = createEditor({
      content: `<p><span data-type="external-link-preview" data-href="${href}" data-link-text="Internal document" data-display="card"><a data-link-preview-target href="${href}"><span data-link-preview-title>Rendered label</span></a></span></p>`,
      resolve: resolver,
      shouldPreview: (candidate) => !candidate.startsWith("https://clevertask.example/"),
    });

    await waitFor(() => expect(hasNodeType(editor, "externalLinkPreview")).toBe(false));
    expect(editor.getJSON().content?.[0].content?.[0]).toMatchObject({
      type: "text",
      text: "Internal document",
      marks: [{ type: "link", attrs: { href } }],
    });
    expect(resolver).not.toHaveBeenCalled();
  });

  it("converts policy-rejected previews from programmatic JSON without fetching", () => {
    const resolver = vi.fn<ExternalLinkPreviewResolver>();
    const href = "https://clevertask.example/tasks/internal";
    const editor = createEditor({
      resolve: resolver,
      shouldPreview: (candidate) => !candidate.startsWith("https://clevertask.example/"),
    });

    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "externalLinkPreview",
              attrs: {
                href,
                linkText: "Internal task",
                display: "compact",
              },
            },
          ],
        },
      ],
    });

    expect(hasNodeType(editor, "externalLinkPreview")).toBe(false);
    expect(editor.getJSON().content?.[0].content?.[0]).toMatchObject({
      type: "text",
      text: "Internal task",
      marks: [{ type: "link", attrs: { href } }],
    });
    expect(resolver).not.toHaveBeenCalled();
  });

  it("keeps policy correction out of history while undoing the rejected insertion", () => {
    const href = "https://clevertask.example/documents/rejected";
    const editor = createEditor({
      content: "<p>Before text</p>",
      resolve: async () => null,
      shouldPreview: () => false,
    });

    editor.commands.setTextSelection(8);
    editor.commands.insertContent({
      type: "externalLinkPreview",
      attrs: {
        href,
        linkText: "Rejected preview",
        display: "compact",
      },
    });

    expect(hasNodeType(editor, "externalLinkPreview")).toBe(false);
    expect(editor.getText()).toBe("Before Rejected previewtext");
    expect(editor.commands.undo()).toBe(true);
    expect(editor.getText()).toBe("Before text");
  });

  it("replaces a whitespace-only paragraph with Compact only when a resolver exists", async () => {
    const resolver = vi.fn<ExternalLinkPreviewResolver>().mockResolvedValue({
      pageTitle: "Pasted destination",
    });
    const editor = createEditor({ content: "<p>   </p>", resolve: resolver });

    editor.commands.setTextSelection(2);
    paste(editor, "https://example.com/pasted?query=kept");

    await waitFor(() => expect(resolver).toHaveBeenCalledOnce());
    expect(editor.getJSON().content).toMatchObject([
      {
        type: "paragraph",
        content: [
          {
            type: "externalLinkPreview",
            attrs: {
              href: "https://example.com/pasted?query=kept",
              linkText: "https://example.com/pasted?query=kept",
              display: "compact",
            },
          },
        ],
      },
    ]);
    expect(editor.getText()).not.toContain("   ");
  });

  it.each([
    ["image", '<p><img src="https://example.com/product.png"></p>', "image"],
    ["hard break", "<p><br></p>", "hardBreak"],
    ["inline atom", "<p><span data-test-inline-atom></span></p>", "testInlineAtom"],
  ])(
    "never replaces a paragraph containing a %s during standalone paste",
    (_label, content, type) => {
      const editor = createEditor({ content, resolve: async () => null });

      expect(hasNodeType(editor, type)).toBe(true);
      editor.commands.setTextSelection(2);
      paste(editor, "https://example.com/pasted");

      expect(hasNodeType(editor, type)).toBe(true);
      expect(hasNodeType(editor, "externalLinkPreview")).toBe(false);
    },
  );

  it("leaves standalone paste on the ordinary Link path when no resolver exists", () => {
    const editor = createEditor();

    editor.commands.setTextSelection(1);
    paste(editor, "https://example.com/ordinary");

    expect(editor.getJSON().content?.[0].content?.[0]?.type).not.toBe("externalLinkPreview");
    expect(editor.getHTML()).toContain(
      '<a target="_blank" rel="noopener noreferrer nofollow" href="https://example.com/ordinary">https://example.com/ordinary</a>',
    );
  });

  it("rejects Card when an enhanced link has adjacent text", () => {
    const editor = createEditor({ resolve: async () => null });

    editor.commands.insertExternalLinkPreview({ href: "https://example.com/compact" });
    editor.commands.insertContentAt(2, " adjacent text");
    editor.commands.setNodeSelection(1);

    expect(editor.commands.setExternalLinkDisplay("card")).toBe(false);
    expect(editor.getJSON().content?.[0].content?.[0].attrs?.display).toBe("compact");
  });

  it.each([
    [
      "paragraph",
      '<p><span data-type="external-link-preview" data-href="https://example.com/target" data-link-text="Target" data-display="compact"><a data-link-preview-target href="https://example.com/target">Target</a></span></p><p>Elsewhere</p>',
    ],
    [
      "list-item paragraph",
      '<ul><li><p><span data-type="external-link-preview" data-href="https://example.com/target" data-link-text="Target" data-display="compact"><a data-link-preview-target href="https://example.com/target">Target</a></span></p></li></ul><p>Elsewhere</p>',
    ],
  ])("checks and applies Card at an explicit %s target", (_label, content) => {
    const editor = createEditor({ content });
    const previewPosition = findNodePosition(editor, "externalLinkPreview");

    editor.commands.setTextSelection(findTextPosition(editor, "Elsewhere"));

    expect(editor.can().setExternalLinkDisplay("card", previewPosition)).toBe(true);
    expect(editor.chain().focus().setExternalLinkDisplay("card", previewPosition).run()).toBe(true);
    expect(editor.state.doc.nodeAt(previewPosition)?.attrs.display).toBe("card");
    expect(editor.state.doc.resolve(previewPosition).parent.childCount).toBe(1);
  });

  it("checks and refreshes metadata at an explicit target", async () => {
    const resolver = vi.fn<ExternalLinkPreviewResolver>().mockResolvedValue({
      pageTitle: "Refreshed target",
    });
    const editor = createEditor({
      content:
        '<p><span data-type="external-link-preview" data-href="https://example.com/refresh-target" data-link-text="Refresh target" data-display="compact"><a data-link-preview-target href="https://example.com/refresh-target">Refresh target</a></span></p><p>Elsewhere</p>',
      resolve: resolver,
    });
    const previewPosition = findNodePosition(editor, "externalLinkPreview");

    editor.commands.setTextSelection(findTextPosition(editor, "Elsewhere"));

    expect(editor.can().refreshExternalLinkPreview(previewPosition)).toBe(true);
    expect(editor.chain().focus().refreshExternalLinkPreview(previewPosition).run()).toBe(true);
    expect(editor.state.selection).toBeInstanceOf(NodeSelection);
    expect(editor.state.selection.from).toBe(previewPosition);
    await waitFor(() =>
      expect(resolver).toHaveBeenCalledWith("https://example.com/refresh-target", {
        signal: expect.any(AbortSignal),
      }),
    );
    await waitFor(() => {
      expect(editor.state.doc.nodeAt(previewPosition)?.attrs.pageTitle).toBe("Refreshed target");
    });
    expect(editor.state.selection).toBeInstanceOf(NodeSelection);
    expect(editor.state.selection.from).toBe(previewPosition);
  });

  it("updates an explicit preview target and resolves its exact new destination", async () => {
    const deferred = createDeferred<ExternalLinkPreviewMetadata | null>();
    const resolver = vi.fn<ExternalLinkPreviewResolver>().mockReturnValue(deferred.promise);
    const oldHref = "https://shop.example/old?campaign=wishlist";
    const newHref = "https://shop.example/new?campaign=wishlist&color=navy#details";
    const editor = createEditor({
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "externalLinkPreview",
                attrs: {
                  href: oldHref,
                  linkText: "Saved product",
                  display: "compact",
                  pageTitle: "Old product",
                  description: "Old description",
                  siteName: "Old shop",
                  faviconUrl: "https://shop.example/old-icon.png",
                  imageUrl: "https://shop.example/old-image.png",
                  fetchedAt: "2026-08-19T06:00:00.000Z",
                },
              },
            ],
          },
          { type: "paragraph", content: [{ type: "text", text: "Elsewhere" }] },
        ],
      },
      resolve: resolver,
    });
    const previewPosition = findNodePosition(editor, "externalLinkPreview");

    editor.commands.setTextSelection(findTextPosition(editor, "Elsewhere"));

    expect(editor.can().updateExternalLinkPreview({ href: newHref }, previewPosition)).toBe(true);
    expect(editor.commands.updateExternalLinkPreview({ href: newHref }, previewPosition)).toBe(
      true,
    );
    expect(editor.state.selection).toBeInstanceOf(NodeSelection);
    expect(editor.state.selection.from).toBe(previewPosition);
    expect(editor.state.doc.nodeAt(previewPosition)?.attrs).toMatchObject({
      href: newHref,
      linkText: "Saved product",
      pageTitle: null,
      description: null,
      siteName: null,
      faviconUrl: null,
      imageUrl: null,
      fetchedAt: null,
    });
    await waitFor(() =>
      expect(resolver).toHaveBeenCalledWith(newHref, { signal: expect.any(AbortSignal) }),
    );

    deferred.resolve({ pageTitle: "New product" });
    await waitFor(() => {
      expect(editor.state.doc.nodeAt(previewPosition)?.attrs.pageTitle).toBe("New product");
    });
  });

  it("rejects an explicit preview URL update without dispatching earlier chained changes", () => {
    const oldHref = "https://shop.example/product";
    const rejectedHref = "https://clevertask.example/documents/internal";
    const resolver = vi.fn<ExternalLinkPreviewResolver>();
    const editor = createEditor({
      content: `<p><span data-type="external-link-preview" data-href="${oldHref}" data-link-text="Product" data-display="compact"><a data-link-preview-target href="${oldHref}">Product</a></span></p><p>Elsewhere</p>`,
      resolve: resolver,
      shouldPreview: (href) => !href.startsWith("https://clevertask.example/"),
    });
    const previewPosition = findNodePosition(editor, "externalLinkPreview");
    const elsewherePosition = findTextPosition(editor, "Elsewhere");
    const before = editor.getJSON();

    editor.commands.setTextSelection(elsewherePosition);

    expect(
      editor
        .chain()
        .insertContentAt(elsewherePosition, "Unexpected ")
        .updateExternalLinkPreview({ href: rejectedHref }, previewPosition)
        .run(),
    ).toBe(false);
    expect(editor.getJSON()).toEqual(before);
    expect(resolver).not.toHaveBeenCalled();
    expect(editor.commands.undo()).toBe(false);
  });

  it("does not create an undo step for an unchanged preview update", () => {
    const href = "https://shop.example/product?campaign=wishlist";
    const editor = createEditor({
      content: `<p><span data-type="external-link-preview" data-href="${href}" data-link-text="Product" data-display="compact"><a data-link-preview-target href="${href}">Product</a></span></p>`,
    });
    const previewPosition = findNodePosition(editor, "externalLinkPreview");

    editor.commands.setNodeSelection(previewPosition);

    expect(editor.commands.updateExternalLinkPreview({ href }, previewPosition)).toBe(true);
    expect(editor.commands.undo()).toBe(false);
  });

  it("undoes a preview URL edit and aborts its pending resolution", async () => {
    const deferred = createDeferred<ExternalLinkPreviewMetadata | null>();
    let signal: AbortSignal | undefined;
    const resolver: ExternalLinkPreviewResolver = vi.fn((_href, context) => {
      signal = context.signal;
      return deferred.promise;
    });
    const oldHref = "https://shop.example/original";
    const newHref = "https://shop.example/replacement";
    const editor = createEditor({
      content: `<p><span data-type="external-link-preview" data-href="${oldHref}" data-link-text="Product" data-display="compact" data-page-title="Original product"><a data-link-preview-target href="${oldHref}">Product</a></span></p>`,
      resolve: resolver,
    });
    const previewPosition = findNodePosition(editor, "externalLinkPreview");

    editor.commands.setNodeSelection(previewPosition);
    expect(editor.commands.updateExternalLinkPreview({ href: newHref }, previewPosition)).toBe(
      true,
    );
    await waitFor(() => expect(signal).toBeDefined());

    expect(editor.commands.undo()).toBe(true);
    await waitFor(() => expect(signal?.aborted).toBe(true));
    expect(editor.state.doc.nodeAt(previewPosition)?.attrs).toMatchObject({
      href: oldHref,
      pageTitle: "Original product",
    });

    deferred.resolve({ pageTitle: "Stale replacement" });
    await Promise.resolve();
    expect(editor.state.doc.nodeAt(previewPosition)?.attrs.pageTitle).toBe("Original product");
  });

  it("downgrades persisted Card mode when text is inserted beside it", () => {
    const editor = createEditor({ resolve: async () => null });

    editor.commands.insertExternalLinkPreview({ href: "https://example.com/card" });
    expect(editor.commands.setExternalLinkDisplay("card")).toBe(true);
    expect(editor.getJSON().content?.[0].content?.[0].attrs?.display).toBe("card");
    editor.view.dispatch(closeHistory(editor.state.tr));

    editor.commands.insertContentAt(2, " adjacent text");
    editor.commands.setNodeSelection(1);

    expect(editor.getJSON().content?.[0].content?.[0].attrs?.display).toBe("compact");
    expect(editor.getAttributes("externalLinkPreview").display).toBe("compact");
    expect(editor.can().setExternalLinkDisplay("card")).toBe(false);
    expect(editor.commands.setExternalLinkDisplay("card")).toBe(false);

    expect(editor.commands.undo()).toBe(true);
    expect(editor.getText()).not.toContain("adjacent text");
    expect(editor.getJSON().content?.[0].content?.[0].attrs?.display).toBe("card");
  });

  it("normalizes an initially invalid Card without adding an undo step", async () => {
    const editor = createEditor({
      content: `<p><span data-type="external-link-preview" data-href="https://example.com/card" data-link-text="Card" data-display="card"><a data-link-preview-target href="https://example.com/card">Card</a></span> adjacent</p>`,
    });

    await waitFor(() => {
      expect(editor.getJSON().content?.[0].content?.[0].attrs?.display).toBe("compact");
    });
    expect(editor.commands.undo()).toBe(false);
  });

  it.each(["remove", "destroy"] as const)(
    "aborts a pending resolver when the preview is %s",
    async (action) => {
      const deferred = createDeferred<ExternalLinkPreviewMetadata | null>();
      let signal: AbortSignal | undefined;
      const resolver: ExternalLinkPreviewResolver = vi.fn((_href, context) => {
        signal = context.signal;
        return deferred.promise;
      });
      const editor = createEditor({ resolve: resolver });

      editor.commands.insertExternalLinkPreview({ href: "https://example.com/pending" });
      await waitFor(() => expect(signal).toBeDefined());

      if (action === "remove") {
        editor.commands.deleteSelection();
      } else {
        editor.destroy();
        editors.delete(editor);
      }

      await waitFor(() => expect(signal?.aborted).toBe(true));
    },
  );

  it("keeps resolver failure transient and retries only after an explicit Refresh", async () => {
    const resolver = vi
      .fn<ExternalLinkPreviewResolver>()
      .mockRejectedValueOnce(new Error("Unavailable"))
      .mockResolvedValueOnce({ pageTitle: "Recovered preview" });
    const editor = createEditor({ resolve: resolver });

    editor.commands.insertExternalLinkPreview({ href: "https://example.com/retry" });

    await waitFor(() => {
      expect(getExternalLinkPreviewResolutionStatus(editor.state, 1)).toBe("error");
    });
    expect(resolver).toHaveBeenCalledOnce();
    expect(editor.getJSON().content?.[0].content?.[0].attrs?.pageTitle).toBeNull();

    editor.commands.setNodeSelection(1);
    expect(editor.commands.refreshExternalLinkPreview()).toBe(true);

    await waitFor(() => {
      expect(resolver).toHaveBeenCalledTimes(2);
      expect(editor.getJSON().content?.[0].content?.[0].attrs?.pageTitle).toBe("Recovered preview");
      expect(getExternalLinkPreviewResolutionStatus(editor.state, 1)).toBe("idle");
    });
  });

  it("aborts and ignores stale metadata when the selected preview URL changes", async () => {
    const deferredRequests: Array<
      ReturnType<typeof createDeferred<ExternalLinkPreviewMetadata | null>>
    > = [];
    const signals: AbortSignal[] = [];
    const resolver: ExternalLinkPreviewResolver = vi.fn((_href, { signal }) => {
      const deferred = createDeferred<ExternalLinkPreviewMetadata | null>();

      deferredRequests.push(deferred);
      signals.push(signal);

      return deferred.promise;
    });
    const editor = createEditor({ resolve: resolver });

    editor.commands.insertExternalLinkPreview({ href: "https://first.example/product" });
    await waitFor(() => expect(deferredRequests).toHaveLength(1));

    expect(
      editor.commands.updateExternalLinkPreview({
        href: "https://second.example/product",
        linkText: "https://second.example/product",
      }),
    ).toBe(true);
    await waitFor(() => expect(deferredRequests).toHaveLength(2));
    expect(signals[0]?.aborted).toBe(true);

    deferredRequests[0]?.resolve({ pageTitle: "Stale product" });
    deferredRequests[1]?.resolve({ pageTitle: "Current product" });

    await waitFor(() => {
      expect(editor.getJSON().content?.[0].content?.[0].attrs).toMatchObject({
        href: "https://second.example/product",
        pageTitle: "Current product",
      });
    });
  });

  it("preserves omitted resolver metadata and clears only explicit nulls", async () => {
    const resolver = vi
      .fn<ExternalLinkPreviewResolver>()
      .mockResolvedValueOnce({
        pageTitle: "Original title",
        description: "Original description",
        siteName: "Original site",
        faviconUrl: "https://example.com/favicon.png",
        imageUrl: "/api/link-preview/media/product.png",
        fetchedAt: "2026-08-19T06:00:00.000Z",
      })
      .mockResolvedValueOnce({ pageTitle: "Updated title" })
      .mockResolvedValueOnce({ description: null });
    const editor = createEditor({ resolve: resolver });

    editor.commands.insertExternalLinkPreview({ href: "https://example.com/metadata" });
    await waitFor(() => expect(resolver).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect(editor.getJSON().content?.[0].content?.[0].attrs?.description).toBe(
        "Original description",
      );
    });

    editor.commands.setNodeSelection(1);
    expect(editor.commands.refreshExternalLinkPreview()).toBe(true);
    await waitFor(() => expect(resolver).toHaveBeenCalledTimes(2));
    await waitFor(() => {
      expect(editor.getJSON().content?.[0].content?.[0].attrs).toMatchObject({
        pageTitle: "Updated title",
        description: "Original description",
        siteName: "Original site",
        faviconUrl: "https://example.com/favicon.png",
        imageUrl: "/api/link-preview/media/product.png",
        fetchedAt: "2026-08-19T06:00:00.000Z",
      });
    });

    editor.commands.setNodeSelection(1);
    expect(editor.commands.refreshExternalLinkPreview()).toBe(true);
    await waitFor(() => expect(resolver).toHaveBeenCalledTimes(3));
    await waitFor(() => {
      expect(editor.getJSON().content?.[0].content?.[0].attrs).toMatchObject({
        pageTitle: "Updated title",
        description: null,
        siteName: "Original site",
      });
    });
  });

  it("accepts only explicit credential-free HTTP(S) preview URLs", () => {
    expect(normalizeExternalLinkPreviewHref("https://example.com/product?color=navy")).toBe(
      "https://example.com/product?color=navy",
    );
    expect(normalizeExternalLinkPreviewHref("https:example.com/product")).toBeNull();
    expect(normalizeExternalLinkPreviewHref("https:\\example.com\\product")).toBeNull();
    expect(normalizeExternalLinkPreviewHref("https://user:pass@example.com/product")).toBeNull();
    expect(normalizeExternalLinkPreviewHref("https://@example.com/product")).toBeNull();

    expect(normalizeExternalLinkPreviewMediaUrl("/api/link-preview/media/product.png")).toBe(
      "/api/link-preview/media/product.png",
    );
    expect(normalizeExternalLinkPreviewMediaUrl("https://cdn.example.com/product.png")).toBe(
      "https://cdn.example.com/product.png",
    );
    expect(normalizeExternalLinkPreviewMediaUrl("//cdn.example.com/product.png")).toBeNull();
    expect(
      normalizeExternalLinkPreviewMediaUrl("https://user:pass@cdn.example.com/product.png"),
    ).toBeNull();
    expect(normalizeExternalLinkPreviewMediaUrl("https:\\cdn.example.com\\product.png")).toBeNull();
  });
});
