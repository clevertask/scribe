export const EXTERNAL_LINK_PREVIEW_DISPLAYS = ["compact", "card"] as const;

export type ExternalLinkPreviewDisplay = (typeof EXTERNAL_LINK_PREVIEW_DISPLAYS)[number];

export interface ExternalLinkPreviewMetadata {
  pageTitle?: string | null;
  description?: string | null;
  siteName?: string | null;
  faviconUrl?: string | null;
  imageUrl?: string | null;
  fetchedAt?: string | null;
}

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

export interface ExternalLinkPreviewResolverContext {
  signal: AbortSignal;
}

export type ExternalLinkPreviewResolver = (
  href: string,
  context: ExternalLinkPreviewResolverContext,
) => Promise<ExternalLinkPreviewMetadata | null>;

export interface ExternalLinkPreviewOptions {
  HTMLAttributes?: Record<string, unknown>;
  resolve?: ExternalLinkPreviewResolver;
  shouldPreview?: (href: string) => boolean;
}

export interface InsertExternalLinkPreviewOptions extends ExternalLinkPreviewMetadata {
  href: string;
  linkText?: string;
  display?: ExternalLinkPreviewDisplay;
}

export interface UpdateExternalLinkPreviewOptions extends ExternalLinkPreviewMetadata {
  href?: string;
  linkText?: string;
}

export type ExternalLinkDisplay = "plain" | ExternalLinkPreviewDisplay;

export type ExternalLinkPreviewResolutionStatus = "idle" | "loading" | "error";
