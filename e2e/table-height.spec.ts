import { expect, test, type Locator, type Page } from "./fixtures";

const editorFor = (page: Page) =>
  page.getByRole("textbox", { name: "Document content", exact: true, includeHidden: true });
const controlsFor = (page: Page) =>
  page.getByRole("toolbar", { name: "Table controls", exact: true });
const layoutMenu = (page: Page) => page.getByRole("menu", { name: "Table layout", exact: true });
const heightDialog = (page: Page) =>
  page.getByRole("dialog", { name: "Table height", exact: true });
const heightInput = (page: Page) =>
  heightDialog(page).getByRole("textbox", { name: "Maximum height (px)", exact: true });

const openLayoutMenu = async (page: Page, cell: Locator) => {
  await cell.evaluate((element) => {
    const wrapper = element.closest<HTMLElement>(".tableWrapper");
    if (wrapper) wrapper.scrollTop = 0;
  });
  await cell.click();
  await expect(editorFor(page)).toBeFocused();
  await controlsFor(page).getByRole("button", { name: "Table layout", exact: true }).click();
  await expect(layoutMenu(page)).toBeVisible();
};

const openHeightDialog = async (page: Page, cell: Locator) => {
  await openLayoutMenu(page, cell);
  await page.getByRole("menuitem", { name: "Maximum height…", exact: true }).click();
  await expect(heightDialog(page)).toBeVisible();
  await expect(heightInput(page)).toBeFocused();
};

const setHeight = async (page: Page, cell: Locator, height: number) => {
  await openHeightDialog(page, cell);
  await heightInput(page).fill(String(height));
  await heightDialog(page).getByRole("button", { name: "Apply", exact: true }).click();
  await expect(heightDialog(page)).toBeHidden();
  await expect(editorFor(page)).toBeFocused();
};

const toggleOption = async (page: Page, cell: Locator, label: string) => {
  await openLayoutMenu(page, cell);
  await page.getByRole("menuitemcheckbox", { name: label, exact: true }).click();
  await expect(layoutMenu(page)).toBeHidden();
  await expect(editorFor(page)).toBeFocused();
};

const chooseLayout = async (page: Page, cell: Locator, label: string) => {
  await openLayoutMenu(page, cell);
  await page.getByRole("menuitemradio", { name: label, exact: true }).click();
  await expect(layoutMenu(page)).toBeHidden();
  await expect(editorFor(page)).toBeFocused();
};

const dimensions = (wrapper: Locator) =>
  wrapper.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));

test("Maximum height stages and validates edits, applies with Enter, and cancels with Escape", async ({
  page,
}) => {
  await page.goto("/?tableLayoutFixture=true&narrowEditor=true");
  const wrapper = editorFor(page).locator(".tableWrapper").first();
  const table = wrapper.locator("table");
  const cell = table.locator("td").first();
  await setHeight(page, cell, 320);
  await expect(table).toHaveAttribute("data-table-max-height", "320");
  await expect(table).toHaveAttribute("data-table-limit-height", "false");
  expect((await dimensions(wrapper)).clientHeight).toBeGreaterThan(360);

  await openHeightDialog(page, cell);
  await expect(heightInput(page)).toHaveValue("320");
  const apply = heightDialog(page).getByRole("button", { name: "Apply", exact: true });
  for (const invalidHeight of ["119", "2001", "280.5", ""]) {
    await heightInput(page).fill(invalidHeight);
    await apply.click();
    await expect(heightDialog(page).getByRole("alert")).toHaveText(
      "Enter a whole number from 120 to 2000.",
    );
    await expect(table).toHaveAttribute("data-table-max-height", "320");
  }
  await heightInput(page).fill("280");
  await expect(apply).toBeEnabled();
  await expect(table).toHaveAttribute("data-table-max-height", "320");
  await page.keyboard.press("Escape");
  await expect(heightDialog(page)).toBeHidden();
  await expect(editorFor(page)).toBeFocused();
  await expect(table).toHaveAttribute("data-table-max-height", "320");

  await openHeightDialog(page, cell);
  await expect(heightInput(page)).toHaveValue("320");
  await heightInput(page).fill("280");
  await page.keyboard.press("Enter");
  await expect(heightDialog(page)).toBeHidden();
  await expect(editorFor(page)).toBeFocused();
  await expect(table).toHaveAttribute("data-table-max-height", "280");
  await toggleOption(page, cell, "Limit height");
  await expect.poll(async () => (await dimensions(wrapper)).clientHeight).toBe(280);
});

