import type { Node as ProseMirrorNode, ResolvedPos } from "@tiptap/pm/model";
import type { EditorState } from "@tiptap/pm/state";
import { NodeSelection, PluginKey } from "@tiptap/pm/state";

interface TableContext {
  node: ProseMirrorNode;
  position: number;
}

export const tableBubbleMenuPluginKey = new PluginKey("scribeTableBubbleMenu");

const findTableAncestor = ($position: ResolvedPos): TableContext | null => {
  for (let depth = $position.depth; depth > 0; depth -= 1) {
    const node = $position.node(depth);

    if (node.type.name === "table") {
      return {
        node,
        position: $position.before(depth),
      };
    }
  }

  return null;
};

export const getSelectionTableContext = (state: EditorState): TableContext | null => {
  const { selection } = state;

  if (selection instanceof NodeSelection && selection.node.type.name === "table") {
    return {
      node: selection.node,
      position: selection.from,
    };
  }

  const fromTable = findTableAncestor(selection.$from);
  const toTable = findTableAncestor(selection.$to);

  if (!fromTable || !toTable || fromTable.position !== toTable.position) {
    return null;
  }

  return fromTable;
};
