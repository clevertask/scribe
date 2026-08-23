/** @experimental Part of Scribe's evolving external-link-preview contract. */
export const EXTERNAL_LINK_PREVIEW_DISPLAYS = ["compact", "card"] as const;

/** @experimental Part of Scribe's evolving external-link-preview contract. */
export type ExternalLinkPreviewDisplay = (typeof EXTERNAL_LINK_PREVIEW_DISPLAYS)[number];

/** @experimental Part of Scribe's evolving external-link-preview contract. */
export interface ExternalLinkPreviewMetadata {
  pageTitle?: string | null;
  description?: string | null;
  siteName?: string | null;
  faviconUrl?: string | null;
  imageUrl?: string | null;
  fetchedAt?: string | null;
}

/** @experimental Part of Scribe's evolving external-link-preview contract. */
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

/** @experimental Part of Scribe's evolving external-link-preview contract. */
export interface ExternalLinkPreviewResolverContext {
  signal: AbortSignal;
}

/** @experimental Part of Scribe's evolving external-link-preview contract. */
export type ExternalLinkPreviewResolver = (
  href: string,
  context: ExternalLinkPreviewResolverContext,
) => Promise<ExternalLinkPreviewMetadata | null>;

/** @experimental Part of Scribe's evolving external-link-preview contract. */
export interface ExternalLinkPreviewOptions {
  HTMLAttributes?: Record<string, unknown>;
  /**
   * Automatically turn a standalone pasted URL into a local Compact preview.
   * This does not request metadata.
   * @default false
   */
  autoPreviewOnPaste?: boolean;
  /** Resolve metadata when a Preview card needs enrichment. */
  resolve?: ExternalLinkPreviewResolver;
  shouldPreview?: (href: string) => boolean;
}

/** @experimental Part of Scribe's evolving external-link-preview contract. */
export interface InsertExternalLinkPreviewOptions extends ExternalLinkPreviewMetadata {
  href: string;
  linkText?: string;
  display?: ExternalLinkPreviewDisplay;
}

/** @experimental Part of Scribe's evolving external-link-preview contract. */
export interface UpdateExternalLinkPreviewOptions extends ExternalLinkPreviewMetadata {
  href?: string;
  linkText?: string;
}

/** @experimental Part of Scribe's evolving external-link-preview contract. */
export type ExternalLinkDisplay = "plain" | ExternalLinkPreviewDisplay;

/** @experimental Part of Scribe's evolving external-link-preview contract. */
export type ExternalLinkPreviewResolutionStatus = "idle" | "loading" | "error";
