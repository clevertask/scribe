import type { Extensions } from "@tiptap/core";
import { createScribeSchemaExtensionSet } from "./schema-extensions";

export {
  createScribeDocumentNodeCapabilityManifest,
  defineScribeDocumentNodeCapability,
  SCRIBE_DOCUMENT_NODE_CAPABILITY_ROLES,
  SCRIBE_DOCUMENT_NODE_CONTENT_KINDS,
} from "./document-node-capabilities.js";
export type {
  ScribeDocumentNodeAttributeShape,
  ScribeDocumentNodeCapability,
  ScribeDocumentNodeCapabilityManifest,
  ScribeDocumentNodeCapabilityRole,
  ScribeDocumentNodeContentKind,
  ScribeDocumentNodePotentialOperation,
} from "./document-node-capabilities.js";

export type ScribeSchemaExtensionOptions = {
  /**
   * Enables Scribe's built-in undo and redo history. Schema-only consumers can
   * disable it because history does not affect the ProseMirror document model.
   */
  enableUndoRedo?: boolean;
};

/**
 * Build the schema-bearing Scribe extensions without importing Scribe's React
 * editor UI or stylesheet.
 *
 * Consumer-owned document nodes must be appended separately. For example,
 * CleverTask adds its resource-reference node to the returned extension list.
 */
export const createScribeSchemaExtensions = (
  options: ScribeSchemaExtensionOptions = {},
): Extensions => Object.values(createScribeSchemaExtensionSet(options));
