import { expect, test } from "./fixtures";

const documentText = "Package consumer content";
const headingText = "Keyboard-selected heading";

test("Slash command menu supports keyboard selection", async ({ page }) => {
  await page.goto("/");

  const editor = page.getByRole("textbox", { name: "Document content", exact: true });

  await expect(editor).toBeEditable();
  await editor.getByText(documentText, { exact: true }).click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.insertText("/");

  const suggestions = page.getByRole("group", {
    name: "Block suggestions",
    exact: true,
  });
  const textSuggestion = suggestions.getByRole("button", { name: "Text", exact: true });
  const headingSuggestion = suggestions.getByRole("button", { name: "H1", exact: true });

  await expect(suggestions).toBeVisible();
  await expect(textSuggestion).toHaveAttribute("aria-current", "true");
  await expect(headingSuggestion).toHaveAccessibleDescription("Big heading");
  await expect(headingSuggestion).not.toHaveAttribute("aria-current");

  await page.keyboard.press("ArrowDown");

  await expect(textSuggestion).not.toHaveAttribute("aria-current");
  await expect(headingSuggestion).toHaveAttribute("aria-current", "true");

  await page.keyboard.press("Enter");
  await expect(suggestions).toHaveCount(0);

  await page.keyboard.insertText(headingText);

  await expect(
    editor.getByRole("heading", { name: headingText, level: 1, exact: true }),
  ).toBeVisible();
  await expect(editor).not.toContainText("/");
});
