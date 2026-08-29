import { generateJSON, getSchema, type JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { initExtensions } from "../lib/components/Scribe/extension";
import { createScribeSchemaExtensions } from "../lib/schema";

const collectNodes = (content: JSONContent, type: string): JSONContent[] => {
  const matches = content.type === type ? [content] : [];

  for (const child of content.content ?? []) {
    matches.push(...collectNodes(child, type));
  }

  return matches;
};

describe("headless Scribe schema", () => {
  it("matches the interactive editor node and mark schema", () => {
    const headlessSchema = getSchema(createScribeSchemaExtensions({ enableUndoRedo: false }));
    const interactiveSchema = getSchema(initExtensions({ enableUndoRedo: false }));

    expect(Object.keys(headlessSchema.nodes)).toEqual(Object.keys(interactiveSchema.nodes));
    expect(Object.keys(headlessSchema.marks)).toEqual(Object.keys(interactiveSchema.marks));

    for (const nodeName of Object.keys(headlessSchema.nodes)) {
      expect(Object.keys(headlessSchema.nodes[nodeName].spec.attrs ?? {})).toEqual(
        Object.keys(interactiveSchema.nodes[nodeName].spec.attrs ?? {}),
      );
    }

    for (const markName of Object.keys(headlessSchema.marks)) {
      expect(Object.keys(headlessSchema.marks[markName].spec.attrs ?? {})).toEqual(
        Object.keys(interactiveSchema.marks[markName].spec.attrs ?? {}),
      );
    }
  });

  it("parses representative Scribe HTML without mounting an editor", () => {
    const html = [
      "<h2>Migration fixture</h2>",
      '<aside data-type="callout" data-variant="warning" role="note">',
      '<div data-callout-header=""><span data-callout-label="">Warning</span></div>',
      '<div data-callout-content=""><p>Keep this warning.</p></div>',
      "</aside>",
      "<table><tbody><tr>",
      '<th colspan="2" rowspan="1"><p>Header</p></th>',
      '</tr><tr><td colspan="1" rowspan="1"><p>Left</p></td>',
      '<td colspan="1" rowspan="1"><p>Right</p></td></tr></tbody></table>',
      '<p><span data-latex="\\sigma^2" data-type="inline-math"></span>',
      '<span data-name="eyes" data-type="emoji">👀</span>',
      '<mark>highlighted</mark> <a href="https://example.com/path">linked</a> ',
      "<code>inlineCode</code></p>",
      '<p><span data-type="external-link-preview" data-href="https://example.com/preview" ',
      'data-link-text="Preview" data-display="card" data-page-title="Preview title" ',
      'data-site-name="Example"><a data-link-preview-target href="https://example.com/preview">',
      "Preview</a></span></p>",
      "<ul><li><p>Outer</p><ul><li><p>Inner</p></li></ul></li></ul>",
      "<pre><code>const answer = 42;</code></pre>",
      "<hr>",
    ].join("");
    const content = generateJSON(html, createScribeSchemaExtensions({ enableUndoRedo: false }));

    expect(content).toEqual(generateJSON(html, initExtensions({ enableUndoRedo: false })));

    expect(collectNodes(content, "heading")[0]?.attrs).toMatchObject({ level: 2 });
    expect(collectNodes(content, "callout")[0]?.attrs).toMatchObject({ variant: "warning" });
    expect(collectNodes(content, "table")).toHaveLength(1);
    expect(collectNodes(content, "tableHeader")[0]?.attrs).toMatchObject({
      colspan: 2,
      rowspan: 1,
    });
    expect(collectNodes(content, "inlineMath")[0]?.attrs).toMatchObject({ latex: "\\sigma^2" });
    expect(collectNodes(content, "emoji")[0]?.attrs).toMatchObject({ name: "eyes" });
    expect(collectNodes(content, "externalLinkPreview")[0]?.attrs).toMatchObject({
      display: "card",
      href: "https://example.com/preview",
      linkText: "Preview",
      pageTitle: "Preview title",
      siteName: "Example",
    });
    expect(collectNodes(content, "bulletList")).toHaveLength(2);
    expect(collectNodes(content, "codeBlock")[0]?.content?.[0]?.text).toBe("const answer = 42;");
    expect(collectNodes(content, "horizontalRule")).toHaveLength(1);

    const textNodes = collectNodes(content, "text");
    expect(textNodes.find((node) => node.text === "highlighted")?.marks).toContainEqual({
      type: "highlight",
    });
    expect(textNodes.find((node) => node.text === "linked")?.marks).toContainEqual(
      expect.objectContaining({
        attrs: expect.objectContaining({ href: "https://example.com/path" }),
        type: "link",
      }),
    );
    expect(textNodes.find((node) => node.text === "inlineCode")?.marks).toContainEqual({
      type: "code",
    });
  });
});
