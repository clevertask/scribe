import { Theme } from "@radix-ui/themes";
import { Extension, type JSONContent } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import type { Editor } from "@tiptap/react";
import { act, fireEvent, render } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Scribe, type ScribeProps, type ScribeRef } from "../lib/main";

const liveEditors = new Set<Editor>();

afterEach(() => {
  liveEditors.forEach((editor) => {
    if (!editor.isDestroyed) {
      editor.destroy();
    }
  });
  liveEditors.clear();
});

const renderScribe = (props: ScribeProps = {}) => {
  const scribeRef = createRef<ScribeRef>();

  render(
    <Theme>
      <Scribe ref={scribeRef} content="" showBarMenu={false} {...props} />
    </Theme>,
  );

  const editor = scribeRef.current?.editor;

  if (!editor) {
    throw new Error("Expected Scribe to expose its editor");
  }

  liveEditors.add(editor);

  return editor;
};

const paste = ({ editor, html = "", text }: { editor: Editor; html?: string; text: string }) => {
  const getData = vi.fn((type: string) => {
    if (type === "text/html") {
      return html;
    }

    if (type === "text/plain") {
      return text;
    }

    return "";
  });

  act(() => {
    editor.commands.focus();
    fireEvent.paste(editor.view.dom, {
      clipboardData: { getData },
    });
  });

  return getData;
};

const getTextMarkTypes = (content: JSONContent, text: string): string[] | undefined => {
  if (content.type === "text" && content.text === text) {
    return (content.marks ?? []).map((mark) => mark.type).sort();
  }

  for (const child of content.content ?? []) {
    const markTypes = getTextMarkTypes(child, text);

    if (markTypes) {
      return markTypes;
    }
  }

  return undefined;
};

describe("Selected-text paste", () => {
  it.each([
    ["replacement", "replacement"],
    ["2026", "2026"],
    ["test@example.com", "test@example.com"],
    ["/notes with prose", "/notes with prose"],
    ["http://[::1]:4000/path extra words", "http://[::1]:4000/path extra words"],
    ["http://[::1]:invalid/path", "http://[::1]:invalid/path"],
    ["127.0.0.1", "127.0.0.1"],
    ["Ordinary replacement text", "Ordinary replacement text"],
    ["hello/world", "hello/world"],
    ["**replacement**", "replacement"],
    ["https://example.com/path extra words", "https://example.com/path extra words"],
    [
      "https://example.com/?q=value and explanation",
      "https://example.com/?q=value and explanation",
    ],
    [
      "https://example.com/#section and explanation",
      "https://example.com/#section and explanation",
    ],
    ["Read https://example.com/path", "Read https://example.com/path"],
    ["First line\nSecond line", "First line\nSecond line"],
  ])("replaces Select all with non-URL clipboard content: %s", (text, expectedText) => {
    const editor = renderScribe({ content: "<p>Original selected text</p>" });

    act(() => {
      editor.commands.selectAll();
    });
    paste({ editor, text });

    expect(editor.getText({ blockSeparator: "\n" })).toBe(expectedText);
    expect(editor.view.dom.querySelector('[data-type="external-link-preview"]')).toBeNull();
  });

  it("replaces only the selection and preserves surrounding text", () => {
    const editor = renderScribe({ content: "<p>Before original after</p>" });

    act(() => {
      editor.commands.setTextSelection({ from: 8, to: 16 });
    });
    paste({ editor, text: "replacement" });

    expect(editor.getText()).toBe("Before replacement after");
    expect(editor.view.dom.querySelector("a")).toBeNull();
  });

  it("replaces multiple selected blocks as one undoable paste", () => {
    const editor = renderScribe({ content: "<h2>Old heading</h2><p>Old paragraph</p>" });
    const originalDocument = editor.getJSON();

    act(() => {
      editor.commands.selectAll();
    });
    paste({ editor, text: "replacement" });

    expect(editor.getText()).toBe("replacement");
    expect(editor.view.dom.querySelector("a")).toBeNull();
    act(() => {
      editor.commands.undo();
    });
    expect(editor.getJSON()).toEqual(originalDocument);
    act(() => {
      editor.commands.redo();
    });
    expect(editor.getText()).toBe("replacement");
  });

  it("keeps rich clipboard formatting while replacing ordinary selected text", () => {
    const editor = renderScribe({ content: "<p>Original selected text</p>" });

    act(() => {
      editor.commands.selectAll();
    });
    paste({ editor, text: "replacement", html: "<p><strong>replacement</strong></p>" });

    expect(editor.getText()).toBe("replacement");
    expect(editor.view.dom.querySelector("strong")).toHaveTextContent("replacement");
    expect(editor.view.dom.querySelector("a")).toBeNull();
  });

  it.each([
    ["/notes", "/notes"],
    ["/tasks/list?itemId=1234567890abcdef12345678", "/tasks/list?itemId=1234567890abcdef12345678"],
    ["https://example.com/reference", "https://example.com/reference"],
    ["  https://example.com/reference  ", "https://example.com/reference"],
    ["localhost:3000/path", "https://localhost:3000/path"],
    ["http://[::1]:4000/path", "http://[::1]:4000/path"],
    ["example.com/reference", "https://example.com/reference"],
    ["https://example.com/path%20with%20spaces", "https://example.com/path%20with%20spaces"],
    [
      "https://clevertask.ai/documents/1234567890abcdef12345678",
      "https://clevertask.ai/documents/1234567890abcdef12345678",
    ],
  ])("keeps URL-only paste linking the selection: %s", (text, href) => {
    const editor = renderScribe({ content: "<p>Original selected text</p>" });

    act(() => {
      editor.commands.selectAll();
    });
    paste({ editor, text, html: `<p><a href="${href}">${text}</a></p>` });

    expect(editor.getText()).toBe("Original selected text");
    expect(editor.view.dom.querySelector("a")).toHaveAttribute("href", href);
  });
});

