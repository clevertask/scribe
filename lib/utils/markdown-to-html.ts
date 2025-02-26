import { marked } from "marked";
import DOMPurify from "dompurify";

const escapeBackslashes = (str: string) => str.replace(/\\/g, "\\\\");

export const md2html = (md: string) =>
  DOMPurify.sanitize(marked.parse(escapeBackslashes(String.raw`${md}`), { async: false }));
