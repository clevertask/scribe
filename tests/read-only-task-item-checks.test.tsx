import { Theme } from "@radix-ui/themes";
import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { act, fireEvent, render } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { createScribeEditor, Scribe, type ScribeProps, type ScribeRef } from "../lib/main";

const task = (content: string) =>
  `<li data-type="taskItem" data-checked="false"><p>Same</p>${content}</li>`;
const list = (content: string) => `<ul data-type="taskList">${content}</ul>`;
const content = list(task("") + task(list(task(""))));

const mountScribe = (props: ScribeProps = {}) => {
  const ref = createRef<ScribeRef>();
  const renderEditor = (nextProps: ScribeProps) => (
    <Theme>
      <button type="button">Outside</button>
      <Scribe ref={ref} content={content} editable={false} showBarMenu={false} {...nextProps} />
    </Theme>
  );
  const result = render(renderEditor(props));
  const editor = ref.current!.editor;
  const checkboxes = () => [
    ...editor.view.dom.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
  ];
  return {
    ...result,
    ref,
    editor,
    checkboxes,
    rerenderScribe(nextProps: ScribeProps) {
      result.rerender(renderEditor(nextProps));
      expect(ref.current!.editor).toBe(editor);
    },
  };
};

describe("explicit read-only task item checks", () => {
  it("keeps read-only checkboxes immutable without the capability", () => {
    const onContentChange = vi.fn();
    const { editor, checkboxes } = mountScribe({ onContentChange });
    const before = editor.getJSON();
    expect(checkboxes()).toHaveLength(3);
    for (const checkbox of checkboxes()) {
      expect(checkbox).toBeDisabled();
      checkbox.click();
    }
    expect(editor.getJSON()).toEqual(before);
    expect(onContentChange).not.toHaveBeenCalled();
  });

  it("changes only the selected nested checkbox and reports its exact preorder index without focus", () => {
    const onChange = vi.fn();
    const onContentChange = vi.fn();
    const { editor, checkboxes, getByRole } = mountScribe({
      readOnlyTaskItemChecks: { onChange },
      onContentChange,
    });
    const expected = structuredClone(editor.getJSON());
    expected.content![0].content![1].content![1].content![0].attrs!.checked = true;
    const outside = getByRole("button", { name: "Outside" });
    outside.focus();
    const focus = vi.spyOn(editor.view, "focus");

    fireEvent.click(checkboxes()[2]);

    expect(editor.getJSON()).toEqual(expected);
    expect(onChange).toHaveBeenCalledExactlyOnceWith({
      checkboxIndex: 2,
      previousChecked: false,
      checked: true,
    });
    expect(onContentChange).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ source: "programmatic" }),
    );
    expect(editor.view.dom).toHaveAttribute("contenteditable", "false");
    expect(editor.view.dom).toHaveAttribute("aria-readonly", "true");
    expect(focus).not.toHaveBeenCalled();
    expect(outside).toHaveFocus();
  });

  it("uses live disabled state and callbacks, and revokes the capability without remounting", () => {
    const firstCallback = vi.fn();
    const nextCallback = vi.fn();
    const { editor, checkboxes, rerenderScribe } = mountScribe({
      readOnlyTaskItemChecks: { onChange: firstCallback },
    });
    fireEvent.click(checkboxes()[0]);
    expect(firstCallback).toHaveBeenCalledOnce();
    const checkedDocument = editor.getJSON();

    rerenderScribe({ readOnlyTaskItemChecks: { disabled: true, onChange: nextCallback } });
    expect(checkboxes()[0]).toBeDisabled();
    checkboxes()[0].click();
    expect(editor.getJSON()).toEqual(checkedDocument);
    expect(nextCallback).not.toHaveBeenCalled();

    rerenderScribe({ readOnlyTaskItemChecks: { onChange: nextCallback } });
    expect(checkboxes()[0]).toBeEnabled();
    fireEvent.click(checkboxes()[0]);
    expect(nextCallback).toHaveBeenCalledExactlyOnceWith({
      checkboxIndex: 0,
      previousChecked: true,
      checked: false,
    });
    expect(firstCallback).toHaveBeenCalledOnce();

    rerenderScribe({});
    expect(checkboxes()[0]).toBeDisabled();
    checkboxes()[0].click();
    expect(nextCallback).toHaveBeenCalledOnce();
    expect(checkboxes()[0]).not.toBeChecked();
  });

  it("does not attribute programmatic replacements or attribute updates to checkbox actions", () => {
    const onChange = vi.fn();
    const onContentChange = vi.fn();
    const { editor, ref } = mountScribe({
      readOnlyTaskItemChecks: { onChange },
      onContentChange,
    });
    act(() => {
      editor.view.dispatch(editor.state.tr.setNodeAttribute(1, "checked", true));
      ref.current!.setContent("<p>Canonical server content</p>");
    });
    expect(editor.getText()).toBe("Canonical server content");
    expect(onChange).not.toHaveBeenCalled();
    expect(onContentChange).toHaveBeenCalledTimes(2);
    expect(onContentChange.mock.calls.every(([event]) => event.source === "programmatic")).toBe(
      true,
    );
  });

  it("does not report a checkbox transaction rejected by a consumer plugin", () => {
    const onChange = vi.fn();
    const rejectChanges = Extension.create({
      name: "rejectChanges",
      addProseMirrorPlugins: () => [new Plugin({ filterTransaction: (tr) => !tr.docChanged })],
    });
    const { editor, checkboxes } = mountScribe({
      extensions: [rejectChanges],
      readOnlyTaskItemChecks: { onChange },
    });
    const before = editor.getJSON();
    fireEvent.click(checkboxes()[0]);
    expect(editor.getJSON()).toEqual(before);
    expect(checkboxes()[0]).not.toBeChecked();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("prevents appended text changes from being included in a checkbox-only action", () => {
    const onChange = vi.fn();
    const appendText = Extension.create({
      name: "appendText",
      addProseMirrorPlugins: () => [
        new Plugin({
          appendTransaction(transactions, _oldState, state) {
            if (!transactions.some((transaction) => transaction.docChanged)) return null;
            return state.tr.insertText("Unexpected text", 3);
          },
        }),
      ],
    });
    const { editor, checkboxes } = mountScribe({
      extensions: [appendText],
      readOnlyTaskItemChecks: { onChange },
    });
    const expected = structuredClone(editor.getJSON());
    expected.content![0].content![0].attrs!.checked = true;
    fireEvent.click(checkboxes()[0]);
    expect(editor.getJSON()).toEqual(expected);
    expect(onChange).toHaveBeenCalledExactlyOnceWith({
      checkboxIndex: 0,
      previousChecked: false,
      checked: true,
    });
  });

  it("leaves ordinary editable checkbox updates on the existing user-change path", () => {
    const onChange = vi.fn();
    const onContentChange = vi.fn();
    const { checkboxes, rerenderScribe } = mountScribe({
      readOnlyTaskItemChecks: { disabled: true, onChange },
      onContentChange,
    });
    rerenderScribe({
      editable: true,
      readOnlyTaskItemChecks: { disabled: true, onChange },
      onContentChange,
    });
    expect(checkboxes()[0]).toBeEnabled();
    fireEvent.click(checkboxes()[0]);
    expect(checkboxes()[0]).toBeChecked();
    expect(onChange).not.toHaveBeenCalled();
    expect(onContentChange).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ source: "user" }),
    );
  });

  it("does not replace the node views or write policy of a caller-owned editor", () => {
    const externalEditor = createScribeEditor({ content, editable: false });
    const onChange = vi.fn();
    const { checkboxes, unmount } = mountScribe({
      externalEditor,
      readOnlyTaskItemChecks: { onChange },
    });
    const before = externalEditor.getJSON();
    fireEvent.click(checkboxes()[0]);
    expect(externalEditor.getJSON()).toEqual(before);
    expect(onChange).not.toHaveBeenCalled();
    unmount();
    expect(externalEditor.isDestroyed).toBe(false);
    externalEditor.destroy();
  });
});
