import { Theme } from "@radix-ui/themes";
import type { Editor } from "@tiptap/react";
import { act, render, waitFor } from "@testing-library/react";
import { createRef, StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createScribeEditor, Scribe, type ScribeRef } from "../lib/main";

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
    key?: string;
  } = {},
) => {
  const scribe = (
    <Theme>
      <Scribe
        key={options.key}
        ref={scribeRef}
        content={options.content ?? "<p>Lifecycle content</p>"}
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
