import {
  EXTERNAL_LINK_PREVIEW_SELECTOR,
  EXTERNAL_LINK_PREVIEW_TARGET_SELECTOR,
  getExternalLinkPreviewHostname,
  getExternalLinkPreviewTitle,
  normalizeExternalLinkPreviewAttributes,
} from "./attributes";
import type { ExternalLinkPreviewAttributes } from "./types";

const DATA_ATTRIBUTE_BY_KEY = {
  href: "data-href",
  linkText: "data-link-text",
  display: "data-display",
  pageTitle: "data-page-title",
  description: "data-description",
  siteName: "data-site-name",
  faviconUrl: "data-favicon-url",
  imageUrl: "data-image-url",
  fetchedAt: "data-fetched-at",
} as const satisfies Record<keyof ExternalLinkPreviewAttributes, string>;

export const getExternalLinkPreviewAttributesFromElement = (
  element: Element,
): ExternalLinkPreviewAttributes | null => {
  const target = Array.from(element.children).find((child) =>
    child.matches(EXTERNAL_LINK_PREVIEW_TARGET_SELECTOR),
  );
  const href = element.getAttribute(DATA_ATTRIBUTE_BY_KEY.href) ?? target?.getAttribute("href");

  return normalizeExternalLinkPreviewAttributes({
    href,
    linkText: element.getAttribute(DATA_ATTRIBUTE_BY_KEY.linkText) ?? href,
    display: element.getAttribute(DATA_ATTRIBUTE_BY_KEY.display),
    pageTitle: element.getAttribute(DATA_ATTRIBUTE_BY_KEY.pageTitle),
    description: element.getAttribute(DATA_ATTRIBUTE_BY_KEY.description),
    siteName: element.getAttribute(DATA_ATTRIBUTE_BY_KEY.siteName),
    faviconUrl: element.getAttribute(DATA_ATTRIBUTE_BY_KEY.faviconUrl),
    imageUrl: element.getAttribute(DATA_ATTRIBUTE_BY_KEY.imageUrl),
    fetchedAt: element.getAttribute(DATA_ATTRIBUTE_BY_KEY.fetchedAt),
  });
};

export const getExternalLinkPreviewDataAttributes = (attributes: ExternalLinkPreviewAttributes) => {
  const dataAttributes: Record<string, string> = {
    "data-type": "external-link-preview",
  };

  (Object.keys(DATA_ATTRIBUTE_BY_KEY) as Array<keyof ExternalLinkPreviewAttributes>).forEach(
    (key) => {
      const value = attributes[key];

      if (value !== null) {
        dataAttributes[DATA_ATTRIBUTE_BY_KEY[key]] = value;
      }
    },
  );

  return dataAttributes;
};

const createTextSpan = (document: Document, hook: string, text: string) => {
  const span = document.createElement("span");

  span.setAttribute(hook, "");
  span.textContent = text;

  return span;
};

export const rebuildExternalLinkPreviewElement = (
  element: Element,
  attributes: ExternalLinkPreviewAttributes,
) => {
  const document = element.ownerDocument;
  const target = document.createElement("a");
  const main = document.createElement("span");
  const copy = document.createElement("span");

  Array.from(element.attributes).forEach((attribute) => element.removeAttribute(attribute.name));
  Object.entries(getExternalLinkPreviewDataAttributes(attributes)).forEach(([name, value]) => {
    element.setAttribute(name, value);
  });

  target.setAttribute("data-link-preview-target", "");
  target.setAttribute("href", attributes.href);
  target.setAttribute("target", "_blank");
  target.setAttribute("rel", "noopener noreferrer");

  if (attributes.display === "card" && attributes.imageUrl) {
    const image = document.createElement("img");

    image.setAttribute("data-link-preview-image", "");
    image.setAttribute("src", attributes.imageUrl);
    image.setAttribute("alt", "");
    target.append(image);
  }

  main.setAttribute("data-link-preview-main", "");

  if (attributes.faviconUrl) {
    const favicon = document.createElement("img");

    favicon.setAttribute("data-link-preview-favicon", "");
    favicon.setAttribute("src", attributes.faviconUrl);
    favicon.setAttribute("alt", "");
    main.append(favicon);
  } else {
    const fallback = createTextSpan(document, "data-link-preview-favicon-fallback", "↗");

    fallback.setAttribute("aria-hidden", "true");
    main.append(fallback);
  }

  copy.setAttribute("data-link-preview-copy", "");
  copy.append(
    createTextSpan(document, "data-link-preview-title", getExternalLinkPreviewTitle(attributes)),
  );

  const siteLabel = attributes.siteName || getExternalLinkPreviewHostname(attributes.href);

  if (siteLabel) {
    copy.append(createTextSpan(document, "data-link-preview-site", siteLabel));
  }

  if (attributes.display === "card" && attributes.description) {
    copy.append(createTextSpan(document, "data-link-preview-description", attributes.description));
  }

  main.append(copy);
  target.append(main);
  element.replaceChildren(target);
};

/**
 * Canonicalize a persisted preview wrapper. Returns false for an invalid destination.
 */
export const normalizeExternalLinkPreviewElement = (element: Element): boolean => {
  const attributes = getExternalLinkPreviewAttributesFromElement(element);

  if (!attributes) {
    return false;
  }

  rebuildExternalLinkPreviewElement(element, attributes);

  return true;
};

export const normalizeExternalLinkPreviewsInTree = (root: Element): void => {
  const previews = [
    ...(root.matches(EXTERNAL_LINK_PREVIEW_SELECTOR) ? [root] : []),
    ...Array.from(root.querySelectorAll(EXTERNAL_LINK_PREVIEW_SELECTOR)),
  ];

  previews.forEach((preview) => {
    const fallbackText =
      preview.getAttribute(DATA_ATTRIBUTE_BY_KEY.linkText) ?? preview.textContent ?? "";

    if (normalizeExternalLinkPreviewElement(preview)) {
      return;
    }

    if (preview === root) {
      Array.from(preview.attributes).forEach((attribute) =>
        preview.removeAttribute(attribute.name),
      );
      preview.replaceChildren(preview.ownerDocument.createTextNode(fallbackText));
      return;
    }

    preview.replaceWith(preview.ownerDocument.createTextNode(fallbackText));
  });
};
