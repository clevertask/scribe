import { expect, test } from "./fixtures";

const markdown = [
  "# Release checklist",
  "",
  "- Review the change",
  "- Read the [Scribe guide](https://example.com/scribe).",
].join("\n");

test("Plain-text Markdown paste creates rich text", async ({ context, page }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: "http://127.0.0.1:5174",
  });
  await page.goto("/");

  const editor = page.getByRole("textbox", {
    name: "Document content",
    exact: true,
  });

  await expect(editor).toBeEditable();
  await page.evaluate((clipboardText) => navigator.clipboard.writeText(clipboardText), markdown);
  await editor.click();
  await editor.press("ControlOrMeta+A");
  await editor.press("ControlOrMeta+V");

  await expect(
    editor.getByRole("heading", {
      name: "Release checklist",
      level: 1,
      exact: true,
    }),
  ).toBeVisible();

  const list = editor.getByRole("list");

  await expect(list).toBeVisible();
  await expect(list.getByRole("listitem")).toHaveCount(2);
  await expect(list).toContainText("Review the change");
  await expect(list).toContainText("Read the Scribe guide");
  await expect(list.getByRole("link", { name: "Scribe guide", exact: true })).toHaveAttribute(
    "href",
    "https://example.com/scribe",
  );
  await expect(editor).not.toContainText("# Release checklist");
  await expect(editor).not.toContainText("- Review the change");
  await expect(editor).not.toContainText("[Scribe guide]");
});
