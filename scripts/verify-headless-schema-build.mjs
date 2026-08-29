import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { generateJSON } from "@tiptap/html";

assert.equal(typeof globalThis.document, "undefined");

const schemaTypesUrl = new URL("../dist/schema.d.ts", import.meta.url);
const schemaModule = await import("@clevertask/scribe/schema");
const schemaTypes = await readFile(schemaTypesUrl, "utf8");

assert.doesNotMatch(schemaTypes, /@tiptap\/(?:extension-|starter-kit)/);
assert.doesNotMatch(schemaTypes, /import\("\.\/main"\)/);

if (typeof schemaModule.createScribeSchemaExtensions !== "function") {
  throw new Error("The built headless schema entry does not export its extension factory.");
}

const extensions = schemaModule.createScribeSchemaExtensions({ enableUndoRedo: false });

if (!Array.isArray(extensions) || extensions.length === 0) {
  throw new Error("The built headless schema entry returned no extensions.");
}

const parsed = generateJSON(
  [
    "<h2>Node verification</h2>",
    '<aside data-type="callout" data-variant="info" role="note">',
    '<div data-callout-header=""><span data-callout-label="">Info</span></div>',
    '<div data-callout-content=""><p>Headless content.</p></div>',
    "</aside>",
    '<table><tbody><tr><td colspan="2"><p>Cell</p></td></tr></tbody></table>',
    '<p><span data-latex="x^2" data-type="inline-math"></span></p>',
  ].join(""),
  extensions,
);

const parsedTypes = [];
const visit = (node) => {
  parsedTypes.push(node.type);
  node.content?.forEach(visit);
};

visit(parsed);
assert.ok(parsedTypes.includes("callout"));
assert.ok(parsedTypes.includes("table"));
assert.ok(parsedTypes.includes("inlineMath"));
