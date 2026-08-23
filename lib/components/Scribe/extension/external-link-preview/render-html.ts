import { mergeAttributes } from "@tiptap/core";
import type { DOMOutputSpec } from "@tiptap/pm/model";
import { getExternalLinkPreviewHostname, getExternalLinkPreviewTitle } from "./attributes";
import { getExternalLinkPreviewDataAttributes } from "./serialization";
import type { ExternalLinkPreviewAttributes } from "./types";

const createStaticMainContent = (attributes: ExternalLinkPreviewAttributes): DOMOutputSpec => {
  const copyChildren: DOMOutputSpec[] = [
    [
      "span",
      { "data-link-preview-title": "" },
      getExternalLinkPreviewTitle(attributes, attributes.display),
    ],
  ];
  const siteLabel =
    attributes.display === "card"
      ? attributes.siteName || getExternalLinkPreviewHostname(attributes.href)
      : null;

  if (siteLabel) {
    copyChildren.push(["span", { "data-link-preview-site": "" }, siteLabel]);
  }

  if (attributes.display === "card" && attributes.description) {
    copyChildren.push(["span", { "data-link-preview-description": "" }, attributes.description]);
  }

  const mainChildren: DOMOutputSpec[] = [
    attributes.display === "card" && attributes.faviconUrl
      ? ["img", { "data-link-preview-favicon": "", src: attributes.faviconUrl, alt: "" }]
      : ["span", { "data-link-preview-favicon-fallback": "", "aria-hidden": "true" }, "↗"],
    ["span", { "data-link-preview-copy": "" }, ...copyChildren] as DOMOutputSpec,
  ];

  return ["span", { "data-link-preview-main": "" }, ...mainChildren] as DOMOutputSpec;
};

export const renderExternalLinkPreviewHTML = ({
  attributes,
  HTMLAttributes,
}: {
  attributes: ExternalLinkPreviewAttributes;
  HTMLAttributes?: Record<string, unknown>;
}): DOMOutputSpec => {
  const targetChildren: DOMOutputSpec[] = [];

  if (attributes.display === "card" && attributes.imageUrl) {
    targetChildren.push([
      "img",
      { "data-link-preview-image": "", src: attributes.imageUrl, alt: "" },
    ]);
  }

  targetChildren.push(createStaticMainContent(attributes));

  return [
    "span",
    mergeAttributes(HTMLAttributes ?? {}, getExternalLinkPreviewDataAttributes(attributes), {
      class: `scribe-external-link-preview scribe-external-link-preview--${attributes.display}`,
    }),
    [
      "a",
      {
        "data-link-preview-target": "",
        href: attributes.href,
        target: "_blank",
        rel: "noopener noreferrer",
      },
      ...targetChildren,
    ] as DOMOutputSpec,
  ];
};
