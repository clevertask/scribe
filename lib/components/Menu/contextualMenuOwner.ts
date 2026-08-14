import type { EditorState } from "@tiptap/pm/state";
import { getSelectionCalloutContext } from "./calloutBubbleMenuPlugin";
import { getSelectionTableContext } from "./tableBubbleMenuPlugin";

export type ContextualMenuOwner = "callout" | "table";

export const getSelectionContextualMenuOwner = (state: EditorState): ContextualMenuOwner | null => {
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
