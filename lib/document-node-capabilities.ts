import type { Schema } from "@tiptap/pm/model";
import { CALLOUT_VARIANTS } from "./components/Scribe/extension/callout";
import { EXTERNAL_LINK_PREVIEW_DISPLAYS } from "./components/Scribe/extension/external-link-preview/types";

export const SCRIBE_DOCUMENT_NODE_CAPABILITY_ROLES = [
  "document",
  "text",
  "text_block",
  "heading",
  "container",
  "list",
  "list_item",
  "table",
  "table_row",
  "table_cell",
  "inline_atom",
  "block_atom",
  "separator",
] as const;

export type ScribeDocumentNodeCapabilityRole =
  (typeof SCRIBE_DOCUMENT_NODE_CAPABILITY_ROLES)[number];

export const SCRIBE_DOCUMENT_NODE_CONTENT_KINDS = [
  "none",
  "inline",
  "block",
  "structured",
] as const;

export type ScribeDocumentNodeContentKind = (typeof SCRIBE_DOCUMENT_NODE_CONTENT_KINDS)[number];

export type ScribeDocumentNodeAttributeShape =
  | {
      readonly kind: "boolean" | "number" | "number_array" | "string" | "unknown";
      readonly nullable?: boolean;
    }
  | {
      readonly kind: "enum";
      readonly nullable?: boolean;
      readonly values: readonly (boolean | number | string)[];
    };

export type ScribeDocumentNodePotentialOperation =
  | {
      readonly type: "replace_content";
    }
  | {
      readonly attributes: readonly string[];
      readonly type: "set_attributes";
    };

/**
 * Static structural facts about one Scribe-compatible node type.
 *
 * Potential operations are not permissions. An application must intersect them with its own
 * authorization, current-node context, parser support, revision checks, and size limits before it
 * advertises or executes a write.
 */
export type ScribeDocumentNodeCapability = {
  readonly attributes: Readonly<Record<string, ScribeDocumentNodeAttributeShape>>;
  readonly content: {
    readonly expression: string | null;
    readonly kind: ScribeDocumentNodeContentKind;
  };
  readonly label: string;
  readonly nodeType: string;
  readonly potentialOperations: readonly ScribeDocumentNodePotentialOperation[];
  readonly role: ScribeDocumentNodeCapabilityRole;
};

export type ScribeDocumentNodeCapabilityManifest = Readonly<
  Record<string, ScribeDocumentNodeCapability>
>;

export const defineScribeDocumentNodeCapability = <
  const Capability extends ScribeDocumentNodeCapability,
>(
  capability: Capability,
): Capability => capability;

const noAttributes = {} as const;
const noOperations = [] as const;
const replaceContent = [{ type: "replace_content" }] as const;

