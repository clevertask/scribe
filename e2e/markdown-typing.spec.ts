import { expect, test } from "./fixtures";

const headingText = "Typed release notes";

test("Markdown heading shortcut creates rich text while typing", async ({ page }) => {
  await page.goto("/");

  const editor = page.getByRole("textbox", { name: "Document content", exact: true });

  await expect(editor).toBeEditable();
  await editor.click();
  await editor.press("ControlOrMeta+A");
  await editor.press("Backspace");
  await page.keyboard.type("#");
  await page.keyboard.press("Space");
  await page.keyboard.type(headingText);

  await expect(
    editor.getByRole("heading", { name: headingText, level: 1, exact: true }),
  ).toBeVisible();
  await expect(editor).toHaveText(headingText);
});
