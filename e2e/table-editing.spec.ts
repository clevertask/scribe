import { expect, test, type Locator, type Page } from "./fixtures";

const documentText = "Package consumer content";

const insertTableFromSlashMenu = async (page: Page) => {
  const editor = page.getByRole("textbox", {
    name: "Document content",
    exact: true,
  });

  await expect(editor).toBeEditable();
  await editor.getByText(documentText, { exact: true }).click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.insertText("/table");

  const suggestions = page.getByRole("group", {
    name: "Block suggestions",
    exact: true,
  });
  const tableSuggestion = suggestions.getByRole("button", {
    name: "Table",
    exact: true,
  });

  await expect(tableSuggestion).toBeVisible();
  await expect(tableSuggestion).toHaveAccessibleDescription("Insert a 3 × 3 table");
  await tableSuggestion.click();

  const table = editor.locator("table");

  await expect(suggestions).toHaveCount(0);
  await expect(table).toBeVisible();
  await expect(table.locator("tr")).toHaveCount(3);
  await expect(table.locator("th")).toHaveCount(3);
  await expect(table.locator("td")).toHaveCount(6);

  return { editor, table };
};

const revealColumnResizeHandle = async (page: Page, cell: Locator) => {
  const cellBox = await cell.boundingBox();

  if (!cellBox) {
    throw new Error("Expected the table cell to have a bounding box");
  }

  await page.mouse.move(cellBox.x + cellBox.width - 1, cellBox.y + cellBox.height / 2);

  const handle = cell.locator(".column-resize-handle");

  await expect(handle).toBeVisible();

  return { cellBox, handle };
};

const getTableMenuGap = async (tableWrapper: Locator, tableControls: Locator) => {
  const tableBox = await tableWrapper.boundingBox();
  const controlsBox = await tableControls.boundingBox();

  if (!tableBox || !controlsBox) {
    throw new Error("Expected the table and its controls to have bounding boxes");
  }

  return tableBox.y - (controlsBox.y + controlsBox.height);
};

test("Slash insertion exposes table-local editing commands", async ({ page }) => {
  await page.goto("/");

  const { table } = await insertTableFromSlashMenu(page);

  await table.locator("td").first().click();

  const tableControls = page.getByRole("toolbar", {
    name: "Table controls",
    exact: true,
  });
  const commandNames = [
    "Add row above",
    "Add row below",
    "Delete row",
    "Add column before",
    "Add column after",
    "Delete column",
    "Toggle header row",
    "Delete table",
  ] as const;

  await expect(tableControls).toBeVisible();

  for (const commandName of commandNames) {
    await expect(
      tableControls.getByRole("button", { name: commandName, exact: true }),
    ).toBeVisible();
  }

  await tableControls.getByRole("button", { name: "Add row above", exact: true }).click();
  await expect(table.locator("tr")).toHaveCount(4);

  await tableControls.getByRole("button", { name: "Add column after", exact: true }).click();
  await expect(table.locator("tr").first().locator("th, td")).toHaveCount(4);

  await tableControls.getByRole("button", { name: "Delete row", exact: true }).click();
  await expect(table.locator("tr")).toHaveCount(3);

  await tableControls.getByRole("button", { name: "Delete column", exact: true }).click();
  await expect(table.locator("tr").first().locator("th, td")).toHaveCount(3);

  await tableControls.getByRole("button", { name: "Toggle header row", exact: true }).click();
  await expect(table.locator("th")).toHaveCount(0);

  await tableControls.getByRole("button", { name: "Delete table", exact: true }).click();
  await expect(table).toHaveCount(0);
  await expect(tableControls).toHaveCount(0);
});

