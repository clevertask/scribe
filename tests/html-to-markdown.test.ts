import { describe, expect, it } from "vitest";
import { html2md } from "../lib/utils/html-to-markdown";
import { md2html } from "../lib/utils/markdown-to-html";

const normalizeHtml = (html: string) => {
  const container = document.createElement("div");

  container.innerHTML = html;

  return container.innerHTML;
};

const EXTERNAL_LINK_PREVIEW_HREF =
  "https://store.example/products/edward-jacket?utm_source=wishlist&color=navy%20blue";

const createExternalLinkPreviewHtml = (display: "compact" | "card") =>
  [
    `<span data-type="external-link-preview" data-display="${display}"`,
    ` data-link-text="Original product link"`,
    ` data-page-title="Edward &amp; Sons Jacket"`,
    ` data-description="A navy wool jacket"`,
    ` data-site-name="Example Store"`,
    ` data-favicon-url="/link-preview-assets/favicon-123"`,
    ` data-image-url="https://images.example/edward-jacket.jpg"`,
    ` data-fetched-at="2026-08-19T04:56:32.309Z">`,
    `<a data-link-preview-target href="${EXTERNAL_LINK_PREVIEW_HREF}">Edward &amp; Sons Jacket</a>`,
    "</span>",
  ].join("");