const builtInCapabilities = [
  defineScribeDocumentNodeCapability({
    attributes: noAttributes,
    content: { expression: "block+", kind: "block" },
    label: "Document",
    nodeType: "doc",
    potentialOperations: noOperations,
    role: "document",
  }),
  defineScribeDocumentNodeCapability({
    attributes: noAttributes,
    content: { expression: null, kind: "none" },
    label: "Text",
    nodeType: "text",
    potentialOperations: noOperations,
    role: "text",
  }),
  defineScribeDocumentNodeCapability({
    attributes: noAttributes,
    content: { expression: "inline*", kind: "inline" },
    label: "Paragraph",
    nodeType: "paragraph",
    potentialOperations: replaceContent,
    role: "text_block",
  }),
  defineScribeDocumentNodeCapability({
    attributes: {
      level: { kind: "enum", values: [1, 2, 3, 4, 5, 6] },
    },
    content: { expression: "inline*", kind: "inline" },
    label: "Heading",
    nodeType: "heading",
    potentialOperations: noOperations,
    role: "heading",
  }),
  defineScribeDocumentNodeCapability({
    attributes: noAttributes,
    content: { expression: "block+", kind: "block" },
    label: "Block quote",
    nodeType: "blockquote",
    potentialOperations: noOperations,
    role: "container",
  }),
  defineScribeDocumentNodeCapability({
    attributes: {
      language: { kind: "string", nullable: true },
    },
    content: { expression: "text*", kind: "inline" },
    label: "Code block",
    nodeType: "codeBlock",
    potentialOperations: noOperations,
    role: "text_block",
  }),
  defineScribeDocumentNodeCapability({
    attributes: noAttributes,
    content: { expression: null, kind: "none" },
    label: "Hard break",
    nodeType: "hardBreak",
    potentialOperations: noOperations,
    role: "inline_atom",
  }),
  defineScribeDocumentNodeCapability({
    attributes: noAttributes,
    content: { expression: null, kind: "none" },
    label: "Horizontal rule",
    nodeType: "horizontalRule",
    potentialOperations: noOperations,
    role: "separator",
  }),
  defineScribeDocumentNodeCapability({
    attributes: noAttributes,
    content: { expression: "listItem+", kind: "structured" },
    label: "Bullet list",
    nodeType: "bulletList",
    potentialOperations: noOperations,
    role: "list",
  }),
  defineScribeDocumentNodeCapability({
    attributes: {
      start: { kind: "number" },
      type: { kind: "string", nullable: true },
    },
    content: { expression: "listItem+", kind: "structured" },
    label: "Ordered list",
    nodeType: "orderedList",
    potentialOperations: noOperations,
    role: "list",
  }),
  defineScribeDocumentNodeCapability({
    attributes: noAttributes,
    content: { expression: "paragraph block*", kind: "structured" },
    label: "List item",
    nodeType: "listItem",
    potentialOperations: noOperations,
    role: "list_item",
  }),
  defineScribeDocumentNodeCapability({
    attributes: noAttributes,
    content: { expression: "taskItem+", kind: "structured" },
    label: "Task list",
    nodeType: "taskList",
    potentialOperations: noOperations,
    role: "list",
  }),
  defineScribeDocumentNodeCapability({
    attributes: {
      checked: { kind: "boolean" },
    },
    content: { expression: "paragraph block*", kind: "structured" },
    label: "Task item",
    nodeType: "taskItem",
    potentialOperations: noOperations,
    role: "list_item",
  }),
  defineScribeDocumentNodeCapability({
    attributes: {
      variant: { kind: "enum", values: CALLOUT_VARIANTS },
    },
    content: { expression: "block+", kind: "block" },
    label: "Callout",
    nodeType: "callout",
    potentialOperations: [{ attributes: ["variant"], type: "set_attributes" }],
    role: "container",
  }),
  defineScribeDocumentNodeCapability({
    attributes: noAttributes,
    content: { expression: "tableRow+", kind: "structured" },
    label: "Table",
    nodeType: "table",
    potentialOperations: noOperations,
    role: "table",
  }),
  defineScribeDocumentNodeCapability({
    attributes: noAttributes,
    content: { expression: "(tableCell | tableHeader)*", kind: "structured" },
    label: "Table row",
    nodeType: "tableRow",
    potentialOperations: noOperations,
    role: "table_row",
  }),
  ...(["tableCell", "tableHeader"] as const).map((nodeType) =>
    defineScribeDocumentNodeCapability({
      attributes: {
        align: { kind: "enum", nullable: true, values: ["left", "center", "right"] },
        colspan: { kind: "number" },
        colwidth: { kind: "number_array", nullable: true },
        rowspan: { kind: "number" },
      },
      content: { expression: "block+", kind: "block" },
      label: nodeType === "tableCell" ? "Table cell" : "Table header",
      nodeType,
      potentialOperations: noOperations,
      role: "table_cell",
    }),
  ),
  defineScribeDocumentNodeCapability({
    attributes: {
      alt: { kind: "string", nullable: true },
      height: { kind: "unknown", nullable: true },
      src: { kind: "string", nullable: true },
      title: { kind: "string", nullable: true },
      width: { kind: "unknown", nullable: true },
    },
    content: { expression: null, kind: "none" },
    label: "Image",
    nodeType: "image",
    potentialOperations: noOperations,
    role: "inline_atom",
  }),
  defineScribeDocumentNodeCapability({
    attributes: {
      name: { kind: "string", nullable: true },
    },
    content: { expression: null, kind: "none" },
    label: "Emoji",
    nodeType: "emoji",
    potentialOperations: noOperations,
    role: "inline_atom",
  }),
  ...(["inlineMath", "blockMath"] as const).map((nodeType) =>
    defineScribeDocumentNodeCapability({
      attributes: {
        latex: { kind: "string" },
      },
      content: { expression: null, kind: "none" },
      label: nodeType === "inlineMath" ? "Inline math" : "Block math",
      nodeType,
      potentialOperations: noOperations,
      role: nodeType === "inlineMath" ? "inline_atom" : "block_atom",
    }),
  ),
  defineScribeDocumentNodeCapability({
    attributes: {
      description: { kind: "string", nullable: true },
      display: { kind: "enum", values: EXTERNAL_LINK_PREVIEW_DISPLAYS },
      faviconUrl: { kind: "string", nullable: true },
      fetchedAt: { kind: "string", nullable: true },
      href: { kind: "string" },
      imageUrl: { kind: "string", nullable: true },
      linkText: { kind: "string" },
      pageTitle: { kind: "string", nullable: true },
      siteName: { kind: "string", nullable: true },
    },
    content: { expression: null, kind: "none" },
    label: "External link preview",
    nodeType: "externalLinkPreview",
    potentialOperations: noOperations,
    role: "inline_atom",
  }),
] as const satisfies readonly ScribeDocumentNodeCapability[];

