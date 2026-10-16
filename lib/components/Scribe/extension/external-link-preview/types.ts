/** @deprecated Retained for saved external-link-preview compatibility. */
export const EXTERNAL_LINK_PREVIEW_DISPLAYS = ["compact", "card"] as const;

/** @deprecated Retained for saved external-link-preview compatibility. */
export type ExternalLinkPreviewDisplay = (typeof EXTERNAL_LINK_PREVIEW_DISPLAYS)[number];

/** @deprecated Retained for saved external-link-preview compatibility. */
export interface ExternalLinkPreviewMetadata {
  pageTitle?: string | null;
  description?: string | null;
  siteName?: string | null;
  faviconUrl?: string | null;
  imageUrl?: string | null;
  fetchedAt?: string | null;
}

/** @deprecated Retained for saved external-link-preview compatibility. */
export interface ExternalLinkPreviewAttributes {
  href: string;
  linkText: string;
  display: ExternalLinkPreviewDisplay;
  pageTitle: string | null;
  description: string | null;
  siteName: string | null;
  faviconUrl: string | null;
  imageUrl: string | null;
  fetchedAt: string | null;
}

/** @deprecated Retained for saved external-link-preview compatibility. */
export interface ExternalLinkPreviewResolverContext {
  signal: AbortSignal;
}

/** @deprecated Retained for saved external-link-preview compatibility. */
export type ExternalLinkPreviewResolver = (
  href: string,
  context: ExternalLinkPreviewResolverContext,
) => Promise<ExternalLinkPreviewMetadata | null>;

/** @deprecated Retained for saved external-link-preview compatibility. */
export interface ExternalLinkPreviewOptions {
  HTMLAttributes?: Record<string, unknown>;
  /** @deprecated Ignored. Paste uses native Tiptap Link behavior. */
  autoPreviewOnPaste?: boolean;
  /** @deprecated Ignored. Scribe no longer fetches preview metadata. */
  resolve?: ExternalLinkPreviewResolver;
  /** @deprecated Ignored. Saved nodes are never converted by a preview policy. */
  shouldPreview?: (href: string) => boolean;
}

/** @deprecated Retained for saved external-link-preview compatibility. */
export interface InsertExternalLinkPreviewOptions extends ExternalLinkPreviewMetadata {
  href: string;
  linkText?: string;
  display?: ExternalLinkPreviewDisplay;
}

/** @deprecated Retained for saved external-link-preview compatibility. */
export interface UpdateExternalLinkPreviewOptions extends ExternalLinkPreviewMetadata {
  href?: string;
  linkText?: string;
}

/** @deprecated Retained for saved external-link-preview compatibility. */
export type ExternalLinkDisplay = "plain" | ExternalLinkPreviewDisplay;

/** @deprecated Retained for saved external-link-preview compatibility. */
export type ExternalLinkPreviewResolutionStatus = "idle" | "loading" | "error";
