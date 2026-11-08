import { expect, test, type Page } from "./fixtures";

const openEditor = async (page: Page, parameters = "") => {
  await page.goto(`/?captureContent=true${parameters}`);

  const editor = page.getByRole("textbox", { name: "Document content", exact: true });
  await expect(editor).toBeEditable();
  await editor.click();
  await editor.press("ControlOrMeta+A");
  await editor.press("Backspace");

  const suggestions = page.getByRole("group", { name: "Emoji suggestions", exact: true });
  return { editor, suggestions };
};

test("Emoji search prioritizes the magnifying glass for names and keywords", async ({ page }) => {
  for (const query of ["mag", "MAG", "magnifying", "search", "sear"]) {
    await test.step(`Search :${query}`, async () => {
      const { editor, suggestions } = await openEditor(page);
      await page.keyboard.insertText(`:${query}`);

      await expect(suggestions).toBeVisible();
      await expect(suggestions.getByRole("button").first()).toHaveAccessibleName(
        "Insert mag emoji",
      );
      await expect(editor).toBeFocused();
      if (query.toLowerCase() === "mag") {
        await expect(suggestions.getByRole("button")).toHaveCount(5);
      } else {
        await expect(suggestions.getByRole("button")).toHaveText([":mag:", ":mag_right:"]);
      }
    });
  }
});

test("Displayed emoji names and shortcode aliases insert the same emoji identity", async ({
  page,
}) => {
  for (const query of ["hugs", "hug"]) {
    await test.step(`Insert with :${query}`, async () => {
      const { editor, suggestions } = await openEditor(page);
      await page.keyboard.insertText(`:${query}`);

      await expect(suggestions.getByRole("button").first()).toHaveAccessibleName(
        "Insert hugs emoji",
      );
      await page.keyboard.press("Enter");

      await expect(editor.locator('[data-type="emoji"][data-name="hugs"]')).toHaveCount(1);
      await expect(page.getByTestId("serialized-html")).toContainText('data-name="hugs"');
      await expect(editor).toBeFocused();
      await expect(suggestions).toHaveCount(0);
    });
  }
});

test("Emoji arrows and Enter keep editor focus as the query is refined", async ({ page }) => {
  const { editor, suggestions } = await openEditor(page);
  await page.keyboard.insertText(":sear");

  const left = suggestions.getByRole("button", { name: "Insert mag emoji", exact: true });
  const right = suggestions.getByRole("button", { name: "Insert mag_right emoji", exact: true });
  await expect(left).toHaveAttribute("aria-current", "true");

  await page.keyboard.press("ArrowUp");
  await expect(right).toHaveAttribute("aria-current", "true");
  await page.keyboard.press("ArrowDown");
  await expect(left).toHaveAttribute("aria-current", "true");
  await page.keyboard.press("ArrowDown");
  await expect(right).toHaveAttribute("aria-current", "true");
  await page.keyboard.insertText("ch");
  await expect(right).toHaveAttribute("aria-current", "true");
  await expect(editor).toBeFocused();

  await page.keyboard.press("Enter");

  await expect(editor.locator('[data-type="emoji"][data-name="mag_right"]')).toHaveCount(1);
  await expect(page.getByTestId("serialized-html")).toContainText('data-name="mag_right"');
  await expect(editor).not.toContainText(":search");
  await expect(editor).toBeFocused();
  await expect(suggestions).toHaveCount(0);
});

test("Emoji insertion replaces only the query and leaves the caret beside surrounding text", async ({
  page,
}) => {
  const { editor, suggestions } = await openEditor(page);
  await page.keyboard.insertText("Before After");
  await page.keyboard.press("Home");
  for (let index = 0; index < "Before ".length; index += 1) {
    await page.keyboard.press("ArrowRight");
  }
  await page.keyboard.insertText(":mag");
  await expect(suggestions.getByRole("button").first()).toHaveAccessibleName("Insert mag emoji");
  await page.keyboard.press("Enter");

  const emoji = editor.locator('[data-type="emoji"][data-name="mag"]');
  await expect(emoji).toHaveCount(1);
  await expect(editor).toBeFocused();
  await page.keyboard.insertText("kept ");

  expect(
    await emoji.evaluate((element) => ({
      before: element.previousSibling?.textContent,
      after: element.nextSibling?.textContent,
    })),
  ).toEqual({ before: "Before ", after: " kept After" });
  await expect(page.getByTestId("serialized-html")).toContainText('data-name="mag"');
  await expect(page.getByTestId("serialized-html")).not.toContainText(":mag");
});

test("Escape dismisses emoji suggestions without inserting or removing the query", async ({
  page,
}) => {
  const { editor, suggestions } = await openEditor(page);
  await page.keyboard.insertText(":mag");
  await expect(suggestions).toBeVisible();
  await page.keyboard.press("Escape");

  await expect(suggestions).toBeHidden();
  await expect(editor).toHaveText(":mag");
  await expect(editor.locator('[data-type="emoji"]')).toHaveCount(0);
  await expect(editor).toBeFocused();
});

test("Emoji pointer selection works in a narrow viewport with mobile controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { editor, suggestions } = await openEditor(page, "&mobile=true&narrowEditor=true");
  await page.keyboard.insertText(":search");
  const right = suggestions.getByRole("button", { name: "Insert mag_right emoji", exact: true });
  await expect(right).toBeInViewport();
  await right.click();

  await expect(editor.locator('[data-type="emoji"][data-name="mag_right"]')).toHaveCount(1);
  await expect(editor).toBeFocused();
  await expect(suggestions).toHaveCount(0);
  await page.keyboard.insertText("after");
  await expect(editor).toContainText("after");
});
