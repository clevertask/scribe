import { expect, test } from "./fixtures";

test("consumer decorations share Scribe's ProseMirror runtime", async ({ page }) => {
  await page.goto("/?consumerDecoration=true");

  const editor = page.getByRole("textbox", { name: "Document content", exact: true });
  const widget = page.getByTestId("consumer-decoration");

  await expect(editor).toHaveAttribute("data-consumer-editor-view-identity", "true");
  await expect(editor).toHaveAttribute("data-consumer-editor-state-identity", "true");
  await expect(editor.locator("p.is-editor-empty")).toBeVisible();
  await expect(widget).toHaveText("Consumer decoration: empty document");

  await editor.fill("Updated package consumer content");

  await expect(widget).toHaveText("Consumer decoration: Updated package consumer content");
  await expect(page.getByTestId("serialized-html")).toHaveText(
    "<p>Updated package consumer content</p>",
  );
});
