import { describe, expect, it } from "vitest";
import { html2md } from "../lib/utils/html-to-markdown";
import { md2html } from "../lib/utils/markdown-to-html";

const normalizeHtml = (html: string) => {
  const container = document.createElement("div");

  container.innerHTML = html;

  return container.innerHTML;
};

describe("html2md tables", () => {
  it("serializes a simple headed table as GFM without losing inline content", () => {
    const html = [
      "<table><tbody>",
      "<tr><th><p>Name</p></th><th><p>Notes</p></th><th><p>Empty</p></th></tr>",
      '<tr><td><p><strong>Ada</strong></p></td><td><p><a href="https://example.com/docs">Docs | API</a><br><code>a | b</code> <em>today</em> <s>old</s></p></td><td><p></p></td></tr>',
      "</tbody></table>",
    ].join("");

    const markdown = html2md(html);

    expect(markdown).toBe(
      [
        "| Name | Notes | Empty |",
        "| --- | --- | --- |",
        "| **Ada** | [Docs \\| API](https://example.com/docs)<br>`a \\| b` _today_ ~~old~~ |  |",
      ].join("\n"),
    );

    const roundTrip = document.createElement("div");

    roundTrip.innerHTML = md2html(markdown);

    const bodyCells = roundTrip.querySelectorAll("tbody td");

    expect(bodyCells).toHaveLength(3);
    expect(bodyCells[0].querySelector("strong")?.textContent).toBe("Ada");
    expect(bodyCells[1].querySelector("a")?.textContent).toBe("Docs | API");
    expect(bodyCells[1].querySelector("br")).not.toBeNull();
    expect(bodyCells[1].querySelector("code")?.textContent).toBe("a | b");
    expect(bodyCells[1].querySelector("em")?.textContent).toBe("today");
    expect(bodyCells[1].querySelector("del")?.textContent).toBe("old");
    expect(bodyCells[2].textContent).toBe("");
  });

  it("ignores Tiptap's generated minimum widths for an otherwise simple table", () => {
    const html = [
      '<table style="min-width: 75px"><colgroup>',
      '<col style="min-width: 25px"><col style="min-width: 25px"><col style="min-width: 25px">',
      "</colgroup><tbody>",
      '<tr><th colspan="1" rowspan="1"><p>A</p></th><th colspan="1" rowspan="1"><p>B</p></th><th colspan="1" rowspan="1"><p>C</p></th></tr>',
      '<tr><td colspan="1" rowspan="1"><p>1</p></td><td colspan="1" rowspan="1"><p>2</p></td><td colspan="1" rowspan="1"><p>3</p></td></tr>',
      "</tbody></table>",
    ].join("");

    expect(html2md(html)).toBe(
      ["| A | B | C |", "| --- | --- | --- |", "| 1 | 2 | 3 |"].join("\n"),
    );
  });

  it("preserves consistent column alignment in the GFM separator", () => {
    const html = [
      "<table><tbody>",
      '<tr><th style="text-align: left"><p>Left</p></th><th align="center"><p>Center</p></th><th style="text-align: right"><p>Right</p></th></tr>',
      '<tr><td style="text-align: left"><p>A</p></td><td align="center"><p>B</p></td><td style="text-align: right"><p>C</p></td></tr>',
      "</tbody></table>",
    ].join("");

    const markdown = html2md(html);

    expect(markdown).toBe(
      ["| Left | Center | Right |", "| :--- | :---: | ---: |", "| A | B | C |"].join("\n"),
    );
    expect(normalizeHtml(md2html(markdown))).toContain('<th align="center">Center</th>');
  });

  it("does not leak the synthetic LaTeX placeholder into a raw HTML table", () => {
    const html =
      '<table><tbody><tr><td><p><span data-type="latex" data-content="x | y" data-display-mode="false"></span></p></td></tr></tbody></table>';
    const markdown = html2md(html);

    expect(markdown).not.toContain("•");
    expect(normalizeHtml(md2html(markdown))).toBe(normalizeHtml(html));
  });

  it("sanitizes unsupported tables before preserving them as raw HTML", () => {
    const markdown = html2md(
      '<table><tbody><tr><td><p>Safe<script>alert(1)</script><img src="x" onerror="alert(2)"></p></td></tr></tbody></table>',
    );

    expect(markdown).toContain("<table");
    expect(markdown).toContain("Safe");
    expect(markdown).not.toContain("<script");
    expect(markdown).not.toContain("onerror");
    expect(md2html(markdown)).not.toContain("onerror");
  });

  it("does not split a GFM row when inline HTML contains formatting whitespace", () => {
    const html = [
      "<table><tbody>",
      "<tr><th><p>Heading</p></th></tr>",
      "<tr><td><p>Hello\n<strong>world</strong></p></td></tr>",
      "</tbody></table>",
    ].join("");
    const roundTrip = document.createElement("div");

    roundTrip.innerHTML = md2html(html2md(html));

    expect(roundTrip.querySelectorAll("tr")).toHaveLength(2);
    expect(roundTrip.querySelectorAll("td")).toHaveLength(1);
    expect(roundTrip.querySelector("td")?.textContent?.replace(/\s+/g, " ").trim()).toBe(
      "Hello world",
    );
  });

  it.each([
    [
      "a headerless table",
      "<table><tbody><tr><td><p>A</p></td><td><p>B</p></td></tr></tbody></table>",
    ],
    [
      "a mixed header row",
      "<table><tbody><tr><th><p>A</p></th><td><p>B</p></td></tr></tbody></table>",
    ],
    [
      "a non-rectangular table",
      "<table><tbody><tr><th><p>A</p></th><th><p>B</p></th></tr><tr><td><p>1</p></td></tr></tbody></table>",
    ],
    [
      "a table with merged columns",
      '<table><tbody><tr><th colspan="2"><p>A</p></th></tr><tr><td><p>1</p></td><td><p>2</p></td></tr></tbody></table>',
    ],
    [
      "a table with merged rows",
      '<table><tbody><tr><th><p>A</p></th><th><p>B</p></th></tr><tr><td rowspan="2"><p>1</p></td><td><p>2</p></td></tr><tr><td><p>3</p></td></tr></tbody></table>',
    ],
    [
      "a cell with multiple blocks",
      "<table><tbody><tr><th><p>A</p></th></tr><tr><td><p>one</p><p>two</p></td></tr></tbody></table>",
    ],
    [
      "a cell with nested block content",
      "<table><tbody><tr><th><p>A</p></th></tr><tr><td><ul><li><p>one</p></li></ul></td></tr></tbody></table>",
    ],
    [
      "a resized table",
      '<table style="width: 180px"><colgroup><col style="width: 180px"></colgroup><tbody><tr><th colwidth="180"><p>A</p></th></tr><tr><td colwidth="180"><p>1</p></td></tr></tbody></table>',
    ],
    [
      "a table with inconsistent column alignment",
      '<table><tbody><tr><th style="text-align: center"><p>A</p></th></tr><tr><td><p>1</p></td></tr></tbody></table>',
    ],
    [
      "a table with unsupported column alignment",
      '<table><tbody><tr><th style="text-align: justify"><p>A</p></th></tr><tr><td style="text-align: justify"><p>1</p></td></tr></tbody></table>',
    ],
    [
      "a table with highlighted text",
      "<table><tbody><tr><th><p>A</p></th></tr><tr><td><p><mark>Important</mark></p></td></tr></tbody></table>",
    ],
  ])("keeps %s as HTML", (_description, html) => {
    const markdown = html2md(html);

    expect(markdown).toContain("<table");
    expect(normalizeHtml(md2html(markdown))).toBe(normalizeHtml(html));
  });
});

