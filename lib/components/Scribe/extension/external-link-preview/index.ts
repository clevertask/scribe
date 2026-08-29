import { ReactNodeViewRenderer } from "@tiptap/react";
import { createExternalLinkPreviewCommands } from "./commands";
import { ExternalLinkPreviewNodeView } from "./node-view";
import {
  createExternalLinkPreviewNormalizationPlugin,
  createExternalLinkPreviewNormalizationTransaction,
} from "./normalization";
import { createExternalLinkPreviewPastePlugin } from "./paste";
import {
  createExternalLinkPreviewPolicyPlugin,
  createExternalLinkPreviewPolicyTransaction,
} from "./policy";
import { createExternalLinkPreviewResolverPlugin } from "./resolver";
import { ExternalLinkPreviewSchema } from "./schema";
import type { ExternalLinkPreviewOptions } from "./types";

/**
 * Backend-agnostic enhanced external links. Consumers own metadata fetching through
 * the optional resolver; Scribe owns only presentation, conversion, and persistence.
 *
 * @experimental The link-preview API and built-in UI may change while this feature is tested.
 */
export const ExternalLinkPreview = ExternalLinkPreviewSchema.extend<ExternalLinkPreviewOptions>({
  addCommands() {
    return createExternalLinkPreviewCommands({
      resolveMetadata: Boolean(this.options.resolve),
      shouldPreview: this.options.shouldPreview,
    });
  },

  addNodeView() {
    return ReactNodeViewRenderer(ExternalLinkPreviewNodeView, {
      trackNodeViewPosition: true,
    });
  },

  onCreate() {
    if (this.editor.isDestroyed) {
      return;
    }

    const normalizationTransaction = createExternalLinkPreviewNormalizationTransaction(
      this.editor.state,
    );

    if (normalizationTransaction) {
      this.editor.view.dispatch(normalizationTransaction.setMeta("addToHistory", false));
    }

    const policyTransaction = createExternalLinkPreviewPolicyTransaction(
      this.editor.state,
      this.options.shouldPreview,
    );

    if (policyTransaction) {
      this.editor.view.dispatch(policyTransaction);
    }
  },

  addProseMirrorPlugins() {
    return [
      createExternalLinkPreviewPastePlugin({
        previewType: this.type,
        autoPreviewOnPaste: this.options.autoPreviewOnPaste === true,
        shouldPreview: this.options.shouldPreview,
      }),
      createExternalLinkPreviewPolicyPlugin(this.options.shouldPreview),
      createExternalLinkPreviewNormalizationPlugin(),
      createExternalLinkPreviewResolverPlugin({
        editor: this.editor,
        resolve: this.options.resolve,
      }),
    ];
  },
});

export { EXTERNAL_LINK_PREVIEW_NODE_NAME } from "./attributes";
export { EXTERNAL_LINK_PREVIEW_DISPLAYS } from "./types";
export type {
  ExternalLinkDisplay,
  ExternalLinkPreviewAttributes,
  ExternalLinkPreviewDisplay,
  ExternalLinkPreviewMetadata,
  ExternalLinkPreviewOptions,
  ExternalLinkPreviewResolutionStatus,
  ExternalLinkPreviewResolver,
  ExternalLinkPreviewResolverContext,
  InsertExternalLinkPreviewOptions,
  UpdateExternalLinkPreviewOptions,
} from "./types";
