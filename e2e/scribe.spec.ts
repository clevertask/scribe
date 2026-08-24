import { expect, test } from "./fixtures";

test("Packed editor loads without browser errors", async ({ page }) => {
  await page.goto("/");

  const editor = page.getByRole("textbox", { name: "Document content", exact: true });

  await expect(editor).toBeVisible();
  await expect(editor).toContainText("Package consumer content");
  await expect(page.getByRole("toolbar", { name: "Text formatting", exact: true })).toBeVisible();
  await expect(page.getByTestId("extension-names")).toContainText("undoRedo");
});

test("Packed editor lets the consumer own undo and redo", async ({ page }) => {
  await page.goto("/?disableUndoRedo=true");

  const extensionNames = page.getByTestId("extension-names");

  await expect(page.getByRole("textbox", { name: "Document content", exact: true })).toBeVisible();
  await expect(extensionNames).toHaveAttribute("data-ready", "true");
  await expect(extensionNames).not.toContainText("undoRedo");
});
