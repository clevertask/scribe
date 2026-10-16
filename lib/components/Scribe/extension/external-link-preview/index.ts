import { createExternalLinkPreviewCommands } from "./commands";
import { ExternalLinkPreviewSchema } from "./schema";

/**
 * @deprecated Compatibility reader for saved external-link previews.
 * Legacy attributes are retained, but links render as ordinary authored text.
 * No metadata requests, preview creation UI, or automatic document conversions run.
 */
export const ExternalLinkPreview = ExternalLinkPreviewSchema.extend({
  addCommands() {
    return createExternalLinkPreviewCommands();
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
