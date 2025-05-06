import { Editor } from "@tiptap/core";
import { initExtensions } from "../components/Scribe/extension";
import { html2md } from "../utils";

export type CreateEditorOptions = {
  content?: string;
  editable?: boolean;
  onContentChange?: (content: { htmlContent: string; jsonContent: any; markdownContent: string }) => void;
};

export function createScribeEditor({ content = "", editable = false, onContentChange }: CreateEditorOptions): Editor {
  return new Editor({
    content,
    editable,
    extensions: initExtensions({}),
    onUpdate({ editor }) {
      if (onContentChange) {
        onContentChange({
          htmlContent: editor.getHTML(),
          jsonContent: editor.getJSON(),
          markdownContent: html2md(editor.getHTML()),
        });
      }
    },
    editorProps: {
      attributes: {
        class: "scribe",
      },
    },
  });
}
