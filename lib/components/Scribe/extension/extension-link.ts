import { commands, Extension, getMarkType } from "@tiptap/core";
import Link from "@tiptap/extension-link";
import type { MarkType, Slice } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { find } from "linkifyjs";

const titleLinkPastePluginKey = new PluginKey("titleLinkPaste");

const isSinglePastedTitleLink = (slice: Slice, html: string, href: string, type: MarkType) => {
  // Adjacent anchors with the same URL can merge during parsing. Keep that
  // authored multi-link content on the ordinary rich-paste path.
  const template = document.createElement("template");
  template.innerHTML = html;
  if (template.content.querySelectorAll("a[href]").length !== 1) return false;

  let content = slice.content;
  if (content.childCount === 1 && content.firstChild?.type.name === "paragraph") {
    content = content.firstChild.content;
  }

  let matches = content.childCount > 0;
  let label = "";
  content.forEach((node) => {
    // Inspect the transformed slice so consumer-owned references and other
    // atoms retain their paste behavior instead of becoming ordinary links.
    if (!node.isText || type.isInSet(node.marks)?.attrs.href !== href) {
      matches = false;
      return;
    }
    label += node.textContent;
  });

  return matches && label !== href;
};

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
  addProseMirrorPlugins() {
    const plugins = this.parent?.() ?? [];
    if (!this.options.linkOnPaste) return plugins;

    return [
      new Plugin({
        key: titleLinkPastePluginKey,
        props: {
          handlePaste: (view, event, slice) => {
            if (view.state.selection.empty) return false;

            const text = event.clipboardData?.getData("text/plain");
            const html = event.clipboardData?.getData("text/html");
            if (!text || !html || !/^https?:\/\//i.test(text)) return false;

            const link = find(text, { defaultProtocol: this.options.defaultProtocol }).find(
              (candidate) => candidate.isLink && candidate.value === text,
            );
            if (
              !link ||
              !this.options.shouldAutoLink(link.value) ||
              !isSinglePastedTitleLink(slice, html, link.href, this.type) ||
              !this.editor.can().setLink({ href: link.href })
            ) {
              return false;
            }

            return this.editor.commands.setLink({ href: link.href });
          },
        },
      }),
      ...plugins,
    ];
  },
}).configure({
  openOnClick: false,
  enableClickSelection: true,
  autolink: true,
  linkOnPaste: true,
  defaultProtocol: "https",
});