const assertSameNames = (kind: string, actual: string[], expected: string[], nodeType: string) => {
  const sortedActual = [...actual].sort();
  const sortedExpected = [...expected].sort();

  if (
    sortedActual.length !== sortedExpected.length ||
    sortedActual.some((value, index) => value !== sortedExpected[index])
  ) {
    throw new Error(
      `Document node capability ${nodeType} ${kind} drifted from the Scribe schema: expected [${sortedExpected.join(
        ", ",
      )}], received [${sortedActual.join(", ")}].`,
    );
  }
};

const validateAttributeShape = (
  nodeType: string,
  attributeName: string,
  shape: ScribeDocumentNodeAttributeShape,
) => {
  if (shape.kind !== "enum") {
    return;
  }

  if (shape.values.length === 0 || new Set(shape.values).size !== shape.values.length) {
    throw new Error(
      `Document node capability ${nodeType}.${attributeName} requires unique enum values.`,
    );
  }
};

const getSchemaContentKind = (nodeType: Schema["nodes"][string]) => {
  if (nodeType.isLeaf) {
    return "none";
  }
  if (nodeType.inlineContent) {
    return "inline";
  }
  if (nodeType.spec.content === "block+" || nodeType.spec.content === "block*") {
    return "block";
  }
  return "structured";
};

const validateCapability = (schema: Schema, capability: ScribeDocumentNodeCapability) => {
  const nodeType = schema.nodes[capability.nodeType];
  if (!nodeType) {
    throw new Error(
      `Document node capability ${capability.nodeType} does not exist in the Scribe schema.`,
    );
  }

  const schemaContentExpression = nodeType.spec.content ?? null;
  if (schemaContentExpression !== capability.content.expression) {
    throw new Error(
      `Document node capability ${capability.nodeType} content drifted from the Scribe schema: expected ${String(
        schemaContentExpression,
      )}, received ${String(capability.content.expression)}.`,
    );
  }

  const schemaContentKind = getSchemaContentKind(nodeType);
  if (schemaContentKind !== capability.content.kind) {
    throw new Error(
      `Document node capability ${capability.nodeType} content kind drifted from the Scribe schema: expected ${schemaContentKind}, received ${capability.content.kind}.`,
    );
  }

  const capabilityAttributeNames = Object.keys(capability.attributes);
  assertSameNames(
    "attributes",
    capabilityAttributeNames,
    Object.keys(nodeType.spec.attrs ?? {}),
    capability.nodeType,
  );
  capabilityAttributeNames.forEach((attributeName) =>
    validateAttributeShape(
      capability.nodeType,
      attributeName,
      capability.attributes[attributeName]!,
    ),
  );

  const operationTypes = capability.potentialOperations.map((operation) => operation.type);
  if (new Set(operationTypes).size !== operationTypes.length) {
    throw new Error(
      `Document node capability ${capability.nodeType} repeats a potential operation.`,
    );
  }

  capability.potentialOperations.forEach((operation) => {
    if (operation.type === "replace_content" && schemaContentExpression === null) {
      throw new Error(
        `Document node capability ${capability.nodeType} cannot replace content on a leaf node.`,
      );
    }

    if (operation.type === "set_attributes") {
      if (operation.attributes.length === 0) {
        throw new Error(
          `Document node capability ${capability.nodeType} must name settable attributes.`,
        );
      }
      if (new Set(operation.attributes).size !== operation.attributes.length) {
        throw new Error(
          `Document node capability ${capability.nodeType} repeats a settable attribute.`,
        );
      }

      operation.attributes.forEach((attributeName) => {
        if (!Object.prototype.hasOwnProperty.call(capability.attributes, attributeName)) {
          throw new Error(
            `Document node capability ${capability.nodeType} cannot set unknown attribute ${attributeName}.`,
          );
        }
      });
    }
  });
};

