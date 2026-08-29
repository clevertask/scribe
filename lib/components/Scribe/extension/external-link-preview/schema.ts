import { Node } from "@tiptap/core";
import {
  EXTERNAL_LINK_PREVIEW_NODE_NAME,
  isExternalLinkPreviewDisplay,
  normalizeExternalLinkPreviewAttributes,
  normalizeExternalLinkPreviewHref,
  normalizeExternalLinkPreviewLinkText,
  normalizeExternalLinkPreviewMediaUrl,
  normalizeExternalLinkPreviewMetadata,
} from "./attributes";
import { renderExternalLinkPreviewHTML } from "./render-html";
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
 * The persistence schema for Scribe external-link previews. Interactive
 * behavior is layered onto this node by the regular Scribe editor entry point.
 */
export const ExternalLinkPreviewSchema = Node.create<ExternalLinkPreviewOptions>({
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
      autoPreviewOnPaste: false,
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
});