test("Keyboard users can enter, operate, navigate, and leave table controls", async ({ page }) => {
  await page.goto("/?table=true");

  const editor = page.getByRole("textbox", {
    name: "Document content",
    exact: true,
  });
  const table = editor.locator("table");
  const tableControls = page.getByRole("toolbar", {
    name: "Table controls",
    exact: true,
  });
  const addRowAbove = tableControls.getByRole("button", {
    name: "Add row above",
    exact: true,
  });
  const addRowBelow = tableControls.getByRole("button", {
    name: "Add row below",
    exact: true,
  });
  const deleteTable = tableControls.getByRole("button", {
    name: "Delete table",
    exact: true,
  });

  await table.locator("td").first().click();
  await expect(tableControls).toBeVisible();
  await expect(tableControls).toHaveAttribute("aria-keyshortcuts", "Alt+F10");

  await page.keyboard.press("Alt+F10");
  await expect(addRowAbove).toBeFocused();

  await page.keyboard.press("ArrowRight");
  await expect(addRowBelow).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(table.locator("tr")).toHaveCount(3);
  await expect(editor).toBeFocused();

  await page.keyboard.press("Alt+F10");
  await page.keyboard.press("End");
  await expect(deleteTable).toBeFocused();
  await page.keyboard.press("Home");
  await expect(addRowAbove).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(editor).toBeFocused();
  await expect(tableControls).toBeVisible();
});

test("Table controls hide when focus leaves after running a command", async ({ page }) => {
  await page.goto("/?table=true");

  const editor = page.getByRole("textbox", {
    name: "Document content",
    exact: true,
  });
  const table = editor.locator("table");
  const tableControls = page.getByRole("toolbar", {
    name: "Table controls",
    exact: true,
  });
  const outsideFocusTarget = page.getByRole("button", {
    name: "Outside focus target",
    exact: true,
  });

  await table.locator("td").first().click();
  await tableControls.getByRole("button", { name: "Add row below", exact: true }).click();
  await expect(table.locator("tr")).toHaveCount(3);
  await expect(editor).toBeFocused();

  await outsideFocusTarget.click();
  await expect(outsideFocusTarget).toBeFocused();
  await expect(tableControls).toHaveCount(0);
});

test("Table controls stay anchored while the window scrolls", async ({ page }) => {
  await page.goto("/?table=true&windowScroll=true");

  const editor = page.getByRole("textbox", {
    name: "Document content",
    exact: true,
  });
  const tableWrapper = editor.locator(".tableWrapper");
  const tableControls = page.getByRole("toolbar", {
    name: "Table controls",
    exact: true,
  });

  await editor.locator("td").first().click();
  await expect(tableControls).toBeVisible();

  const initialGap = await getTableMenuGap(tableWrapper, tableControls);
  const initialScrollY = await page.evaluate(() => window.scrollY);

  await page.evaluate(() => window.scrollBy(0, 120));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(initialScrollY);
  await expect
    .poll(async () => Math.abs((await getTableMenuGap(tableWrapper, tableControls)) - initialGap))
    .toBeLessThan(5);
});

