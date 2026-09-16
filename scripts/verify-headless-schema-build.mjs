import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { generateJSON } from "@tiptap/html";
import { getSchema } from "@tiptap/core";

assert.equal(typeof globalThis.document, "undefined");

const schemaTypesUrl = new URL("../dist/schema.d.ts", import.meta.url);
const schemaRuntimeUrl = new URL("../dist/schema.js", import.meta.url);
const schemaModule = await import("@clevertask/scribe/schema");
const schemaTypes = await readFile(schemaTypesUrl, "utf8");

const staticModuleSpecifiers = (source) => [
  ...source.matchAll(/\b(?:import|export)\s+(?:type\s+)?(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g),
  ...source.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g),
];

const readLocalModuleGraph = async (entryUrl, declarationGraph = false) => {
  const modules = new Map();

  const visit = async (moduleUrl) => {
    if (modules.has(moduleUrl.href)) {
      return;
    }

    const source = await readFile(moduleUrl, "utf8");
    modules.set(moduleUrl.href, source);

    for (const match of staticModuleSpecifiers(source)) {
      const specifier = match[1];
      if (!specifier?.startsWith(".")) {
        continue;
      }

      const childUrl = new URL(specifier, moduleUrl);
      if (declarationGraph && childUrl.pathname.endsWith(".js")) {
        childUrl.pathname = `${childUrl.pathname.slice(0, -3)}.d.ts`;
      }
      await visit(childUrl);
    }
  };

  await visit(entryUrl);
  return modules;
};

const declarationGraph = await readLocalModuleGraph(schemaTypesUrl, true);
const runtimeGraph = await readLocalModuleGraph(schemaRuntimeUrl);
const headlessGraph = [...declarationGraph, ...runtimeGraph];

assert.doesNotMatch(schemaTypes, /@tiptap\/(?:extension-|starter-kit)/);
assert.doesNotMatch(schemaTypes, /import\("\.\/main"\)/);
for (const [moduleUrl, source] of headlessGraph) {
  assert.doesNotMatch(
    source,
    /["'](?:react(?:-dom)?|@radix-ui\/themes)(?:\/[^"']*)?["']/,
    `The headless schema graph imports a UI dependency through ${moduleUrl}.`,
  );
  assert.doesNotMatch(
    moduleUrl,
    /\/(?:main\.js|styles\/[^/]+\.css)$/,
    `The headless schema graph reaches a UI entry through ${moduleUrl}.`,
  );
}

const typeScriptBin = fileURLToPath(new URL("../node_modules/typescript/bin/tsc", import.meta.url));
const nodeNextDeclarationCheck = spawnSync(
  process.execPath,
  [
    typeScriptBin,
    "--ignoreConfig",
    "--noEmit",
    "--strict",
    "--skipLibCheck",
    "false",
    "--moduleResolution",
    "nodenext",
    "--module",
    "nodenext",
    "--target",
    "es2020",
    fileURLToPath(schemaTypesUrl),
  ],
  { encoding: "utf8" },
);

assert.equal(
  nodeNextDeclarationCheck.status,
  0,
  [nodeNextDeclarationCheck.stdout, nodeNextDeclarationCheck.stderr].filter(Boolean).join("\n"),
);

if (typeof schemaModule.createScribeSchemaExtensions !== "function") {
  throw new Error("The built headless schema entry does not export its extension factory.");
}

if (typeof schemaModule.createScribeDocumentNodeCapabilityManifest !== "function") {
  throw new Error("The built headless schema entry does not export its node capability factory.");
}

const extensions = schemaModule.createScribeSchemaExtensions({ enableUndoRedo: false });

if (!Array.isArray(extensions) || extensions.length === 0) {
  throw new Error("The built headless schema entry returned no extensions.");
}

const schema = getSchema(extensions);
const capabilities = schemaModule.createScribeDocumentNodeCapabilityManifest(schema);

assert.deepEqual(Object.keys(capabilities).sort(), Object.keys(schema.nodes).sort());
assert.deepEqual(capabilities.paragraph.potentialOperations, [{ type: "replace_content" }]);
assert.deepEqual(capabilities.callout.potentialOperations, [
  { attributes: ["variant"], type: "set_attributes" },
]);
assert.deepEqual(capabilities.tableCell.potentialOperations, []);
assert.deepEqual(capabilities.externalLinkPreview.potentialOperations, []);

assert.equal(schema.marks.code.spec.excludes, "code");
assert.equal(schema.marks.code.excludes(schema.marks.code), true);
assert.equal(schema.marks.code.excludes(schema.marks.bold), false);
assert.equal(schema.marks.code.excludes(schema.marks.link), false);

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

const overlapFixture = generateJSON(
  [
    "<p>",
    "<strong><code>boldCode</code></strong> ",
    '<a href="https://example.com/api"><code>linkedCode</code></a>',
    "</p>",
  ].join(""),
  extensions,
);
const overlapMarks = new Map();
const collectOverlapMarks = (node) => {
  if (node.type === "text") {
    overlapMarks.set(node.text, (node.marks ?? []).map((mark) => mark.type).sort());
  }

  node.content?.forEach(collectOverlapMarks);
};

collectOverlapMarks(overlapFixture);
assert.deepEqual(overlapMarks.get("boldCode"), ["bold", "code"]);
assert.deepEqual(overlapMarks.get("linkedCode"), ["code", "link"]);
