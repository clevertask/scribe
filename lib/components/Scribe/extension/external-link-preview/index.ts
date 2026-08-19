import { Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import {
  EXTERNAL_LINK_PREVIEW_NODE_NAME,
  isExternalLinkPreviewDisplay,
  normalizeExternalLinkPreviewAttributes,
  normalizeExternalLinkPreviewHref,
  normalizeExternalLinkPreviewLinkText,
  normalizeExternalLinkPreviewMediaUrl,
  normalizeExternalLinkPreviewMetadata,
} from "./attributes";
import { createExternalLinkPreviewCommands } from "./commands";
import { ExternalLinkPreviewNodeView } from "./node-view";
import {
  createExternalLinkPreviewNormalizationPlugin,
  createExternalLinkPreviewNormalizationTransaction,
} from "./normalization";
import { renderExternalLinkPreviewHTML } from "./render-html";
import { createExternalLinkPreviewPastePlugin } from "./paste";
import {
  createExternalLinkPreviewPolicyPlugin,
  createExternalLinkPreviewPolicyTransaction,
} from "./policy";
import { createExternalLinkPreviewResolverPlugin } from "./resolver";
import { getExternalLinkPreviewAttributesFromElement } from "./serialization";
import type { ExternalLinkPreviewOptions } from "./types";

const validateExternalHref = (value: unknown) => {
  if (normalizeExternalLinkPreviewHref(value) !== value) {
    throw new RangeError("External link previews require an absolute HTTP(S) URL.");
  }
};

const validateLinkText = (value: unknown) => {
  if (normalizeExternalLinkPreviewLinkText(value) !== value) {
    throw new RangeError("External link previews require non-empty fallback link text.");
  }
};

const validateDisplay = (value: unknown) => {
  if (!isExternalLinkPreviewDisplay(value)) {
    throw new RangeError(`Invalid external link preview display: ${String(value)}`);
  }
};

const validateMetadataText = (
  key: "pageTitle" | "description" | "siteName" | "fetchedAt",
  value: unknown,
) => {
  if (value === null) {
    return;
  }

  const normalized = normalizeExternalLinkPreviewMetadata({ [key]: value })[key];

  if (normalized !== value) {
    throw new RangeError(`Invalid external link preview ${key}.`);
  }
};

const validateMediaUrl = (key: "faviconUrl" | "imageUrl", value: unknown) => {
  if (value !== null && normalizeExternalLinkPreviewMediaUrl(value) !== value) {
    throw new RangeError(`Invalid external link preview ${key}.`);
  }
};

/**
 * Backend-agnostic enhanced external links. Consumers own metadata fetching through
 * the optional resolver; Scribe owns only presentation, conversion, and persistence.
 */
export const ExternalLinkPreview = Node.create<ExternalLinkPreviewOptions>({
  name: EXTERNAL_LINK_PREVIEW_NODE_NAME,

  priority: 1_100,

  group: "inline",

  inline: true,

  atom: true,

  selectable: true,

  draggable: false,

  addOptions() {
    return {
      HTMLAttributes: {},
      resolve: undefined,
      shouldPreview: undefined,
    };
  },

  addAttributes() {
    return {
      href: {
        default: "",
        rendered: false,
        validate: validateExternalHref,
      },
      linkText: {
        default: "",
        rendered: false,
        validate: validateLinkText,
      },
      display: {
        default: "compact",
        rendered: false,
        validate: validateDisplay,
      },
      pageTitle: {
        default: null,
        rendered: false,
        validate: (value) => validateMetadataText("pageTitle", value),
      },
      description: {
        default: null,
        rendered: false,
        validate: (value) => validateMetadataText("description", value),
      },
      siteName: {
        default: null,
        rendered: false,
        validate: (value) => validateMetadataText("siteName", value),
      },
      faviconUrl: {
        default: null,
        rendered: false,
        validate: (value) => validateMediaUrl("faviconUrl", value),
      },
      imageUrl: {
        default: null,
        rendered: false,
        validate: (value) => validateMediaUrl("imageUrl", value),
      },
      fetchedAt: {
        default: null,
        rendered: false,
        validate: (value) => validateMetadataText("fetchedAt", value),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-type="external-link-preview"]',
        getAttrs: (element) => getExternalLinkPreviewAttributesFromElement(element) ?? false,
      },
    ];
  },

  renderHTML({ node }) {
    const attributes = normalizeExternalLinkPreviewAttributes(node.attrs);

    if (!attributes) {
      return ["span", { "data-type": "external-link-preview" }, "Invalid external link"];
    }

    return renderExternalLinkPreviewHTML({
      attributes,
      HTMLAttributes: this.options.HTMLAttributes,
    });
  },

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
        resolveMetadata: Boolean(this.options.resolve),
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
