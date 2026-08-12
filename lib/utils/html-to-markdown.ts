import DOMPurify from "dompurify";
import TurndownService from "turndown";

const TABLE_HARD_BREAK_PLACEHOLDER = "\uE000scribe-table-break\uE001";
const BLOCK_CONTENT_SELECTOR = [
  "address",
  "article",
  "aside",
  "blockquote",
  "details",
  "dialog",
  "dd",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "li",
  "main",
  "menu",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "summary",
  "table",
  "ul",
].join(",");
const SUPPORTED_INLINE_ELEMENTS = new Set([
  "A",
  "B",
  "BR",
  "CODE",
  "DEL",
  "EM",
  "I",
  "IMG",
  "S",
  "STRONG",
]);

const isSupportedInlineElement = (element: Element) =>
  SUPPORTED_INLINE_ELEMENTS.has(element.tagName) ||
  (element.tagName === "SPAN" && element.getAttribute("data-type") === "latex");

const hasOnlySupportedInlineContent = (element: Element) =>
  isSupportedInlineElement(element) &&
  Array.from(element.querySelectorAll("*")).every(isSupportedInlineElement);

const hasMeaningfulContent = (node: Node) =>
  node.nodeType !== Node.TEXT_NODE || Boolean(node.textContent?.trim());

const hasSimpleCellContent = (cell: HTMLTableCellElement) => {
  const children = Array.from(cell.childNodes).filter(hasMeaningfulContent);

  if (children.length === 0) {
    return true;
  }

  if (children.length === 1 && children[0] instanceof HTMLParagraphElement) {
    return (
      !children[0].querySelector(BLOCK_CONTENT_SELECTOR) &&
      Array.from(children[0].children).every(hasOnlySupportedInlineContent)
    );
  }

  return children.every(
    (child) =>
      (!(child instanceof Element) && child.nodeType === Node.TEXT_NODE) ||
      (child instanceof Element &&
        !child.matches(BLOCK_CONTENT_SELECTOR) &&
        !child.querySelector(BLOCK_CONTENT_SELECTOR) &&
        hasOnlySupportedInlineContent(child)),
  );
};

const hasResizableWidths = (table: HTMLTableElement) => {
  if (
    table.hasAttribute("width") ||
    /(?:^|;)\s*width\s*:/i.test(table.getAttribute("style") ?? "")
  ) {
    return true;
  }

  return Array.from(table.querySelectorAll("th, td, col")).some((element) => {
    if (
      element.hasAttribute("colwidth") ||
      element.hasAttribute("width") ||
      /(?:^|;)\s*width\s*:/i.test(element.getAttribute("style") ?? "")
    ) {
      return true;
    }

    return false;
  });
};

type TableAlignment = "left" | "center" | "right" | null;

const getCellAlignment = (cell: HTMLTableCellElement): TableAlignment | undefined => {
  const styleAlignment = cell.style.textAlign.trim().toLowerCase();
  const attributeAlignment = (cell.getAttribute("align") ?? "").trim().toLowerCase();

  if (styleAlignment && attributeAlignment && styleAlignment !== attributeAlignment) {
    return undefined;
  }

  const alignment = styleAlignment || attributeAlignment;

  if (!alignment) {
    return null;
  }

  if (alignment === "left" || alignment === "center" || alignment === "right") {
    return alignment;
  }

  return undefined;
};

const getSimpleTableRows = (table: HTMLTableElement) => {
  if (table.caption || table.tFoot || hasResizableWidths(table)) {
    return null;
  }

  const rows = Array.from(table.rows);
  const columnCount = rows[0]?.cells.length ?? 0;

  if (rows.length === 0 || columnCount === 0) {
    return null;
  }

  const cells = rows.map((row) => Array.from(row.cells));

  if (
    cells.some(
      (row, rowIndex) =>
        row.length !== columnCount ||
        row.some(
          (cell) =>
            cell.closest("table") !== table ||
            cell.colSpan !== 1 ||
            cell.rowSpan !== 1 ||
            !hasSimpleCellContent(cell) ||
            (rowIndex === 0 ? cell.tagName !== "TH" : cell.tagName !== "TD"),
        ),
    )
  ) {
    return null;
  }

  const alignments = cells[0].map((_, columnIndex) => {
    const columnAlignments = cells.map((row) => getCellAlignment(row[columnIndex]));
    const alignment = columnAlignments[0];

    if (
      alignment === undefined ||
      columnAlignments.some((currentAlignment) => currentAlignment !== alignment)
    ) {
      return undefined;
    }

    return alignment;
  });

  if (alignments.some((alignment) => alignment === undefined)) {
    return null;
  }

  return { rows: cells, alignments: alignments as TableAlignment[] };
};

const serializeTableCell = (service: TurndownService, cell: HTMLTableCellElement) => {
  const children = Array.from(cell.childNodes).filter(hasMeaningfulContent);
  const content =
    children.length === 1 && children[0] instanceof HTMLParagraphElement ? children[0] : cell;
  const clone = content.cloneNode(true) as HTMLElement;

  clone.querySelectorAll("br").forEach((hardBreak) => {
    hardBreak.replaceWith(hardBreak.ownerDocument.createTextNode(TABLE_HARD_BREAK_PLACEHOLDER));
  });

  const markdown = service
    .turndown(clone.innerHTML)
    .split(TABLE_HARD_BREAK_PLACEHOLDER)
    .join("<br>")
    .split("|")
    .join("\\|")
    .trim();

  return /[\r\n]/.test(markdown) ? null : markdown;
};

const serializeRawTable = (table: HTMLTableElement) => {
  const clone = table.cloneNode(true) as HTMLTableElement;

  clone.querySelectorAll('span[data-type="latex"]').forEach((latex) => {
    if (latex.textContent === "•") {
      latex.textContent = "";
    }
  });

  return clone.outerHTML;
};

const addTableRule = (service: TurndownService) => {
  service.addRule("scribeTable", {
    filter: "table",
    replacement: (_content, node) => {
      const table = node as HTMLTableElement;
      const simpleTable = getSimpleTableRows(table);

      if (!simpleTable) {
        return `\n\n${serializeRawTable(table)}\n\n`;
      }

      const { rows, alignments } = simpleTable;
      const serializedRows = rows.map((row) =>
        row.map((cell) => serializeTableCell(service, cell)),
      );

      if (serializedRows.some((row) => row.some((cell) => cell === null))) {
        return `\n\n${serializeRawTable(table)}\n\n`;
      }

      const markdownRows = serializedRows.map((row) => `| ${row.join(" | ")} |`);
      const separator = `| ${alignments
        .map((alignment) => {
          if (alignment === "left") {
            return ":---";
          }

          if (alignment === "center") {
            return ":---:";
          }

          if (alignment === "right") {
            return "---:";
          }

          return "---";
        })
        .join(" | ")} |`;

      markdownRows.splice(1, 0, separator);

      return `\n\n${markdownRows.join("\n")}\n\n`;
    },
  });
};

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

  addTableRule(service);

  const patchLatexSpans = (html: string) => {
    return html.replace(/<span([^>]+data-type="latex"[^>]*)><\/span>/g, "<span$1>•</span>");
  };

  return service.turndown(
    DOMPurify.sanitize(patchLatexSpans(html), {
      ADD_ATTR: ["colwidth"],
    }),
  );
};