test("A saved custom cap survives height toggles independently of width and sticky headers", async ({
  page,
}) => {
  await page.goto("/?tableLayoutFixture=true&narrowEditor=true");
  const wrapper = editorFor(page).locator(".tableWrapper").first();
  const table = wrapper.locator("table");
  const cell = table.locator("td").first();
  await setHeight(page, cell, 220);
  await toggleOption(page, cell, "Limit height");
  await toggleOption(page, cell, "Sticky header row");
  await expect
    .poll(async () =>
      wrapper.evaluate((element) => {
        const selection = element.ownerDocument.defaultView!.getSelection();
        const caret = selection?.rangeCount
          ? selection.getRangeAt(0).getBoundingClientRect()
          : null;
        const header = element.querySelector("th")!.getBoundingClientRect();
        return Boolean(
          caret &&
          caret.top >= header.bottom - 1 &&
          caret.bottom <= element.getBoundingClientRect().bottom + 1,
        );
      }),
    )
    .toBe(true);
  const menuCell = table.locator("th").first();
  await chooseLayout(page, menuCell, "Fit to width");
  await expect.poll(async () => (await dimensions(wrapper)).clientHeight).toBe(220);
  expect(
    (await dimensions(wrapper)).scrollWidth - (await dimensions(wrapper)).clientWidth,
  ).toBeLessThanOrEqual(2);
  await expect(wrapper).toHaveAttribute("data-table-sticky-header-active", "true");

  await chooseLayout(page, menuCell, "Scroll horizontally");
  const scrolling = await dimensions(wrapper);
  expect(scrolling.clientHeight).toBe(220);
  expect(scrolling.scrollWidth).toBeGreaterThan(scrolling.clientWidth);
  await toggleOption(page, menuCell, "Limit height");
  await expect(table).toHaveAttribute("data-table-max-height", "220");
  await expect(table).toHaveAttribute("data-table-layout", "scroll");
  await expect(wrapper).toHaveAttribute("data-table-sticky-header-active", "true");
  expect((await dimensions(wrapper)).clientHeight).toBeGreaterThan(360);
  await toggleOption(page, menuCell, "Limit height");
  await expect.poll(async () => (await dimensions(wrapper)).clientHeight).toBe(220);
});

test("Custom height overrides the host cap and Use default restores the current host value", async ({
  page,
}) => {
  await page.goto("/?tableLayoutFixture=true&narrowEditor=true");
  const wrapper = editorFor(page).locator(".tableWrapper").first();
  const table = wrapper.locator("table");
  const cell = table.locator("td").first();
  await page.getByTestId("scribe-container").evaluate((element) => {
    element.style.setProperty("--scribe-table-max-height", "240px");
  });
  await toggleOption(page, cell, "Limit height");
  await expect.poll(async () => (await dimensions(wrapper)).clientHeight).toBe(240);
  await setHeight(page, cell, 300);
  await expect.poll(async () => (await dimensions(wrapper)).clientHeight).toBe(300);
  await page.getByTestId("scribe-container").evaluate((element) => {
    element.style.setProperty("--scribe-table-max-height", "180px");
  });
  expect((await dimensions(wrapper)).clientHeight).toBe(300);
  await openHeightDialog(page, cell);
  await heightDialog(page).getByRole("button", { name: "Use default", exact: true }).click();
  await expect(heightDialog(page)).toBeHidden();
  await expect(editorFor(page)).toBeFocused();
  await expect(table).not.toHaveAttribute("data-table-max-height");
  await expect(table).toHaveAttribute("data-table-limit-height", "true");
  await expect.poll(async () => (await dimensions(wrapper)).clientHeight).toBe(180);
  await page.getByTestId("scribe-container").evaluate((element) => {
    element.style.removeProperty("--scribe-table-max-height");
  });
  await expect.poll(async () => (await dimensions(wrapper)).clientHeight).toBe(360);
});

