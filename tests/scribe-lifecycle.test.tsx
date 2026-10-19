import { Theme } from "@radix-ui/themes";
import type { Editor } from "@tiptap/react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRef, StrictMode, useCallback, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createScribeEditor,
  Scribe,
  type ScribeOnChangeContents,
  type ScribeRef,
} from "../lib/main";

const externalEditors = new Set<Editor>();

afterEach(() => {
  externalEditors.forEach((editor) => {
    if (!editor.isDestroyed) {
      editor.destroy();
    }
  });
  externalEditors.clear();
});

const renderScribe = (
  scribeRef: React.RefObject<ScribeRef | null>,
  options: {
    content?: string;
    enableUndoRedo?: boolean;
    key?: string;
  } = {},
) => {
  const scribe = (
    <Theme>
      <Scribe
        key={options.key}
        ref={scribeRef}
        content={options.content ?? "<p>Lifecycle content</p>"}
        enableUndoRedo={options.enableUndoRedo}
        showBarMenu={false}
      />
    </Theme>
  );

  return render(scribe);
};

const getEditor = (scribeRef: React.RefObject<ScribeRef | null>) => {
  const editor = scribeRef.current?.editor;

  if (!editor) {
    throw new Error("Expected Scribe to expose its editor");
  }

  return editor;
};

