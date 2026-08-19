import {
  EXTERNAL_LINK_PREVIEW_DISPLAYS,
  type ExternalLinkPreviewAttributes,
  type ExternalLinkPreviewDisplay,
  type ExternalLinkPreviewMetadata,
} from "./types";

const ROOT_RELATIVE_PATH_PATTERN = /^\/(?![\\/])/;
const ABSOLUTE_HTTP_URL_PATTERN = /^https?:\/\//i;
const MAX_HREF_LENGTH = 16_384;
const MAX_LINK_TEXT_LENGTH = 16_384;
const MAX_PAGE_TITLE_LENGTH = 512;
const MAX_DESCRIPTION_LENGTH = 2_048;
const MAX_SITE_NAME_LENGTH = 256;
const MAX_MEDIA_URL_LENGTH = 16_384;
const MAX_FETCHED_AT_LENGTH = 128;
const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const EXTERNAL_LINK_PREVIEW_METADATA_KEYS = [
  "pageTitle",
  "description",
  "siteName",
  "faviconUrl",
  "imageUrl",
  "fetchedAt",
] as const satisfies ReadonlyArray<keyof ExternalLinkPreviewMetadata>;

const containsAsciiControlCharacter = (value: string) => {
  for (const character of value) {
    const characterCode = character.charCodeAt(0);

    if (characterCode <= 31 || characterCode === 127) {
      return true;
    }
  }

  return false;
};

const hasUrlCredentials = (value: string) => {
  const authorityStart = value.indexOf("//") + 2;
  const authorityEndCandidates = ["/", "?", "#"]
    .map((separator) => value.indexOf(separator, authorityStart))
    .filter((position) => position >= 0);
  const authorityEnd = authorityEndCandidates.length
    ? Math.min(...authorityEndCandidates)
    : value.length;

  return value.slice(authorityStart, authorityEnd).includes("@");
};

/** @experimental Part of Scribe's evolving external-link-preview contract. */
export const EXTERNAL_LINK_PREVIEW_NODE_NAME = "externalLinkPreview";
export const EXTERNAL_LINK_PREVIEW_SELECTOR = 'span[data-type="external-link-preview"]';
export const EXTERNAL_LINK_PREVIEW_TARGET_SELECTOR = "a[data-link-preview-target]";

export const isExternalLinkPreviewDisplay = (value: unknown): value is ExternalLinkPreviewDisplay =>
  typeof value === "string" && EXTERNAL_LINK_PREVIEW_DISPLAYS.some((display) => display === value);

const normalizeBoundedText = (
  value: unknown,
  maximumLength: number,
  { preserveWhitespace = false }: { preserveWhitespace?: boolean } = {},
) => {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = preserveWhitespace ? value : value.trim();

  if (
    !normalized.trim() ||
    normalized.length > maximumLength ||
    containsAsciiControlCharacter(normalized)
  ) {
    return null;
  }

  return normalized;
};

export const normalizeExternalLinkPreviewLinkText = (value: unknown): string | null =>
  normalizeBoundedText(value, MAX_LINK_TEXT_LENGTH, { preserveWhitespace: true });

/** Validate an authored preview destination without canonicalizing or removing query parameters. */
export const normalizeExternalLinkPreviewHref = (value: unknown): string | null => {
  const href = normalizeBoundedText(value, MAX_HREF_LENGTH);

  if (
    !href ||
    href.includes("\\") ||
    !ABSOLUTE_HTTP_URL_PATTERN.test(href) ||
    hasUrlCredentials(href)
  ) {
    return null;
  }

  try {
    const url = new URL(href);

    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) {
      return null;
    }

    return href;
  } catch {
    return null;
  }
};

/** Preview media may be proxied by a consumer through a strict root-relative path. */
export const normalizeExternalLinkPreviewMediaUrl = (value: unknown): string | null => {
  const mediaUrl = normalizeBoundedText(value, MAX_MEDIA_URL_LENGTH);

  if (!mediaUrl || mediaUrl.includes("\\")) {
    return null;
  }

  if (ROOT_RELATIVE_PATH_PATTERN.test(mediaUrl)) {
    return mediaUrl;
  }

  if (!ABSOLUTE_HTTP_URL_PATTERN.test(mediaUrl) || hasUrlCredentials(mediaUrl)) {
    return null;
  }

  try {
    const url = new URL(mediaUrl);

    return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password
      ? mediaUrl
      : null;
  } catch {
    return null;
  }
};

const normalizeFetchedAt = (value: unknown) => {
  const fetchedAt = normalizeBoundedText(value, MAX_FETCHED_AT_LENGTH);

  if (!fetchedAt || !ISO_TIMESTAMP_PATTERN.test(fetchedAt)) {
    return null;
  }

  const timestamp = new Date(fetchedAt);

  return Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString();
};

export const normalizeExternalLinkPreviewMetadata = (
  metadata: ExternalLinkPreviewMetadata | Record<string, unknown> | null | undefined,
): Required<ExternalLinkPreviewMetadata> => ({
  pageTitle: normalizeBoundedText(metadata?.pageTitle, MAX_PAGE_TITLE_LENGTH),
  description: normalizeBoundedText(metadata?.description, MAX_DESCRIPTION_LENGTH),
  siteName: normalizeBoundedText(metadata?.siteName, MAX_SITE_NAME_LENGTH),
  faviconUrl: normalizeExternalLinkPreviewMediaUrl(metadata?.faviconUrl),
  imageUrl: normalizeExternalLinkPreviewMediaUrl(metadata?.imageUrl),
  fetchedAt: normalizeFetchedAt(metadata?.fetchedAt),
});

/** Normalize only metadata fields that a resolver deliberately returned. */
export const normalizeExternalLinkPreviewMetadataPatch = (
  metadata: ExternalLinkPreviewMetadata,
): Partial<Required<ExternalLinkPreviewMetadata>> => {
  const normalized = normalizeExternalLinkPreviewMetadata(metadata);
  const patch: Partial<Required<ExternalLinkPreviewMetadata>> = {};

  EXTERNAL_LINK_PREVIEW_METADATA_KEYS.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(metadata, key) && metadata[key] !== undefined) {
      patch[key] = normalized[key];
    }
  });

  return patch;
};

export const normalizeExternalLinkPreviewAttributes = (
  input: Partial<Record<keyof ExternalLinkPreviewAttributes, unknown>>,
): ExternalLinkPreviewAttributes | null => {
  const href = normalizeExternalLinkPreviewHref(input.href);

  if (!href) {
    return null;
  }

  const metadata = normalizeExternalLinkPreviewMetadata(input);
  const linkText = normalizeExternalLinkPreviewLinkText(input.linkText) ?? href;

  return {
    href,
    linkText,
    display: isExternalLinkPreviewDisplay(input.display) ? input.display : "compact",
    ...metadata,
  };
};

export const getExternalLinkPreviewHostname = (href: string) => {
  try {
    return new URL(href).hostname;
  } catch {
    return href;
  }
};

export const getExternalLinkPreviewTitle = (
  attributes: Pick<ExternalLinkPreviewAttributes, "href" | "pageTitle" | "siteName">,
) => attributes.pageTitle || attributes.siteName || getExternalLinkPreviewHostname(attributes.href);
