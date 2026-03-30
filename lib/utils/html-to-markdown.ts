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
      const latexNode = node as Element;
      const content = latexNode.getAttribute("data-content") || "";
      const isBlock = latexNode.getAttribute("data-display-mode") === "true";

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
