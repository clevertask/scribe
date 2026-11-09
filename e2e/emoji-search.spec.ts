import { expect, test, type Locator, type Page } from "./fixtures";

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

const suggestionScrollState = (suggestions: Locator) =>
  suggestions.evaluate((element) => {
    let viewport = element.parentElement;
    while (
      viewport &&
      (!/auto|scroll/.test(getComputedStyle(viewport).overflowY) ||
        viewport.scrollHeight <= viewport.clientHeight)
    ) {
      viewport = viewport.parentElement;
    }
    if (!viewport) throw new Error("Expected a scrollable emoji suggestion viewport");

    const selected = element.querySelector('[aria-current="true"]')!;
    const viewportBounds = viewport.getBoundingClientRect();
    const selectedBounds = selected.getBoundingClientRect();
    return {
      height: viewport.clientHeight,
      scrollHeight: viewport.scrollHeight,
      scrollTop: viewport.scrollTop,
      selectedFullyVisible:
        selectedBounds.top >= viewportBounds.top - 1 &&
        selectedBounds.bottom <= viewportBounds.bottom + 1,
    };
  });

const editorScrollPositions = (editor: Locator) =>
  editor.evaluate((element) => {
    const positions: { top: number; left: number }[] = [];
    for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) {
      positions.push({ top: ancestor.scrollTop, left: ancestor.scrollLeft });
    }
    return { windowX: window.scrollX, windowY: window.scrollY, positions };
  });

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
        await expect(suggestions.getByRole("button")).toHaveCount(16);
      } else {
        await expect(suggestions.getByRole("button")).toHaveText([":mag:", ":mag_right:"]);
      }
    });
  }
});

test("Seventeen emoji results stay bounded and keyboard wrapping scrolls only the popup", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1000, height: 900 });
  const { editor, suggestions } = await openEditor(page, "&nestedScroll=true&windowScroll=true");
  await page.keyboard.insertText(":");
  await expect(suggestions.getByRole("button")).toHaveCount(5);
  await page.keyboard.insertText("m");

  const buttons = suggestions.getByRole("button");
  const first = buttons.first();
  const last = buttons.last();
  await expect(buttons).toHaveCount(17);
  await expect(first).toHaveAttribute("aria-current", "true");
  const popup = page.locator(".scribe-popup");
  const bounds = await popup.boundingBox();
  expect(bounds?.height).toBeLessThanOrEqual(242);
  const initialScroll = await suggestionScrollState(suggestions);
  expect(initialScroll.scrollHeight).toBeGreaterThan(initialScroll.height);
  expect(initialScroll.selectedFullyVisible).toBe(true);
  const surroundingScroll = await editorScrollPositions(editor);

  await page.keyboard.press("ArrowUp");
  await expect(last).toHaveAttribute("aria-current", "true");
  await expect
    .poll(async () => (await suggestionScrollState(suggestions)).scrollTop)
    .toBeGreaterThan(0);
  await expect
    .poll(async () => (await suggestionScrollState(suggestions)).selectedFullyVisible)
    .toBe(true);
  expect(await editorScrollPositions(editor)).toEqual(surroundingScroll);
  await expect(editor).toBeFocused();

  await page.keyboard.press("ArrowDown");
  await expect(first).toHaveAttribute("aria-current", "true");
  await expect
    .poll(async () => (await suggestionScrollState(suggestions)).selectedFullyVisible)
    .toBe(true);
  expect((await suggestionScrollState(suggestions)).scrollTop).toBeLessThanOrEqual(6);
  expect(await editorScrollPositions(editor)).toEqual(surroundingScroll);

  await page.keyboard.press("ArrowUp");
  await expect(last).toHaveAttribute("aria-current", "true");
  const selectedName = (await last.getAttribute("aria-label"))!.replace(/^Insert | emoji$/g, "");
  await page.keyboard.press("Enter");
  await expect(editor.locator(`[data-type="emoji"][data-name="${selectedName}"]`)).toHaveCount(1);
  await expect(page.getByTestId("serialized-html")).toContainText(`data-name="${selectedName}"`);
  await expect(editor).toBeFocused();
  await expect(suggestions).toHaveCount(0);
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

test("Narrowing a long emoji list navigates from the clamped visible selection", async ({
  page,
}) => {
  const { editor, suggestions } = await openEditor(page);
  await page.keyboard.insertText(":m");
  const buttons = suggestions.getByRole("button");
  await expect(buttons).toHaveCount(17);
  await page.keyboard.press("ArrowUp");
  await expect(buttons.last()).toHaveAttribute("aria-current", "true");

  await page.keyboard.insertText("agnifying");
  await expect(buttons).toHaveCount(2);
  const left = suggestions.getByRole("button", { name: "Insert mag emoji", exact: true });
  const right = suggestions.getByRole("button", { name: "Insert mag_right emoji", exact: true });
  await expect(right).toHaveAttribute("aria-current", "true");
  await expect(right).toBeInViewport({ ratio: 1 });
  await expect(editor).toBeFocused();

  await page.keyboard.press("ArrowDown");
  await expect(left).toHaveAttribute("aria-current", "true");
  await expect(left).toBeInViewport({ ratio: 1 });
  await page.keyboard.press("Enter");

  await expect(editor.locator('[data-type="emoji"][data-name="mag"]')).toHaveCount(1);
  await expect(page.getByTestId("serialized-html")).toContainText('data-name="mag"');
  await expect(editor).toBeFocused();
  await expect(suggestions).toHaveCount(0);
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

test("Scrolling to a late emoji supports pointer selection in a narrow viewport with mobile controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { editor, suggestions } = await openEditor(page, "&mobile=true&narrowEditor=true");
  await page.keyboard.insertText(":m");
  const buttons = suggestions.getByRole("button");
  await expect(buttons).toHaveCount(17);
  const last = buttons.last();
  const selectedName = (await last.getAttribute("aria-label"))!.replace(/^Insert | emoji$/g, "");
  await buttons.first().hover();
  await page.mouse.wheel(0, 1000);
  await expect
    .poll(async () => (await suggestionScrollState(suggestions)).scrollTop)
    .toBeGreaterThan(0);
  await expect(last).toBeInViewport();
  await last.click();

  await expect(editor.locator(`[data-type="emoji"][data-name="${selectedName}"]`)).toHaveCount(1);
  await expect(editor).toBeFocused();
  await expect(suggestions).toHaveCount(0);
  await page.keyboard.insertText("after");
  await expect(editor).toContainText("after");
});