test("Per-table heights remain isolated and survive saved HTML in read-only mode", async ({
  page,
}) => {
  await page.goto("/?tableLayoutFixture=true&narrowEditor=true&editableTransition=true");
  await page.getByRole("button", { name: "Enable editing", exact: true }).click();
  const editor = editorFor(page);
  const first = editor.locator(".tableWrapper").first();
  const second = editor.locator(".tableWrapper").nth(1);
  await setHeight(page, first.locator("td").first(), 250);
  await toggleOption(page, first.locator("td").first(), "Limit height");
  await expect(second.locator("table")).not.toHaveAttribute("data-table-max-height");
  await setHeight(page, second.locator("td").first(), 140);
  await toggleOption(page, second.locator("td").first(), "Limit height");
  await expect(first.locator("table")).toHaveAttribute("data-table-max-height", "250");
  await page.getByRole("button", { name: "Disable editing", exact: true }).click();
  await page.getByRole("button", { name: "Reload saved table content", exact: true }).click();
  await expect(editor).not.toBeEditable();
  await expect(controlsFor(page)).toHaveCount(0);
  await expect(first.locator("table")).toHaveAttribute("data-table-max-height", "250");
  await expect(second.locator("table")).toHaveAttribute("data-table-max-height", "140");
  await expect.poll(async () => (await dimensions(first)).clientHeight).toBe(250);
  await expect(page.getByTestId("serialized-html")).toContainText('data-table-max-height="250"');
  await expect(page.getByTestId("serialized-html")).toContainText('data-table-max-height="140"');
});

test("A short table remains compact when its maximum height is much larger", async ({ page }) => {
  await page.goto("/?tableLayoutFixture=true&narrowEditor=true");
  const shortTable = editorFor(page).locator(".tableWrapper").nth(1);
  const cell = shortTable.locator("td").first();
  const naturalHeight = (await dimensions(shortTable)).clientHeight;
  await setHeight(page, cell, 2000);
  await toggleOption(page, cell, "Limit height");
  const capped = await dimensions(shortTable);
  expect(Math.abs(capped.clientHeight - naturalHeight)).toBeLessThanOrEqual(1);
  expect(capped.clientHeight).toBeLessThan(200);
  expect(capped.scrollHeight - capped.clientHeight).toBeLessThanOrEqual(2);
});

