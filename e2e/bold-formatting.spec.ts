import { expect, test } from "./fixtures";

const documentText = "Package consumer content";

test("Bold toolbar button toggles selected text", async ({ page }) => {
  await page.goto("/");

  const editor = page.getByRole("textbox", { name: "Document content", exact: true });
  const toolbar = page.getByRole("toolbar", { name: "Text formatting", exact: true });
  const boldButton = toolbar.getByRole("button", { name: "Bold", exact: true });
  const boldText = editor.getByRole("strong");

  await expect(editor).toBeEditable();
  await expect(boldButton).toHaveAttribute("aria-pressed", "false");

  await editor.click();
  await editor.press("ControlOrMeta+A");
  await boldButton.click();

  await expect(boldButton).toHaveAttribute("aria-pressed", "true");
  await expect(boldText).toHaveText(documentText);

  await boldButton.click();

  await expect(boldButton).toHaveAttribute("aria-pressed", "false");
  await expect(boldText).toHaveCount(0);
  await expect(editor).toContainText(documentText);
});
