import type { EditorState } from "@tiptap/pm/state";
import { getSelectionCalloutContext } from "./calloutBubbleMenuPlugin";
import { getSelectionLinkContext } from "./linkBubbleMenuPlugin";
import { getSelectionTableContext } from "./tableBubbleMenuPlugin";

export type ContextualMenuOwner = "callout" | "link" | "table";

export const getSelectionContextualMenuOwner = (state: EditorState): ContextualMenuOwner | null => {
  const linkContext = getSelectionLinkContext(state);

  if (
    linkContext?.kind === "preview" ||
    (linkContext?.kind === "plain" &&
      !state.selection.empty &&
      state.selection.from === linkContext.from &&
      state.selection.to === linkContext.to)
  ) {
    return "link";
  }

  const calloutContext = getSelectionCalloutContext(state);
  const tableContext = getSelectionTableContext(state);

  if (!calloutContext) {
    return tableContext ? "table" : null;
  }

  if (!tableContext) {
    return "callout";
  }

  return calloutContext.position > tableContext.position ? "callout" : "table";
};