test("Custom caps retain native sticky header cells, editing, and keyboard navigation", async ({
  page,
}) => {
  await page.goto("/?tableStickyHeaderFixture=true&narrowEditor=true");
  const wrapper = editorFor(page).locator(".tableWrapper").first();
  const table = wrapper.locator("table");
  const cell = table.locator("td").first();
  await setHeight(page, cell, 220);
  await toggleOption(page, cell, "Sticky header row");
  const originalHeader = await table.locator("th").first().elementHandle();
  if (!originalHeader) throw new Error("Expected a native table header cell");
  await wrapper.evaluate((element) => {
    element.scrollTop = 220;
    element.scrollLeft = 100;
  });
  await expect
    .poll(async () =>
      wrapper.evaluate((element) => {
        const header = element.querySelector("th")!;
        const body = element.querySelector("td")!;
        const style = element.ownerDocument.defaultView!.getComputedStyle(header);
        return {
          topGap: Math.abs(
            header.getBoundingClientRect().top - element.getBoundingClientRect().top,
          ),
          columnGap: Math.abs(
            header.getBoundingClientRect().left - body.getBoundingClientRect().left,
          ),
          position: style.position,
          height: element.clientHeight,
          scrollTop: element.scrollTop,
        };
      }),
    )
    .toMatchObject({ position: "sticky", height: 220 });
  const pinned = await wrapper.evaluate((element) => {
    const header = element.querySelector("th")!;
    const body = element.querySelector("td")!;
    return {
      topGap: Math.abs(header.getBoundingClientRect().top - element.getBoundingClientRect().top),
      columnGap: Math.abs(header.getBoundingClientRect().left - body.getBoundingClientRect().left),
      scrollTop: element.scrollTop,
    };
  });
  expect(pinned.topGap).toBeLessThanOrEqual(2);
  expect(pinned.columnGap).toBeLessThanOrEqual(1);
  expect(pinned.scrollTop).toBeGreaterThan(150);
  expect(
    await table
      .locator("th")
      .first()
      .evaluate((header, original) => header === original, originalHeader),
  ).toBe(true);
  await originalHeader.dispose();
  await expect(table.locator("tr")).toHaveCount(21);
  await expect(table.locator("th")).toHaveCount(3);

  const selected = table.locator("tr").nth(8).locator("td").first();
  await selected.click();
  await page.keyboard.press("End");
  await page.keyboard.insertText(" updated");
  await expect(selected).toHaveText("Sticky project 8 updated");
  await page.keyboard.press("Tab");
  await page.keyboard.insertText("Edited ");
  await expect(table.locator("tr").nth(8).locator("td").nth(1)).toContainText("Edited ");
  await page.keyboard.press("Shift+Tab");
  await expect
    .poll(async () =>
      selected.evaluate((element) => {
        const selection = element.ownerDocument.defaultView!.getSelection();
        return Boolean(selection?.anchorNode && element.contains(selection.anchorNode));
      }),
    )
    .toBe(true);
  await expect(wrapper).toHaveAttribute("data-table-sticky-header-active", "true");
  await expect(table).toHaveAttribute("data-table-max-height", "220");
});

for (const width of [320, 360]) {
  test(`Maximum height is reachable by keyboard and contained at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 740 });
    await page.goto("/?tableLayoutFixture=true&narrowEditor=true");
    const editor = editorFor(page);
    const table = editor.locator("table").first();
    await table.locator("td").first().click();
    await expect(editor).toBeFocused();
    await expect(controlsFor(page)).toBeVisible();
    await page.keyboard.press("Alt+F10");
    await expect(
      controlsFor(page).getByRole("button", { name: "Add row above", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("End");
    await expect(
      controlsFor(page).getByRole("button", { name: "Delete table", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(
      controlsFor(page).getByRole("button", { name: "Table layout", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menuitemradio", { name: "Auto", exact: true })).toBeFocused();
    for (const option of [
      { role: "menuitemradio", name: "Fit to width" },
      { role: "menuitemradio", name: "Scroll horizontally" },
      { role: "menuitemcheckbox", name: "Limit height" },
      { role: "menuitem", name: "Maximum height…" },
    ] as const) {
      await page.keyboard.press("ArrowDown");
      await expect(page.getByRole(option.role, { name: option.name, exact: true })).toBeFocused();
    }
    await page.keyboard.press("Enter");
    await expect(heightInput(page)).toBeFocused();
    const dialogBounds = await heightDialog(page).boundingBox();
    expect(dialogBounds?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect((dialogBounds?.x ?? width) + (dialogBounds?.width ?? width)).toBeLessThanOrEqual(width);
    await heightInput(page).fill("240");
    await page.keyboard.press("Enter");
    await expect(heightDialog(page)).toBeHidden();
    await expect(editor).toBeFocused();
    await expect(table).toHaveAttribute("data-table-max-height", "240");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
    ).toBeLessThanOrEqual(2);
  });
}
