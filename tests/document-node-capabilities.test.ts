import { getSchema, Node } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { initExtensions } from "../lib/components/Scribe/extension";
import {
  createScribeDocumentNodeCapabilityManifest,
  createScribeSchemaExtensions,
  defineScribeDocumentNodeCapability,
} from "../lib/schema";

const expectedScribeNodeTypes = [
  "blockquote",
  "blockMath",
  "bulletList",
  "callout",
  "codeBlock",
  "doc",
  "emoji",
  "externalLinkPreview",
  "hardBreak",
  "heading",
  "horizontalRule",
  "image",
  "inlineMath",
  "listItem",
  "orderedList",
  "paragraph",
  "table",
  "tableCell",
  "tableHeader",
  "tableRow",
  "taskItem",
  "taskList",
  "text",
] as const;

const ResourceReference = Node.create({
  name: "resourceReference",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      resourceId: { default: null },
      resourceType: { default: "task" },
    };
  },
});

const resourceReferenceCapability = defineScribeDocumentNodeCapability({
  attributes: {
    resourceId: { kind: "string", nullable: true },
    resourceType: { kind: "enum", values: ["task", "document"] },
  },
  content: { expression: null, kind: "none" },
  label: "Resource reference",
  nodeType: "resourceReference",
  potentialOperations: [],
  role: "inline_atom",
});