const cloneAndFreezeCapability = (
  capability: ScribeDocumentNodeCapability,
): ScribeDocumentNodeCapability => {
  const attributes = Object.freeze(
    Object.fromEntries(
      Object.entries(capability.attributes).map(([attributeName, shape]) => [
        attributeName,
        Object.freeze(
          shape.kind === "enum"
            ? { ...shape, values: Object.freeze([...shape.values]) }
            : { ...shape },
        ),
      ]),
    ),
  );
  const potentialOperations = Object.freeze(
    capability.potentialOperations.map((operation) =>
      Object.freeze(
        operation.type === "set_attributes"
          ? { ...operation, attributes: Object.freeze([...operation.attributes]) }
          : { ...operation },
      ),
    ),
  );

  return Object.freeze({
    attributes,
    content: Object.freeze({ ...capability.content }),
    label: capability.label,
    nodeType: capability.nodeType,
    potentialOperations,
    role: capability.role,
  });
};

/**
 * Describe the exact node schema without importing Scribe's React editor.
 *
 * Consumer-owned nodes must provide an additional declaration. New schema nodes therefore fail
 * closed instead of silently inheriting write capabilities.
 */
export const createScribeDocumentNodeCapabilityManifest = (
  schema: Schema,
  additionalCapabilities: readonly ScribeDocumentNodeCapability[] = [],
): ScribeDocumentNodeCapabilityManifest => {
  const capabilities = new Map<string, ScribeDocumentNodeCapability>();

  const unknownAdditionalNodeTypes = additionalCapabilities
    .map((capability) => capability.nodeType)
    .filter((nodeType) => !schema.nodes[nodeType]);
  if (unknownAdditionalNodeTypes.length > 0) {
    throw new Error(
      `Document node capabilities do not exist in the Scribe schema: ${unknownAdditionalNodeTypes.join(
        ", ",
      )}.`,
    );
  }

  for (const capability of [...builtInCapabilities, ...additionalCapabilities]) {
    if (capabilities.has(capability.nodeType)) {
      throw new Error(
        `Document node capability ${capability.nodeType} is declared more than once.`,
      );
    }
    capabilities.set(capability.nodeType, capability);
  }

  const schemaNodeNames = Object.keys(schema.nodes);
  const declaredCapabilities = schemaNodeNames.map((nodeType) => capabilities.get(nodeType));
  const missingNodeTypes = schemaNodeNames.filter((_, index) => !declaredCapabilities[index]);

  if (missingNodeTypes.length > 0) {
    throw new Error(
      `Document node capabilities are missing for schema nodes: ${missingNodeTypes.join(", ")}.`,
    );
  }

  const manifestEntries = declaredCapabilities.map((capability) => {
    validateCapability(schema, capability!);
    return [capability!.nodeType, cloneAndFreezeCapability(capability!)] as const;
  });

  return Object.freeze(Object.fromEntries(manifestEntries));
};
