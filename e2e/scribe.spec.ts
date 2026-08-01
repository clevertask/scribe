import { expect, test } from "./fixtures";

test("Packed editor loads without browser errors", async ({ page }) => {
  await page.goto("/");

  const editor = page.getByRole("textbox", { name: "Document content", exact: true });

  await expect(editor).toBeVisible();
  await expect(editor).toContainText("Package consumer content");
  await expect(page.getByRole("toolbar", { name: "Text formatting", exact: true })).toBeVisible();
});
