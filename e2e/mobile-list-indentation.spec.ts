import { expect, test } from "./fixtures";

const firstListItemText = "First item";
const secondListItemText = "Second item";

test.use({ viewport: { width: 390, height: 844 } });

test("Mobile list controls indent and outdent a list item", async ({ page }) => {
  await page.goto("/?mobile=true");

  const editor = page.getByRole("textbox", { name: "Document content", exact: true });
  const toolbar = page.getByRole("toolbar", { name: "Text formatting", exact: true });
  const listControls = page.getByRole("group", { name: "List indentation", exact: true });

  await expect(editor).toBeEditable();
  await expect(listControls).toHaveCount(0);
  await editor.click();
  await editor.press("ControlOrMeta+A");
  await page.keyboard.insertText(firstListItemText);
  await toolbar.getByRole("button", { name: "Bulleted list", exact: true }).click();

  await expect(listControls).toBeVisible();
  await page.keyboard.press("Enter");
  await page.keyboard.insertText(secondListItemText);

  const lists = editor.getByRole("list");
  const listItems = editor.getByRole("listitem");
  const parentListItem = listItems.filter({ hasText: firstListItemText });
  const nestedList = parentListItem.getByRole("list");

  await expect(lists).toHaveCount(1);
  await expect(listItems).toHaveCount(2);
  await expect(nestedList).toHaveCount(0);
  await expect(listItems.nth(0)).toHaveText(firstListItemText);
  await expect(listItems.nth(1)).toHaveText(secondListItemText);

  await listControls.getByRole("button", { name: "Indent list item", exact: true }).click();

  await expect(lists).toHaveCount(2);
  await expect(listItems).toHaveCount(2);
  await expect(nestedList).toHaveCount(1);
  await expect(nestedList.getByRole("listitem")).toHaveText(secondListItemText);

  await listControls.getByRole("button", { name: "Outdent list item", exact: true }).click();

  await expect(lists).toHaveCount(1);
  await expect(nestedList).toHaveCount(0);
  await expect(listItems).toHaveCount(2);
  await expect(listItems.nth(0)).toHaveText(firstListItemText);
  await expect(listItems.nth(1)).toHaveText(secondListItemText);
});
