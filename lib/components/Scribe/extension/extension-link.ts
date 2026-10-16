import { commands, Extension, getMarkType } from "@tiptap/core";
import Link from "@tiptap/extension-link";

const LinkAtomGuard = Extension.create({
  name: "linkAtomGuard",
  // Core commands have priority 100; register this narrow override afterwards.
  priority: 90,
  addCommands() {
    return {
      setMark:
        (typeOrName, attributes = {}) =>
        (props) => {
          const { tr, state, dispatch } = props;
          const type = getMarkType(typeOrName, state.schema);
          let containsInlineAtom = false;

          if (type.name === "link" && !tr.selection.empty) {
            tr.selection.ranges.forEach(({ $from, $to }) => {
              tr.doc.nodesBetween($from.pos, $to.pos, (node) => {
                if (node.isInline && !node.isText && node.isAtom) containsInlineAtom = true;
              });
            });
          }

          if (!containsInlineAtom) return commands.setMark(typeOrName, attributes)(props);

          // Native URL paste calls setMark directly. Keep application-owned atoms
          // intact while applying the native link mark to eligible selected text.
          let canApply = false;
          tr.selection.ranges.forEach(({ $from, $to }) => {
            tr.doc.nodesBetween($from.pos, $to.pos, (node, pos, parent) => {
              if (node.isInline && !node.isText && node.isAtom) return false;
              if (!node.isText || !parent?.type.allowsMarkType(type)) return;
              const existing = type.isInSet(node.marks);
              if (!existing && node.marks.some((mark) => mark.type.excludes(type))) return;
              canApply = true;
              if (dispatch) {
                tr.addMark(
                  Math.max(pos, $from.pos),
                  Math.min(pos + node.nodeSize, $to.pos),
                  type.create({ ...existing?.attrs, ...attributes }),
                );
              }
            });
          });
          // An atom-only selection follows the normal paste replacement path.
          return canApply;
        },
    };
  },
});

export default Link.extend({
  addExtensions() {
    return [...(this.parent?.() ?? []), LinkAtomGuard];
  },
}).configure({
  openOnClick: false,
  enableClickSelection: true,
  autolink: true,
  linkOnPaste: true,
  defaultProtocol: "https",
});