describe("Markdown paste", () => {
  it("runs generated HTML through every paste transform before inserting it", () => {
    const callerTransform = vi.fn((html: string, _view?: EditorView) =>
      html.replace("Task reference", "Caller transformed"),
    );
    const pluginTransform = vi.fn((html: string, _view: EditorView) =>
      html.replace("Caller transformed", "Plugin transformed"),
    );
    const pluginExtension = Extension.create({
      name: "testMarkdownPasteTransform",
      addProseMirrorPlugins() {
        return [
          new Plugin({
            props: {
              transformPastedHTML: pluginTransform,
            },
          }),
        ];
      },
    });
    const editor = renderScribe({
      editorProps: {
        editorProps: {
          transformPastedHTML: callerTransform,
        },
      },
      extensions: [pluginExtension],
    });

    paste({
      editor,
      text: "[Task reference](https://clevertask.ai/tasks/list?itemId=1234567890abcdef12345678)",
    });

    expect(callerTransform).toHaveBeenCalledOnce();
    expect(callerTransform.mock.calls[0]?.[0]).toContain(
      '<a href="https://clevertask.ai/tasks/list?itemId=1234567890abcdef12345678">Task reference</a>',
    );
    expect(callerTransform.mock.calls[0]?.[1]).toBe(editor.view);
    expect(pluginTransform).toHaveBeenCalledOnce();
    expect(pluginTransform.mock.calls[0]?.[0]).toContain("Caller transformed");
    expect(pluginTransform.mock.calls[0]?.[1]).toBe(editor.view);

    const link = editor.view.dom.querySelector("a");

    expect(link).toHaveTextContent("Plugin transformed");
    expect(link).toHaveAttribute(
      "href",
      "https://clevertask.ai/tasks/list?itemId=1234567890abcdef12345678",
    );
  });

  it("keeps rich HTML paste on the native single-transform path", () => {
    const transformPastedHTML = vi.fn((html: string) =>
      html.replace("Original HTML", "Transformed HTML"),
    );
    const editor = renderScribe({
      editorProps: {
        editorProps: {
          transformPastedHTML,
        },
      },
    });

    paste({
      editor,
      html: "<p>Original HTML</p>",
      text: "Original HTML",
    });

    expect(transformPastedHTML).toHaveBeenCalledOnce();
    expect(editor.getText()).toBe("Transformed HTML");
  });

  it("preserves marks combined with inline code in pasted Markdown", () => {
    const editor = renderScribe();

    paste({
      editor,
      text: "**`boldCode`** and [`linkedCode`](https://example.com/api)",
    });

    expect(getTextMarkTypes(editor.getJSON(), "boldCode")).toEqual(["bold", "code"]);
    expect(getTextMarkTypes(editor.getJSON(), "linkedCode")).toEqual(["code", "link"]);
    expect(editor.view.dom.querySelectorAll("code")).toHaveLength(2);
    expect(editor.view.dom.querySelector("a code, code a")).toHaveTextContent("linkedCode");
  });
});
