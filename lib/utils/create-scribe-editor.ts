import { Editor, JSONContent } from "@tiptap/core";
import { initExtensions } from "../components/Scribe/extension";
import { html2md } from "../utils";
import type { ExternalLinkPreviewOptions } from "../components/Scribe/extension/external-link-preview";

export type CreateEditorOptions = {
  content?: string;
  editable?: boolean;
  /**
   * Enables Scribe's built-in undo and redo history. Disable this when another
   * extension owns history for the editor.
   */
  enableUndoRedo?: boolean;
  /** @deprecated Legacy node compatibility. Resolver, policy and automatic preview options are ignored. */
  externalLinkPreview?: Partial<ExternalLinkPreviewOptions>;
  onContentChange?: (content: {
    htmlContent: string;
    jsonContent: JSONContent;
    markdownContent: string;
  }) => void;
};

export function createScribeEditor({
  content = "",
  editable = false,
  enableUndoRedo,
  externalLinkPreview,
  onContentChange,
}: CreateEditorOptions): Editor {
  return new Editor({
    content,
    editable,
    extensions: initExtensions({ enableUndoRedo, externalLinkPreview }),
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
