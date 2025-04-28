import katex from "katex";
import { Node, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey } from "prosemirror-state";

export const LatexExtension = Node.create({
  name: "latex",

  group: "inline",
  inline: true,
  atom: true,
  selectable: false,
  content: "",
  addAttributes() {
    return {
      content: { default: "" },
      displayMode: { default: false },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-type="latex"]',
        getAttrs: (node) => ({
          content: (node as HTMLElement).getAttribute("data-content"),
        }),
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(
        { "data-type": "latex", "data-content": node.attrs.content, "data-display-mode": node.attrs.displayMode },
        HTMLAttributes
      ),
    ];
  },

  addNodeView() {
    return ({ node }) => {
      const span = document.createElement("span");
      span.setAttribute("data-type", "latex");
      span.setAttribute("contenteditable", "false");

      try {
        katex.render(node.attrs.content, span, {
          throwOnError: false,
          displayMode: node.attrs.displayMode,
        });
      } catch (error) {
        span.textContent = node.attrs.content;
      }

      return {
        dom: span,
        contentDOM: null,
      };
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("latexAutoDetect"),
        appendTransaction: (transactions, oldState, newState) => {
          if (!transactions.some((tr) => tr.docChanged)) {
            return null;
          }

          const regex = /(\[.*?\])|(\\[a-zA-Z]+(\{[^}]+\})*)/g;
          let tr = newState.tr;
          let matches: { start: number; end: number; content: string }[] = [];

          newState.doc.descendants((node, pos, parent) => {
            if (node.isText) {
              const text = node.text;
              if (text && parent) {
                // Skip if inside a code block or inline code
                if (parent.type.name === "codeBlock" || parent.type.name === "code") {
                  return;
                }

                // Skip if the text node itself has a code mark
                if (node.marks.some((mark) => mark.type.name === "code")) {
                  return;
                }

                // Skip if already inside a latex node
                if (parent.type.name === "latex") {
                  return;
                }
                let match;
                while ((match = regex.exec(text)) !== null) {
                  const fullMatch = match[0];
                  const start = pos + match.index;
                  const end = start + fullMatch.length;

                  matches.push({ start, end, content: fullMatch });
                }
              }
            }
          });

          if (matches.length > 0) {
            matches.reverse().forEach(({ start, end, content }) => {
              const isBlock = content.startsWith("[") && content.endsWith("]");
              const cleanContent = isBlock
                ? content.slice(1, -1).trim() // Remove the [ and ] if it's block
                : content;

              tr = tr.replaceWith(
                start,
                end,
                newState.schema.nodes.latex.create({
                  content: cleanContent,
                  displayMode: isBlock,
                })
              );
            });

            return tr;
          }

          return null;
        },
      }),
    ];
  },
});
