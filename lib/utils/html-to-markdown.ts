import DOMPurify from "dompurify";
import TurndownService from "turndown";

export const html2md = (html: string) => {
  const service = new TurndownService({
    headingStyle: "atx",
    hr: "---",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
  });

  service.addRule("latex", {
    filter: function (node) {
      return node.nodeName === "SPAN" && node.getAttribute("data-type") === "latex";
    },
    replacement: function (_content, node) {
      //@ts-ignore
      const content = node.getAttribute("data-content") || "";
      //@ts-ignore
      const isBlock = node.getAttribute("data-display-mode") === "true";

      return isBlock ? `\n\n$$\n${content}\n$$\n\n` : `$${content}$`;
    },
  });

  service.addRule("strikethrough", {
    filter: ["del", "s"],
    replacement: function (content) {
      return "~~" + content + "~~";
    },
  });

  const patchLatexSpans = (html: string) => {
    return html.replace(/<span([^>]+data-type="latex"[^>]*)><\/span>/g, "<span$1>•</span>");
  };

  return service.turndown(DOMPurify.sanitize(patchLatexSpans(html)));
};
