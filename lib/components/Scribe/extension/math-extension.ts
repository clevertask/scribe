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

          const regex = /\$\$([\s\S]+?)\$\$|\$([^\$]+?)\$|\[([^\]]+?)\]|(\\[a-zA-Z]+(?:\{[^}]*\})*)/g;

          let tr = newState.tr;
          let matches: { start: number; end: number; content: string; isBlock: boolean }[] = [];

          newState.doc.descendants((node, pos, parent) => {
            if (!node.isText) return;

            const text = node.text;
            if (!text || !parent) return;

            // Skip if inside a code block or inline code
            if (parent.type.name === "codeBlock" || parent.type.name === "code") return;

            // Skip if the text node itself has a code mark
            if (node.marks.some((mark) => mark.type.name === "code")) return;

            // Skip if already inside a latex node
            if (parent.type.name === "latex") return;

            if (text.includes("$") || text.includes("[") || text.includes("\\")) {
              let match;
              while ((match = regex.exec(text)) !== null) {
                const [fullMatch, blockDollar, inlineDollar, squareBlock, inlineCommand] = match;
                const start = pos + match.index;
                const end = start + fullMatch.length;

                let content = blockDollar || inlineDollar || squareBlock || inlineCommand;
                const isBlock = !!blockDollar || !!squareBlock;
                const hasInlineDelimiter = !!inlineDollar;

                // Skip risky commands unless wrapped
                if (!isBlock && !hasInlineDelimiter && /\\(begin|end|left|right)/.test(content)) {
                  continue;
                }

                matches.push({ start, end, content: content.trim(), isBlock });
              }
            }
          });

          if (matches.length > 0) {
            matches.reverse().forEach(({ start, end, content, isBlock }) => {
              tr = tr.replaceWith(
                start,
                end,
                newState.schema.nodes.latex.create({
                  content,
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