const getExternalLinkPreview = (html: string) => {
  const container = document.createElement("div");

  container.innerHTML = html;

  return container.querySelector('span[data-type="external-link-preview"]');
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

describe("External link preview Markdown fallback", () => {
  it("rebuilds a provider-free Compact label while preserving its exact tracked URL", () => {
    const href =
      "https://shop.example:8443/products/edward-jacket?utm_source=wishlist&color=navy#details";
    const html = `<p><span data-type="external-link-preview" data-display="compact" data-href="${href.replaceAll("&", "&amp;")}" data-link-text="${href.replaceAll("&", "&amp;")}"><a data-link-preview-target href="${href.replaceAll("&", "&amp;")}">${href.replaceAll("&", "&amp;")}</a></span></p>`;
    const markdown = html2md(html);
    const restored = getExternalLinkPreview(md2html(markdown));

    expect(restored).toHaveAttribute("data-href", href);
    expect(restored).toHaveAttribute("data-link-text", href);
    expect(restored?.querySelector("a[data-link-preview-target]")).toHaveAttribute("href", href);
    expect(restored?.querySelector("[data-link-preview-title]")).toHaveTextContent(
      "shop.example:8443/products/edward-jacket",
    );
    expect(restored?.querySelector("[data-link-preview-title]")?.textContent).not.toContain(
      "utm_source",
    );
  });

  it.each(["compact", "card"] as const)(
    "preserves a %s preview as inline raw HTML with its metadata",
    (display) => {
      const html = `<p>Before ${createExternalLinkPreviewHtml(display)} after</p>`;
      const markdown = html2md(html);
      const restored = getExternalLinkPreview(md2html(markdown));
      const target = restored?.querySelector("a[data-link-preview-target]");

      expect(markdown).toContain('<span data-type="external-link-preview"');
      expect(markdown).toContain(`data-display="${display}"`);
      expect(markdown).not.toContain("[Edward & Sons Jacket]");
      expect(restored).not.toBeNull();
      expect(restored).toHaveAttribute("data-display", display);
      expect(restored).toHaveAttribute("data-link-text", "Original product link");
      expect(restored).toHaveAttribute("data-page-title", "Edward & Sons Jacket");
      expect(restored).toHaveAttribute("data-description", "A navy wool jacket");
      expect(restored).toHaveAttribute("data-site-name", "Example Store");
      expect(restored).toHaveAttribute("data-favicon-url", "/link-preview-assets/favicon-123");
      expect(restored).toHaveAttribute(
        "data-image-url",
        "https://images.example/edward-jacket.jpg",
      );
      expect(restored).toHaveAttribute("data-fetched-at", "2026-08-19T04:56:32.309Z");
      expect(target).toHaveAttribute("href", EXTERNAL_LINK_PREVIEW_HREF);
      expect(target).toHaveAttribute("target", "_blank");
      expect(target).toHaveAttribute("rel", "noopener noreferrer");
      if (display === "card") {
        expect(target?.querySelector("[data-link-preview-title]")).toHaveTextContent(
          "Edward & Sons Jacket",
        );
        expect(target?.querySelector("img[data-link-preview-favicon]")).toHaveAttribute(
          "src",
          "/link-preview-assets/favicon-123",
        );
        expect(target?.querySelector("img[data-link-preview-image]")).toHaveAttribute(
          "src",
          "https://images.example/edward-jacket.jpg",
        );
        expect(target?.querySelector("[data-link-preview-description]")).toHaveTextContent(
          "A navy wool jacket",
        );
      } else {
        expect(target?.querySelector("[data-link-preview-title]")).toHaveTextContent(
          "Original product link",
        );
        expect(target?.querySelector("img[data-link-preview-favicon]")).toBeNull();
        expect(target?.querySelector("[data-link-preview-favicon-fallback]")).not.toBeNull();
        expect(target?.querySelector("[data-link-preview-site]")).toBeNull();
        expect(target?.querySelector("[data-link-preview-image]")).toBeNull();
        expect(target?.querySelector("[data-link-preview-description]")).toBeNull();
      }
    },
  );

  it("keeps a Card preview inside a Markdown list item", () => {
    const markdown = html2md(`<ul><li><p>${createExternalLinkPreviewHtml("card")}</p></li></ul>`);
    const restoredContainer = document.createElement("div");

    restoredContainer.innerHTML = md2html(markdown);

    const restored = restoredContainer.querySelector('li span[data-type="external-link-preview"]');

    expect(markdown).toMatch(/^\s*-\s+/);
    expect(restored).toHaveAttribute("data-display", "card");
    expect(restored?.querySelector("a[data-link-preview-target]")).toHaveAttribute(
      "href",
      EXTERNAL_LINK_PREVIEW_HREF,
    );
  });

  it("keeps the wrapper strict and removes unsafe imported metadata", () => {
    const markdown = html2md(
      [
        '<p><span data-type="external-link-preview" data-display="gallery"',
        ' data-link-text="Safe fallback" data-page-title="Safe title"',
        ' data-favicon-url="javascript:alert(1)"',
        ' data-image-url="data:image/svg+xml,unsafe"',
        ' data-fetched-at="not-a-date" class="spoofed" id="unsafe"',
        ' style="position: fixed" onclick="alert(2)" data-unexpected="unsafe">',
        `<a data-link-preview-target href="${EXTERNAL_LINK_PREVIEW_HREF}" onfocus="alert(3)">`,
        "Safe title<script>alert(4)</script></a></span></p>",
      ].join(""),
    );
    const preview = getExternalLinkPreview(markdown);

    expect(preview).toHaveAttribute("data-display", "compact");
    expect(preview).not.toHaveAttribute("data-favicon-url");
    expect(preview).not.toHaveAttribute("data-image-url");
    expect(preview).not.toHaveAttribute("data-fetched-at");
    expect(preview).not.toHaveAttribute("class");
    expect(preview).not.toHaveAttribute("id");
    expect(preview).not.toHaveAttribute("style");
    expect(preview).not.toHaveAttribute("onclick");
    expect(preview).not.toHaveAttribute("data-unexpected");
    expect(markdown).not.toMatch(/javascript:|data:image|on\w+=|<script/i);
  });

  it("degrades an imported preview with an unsafe destination to text", () => {
    const unsafePreview = [
      '<span data-type="external-link-preview" data-display="card"',
      ' data-link-text="Safe fallback" data-href="javascript:alert(1)">',
      '<a data-link-preview-target href="https://safe.example/product">Unsafe title</a>',
      "</span>",
    ].join("");
    const markdown = html2md(`<p>${unsafePreview}</p>`);
    const restoredHtml = md2html(unsafePreview);

    expect(markdown).toContain("Safe fallback");
    expect(markdown).not.toContain("external-link-preview");
    expect(markdown).not.toContain("javascript:");
    expect(restoredHtml).toContain("Safe fallback");
    expect(restoredHtml).not.toContain("external-link-preview");
    expect(restoredHtml).not.toContain("javascript:");
  });

  it("normalizes a preview nested inside a raw Callout", () => {
    const markdown = html2md(
      [
        '<aside data-type="callout" data-variant="warning">',
        `<p>${createExternalLinkPreviewHtml("card").replace(
          ' data-image-url="https://images.example/edward-jacket.jpg"',
          ' data-image-url="javascript:alert(1)" class="spoofed"',
        )}</p>`,
        "</aside>",
      ].join(""),
    );
    const container = document.createElement("div");

    container.innerHTML = markdown;

    const preview = container.querySelector('span[data-type="external-link-preview"]');

    expect(markdown).toContain('<aside data-type="callout"');
    expect(preview).toHaveAttribute("data-display", "card");
    expect(preview).not.toHaveAttribute("data-image-url");
    expect(preview).not.toHaveAttribute("class");
    expect(normalizeHtml(md2html(markdown))).toContain('data-type="external-link-preview"');
  });

  it("normalizes a preview nested inside a raw-fallback table", () => {
    const markdown = html2md(
      [
        "<table><tbody>",
        "<tr><th><p>Product</p></th></tr>",
        `<tr><td><p>${createExternalLinkPreviewHtml("compact").replace(
          ' data-favicon-url="/link-preview-assets/favicon-123"',
          ' data-favicon-url="data:image/svg+xml,unsafe" style="position: fixed"',
        )}</p></td></tr>`,
        "</tbody></table>",
      ].join(""),
    );
    const container = document.createElement("div");

    container.innerHTML = markdown;

    const preview = container.querySelector('span[data-type="external-link-preview"]');

    expect(markdown).toContain("<table");
    expect(preview).toHaveAttribute("data-display", "compact");
    expect(preview).not.toHaveAttribute("data-favicon-url");
    expect(preview).not.toHaveAttribute("style");
    expect(normalizeHtml(md2html(markdown))).toContain('data-type="external-link-preview"');
  });

  it("does not treat an arbitrary span as an external link preview", () => {
    expect(html2md('<span data-display="card">Ordinary text</span>')).toBe("Ordinary text");
  });
});
