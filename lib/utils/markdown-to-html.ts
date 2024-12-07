import { marked } from "marked";
import DOMPurify from "dompurify";

export const md2html = (md: string) => DOMPurify.sanitize(marked.parse(md, { async: false }));