describe("Callout Markdown fallback", () => {
  it.each(["info", "tip", "warning", "caution"])(
    "preserves a %s Callout as raw HTML with nested block content",
    (variant) => {
      const html = [
        `<aside data-type="callout" data-variant="${variant}" role="note">`,
        "<p><strong>Heads up</strong></p>",
        "<ul><li><p>First consideration</p></li><li><p>Second consideration</p></li></ul>",
        "</aside>",
      ].join("");
      const markdown = html2md(html);

      expect(markdown).toBe(html);
      expect(normalizeHtml(md2html(markdown))).toBe(normalizeHtml(html));
    },
  );

  it.each([
    ["a missing variant", "", "info"],
    ["an unsupported variant", ' data-variant="success"', "info"],
    ["a variant with inconsistent casing", ' data-variant=" WARNING "', "warning"],
  ])("normalizes %s", (_description, variantAttribute, expectedVariant) => {
    const markdown = html2md(
      `<aside data-type="callout"${variantAttribute}><p>Consider this</p></aside>`,
    );

    expect(markdown).toBe(
      `<aside data-type="callout" data-variant="${expectedVariant}" role="note"><p>Consider this</p></aside>`,
    );
    expect(md2html(markdown)).toContain(`data-variant="${expectedVariant}"`);
  });

  it("keeps the Callout wrapper strict and sanitizes unsafe nested content", () => {
    const markdown = html2md(
      [
        '<aside data-type="callout" data-variant="warning" role="alert" class="spoofed" id="unsafe" style="position: fixed" onclick="alert(1)">',
        '<p style="color: red" onmouseover="alert(2)">Safe<script>alert(3)</script>',
        '<a href="javascript:alert(4)" onfocus="alert(5)">link</a></p>',
        "</aside>",
      ].join(""),
    );

    expect(markdown).toBe(
      '<aside data-type="callout" data-variant="warning" role="note"><p>Safe<a>link</a></p></aside>',
    );
    expect(markdown).not.toContain('role="alert"');
    expect(markdown).not.toMatch(/class=|id=|style=|on\w+=|<script|javascript:/i);
  });

  it("does not leak the synthetic LaTeX placeholder into a raw Callout", () => {
    const html =
      '<aside data-type="callout" data-variant="info" role="note"><p><span data-type="latex" data-content="x + y" data-display-mode="false"></span></p></aside>';
    const markdown = html2md(html);

    expect(markdown).not.toContain("•");
    expect(normalizeHtml(md2html(markdown))).toBe(normalizeHtml(html));
  });

  it("normalizes and sanitizes a raw Callout imported from Markdown", () => {
    const html = md2html(
      [
        '<aside data-type="callout" data-variant="danger" role="alert" class="spoofed" style="position: fixed" onclick="alert(1)">',
        '<p style="color: red" onmouseover="alert(2)">Safe<script>alert(3)</script></p>',
        "</aside>",
      ].join(""),
    );

    expect(normalizeHtml(html)).toBe(
      '<aside data-type="callout" data-variant="info" role="note"><p>Safe</p></aside>',
    );
    expect(html).not.toContain('role="alert"');
    expect(html).not.toMatch(/class=|style=|on\w+=|<script/i);
  });

  it("keeps the Callout contract strict inside a raw-fallback table", () => {
    const html = [
      "<table><tbody>",
      "<tr><th><p>Context</p></th></tr>",
      '<tr><td><aside data-type="callout" data-variant="danger" role="alert" class="spoofed" style="position: fixed" onclick="alert(1)"><p style="color: red">Nested Callout</p></aside></td></tr>',
      "</tbody></table>",
    ].join("");
    const markdown = html2md(html);
    const container = document.createElement("div");

    container.innerHTML = markdown;

    const callout = container.querySelector('aside[data-type="callout"]');

    expect(callout?.getAttribute("data-variant")).toBe("info");
    expect(callout?.getAttribute("role")).toBe("note");
    expect(Array.from(callout?.attributes ?? []).map((attribute) => attribute.name)).toEqual([
      "data-type",
      "data-variant",
      "role",
    ]);
    expect(markdown).toContain("<table");
    expect(markdown).not.toContain('role="alert"');
    expect(markdown).not.toMatch(/class=|style=|on\w+=/i);
  });

  it("preserves safe table layout styles inside a Callout", () => {
    const markdown = html2md(
      [
        '<aside data-type="callout" data-variant="warning" style="position: fixed">',
        '<p style="color: red">Nested table</p>',
        '<table style="width: 180px; position: fixed"><colgroup>',
        '<col style="width: 180px; background: red"></colgroup><tbody>',
        '<tr><th colwidth="180" style="text-align: center; color: red"><p>Heading</p></th></tr>',
        '<tr><td colwidth="180" style="width: 180px; text-align: center; color: red"><p>Value</p></td></tr>',
        "</tbody></table></aside>",
      ].join(""),
    );
    const markdownContainer = document.createElement("div");

    markdownContainer.innerHTML = markdown;

    const markdownCallout = markdownContainer.querySelector('aside[data-type="callout"]');
    const markdownTable = markdownContainer.querySelector("table");
    const markdownColumn = markdownContainer.querySelector("col");
    const markdownHeader = markdownContainer.querySelector("th");
    const markdownCell = markdownContainer.querySelector("td");

    expect(markdownCallout).not.toHaveAttribute("style");
    expect(markdownContainer.querySelector("p")).not.toHaveAttribute("style");
    expect(markdownTable).toHaveStyle({ width: "180px" });
    expect(markdownTable).not.toHaveStyle({ position: "fixed" });
    expect(markdownColumn).toHaveStyle({ width: "180px" });
    expect(markdownColumn).not.toHaveStyle({ background: "red" });
    expect(markdownHeader).toHaveStyle({ textAlign: "center" });
    expect(markdownHeader).not.toHaveStyle({ color: "red" });
    expect(markdownCell).toHaveStyle({ width: "180px", textAlign: "center" });
    expect(markdownCell).not.toHaveStyle({ color: "red" });

    const restoredContainer = document.createElement("div");

    restoredContainer.innerHTML = md2html(markdown);

    expect(restoredContainer.querySelector("table")).toHaveStyle({ width: "180px" });
    expect(restoredContainer.querySelector("col")).toHaveStyle({ width: "180px" });
    expect(restoredContainer.querySelector("th")).toHaveStyle({ textAlign: "center" });
    expect(restoredContainer.querySelector("td")).toHaveStyle({
      width: "180px",
      textAlign: "center",
    });
    expect(restoredContainer.innerHTML).not.toMatch(
      /position:\s*fixed|background:\s*red|color:\s*red/i,
    );
  });

  it("does not treat an arbitrary aside as a Scribe Callout", () => {
    expect(html2md("<aside><p>Ordinary note</p></aside>")).toBe("Ordinary note");
  });
});
