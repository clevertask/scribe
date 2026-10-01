import { expect, test, type Locator, type Page } from "./fixtures";

const editorFor = (page: Page) =>
  page.getByRole("textbox", { name: "Document content", exact: true });
const controlsFor = (page: Page) =>
  page.getByRole("toolbar", { name: "Table controls", exact: true });

const chooseLayout = async (page: Page, cell: Locator, option: string) => {
  await cell.click();
  await controlsFor(page).getByRole("button", { name: "Table layout", exact: true }).click();
  await page.getByRole("menuitemradio", { name: option, exact: true }).click();
  await expect(editorFor(page)).toBeFocused();
};

const toggleHeightLimit = async (page: Page, cell: Locator) => {
  await cell.click();
  await controlsFor(page).getByRole("button", { name: "Table layout", exact: true }).click();
  await page.getByRole("menuitemcheckbox", { name: "Limit height", exact: true }).click();
  await expect(editorFor(page)).toBeFocused();
};

const overflow = (wrapper: Locator) =>
  wrapper.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));

test("Explicit table layout responds to a narrow parent and survives saved HTML in read-only mode", async ({
  page,
}) => {
  await page.goto("/?tableLayoutFixture=true&narrowEditor=true&editableTransition=true");
  await page.getByRole("button", { name: "Enable editing", exact: true }).click();
  const editor = editorFor(page);
  const wrapper = editor.locator(".tableWrapper").first();
  const table = wrapper.locator("table");
  const firstCell = table.locator("td").first();
  const firstHeader = table.locator("th").first();
  const parent = page.getByTestId("scribe-container");
  const viewportWidth = page.viewportSize()?.width ?? 0;
  expect((await parent.boundingBox())?.width ?? viewportWidth).toBeLessThan(viewportWidth / 2);

  await chooseLayout(page, firstCell, "Scroll horizontally");
  await expect
    .poll(async () => {
      const dimensions = await overflow(wrapper);
      return dimensions.scrollWidth - dimensions.clientWidth;
    })
    .toBeGreaterThan(100);
  await expect.poll(async () => (await firstHeader.boundingBox())?.width ?? 0).toBeGreaterThan(175);
  const scrollingWidth = (await firstHeader.boundingBox())?.width ?? 0;
  expect(
    await parent.evaluate((element) => element.scrollWidth - element.clientWidth),
  ).toBeLessThanOrEqual(2);

  await chooseLayout(page, firstCell, "Fit to width");
  await expect
    .poll(async () => {
      const dimensions = await overflow(wrapper);
      return dimensions.scrollWidth - dimensions.clientWidth;
    })
    .toBeLessThanOrEqual(2);
  await expect
    .poll(async () => (await firstHeader.boundingBox())?.width ?? scrollingWidth)
    .toBeLessThan(scrollingWidth - 20);
  await expect(table.locator(".column-resize-handle")).toHaveCount(0);

  await chooseLayout(page, firstCell, "Scroll horizontally");
  await expect.poll(async () => (await firstHeader.boundingBox())?.width ?? 0).toBeGreaterThan(175);
  await toggleHeightLimit(page, firstCell);
  await page.getByRole("button", { name: "Disable editing", exact: true }).click();
  await expect(editor).not.toBeEditable();
  await expect(controlsFor(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Reload saved table content", exact: true }).click();

  await expect(editor).not.toBeEditable();
  await expect(table.locator("tr")).toHaveCount(21);
  const serializedHtml = await page.getByTestId("serialized-html").textContent();
  expect(serializedHtml).toContain('data-table-layout="scroll"');
  expect(serializedHtml).toContain('data-table-limit-height="true"');
  expect(serializedHtml).toContain('colwidth="180"');
  await expect.poll(async () => (await firstHeader.boundingBox())?.width ?? 0).toBeGreaterThan(175);
  const restoredOverflow = await overflow(wrapper);
  expect(restoredOverflow.scrollWidth).toBeGreaterThan(restoredOverflow.clientWidth);
  expect(restoredOverflow.clientHeight).toBeLessThanOrEqual(360);
  expect(restoredOverflow.scrollHeight).toBeGreaterThan(restoredOverflow.clientHeight);
  await expect(editor.locator(".tableWrapper").nth(1)).not.toHaveAttribute(
    "data-table-layout",
    "scroll",
  );
});

test("Height limiting is independent of width layout and can be turned off", async ({ page }) => {
  await page.goto("/?tableLayoutFixture=true&narrowEditor=true");
  const wrapper = editorFor(page).locator(".tableWrapper").first();
  const firstCell = wrapper.locator("td").first();
  await chooseLayout(page, firstCell, "Fit to width");
  expect((await overflow(wrapper)).clientHeight).toBeGreaterThan(360);
  await toggleHeightLimit(page, firstCell);
  const fitted = await overflow(wrapper);
  expect(fitted.clientHeight).toBeLessThanOrEqual(360);
  expect(fitted.scrollHeight).toBeGreaterThan(fitted.clientHeight);
  expect(fitted.scrollWidth - fitted.clientWidth).toBeLessThanOrEqual(2);

  const scrollTop = await wrapper.evaluate((element) => {
    element.scrollTop = 120;
    return element.scrollTop;
  });
  expect(scrollTop).toBeGreaterThan(0);
  await wrapper.evaluate((element) => {
    element.scrollTop = 0;
  });
  await chooseLayout(page, firstCell, "Scroll horizontally");
  const scrolling = await overflow(wrapper);
  expect(scrolling.clientHeight).toBeLessThanOrEqual(360);
  expect(scrolling.scrollHeight).toBeGreaterThan(scrolling.clientHeight);
  expect(scrolling.scrollWidth).toBeGreaterThan(scrolling.clientWidth);
  await page.getByTestId("scribe-container").evaluate((element) => {
    element.style.setProperty("--scribe-table-max-height", "240px");
  });
  await expect.poll(async () => (await overflow(wrapper)).clientHeight).toBeLessThanOrEqual(240);

  await toggleHeightLimit(page, firstCell);
  const unrestricted = await overflow(wrapper);
  expect(unrestricted.clientHeight).toBeGreaterThan(360);
  expect(unrestricted.scrollHeight - unrestricted.clientHeight).toBeLessThanOrEqual(2);
  expect(unrestricted.scrollWidth).toBeGreaterThan(unrestricted.clientWidth);
});

test("Scrolled tables retain cell editing, keyboard navigation, and column resizing", async ({
  page,
}) => {
  await page.goto("/?tableLayoutFixture=true&narrowEditor=true");
  const editor = editorFor(page);
  const wrapper = editor.locator(".tableWrapper").first();
  const table = wrapper.locator("table");
  await chooseLayout(page, table.locator("td").first(), "Scroll horizontally");
  const scrolledLeft = await wrapper.evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
    return element.scrollLeft;
  });
  expect(scrolledLeft).toBeGreaterThan(0);
  const statusCell = table.locator("tr").nth(1).locator("td").nth(2);
  await statusCell.click();
  await page.keyboard.press("End");
  await page.keyboard.insertText(" updated");
  await expect(statusCell).toHaveText("Planned 1 updated");
  await page.keyboard.press("Tab");
  await page.keyboard.insertText("Next ");
  await expect(table.locator("tr").nth(2).locator("td").first()).toHaveText("Next ");

  await wrapper.evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
  });
  const secondHeader = table.locator("th").nth(1);
  const headerBox = await secondHeader.boundingBox();
  if (!headerBox) throw new Error("Expected a visible header in the scrolled table");
  await page.mouse.move(headerBox.x + headerBox.width - 1, headerBox.y + headerBox.height / 2);
  const handle = secondHeader.locator(".column-resize-handle");
  await expect(handle).toBeVisible();
  const handleBox = await handle.boundingBox();
  if (!handleBox) throw new Error("Expected a resize handle after horizontal scrolling");
  const handleX = handleBox.x + handleBox.width / 2;
  const handleY = handleBox.y + handleBox.height / 2;
  await page.mouse.move(handleX, handleY);
  await page.mouse.down();
  await page.mouse.move(handleX + 40, handleY, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(async () => (await secondHeader.boundingBox())?.width ?? 0)
    .toBeGreaterThan(headerBox.width + 20);
  await expect(page.getByTestId("serialized-html")).toContainText('colwidth="');
});

test("The layout dropdown supports keyboard access and restores the active cell", async ({
  page,
}) => {
  await page.goto("/?table=true&narrowEditor=true");
  const editor = editorFor(page);
  await editor.locator("td").first().click();
  await expect(controlsFor(page)).toBeVisible();
  await page.keyboard.press("Alt+F10");
  await expect(
    controlsFor(page).getByRole("button", { name: "Add row above", exact: true }),
  ).toBeFocused();
  const trigger = controlsFor(page).getByRole("button", { name: "Table layout", exact: true });
  await page.keyboard.press("End");
  await expect(
    controlsFor(page).getByRole("button", { name: "Delete table", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitemradio", { name: "Auto", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByRole("menuitemradio", { name: "Fit to width", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(editor).toBeFocused();
  await trigger.click();
  await expect(
    page.getByRole("menuitemradio", { name: "Fit to width", exact: true }),
  ).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape");
  await expect(editor).toBeFocused();
});
