import DOMPurify from "dompurify";
import TurndownService from "turndown";

export const html2md = (html: string) => {
  const service = new TurndownService({
    headingStyle: "atx",
    hr: "---",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
  });

  return service.turndown(DOMPurify.sanitize(html));
};
