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
