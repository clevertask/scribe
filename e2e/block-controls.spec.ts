import { expect, test, type Page } from "./fixtures";

const documentText = "Package consumer content";
const secondListItemText = "Second item";

const openEditableDocument = async (page: Page) => {
  await page.goto("/");

  const editor = page.getByRole("textbox", { name: "Document content", exact: true });
  const toolbar = page.getByRole("toolbar", { name: "Text formatting", exact: true });

  await expect(editor).toBeEditable();
  await editor.getByText(documentText, { exact: true }).click();

  return { editor, toolbar };
};

test("List controls create and switch list content", async ({ page }) => {
  const { editor, toolbar } = await openEditableDocument(page);
  const bulletedListButton = toolbar.getByRole("button", {
    name: "Bulleted list",
    exact: true,
  });
  const numberedListButton = toolbar.getByRole("button", {
    name: "Numbered list",
    exact: true,
  });
  const list = editor.getByRole("list");

  await expect(bulletedListButton).toHaveAttribute("aria-pressed", "false");
  await expect(numberedListButton).toHaveAttribute("aria-pressed", "false");

  await bulletedListButton.click();

  await expect(bulletedListButton).toHaveAttribute("aria-pressed", "true");
  await expect(numberedListButton).toHaveAttribute("aria-pressed", "false");
  await expect(list).toHaveCount(1);

  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.insertText(secondListItemText);

  const listItems = list.getByRole("listitem");

  await expect(listItems).toHaveCount(2);
  await expect(listItems.nth(0)).toHaveText(documentText);
  await expect(listItems.nth(1)).toHaveText(secondListItemText);

  await numberedListButton.click();

  await expect(numberedListButton).toHaveAttribute("aria-pressed", "true");
  await expect(bulletedListButton).toHaveAttribute("aria-pressed", "false");
  await expect(list).toHaveCount(1);
  await expect(listItems).toHaveCount(2);
  await expect(listItems.nth(0)).toHaveText(documentText);
  await expect(listItems.nth(1)).toHaveText(secondListItemText);
});

const blockControls = [
  { buttonName: "Block quote", role: "blockquote" },
  { buttonName: "Code block", role: "code" },
] as const;

for (const { buttonName, role } of blockControls) {
  test(`${buttonName} toggles block formatting`, async ({ page }) => {
    const { editor, toolbar } = await openEditableDocument(page);
    const blockButton = toolbar.getByRole("button", { name: buttonName, exact: true });
    const block = editor.getByRole(role);

    await expect(blockButton).toHaveAttribute("aria-pressed", "false");
    await blockButton.click();

    await expect(blockButton).toHaveAttribute("aria-pressed", "true");
    await expect(block).toHaveText(documentText);

    await blockButton.click();

    await expect(blockButton).toHaveAttribute("aria-pressed", "false");
    await expect(block).toHaveCount(0);
    await expect(editor).toContainText(documentText);
  });
}

test("Horizontal rule inserts a document divider", async ({ page }) => {
  const { editor, toolbar } = await openEditableDocument(page);
  const horizontalRuleButton = toolbar.getByRole("button", {
    name: "Horizontal rule",
    exact: true,
  });

  await expect(horizontalRuleButton).not.toHaveAttribute("aria-pressed");
  await horizontalRuleButton.click();

  await expect(editor.getByRole("separator")).toHaveCount(1);
  await expect(editor).toContainText(documentText);
});