describe("Scribe editor lifecycle", () => {
  it.each([false, true])(
    "settles content feedback and keeps editability changes silent (external editor: %s)",
    async (useExternalEditor) => {
      const scribeRef = createRef<ScribeRef>();
      const onContentChange = vi.fn();
      const externalEditor = useExternalEditor
        ? createScribeEditor({ content: "<p></p>" })
        : undefined;
      if (externalEditor) externalEditors.add(externalEditor);

      const StatefulConsumer = ({ editable }: { editable: boolean }) => {
        const [document, setDocument] = useState<ScribeOnChangeContents["jsonContent"]>("");
        const handleContentChange = useCallback((content: ScribeOnChangeContents) => {
          onContentChange(content);
          // Bound a broken feedback cycle so the regression fails instead of hanging React.
          if (onContentChange.mock.calls.length <= 5) setDocument(content.jsonContent);
        }, []);

        return (
          <>
            <Scribe
              ref={scribeRef}
              content="<p></p>"
              editable={editable}
              externalEditor={externalEditor}
              editorProps={{ editorProps: { attributes: { "data-consumer": "planner" } } }}
              onContentChange={handleContentChange}
              showBarMenu={false}
            />
            <output aria-label="Stored document">{JSON.stringify(document)}</output>
          </>
        );
      };
      const renderConsumer = (editable: boolean) => (
        <Theme>
          <StatefulConsumer editable={editable} />
        </Theme>
      );
      const { rerender } = render(renderConsumer(true));
      const editor = getEditor(scribeRef);
      onContentChange.mockClear();

      await act(async () => {
        editor.commands.insertContent("A");
      });

      expect(editor.getText()).toBe("A");
      expect(onContentChange).toHaveBeenCalledOnce();
      expect(onContentChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ jsonContent: editor.getJSON(), source: "user" }),
      );
      expect(screen.getByLabelText("Stored document")).toHaveTextContent(
        JSON.stringify(editor.getJSON()),
      );

      rerender(renderConsumer(true));
      expect(onContentChange).toHaveBeenCalledOnce();
      expect(getEditor(scribeRef)).toBe(editor);

      rerender(renderConsumer(false));
      expect(editor.isEditable).toBe(false);
      expect(editor.view.dom).toHaveAttribute("contenteditable", "false");
      expect(editor.view.dom).toHaveAttribute("aria-readonly", "true");
      expect(onContentChange).toHaveBeenCalledOnce();

      await act(async () => {
        editor.commands.setContent("<p>Loaded content</p>");
      });
      expect(onContentChange).toHaveBeenCalledTimes(2);
      expect(onContentChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ jsonContent: editor.getJSON(), source: "programmatic" }),
      );

      rerender(renderConsumer(true));
      expect(editor.isEditable).toBe(true);
      expect(editor.view.dom).toHaveAttribute("contenteditable", "true");
      expect(editor.view.dom).toHaveAttribute("aria-readonly", "false");
      expect(onContentChange).toHaveBeenCalledTimes(2);

      await act(async () => {
        editor.commands.setTextSelection(editor.state.doc.content.size - 1);
        editor.commands.insertContent(" B");
      });
      expect(editor.getText()).toBe("Loaded content B");
      expect(onContentChange).toHaveBeenCalledTimes(3);
      expect(onContentChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ jsonContent: editor.getJSON(), source: "user" }),
      );
      expect(screen.getByLabelText("Stored document")).toHaveTextContent(
        JSON.stringify(editor.getJSON()),
      );
    },
  );

  it("keeps built-in undo and redo enabled by default", () => {
    const scribeRef = createRef<ScribeRef>();

    renderScribe(scribeRef, { content: "<p>Original</p>" });
    const editor = getEditor(scribeRef);

    expect(editor.extensionManager.extensions.map(({ name }) => name)).toContain("undoRedo");

    act(() => {
      editor.commands.setTextSelection(editor.state.doc.content.size - 1);
      editor.commands.insertContent(" updated");
    });
    expect(editor.getText()).toBe("Original updated");

    act(() => {
      editor.commands.undo();
    });
    expect(editor.getText()).toBe("Original");

    act(() => {
      editor.commands.redo();
    });
    expect(editor.getText()).toBe("Original updated");
  });

  it("lets a consumer disable Scribe's built-in undo and redo", () => {
    const scribeRef = createRef<ScribeRef>();

    renderScribe(scribeRef, { enableUndoRedo: false });

    expect(getEditor(scribeRef).extensionManager.extensions.map(({ name }) => name)).not.toContain(
      "undoRedo",
    );
  });

  it("lets createScribeEditor disable Scribe's built-in undo and redo", () => {
    const editor = createScribeEditor({ enableUndoRedo: false });
    externalEditors.add(editor);

    expect(editor.extensionManager.extensions.map(({ name }) => name)).not.toContain("undoRedo");
  });

  it("leaves undo and redo configuration on a caller-owned editor unchanged", () => {
    const externalEditor = createScribeEditor({ editable: true });
    const scribeRef = createRef<ScribeRef>();
    externalEditors.add(externalEditor);

    render(
      <Theme>
        <Scribe
          ref={scribeRef}
          enableUndoRedo={false}
          externalEditor={externalEditor}
          showBarMenu={false}
        />
      </Theme>,
    );

    expect(getEditor(scribeRef)).toBe(externalEditor);
    expect(externalEditor.extensionManager.extensions.map(({ name }) => name)).toContain(
      "undoRedo",
    );
  });

  it("keeps legacy links readable and editable across editable transitions", async () => {
    const scribeRef = createRef<ScribeRef>();
    const previewContent =
      '<p><span data-type="external-link-preview" data-href="https://example.com/reference" data-link-text="Reference" data-display="compact"><a data-link-preview-target href="https://example.com/reference">Reference</a></span></p>';
    const resolve = vi.fn(async () => null);
    const renderEditor = (editable: boolean) => (
      <Theme>
        <Scribe
          ref={scribeRef}
          content={previewContent}
          editable={editable}
          externalLinkPreview={{ resolve }}
          showBarMenu={false}
        />
      </Theme>
    );
    const { rerender } = render(renderEditor(true));
    const editor = getEditor(scribeRef);
    const original = editor.getJSON();
    const getPreviewTarget = () => {
      const target = editor.view.dom.querySelector<HTMLAnchorElement>("[data-link-preview-target]");
      if (!target) {
        throw new Error("Expected a readable legacy link");
      }
      expect(target).toHaveAttribute("href", "https://example.com/reference");
      expect(target).toHaveTextContent("Reference");
      return target;
    };

    fireEvent.click(getPreviewTarget());
    expect(await screen.findByRole("dialog", { name: "Edit link" })).toBeInTheDocument();
    const urlInput = screen.getByRole("textbox", { name: "URL" });
    expect(urlInput).toHaveValue("https://example.com/reference");
    fireEvent.keyDown(urlInput, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Edit link" })).not.toBeInTheDocument();
    });

    rerender(renderEditor(false));
    await waitFor(() => {
      expect(editor.isEditable).toBe(false);
    });
    expect(editor.view.dom).toHaveAttribute("aria-readonly", "true");
    expect(fireEvent.click(getPreviewTarget())).toBe(true);
    expect(screen.queryByRole("dialog", { name: "Edit link" })).not.toBeInTheDocument();

    rerender(renderEditor(true));
    await waitFor(() => {
      expect(editor.isEditable).toBe(true);
    });
    expect(editor.view.dom).toHaveAttribute("aria-readonly", "false");
    fireEvent.click(getPreviewTarget());
    expect(await screen.findByRole("dialog", { name: "Edit link" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Text to display" })).toHaveValue("Reference");
    expect(editor.getJSON()).toEqual(original);
    expect(resolve).not.toHaveBeenCalled();
  });

  it("does not remove update listeners owned by a caller-provided editor", () => {
    const externalEditor = createScribeEditor({
      content: "<p>Caller-owned content</p>",
      editable: true,
    });
    const onExternalUpdate = vi.fn();
    const scribeRef = createRef<ScribeRef>();
    externalEditors.add(externalEditor);
    externalEditor.on("update", onExternalUpdate);

    render(
      <Theme>
        <Scribe ref={scribeRef} externalEditor={externalEditor} editable showBarMenu={false} />
      </Theme>,
    );
    onExternalUpdate.mockClear();

    act(() => {
      externalEditor.commands.insertContent(" Updated");
    });

    expect(onExternalUpdate).toHaveBeenCalledOnce();
  });

  it("destroys an internally created editor after unmount", async () => {
    const scribeRef = createRef<ScribeRef>();
    const { unmount } = renderScribe(scribeRef);
    const editor = getEditor(scribeRef);

    expect(editor.isDestroyed).toBe(false);

    unmount();

    await waitFor(() => {
      expect(editor.isDestroyed).toBe(true);
    });
  });

  it("leaves a caller-owned external editor alive after unmount", async () => {
    const onBeforeCreate = vi.fn();
    const externalEditor = createScribeEditor({
      content: "<p>Caller-owned content</p>",
      editable: true,
    });
    const scribeRef = createRef<ScribeRef>();
    externalEditors.add(externalEditor);

    const { unmount } = render(
      <Theme>
        <Scribe
          ref={scribeRef}
          externalEditor={externalEditor}
          editable
          editorProps={{ onBeforeCreate }}
          showBarMenu={false}
        />
      </Theme>,
    );

    expect(getEditor(scribeRef)).toBe(externalEditor);

    unmount();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(onBeforeCreate).not.toHaveBeenCalled();
    expect(externalEditor.isDestroyed).toBe(false);
    expect(externalEditor.getText()).toBe("Caller-owned content");
    expect(externalEditor.commands.setContent("<p>Still usable</p>")).toBe(true);
    expect(externalEditor.getText()).toBe("Still usable");
  });

  it("cleans up discarded editors without destroying the active Strict Mode editor", async () => {
    const createdEditors = new Set<Editor>();
    const scribeRef = createRef<ScribeRef>();
    const { unmount } = render(
      <StrictMode>
        <Theme>
          <Scribe
            ref={scribeRef}
            content="<p>Strict Mode content</p>"
            editorProps={{
              onBeforeCreate: ({ editor }) => createdEditors.add(editor),
            }}
            showBarMenu={false}
          />
        </Theme>
      </StrictMode>,
    );

    await waitFor(() => {
      expect(createdEditors.size).toBeGreaterThan(1);
    });

    const editor = getEditor(scribeRef);

    await waitFor(() => {
      expect(editor.isDestroyed).toBe(false);
      createdEditors.forEach((createdEditor) => {
        if (createdEditor !== editor) {
          expect(createdEditor.isDestroyed).toBe(true);
        }
      });
    });

    act(() => {
      editor.commands.setContent("<p>Active after Strict Mode check</p>");
    });

    expect(editor.getText()).toBe("Active after Strict Mode check");

    unmount();

    await waitFor(() => {
      expect([...createdEditors].every((createdEditor) => createdEditor.isDestroyed)).toBe(true);
    });
  });

  it("destroys the old editor when a keyed Scribe is replaced", async () => {
    const scribeRef = createRef<ScribeRef>();
    const { rerender, unmount } = renderScribe(scribeRef, {
      content: "<p>Document A</p>",
      key: "document-a",
    });
    const firstEditor = getEditor(scribeRef);

    rerender(
      <Theme>
        <Scribe key="document-b" ref={scribeRef} content="<p>Document B</p>" showBarMenu={false} />
      </Theme>,
    );

    await waitFor(() => {
      expect(firstEditor.isDestroyed).toBe(true);
      expect(scribeRef.current?.editor).not.toBe(firstEditor);
    });

    const secondEditor = getEditor(scribeRef);

    expect(secondEditor.getText()).toBe("Document B");

    unmount();

    await waitFor(() => {
      expect(secondEditor.isDestroyed).toBe(true);
    });
  });
});