test("Table controls stay anchored inside a nested scroll container", async ({ page }) => {
  await page.goto("/?table=true&nestedScroll=true");

  const editor = page.getByRole("textbox", {
    name: "Document content",
    exact: true,
  });
  const scrollContainer = page.getByTestId("nested-scroll-container");
  const tableWrapper = editor.locator(".tableWrapper");
  const tableControls = page.getByRole("toolbar", {
    name: "Table controls",
    exact: true,
  });

  await editor.locator("td").first().click();
  await expect(tableControls).toBeVisible();

  const initialGap = await getTableMenuGap(tableWrapper, tableControls);
  const initialScrollTop = await scrollContainer.evaluate((element) => element.scrollTop);

  await scrollContainer.evaluate((element) => element.scrollBy(0, 80));
  await expect
    .poll(() => scrollContainer.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(initialScrollTop);
  await expect
    .poll(async () => Math.abs((await getTableMenuGap(tableWrapper, tableControls)) - initialGap))
    .toBeLessThan(5);
});

test("A narrow editor contains every table command", async ({ page }) => {
  await page.goto("/?table=true&narrowEditor=true");

  const scribeContainer = page.getByTestId("scribe-container");
  const editor = page.getByRole("textbox", {
    name: "Document content",
    exact: true,
  });
  const table = editor.locator("table");
  const tableControls = page.getByRole("toolbar", {
    name: "Table controls",
    exact: true,
  });
  const deleteTable = tableControls.getByRole("button", {
    name: "Delete table",
    exact: true,
  });

  await table.locator("td").first().click();
  await expect(tableControls).toBeVisible();

  const containerBox = await scribeContainer.boundingBox();
  const controlsBox = await tableControls.boundingBox();

  if (!containerBox || !controlsBox) {
    throw new Error("Expected the narrow editor and its controls to have bounding boxes");
  }

  expect(controlsBox.x).toBeGreaterThanOrEqual(containerBox.x - 1);
  expect(controlsBox.x + controlsBox.width).toBeLessThanOrEqual(
    containerBox.x + containerBox.width + 1,
  );

  await deleteTable.scrollIntoViewIfNeeded();
  await expect(deleteTable).toBeVisible();
  await deleteTable.click();
  await expect(table).toHaveCount(0);
});

test("A resized column can make a wide table horizontally scrollable", async ({ page }) => {
  await page.goto("/?table=true");

  const editor = page.getByRole("textbox", {
    name: "Document content",
    exact: true,
  });
  const table = editor.locator("table");
  const tableWrapper = editor.locator(".tableWrapper");
  const firstHeader = table.locator("th").first();

  await expect(tableWrapper).toHaveCSS("overflow-x", "auto");

  const { cellBox, handle } = await revealColumnResizeHandle(page, firstHeader);
  const handleBox = await handle.boundingBox();

  if (!handleBox) {
    throw new Error("Expected the column resize handle to have a bounding box");
  }

  const handleCenterX = handleBox.x + handleBox.width / 2;
  const handleCenterY = handleBox.y + handleBox.height / 2;

  await page.mouse.move(handleCenterX, handleCenterY);
  await page.mouse.down();
  await page.mouse.move(handleCenterX + 700, handleCenterY, { steps: 12 });
  await expect(editor).toHaveClass(/resize-cursor/);
  await page.mouse.up();

  await expect
    .poll(async () => (await firstHeader.boundingBox())?.width ?? 0)
    .toBeGreaterThan(cellBox.width + 400);

  const overflow = await tableWrapper.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));

  expect(overflow.scrollWidth).toBeGreaterThan(overflow.clientWidth);

  const horizontalScrollOffset = await tableWrapper.evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
    return element.scrollLeft;
  });

  expect(horizontalScrollOffset).toBeGreaterThan(0);
});

test("Table controls become available after enabling editing", async ({ page }) => {
  await page.goto("/?table=true&editableTransition=true");

  const editor = page.getByRole("textbox", {
    name: "Document content",
    exact: true,
  });
  const table = editor.locator("table");
  const firstHeader = table.locator("th").first();
  const lastBodyCell = table.locator("td").last();
  const tableControls = page.getByRole("toolbar", {
    name: "Table controls",
    exact: true,
  });

  await expect(editor).not.toBeEditable();
  await expect(tableControls).toHaveCount(0);

  const readOnlyHeaderBox = await firstHeader.boundingBox();

  if (!readOnlyHeaderBox) {
    throw new Error("Expected the read-only table header to have a bounding box");
  }

  await page.mouse.move(
    readOnlyHeaderBox.x + readOnlyHeaderBox.width - 1,
    readOnlyHeaderBox.y + readOnlyHeaderBox.height / 2,
  );
  await expect(firstHeader.locator(".column-resize-handle")).toHaveCount(0);

  await page.getByRole("button", { name: "Enable editing", exact: true }).click();
  await expect(editor).toBeEditable();

  await lastBodyCell.click();
  await expect(tableControls).toBeVisible();

  await tableControls.getByRole("button", { name: "Add row below", exact: true }).click();
  await expect(table.locator("tr")).toHaveCount(3);

  await revealColumnResizeHandle(page, firstHeader);

  await page.getByRole("button", { name: "Disable editing", exact: true }).click();
  await expect(editor).not.toBeEditable();
  await expect(tableControls).toHaveCount(0);
  await expect(firstHeader.locator(".column-resize-handle")).toHaveCount(0);

  const disabledHeaderBox = await firstHeader.boundingBox();

  if (!disabledHeaderBox) {
    throw new Error("Expected the disabled table header to have a bounding box");
  }

  await page.mouse.move(
    disabledHeaderBox.x + disabledHeaderBox.width - 1,
    disabledHeaderBox.y + disabledHeaderBox.height / 2,
  );
  await expect(firstHeader.locator(".column-resize-handle")).toHaveCount(0);
});
