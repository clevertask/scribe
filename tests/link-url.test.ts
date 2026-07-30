import { describe, expect, it } from "vitest";
import { normalizeLinkUrl } from "../lib/components/Menu/linkUrl";

describe("normalizeLinkUrl", () => {
  it.each([
    ["/docs", "/docs"],
    [" /docs?view=compact#today ", "/docs?view=compact#today"],
  ])("preserves a root-relative path", (value, expected) => {
    expect(normalizeLinkUrl(value)).toBe(expected);
  });

  it.each([
    "//evil.test",
    "///evil.test",
    "/\\evil.test",
    "\\evil.test",
    "/docs\\redirect",
    "/docs\u0000redirect",
  ])("rejects an ambiguous or unsafe relative path", (value) => {
    expect(normalizeLinkUrl(value)).toBeNull();
  });

  it.each([
    ["localhost:3000/docs", "https://localhost:3000/docs"],
    ["example.com:8443/path", "https://example.com:8443/path"],
    ["127.0.0.1:8080", "https://127.0.0.1:8080/"],
    ["[::1]:4000/path", "https://[::1]:4000/path"],
  ])("normalizes a scheme-less address with a port", (value, expected) => {
    expect(normalizeLinkUrl(value)).toBe(expected);
  });

  it.each(["javascript:alert(1)", "data:text/html,test", "mailto:test@example.com"])(
    "rejects a non-HTTP protocol",
    (value) => {
      expect(normalizeLinkUrl(value)).toBeNull();
    },
  );
});
