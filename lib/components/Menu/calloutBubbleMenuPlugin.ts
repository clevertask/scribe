import type { Node as ProseMirrorNode, ResolvedPos } from "@tiptap/pm/model";
import type { EditorState } from "@tiptap/pm/state";
import { NodeSelection, PluginKey } from "@tiptap/pm/state";

export interface CalloutContext {
  node: ProseMirrorNode;
  position: number;
}

export const calloutBubbleMenuPluginKey = new PluginKey("scribeCalloutBubbleMenu");

const findCalloutAncestor = ($position: ResolvedPos): CalloutContext | null => {
  for (let depth = $position.depth; depth > 0; depth -= 1) {
    const node = $position.node(depth);

    if (node.type.name === "callout") {
      return {
        node,
        position: $position.before(depth),
      };
    }
  }

  return null;
};

export const getSelectionCalloutContext = (state: EditorState): CalloutContext | null => {
  const { selection } = state;

  if (selection instanceof NodeSelection && selection.node.type.name === "callout") {
    return {
      node: selection.node,
      position: selection.from,
    };
  }

  const fromCallout = findCalloutAncestor(selection.$from);
  const toCallout = findCalloutAncestor(selection.$to);

  if (!fromCallout || !toCallout || fromCallout.position !== toCallout.position) {
    return null;
  }

  return fromCallout;
};
