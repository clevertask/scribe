const escapeAttribute = (value: string) =>
    value
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

const renderInline = (latex: string) =>
    `<span data-type="inline-math" data-latex="${escapeAttribute(latex.trim())}"></span>`;

const renderBlock = (latex: string) =>
    `<div data-type="block-math" data-latex="${escapeAttribute(latex.trim())}"></div>`;

const isLikelyLatex = (value: string) => /\\[a-zA-Z]+|[_^]/.test(value);

const inlineMathRegex = /\\\(([^\n]+?)\\\)|\\\[([^\n]+?)\\\]|\[([^\n]+?)\]|\(([^\n]+?)\)/g;

const replaceInlineMath = (text: string) =>
    text.replace(inlineMathRegex, (match, escapedParen, escapedBracket, rawBracket, rawParen) => {
        const latex = escapedParen || escapedBracket || rawBracket || rawParen || "";
        const isEscaped = Boolean(escapedParen || escapedBracket);

        if (!isEscaped && !isLikelyLatex(latex)) {
            return match;
        }

        return renderInline(latex);
    });

const replaceInlineInHtml = (input: string) =>
    input
        .split(/(<[^>]+>)/g)
        .map(chunk => (chunk.startsWith("<") ? chunk : replaceInlineMath(chunk)))
        .join("");

export const convertLegacyMathDelimiters = (input: string) => {
    const withBlockMath = input.replace(
        /(^|\n)[ \t]*(?:\\\[|\[)([\s\S]*?)(?:\\\]|\])[ \t]*(?=\n|$)/g,
        (match, leading, latex) =>
            isLikelyLatex(latex) ? `${leading}${renderBlock(latex)}` : match,
    );

    return replaceInlineInHtml(withBlockMath);
};
