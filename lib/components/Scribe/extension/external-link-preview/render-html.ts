import { mergeAttributes } from "@tiptap/core";
import type { DOMOutputSpec } from "@tiptap/pm/model";
import { getExternalLinkPreviewDataAttributes } from "./serialization";
import type { ExternalLinkPreviewAttributes } from "./types";

/** Preserve the legacy wrapper and attributes while displaying only its authored link. */
export const renderExternalLinkPreviewHTML = ({
  attributes,
  HTMLAttributes,
}: {
  attributes: ExternalLinkPreviewAttributes;
  HTMLAttributes?: Record<string, unknown>;
}): DOMOutputSpec => [
  "span",
  mergeAttributes(HTMLAttributes ?? {}, getExternalLinkPreviewDataAttributes(attributes)),
  [
    "a",
    {
      "data-link-preview-target": "",
      href: attributes.href,
      target: "_blank",
      rel: "noopener noreferrer",
    },
    attributes.linkText,
  ],
];