describe("Scribe document node capabilities", () => {
  it("covers the complete headless schema with conservative potential operations", () => {
    const schema = getSchema(createScribeSchemaExtensions({ enableUndoRedo: false }));
    const manifest = createScribeDocumentNodeCapabilityManifest(schema);

    expect(Object.keys(schema.nodes).sort()).toEqual([...expectedScribeNodeTypes].sort());
    expect(Object.keys(manifest).sort()).toEqual([...expectedScribeNodeTypes].sort());

    expect(manifest.paragraph).toEqual({
      attributes: {},
      content: { expression: "inline*", kind: "inline" },
      label: "Paragraph",
      nodeType: "paragraph",
      potentialOperations: [{ type: "replace_content" }],
      role: "text_block",
    });
    expect(manifest.callout).toEqual({
      attributes: {
        variant: {
          kind: "enum",
          values: ["info", "tip", "warning", "caution"],
        },
      },
      content: { expression: "block+", kind: "block" },
      label: "Callout",
      nodeType: "callout",
      potentialOperations: [{ attributes: ["variant"], type: "set_attributes" }],
      role: "container",
    });

    expect(manifest.heading.potentialOperations).toEqual([]);
    expect(manifest.table.potentialOperations).toEqual([]);
    expect(manifest.tableCell).toMatchObject({
      attributes: {
        align: { kind: "enum", nullable: true, values: ["left", "center", "right"] },
        colspan: { kind: "number" },
        colwidth: { kind: "number_array", nullable: true },
        rowspan: { kind: "number" },
      },
      content: { expression: "block+", kind: "block" },
      potentialOperations: [],
      role: "table_cell",
    });
    expect(manifest.externalLinkPreview).toMatchObject({
      content: { expression: null, kind: "none" },
      potentialOperations: [],
      role: "inline_atom",
    });
  });

  it("describes the same nodes for headless and interactive schema extensions", () => {
    const headlessSchema = getSchema(createScribeSchemaExtensions({ enableUndoRedo: false }));
    const interactiveSchema = getSchema(initExtensions({ enableUndoRedo: false }));

    expect(createScribeDocumentNodeCapabilityManifest(interactiveSchema)).toEqual(
      createScribeDocumentNodeCapabilityManifest(headlessSchema),
    );
  });

  it("returns fresh deeply frozen manifests without freezing caller declarations", () => {
    const schema = getSchema(createScribeSchemaExtensions({ enableUndoRedo: false }));
    const firstManifest = createScribeDocumentNodeCapabilityManifest(schema);

    expect(Object.isFrozen(firstManifest)).toBe(true);
    expect(Object.isFrozen(firstManifest.callout)).toBe(true);
    expect(Object.isFrozen(firstManifest.callout.content)).toBe(true);
    expect(Object.isFrozen(firstManifest.callout.attributes)).toBe(true);
    expect(Object.isFrozen(firstManifest.callout.attributes.variant)).toBe(true);
    expect(Object.isFrozen(firstManifest.callout.potentialOperations)).toBe(true);
    expect(Object.isFrozen(firstManifest.callout.potentialOperations[0]?.attributes)).toBe(true);
    expect(() => {
      (
        firstManifest.callout.content as unknown as {
          kind: string;
        }
      ).kind = "none";
    }).toThrow(TypeError);

    const secondManifest = createScribeDocumentNodeCapabilityManifest(schema);
    expect(secondManifest.callout).not.toBe(firstManifest.callout);
    expect(secondManifest.callout.content.kind).toBe("block");
    expect(Object.isFrozen(resourceReferenceCapability)).toBe(false);
  });

  it("requires consumer-owned nodes to provide an exact read-only declaration", () => {
    const schema = getSchema([
      ...createScribeSchemaExtensions({ enableUndoRedo: false }),
      ResourceReference,
    ]);

    expect(() => createScribeDocumentNodeCapabilityManifest(schema)).toThrow(
      "Document node capabilities are missing for schema nodes: resourceReference.",
    );

    const manifest = createScribeDocumentNodeCapabilityManifest(schema, [
      resourceReferenceCapability,
    ]);
    expect(manifest.resourceReference).toEqual(resourceReferenceCapability);
    expect(manifest.resourceReference.potentialOperations).toEqual([]);
  });

  it("rejects consumer declarations that drift from schema content or attributes", () => {
    const schema = getSchema([
      ...createScribeSchemaExtensions({ enableUndoRedo: false }),
      ResourceReference,
    ]);

    expect(() =>
      createScribeDocumentNodeCapabilityManifest(schema, [
        {
          ...resourceReferenceCapability,
          content: { expression: "inline*", kind: "inline" },
        },
      ]),
    ).toThrow("Document node capability resourceReference content drifted from the Scribe schema");

    expect(() =>
      createScribeDocumentNodeCapabilityManifest(schema, [
        {
          ...resourceReferenceCapability,
          content: { expression: null, kind: "block" },
        },
      ]),
    ).toThrow(
      "Document node capability resourceReference content kind drifted from the Scribe schema",
    );

    expect(() =>
      createScribeDocumentNodeCapabilityManifest(schema, [
        {
          ...resourceReferenceCapability,
          attributes: {
            resourceType: resourceReferenceCapability.attributes.resourceType,
          },
        },
      ]),
    ).toThrow(
      "Document node capability resourceReference attributes drifted from the Scribe schema",
    );
  });

  it("rejects duplicate declarations and attribute operations outside the declared shape", () => {
    const schema = getSchema([
      ...createScribeSchemaExtensions({ enableUndoRedo: false }),
      ResourceReference,
    ]);

    expect(() =>
      createScribeDocumentNodeCapabilityManifest(schema, [
        resourceReferenceCapability,
        resourceReferenceCapability,
      ]),
    ).toThrow("Document node capability resourceReference is declared more than once.");

    expect(() =>
      createScribeDocumentNodeCapabilityManifest(schema, [
        {
          ...resourceReferenceCapability,
          potentialOperations: [{ attributes: ["missingAttribute"], type: "set_attributes" }],
        },
      ]),
    ).toThrow(
      "Document node capability resourceReference cannot set unknown attribute missingAttribute.",
    );

    const builtInSchema = getSchema(createScribeSchemaExtensions({ enableUndoRedo: false }));
    expect(() =>
      createScribeDocumentNodeCapabilityManifest(builtInSchema, [resourceReferenceCapability]),
    ).toThrow("Document node capabilities do not exist in the Scribe schema: resourceReference.");
  });
});
