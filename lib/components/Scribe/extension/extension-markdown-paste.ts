import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { marked, Token } from "marked";
import { md2html } from "../../../utils/markdown-to-html";

const markdownPastePluginKey = new PluginKey("markdownPaste");

const blockMarkdownTokenTypes = new Set(["blockquote", "code", "heading", "hr", "list", "table"]);
const inlineMarkdownTokenTypes = new Set(["codespan", "del", "em", "strong"]);

const hasMarkdownLinkSyntax = (token: Token) => {
  if (token.type === "image") {
    return token.raw.startsWith("![");
  }

  if (token.type === "link") {
    return token.raw.startsWith("[");
  }

  return false;
};

const containsMarkdownTokens = (tokens: Token[]): boolean => {
  return tokens.some((token) => {
    if (
      blockMarkdownTokenTypes.has(token.type) ||
      inlineMarkdownTokenTypes.has(token.type) ||
      hasMarkdownLinkSyntax(token)
    ) {
      return true;
    }

    if ("tokens" in token && Array.isArray(token.tokens) && containsMarkdownTokens(token.tokens)) {
      return true;
    }

    if ("items" in token && Array.isArray(token.items)) {
      return token.items.some((item) => containsMarkdownTokens(item.tokens));
    }

    return false;
  });
};

const shouldConvertMarkdownPaste = (clipboardText: string) => {
  const normalizedText = clipboardText.trim();

  if (!normalizedText) {
    return false;
  }

  return containsMarkdownTokens(marked.lexer(normalizedText));
};

const getTaskListCheckbox = (listItem: HTMLLIElement) => {
  const firstElementChild = listItem.firstElementChild;

  if (!(firstElementChild instanceof HTMLInputElement) || firstElementChild.type !== "checkbox") {
    return null;
  }

  return firstElementChild;
};

const normalizeTaskListHtml = (html: string) => {
  const template = document.createElement("template");
  template.innerHTML = html;

  for (const list of template.content.querySelectorAll("ul")) {
    const listItems = Array.from(list.children).filter(
      (child): child is HTMLLIElement => child instanceof HTMLLIElement,
    );

    if (!listItems.length || listItems.length !== list.children.length) {
      continue;
    }

    const checkboxes = listItems.map(getTaskListCheckbox);

    if (checkboxes.some((checkbox) => !checkbox)) {
      continue;
    }

    list.setAttribute("data-type", "taskList");

    listItems.forEach((listItem, index) => {
      const checkbox = checkboxes[index];

      if (!checkbox) {
        return;
      }

      const isChecked = checkbox.checked;
      checkbox.remove();
      listItem.setAttribute("data-type", "taskItem");
      listItem.setAttribute("data-checked", isChecked ? "true" : "false");

      if (listItem.firstChild?.nodeType === Node.TEXT_NODE) {
        listItem.firstChild.textContent =
          listItem.firstChild.textContent?.replace(/^\s+/, "") ?? "";

        if (!listItem.firstChild.textContent) {
          listItem.firstChild.remove();
        }
      }
    });
  }

  return template.innerHTML;
};

export default Extension.create({
  name: "markdownPaste",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: markdownPastePluginKey,
        props: {
          handlePaste: (_, event) => {
            const clipboardHtml = event.clipboardData?.getData("text/html");
            const clipboardText = event.clipboardData?.getData("text/plain");

            if (!clipboardText || clipboardHtml || !shouldConvertMarkdownPaste(clipboardText)) {
              return false;
            }

            event.preventDefault();
            this.editor
              .chain()
              .focus()
              .insertContent(normalizeTaskListHtml(md2html(clipboardText)))
              .run();

            return true;
          },
        },
      }),
    ];
  },
});
