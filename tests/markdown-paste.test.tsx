import { Theme } from "@radix-ui/themes";
import { Extension } from "@tiptap/core";
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
});
