import { marked } from "marked";
import DOMPurify from "dompurify";

const CALLOUT_VARIANTS = new Set(["info", "tip", "warning", "caution"]);
const SAFE_NESTED_TABLE_STYLE_PROPERTIES = ["width", "min-width", "max-width", "text-align"];

const normalizeCalloutVariant = (variant: string | null) => {
  const normalizedVariant = variant?.trim().toLowerCase();

  return normalizedVariant && CALLOUT_VARIANTS.has(normalizedVariant) ? normalizedVariant : "info";
};

const normalizeCalloutDescendantStyle = (element: Element) => {
  const preservedTableStyles = element.matches("table, col, th, td")
    ? SAFE_NESTED_TABLE_STYLE_PROPERTIES.map(
        (property) =>
          [property, (element as HTMLElement).style.getPropertyValue(property)] as const,
      ).filter(([, value]) => Boolean(value))
    : [];

  element.removeAttribute("style");

  preservedTableStyles.forEach(([property, value]) => {
    (element as HTMLElement).style.setProperty(property, value);
  });
};

const normalizeCallouts = (html: string) => {
  const container = document.createElement("div");

  container.innerHTML = html;
  container.querySelectorAll('aside[data-type="callout"]').forEach((callout) => {
    const variant = normalizeCalloutVariant(callout.getAttribute("data-variant"));

    Array.from(callout.attributes).forEach((attribute) => {
      if (
        attribute.name !== "data-type" &&
        attribute.name !== "data-variant" &&
        attribute.name !== "role"
      ) {
        callout.removeAttribute(attribute.name);
      }
    });

    callout.setAttribute("data-type", "callout");
    callout.setAttribute("data-variant", variant);
    callout.setAttribute("role", "note");

    [callout, ...Array.from(callout.querySelectorAll("*"))].forEach((element) => {
      normalizeCalloutDescendantStyle(element);

      Array.from(element.attributes).forEach((attribute) => {
        if (attribute.name.toLowerCase().startsWith("on")) {
          element.removeAttribute(attribute.name);
        }
      });
    });
  });

  return container.innerHTML;
};

export const md2html = (md: string) => {
  const sanitizedHtml = DOMPurify.sanitize(marked.parse(md, { async: false }), {
    ADD_ATTR: ["colwidth"],
  });

  return normalizeCallouts(sanitizedHtml);
};
