import { expect, test, type Locator, type Page } from "./fixtures";

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

const startTaskList = async (page: Page, firstItemText: string) => {
  await page.goto("/?mobile=true");
  const editor = page.getByRole("textbox", { name: "Document content", exact: true });
  await expect(editor).toBeEditable();
  await editor.click();
  await editor.press("ControlOrMeta+A");
  await editor.press("Backspace");
  await page.keyboard.type("[ ] ");
  await expect(editor.locator(".scribe-task-list > li")).toHaveCount(1);
  await page.keyboard.insertText(firstItemText);
  return editor;
};

const paragraphFor = (item: Locator) => item.locator(":scope > div > p").first();
const checkboxFor = (item: Locator) => item.locator(':scope > label input[type="checkbox"]');

const typeAtBlankRightSide = async (
  page: Page,
  item: Locator,
  text: string,
  { wrapped = false }: { wrapped?: boolean } = {},
) => {
  await item.scrollIntoViewIfNeeded();
  const paragraph = paragraphFor(item);
  const previousText = (await paragraph.textContent()) ?? "";
  const target = await item.evaluate((element) => {
    const paragraph = element.querySelector(":scope > div > p");
    const label = element.querySelector(":scope > label");
    const editor = element.closest(".ProseMirror");
    if (!paragraph || !label || !editor) throw new Error("Expected a rendered task item");

    const rowRect = element.getBoundingClientRect();
    const paragraphRect = paragraph.getBoundingClientRect();
    const labelRect = label.getBoundingClientRect();
    const editorRect = editor.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    const textRects = [...range.getClientRects()].filter((rect) => rect.width && rect.height);
    const lastTextLine = textRects.at(-1);
    const lastLine = lastTextLine ?? paragraphRect;
    const blankStart = Math.max(
      labelRect.right,
      paragraphRect.left,
      lastTextLine?.right ?? paragraphRect.left,
    );
    const x = blankStart + (rowRect.right - blankStart) * 0.75;
    const y = lastLine.top + lastLine.height / 2;
    const hit = document.elementFromPoint(x, y);

    return {
      x,
      y,
      hasBlankSpace: x > blankStart && x < rowRect.right,
      paragraphOwnsPoint: hit !== null && paragraph.contains(hit),
      contentWithinEditor:
        paragraphRect.left >= editorRect.left && paragraphRect.right <= editorRect.right + 1,
      lineCount: new Set(textRects.map((rect) => rect.top)).size,
    };
  });

  // Focus alone also remained true in the Android failure. The blank area must
  // belong to this paragraph, and typing after the tap must land in this item.
  expect(target).toMatchObject({
    hasBlankSpace: true,
    paragraphOwnsPoint: true,
    contentWithinEditor: true,
  });
  if (wrapped) expect(target.lineCount).toBeGreaterThan(1);
  await page.touchscreen.tap(target.x, target.y);
  await page.keyboard.insertText(text);
  await expect(paragraph).toHaveText(previousText + text);
};

test("Empty and short task items accept typing beside their text and toggle independently", async ({
  page,
}) => {
  const editor = await startTaskList(page, "Gg");
  await page.keyboard.press("Enter");
  const items = editor.locator(":scope > .scribe-task-list > li");
  await expect(items).toHaveCount(2);
  const shortItem = items.nth(0);
  const emptyItem = items.nth(1);
  const shortCheckbox = checkboxFor(shortItem);
  const emptyCheckbox = checkboxFor(emptyItem);
  await expect(paragraphFor(emptyItem)).toBeEmpty();
  await expect(shortCheckbox).not.toBeChecked();
  await expect(emptyCheckbox).not.toBeChecked();

  await shortCheckbox.tap();
  await expect(shortCheckbox).toBeChecked();
  await expect(emptyCheckbox).not.toBeChecked();
  await typeAtBlankRightSide(page, emptyItem, "Empty item typing");
  await expect(paragraphFor(shortItem)).toHaveText("Gg");

  await shortCheckbox.tap();
  await expect(shortCheckbox).not.toBeChecked();
  await expect(emptyCheckbox).not.toBeChecked();
  await typeAtBlankRightSide(page, shortItem, " short item typing");
  await expect(paragraphFor(emptyItem)).toHaveText("Empty item typing");
});

test("An empty nested task item has its own blank typing area", async ({ page }) => {
  const editor = await startTaskList(page, "Parent item");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  const parentItem = editor.locator(":scope > .scribe-task-list > li");
  await expect(parentItem).toHaveCount(1);
  const nestedItem = parentItem.locator(":scope > div > .scribe-task-list > li");
  await expect(nestedItem).toHaveCount(1);
  await expect(paragraphFor(nestedItem)).toBeEmpty();

  await typeAtBlankRightSide(page, nestedItem, "Nested item typing");
  await expect(paragraphFor(parentItem)).toHaveText("Parent item");
  await expect(checkboxFor(parentItem)).not.toBeChecked();
  await expect(checkboxFor(nestedItem)).not.toBeChecked();
});

test("A wrapping task item keeps the blank end of its last line available for typing", async ({
  page,
}) => {
  const longText = `A checklist item with a long token ${"unbroken".repeat(12)} followed by the end.`;
  const editor = await startTaskList(page, longText);
  const item = editor.locator(":scope > .scribe-task-list > li");
  await expect(item).toHaveCount(1);

  await typeAtBlankRightSide(page, item, " More typing", { wrapped: true });
  await checkboxFor(item).tap();
  await expect(checkboxFor(item)).toBeChecked();
  await expect(paragraphFor(item)).toHaveText(longText + " More typing");
});
