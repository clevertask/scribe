import { expect, test, type Locator, type Page } from "./fixtures";

const editorFor = (page: Page) =>
  page.getByRole("textbox", { name: "Document content", exact: true });
const controlsFor = (page: Page) =>
  page.getByRole("toolbar", { name: "Table controls", exact: true });
const stickyOption = (page: Page) =>
  page.getByRole("menuitemcheckbox", { name: "Sticky header row", exact: true });
const layoutMenu = (page: Page) => page.getByRole("menu", { name: "Table layout", exact: true });

const openLayoutMenu = async (page: Page, cell: Locator) => {
  await expect(layoutMenu(page)).toBeHidden();
  await cell.click();
  await expect(editorFor(page)).toBeFocused();
  const trigger = controlsFor(page).getByRole("button", { name: "Table layout", exact: true });
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await trigger.click();
  await expect(layoutMenu(page)).toBeVisible();
};

const enableStickyHeader = async (page: Page, cell: Locator) => {
  await openLayoutMenu(page, cell);
  await stickyOption(page).click();
  await expect(layoutMenu(page)).toBeHidden();
  await expect(editorFor(page)).toBeFocused();
};

const tableGeometry = (wrapper: Locator) =>
  wrapper.evaluate((element) => {
    const table = element.querySelector<HTMLTableElement>(":scope > table")!;
    const header = table.rows[0].cells[0];
    const bodyCell = table.rows[1].cells[0];
    const headerBox = header.getBoundingClientRect();
    const bodyBox = bodyCell.getBoundingClientRect();
    const wrapperBox = element.getBoundingClientRect();
    const style = element.ownerDocument.defaultView!.getComputedStyle(header);

    return {
      wrapperTop: wrapperBox.top,
      wrapperBottom: wrapperBox.top + element.clientHeight,
      headerHeight: headerBox.height,
      headerTop: headerBox.top,
      headerBottom: headerBox.bottom,
      headerLeft: headerBox.left,
      bodyLeft: bodyBox.left,
      headerPosition: style.position,
      headerBackground: style.backgroundColor,
      scrollTop: element.scrollTop,
      scrollLeft: element.scrollLeft,
      horizontalOverflow: element.scrollWidth - element.clientWidth,
    };
  });

test("Sticky headers remain independent of height limiting and remember the header choice", async ({
  page,
}) => {
  await page.goto("/?tableStickyHeaderFixture=true&narrowEditor=true");
  const editor = editorFor(page);
  const wrapper = editor.locator(".tableWrapper").first();
  const table = wrapper.locator("table");
  const firstCell = table.locator("td").first();
  await openLayoutMenu(page, firstCell);
  await expect(stickyOption(page)).toHaveAttribute("aria-checked", "false");
  await expect(stickyOption(page)).toBeEnabled();
  await stickyOption(page).click();
  await expect(layoutMenu(page)).toBeHidden();
  await expect(editor).toBeFocused();
  await expect(wrapper).toHaveAttribute("data-table-sticky-header-active", "true");
  await expect(table).toHaveAttribute("data-table-sticky-header-row", "true");
  await expect(editor.locator(".tableWrapper").nth(1)).toHaveAttribute(
    "data-table-sticky-header-active",
    "false",
  );

  await openLayoutMenu(page, firstCell);
  await page.getByRole("menuitemcheckbox", { name: "Limit height", exact: true }).click();
  await expect(layoutMenu(page)).toBeHidden();
  await expect(editor).toBeFocused();
  await expect(wrapper).toHaveAttribute("data-table-sticky-header-active", "true");
  await openLayoutMenu(page, firstCell);
  await expect(stickyOption(page)).toHaveAttribute("aria-checked", "true");
  await expect(stickyOption(page)).toBeEnabled();
  await page.getByRole("menuitemcheckbox", { name: "Limit height", exact: true }).click();
  await expect(layoutMenu(page)).toBeHidden();
  await expect(editor).toBeFocused();
  await expect(wrapper).toHaveAttribute("data-table-sticky-header-active", "true");

  await controlsFor(page).getByRole("button", { name: "Toggle header row", exact: true }).click();
  await expect(table.locator("tr").first().locator("th")).toHaveCount(0);
  await expect(wrapper).toHaveAttribute("data-table-sticky-header-active", "false");
  await openLayoutMenu(page, firstCell);
  await expect(stickyOption(page)).toHaveAttribute("aria-checked", "true");
  await expect(stickyOption(page)).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(layoutMenu(page)).toBeHidden();
  await expect(editor).toBeFocused();
  await controlsFor(page).getByRole("button", { name: "Toggle header row", exact: true }).click();
  await expect(wrapper).toHaveAttribute("data-table-sticky-header-active", "true");
  await expect(table.locator("tr").first().locator("th")).toHaveCount(3);

  await openLayoutMenu(page, firstCell);
  await stickyOption(page).click();
  await expect(wrapper).toHaveAttribute("data-table-sticky-header-active", "false");
  const unpinned = await tableGeometry(wrapper);
  await wrapper.evaluate((element) => {
    element.scrollTop = 160;
  });
  await expect
    .poll(async () => (await tableGeometry(wrapper)).headerTop)
    .toBeLessThan(unpinned.headerTop - 100);
});

for (const layout of ["Auto", "Fit to width", "Scroll horizontally"]) {
  test(`Sticky headers pin vertically and follow their columns in ${layout} mode`, async ({
    page,
  }) => {
    await page.goto("/?tableStickyHeaderFixture=true&narrowEditor=true");
    const editor = editorFor(page);
    const wrapper = editor.locator(".tableWrapper").first();
    const firstCell = wrapper.locator("td").first();
    await openLayoutMenu(page, firstCell);
    await page.getByRole("menuitemradio", { name: layout, exact: true }).click();
    await enableStickyHeader(page, firstCell);
    const initial = await tableGeometry(wrapper);
    await wrapper.evaluate((element) => {
      element.scrollTop = 220;
      element.scrollLeft = 100;
    });

    await expect
      .poll(async () => {
        const geometry = await tableGeometry(wrapper);
        return Math.abs(geometry.headerTop - geometry.wrapperTop);
      })
      .toBeLessThanOrEqual(2);
    const scrolled = await tableGeometry(wrapper);
    expect(scrolled.scrollTop).toBeGreaterThan(150);
    expect(scrolled.headerPosition).toBe("sticky");
    expect(scrolled.headerBackground).not.toBe("rgba(0, 0, 0, 0)");
    expect(Math.abs(scrolled.headerLeft - scrolled.bodyLeft)).toBeLessThanOrEqual(1);
    expect(
      Math.abs(initial.headerLeft - scrolled.headerLeft - scrolled.scrollLeft),
    ).toBeLessThanOrEqual(2);
    if (layout === "Fit to width") {
      expect(scrolled.horizontalOverflow).toBeLessThanOrEqual(2);
    } else {
      expect(scrolled.scrollLeft).toBeGreaterThan(50);
    }
    expect(
      await page
        .getByTestId("scribe-container")
        .evaluate((element) => element.scrollWidth - element.clientWidth),
    ).toBeLessThanOrEqual(2);
  });
}

test("Saved sticky headers render in read-only mode and retain merged cells", async ({ page }) => {
  await page.goto("/?tableStickyHeaderFixture=true&narrowEditor=true&editableTransition=true");
  await page.getByRole("button", { name: "Enable editing", exact: true }).click();
  const editor = editorFor(page);
  const firstWrapper = editor.locator(".tableWrapper").first();
  await enableStickyHeader(page, firstWrapper.locator("td").first());
  await page.getByRole("button", { name: "Disable editing", exact: true }).click();
  await page.getByRole("button", { name: "Reload saved table content", exact: true }).click();
  await expect(editor).not.toBeEditable();
  await expect(controlsFor(page)).toHaveCount(0);
  await expect(firstWrapper).toHaveAttribute("data-table-sticky-header-active", "true");
  expect(await page.getByTestId("serialized-html").textContent()).toContain(
    'data-table-sticky-header-row="true"',
  );
  await firstWrapper.evaluate((element) => {
    element.scrollTop = 160;
  });
  const firstGeometry = await tableGeometry(firstWrapper);
  expect(Math.abs(firstGeometry.headerTop - firstGeometry.wrapperTop)).toBeLessThanOrEqual(2);

  const mergedWrapper = editor.locator(".tableWrapper").nth(2);
  await mergedWrapper.scrollIntoViewIfNeeded();
  const mergedTable = mergedWrapper.locator("table");
  await expect(mergedTable.locator("th").first()).toHaveAttribute("colspan", "2");
  await expect(mergedTable.locator("td").first()).toHaveAttribute("rowspan", "2");
  await expect(mergedWrapper).toHaveAttribute("data-table-sticky-header-active", "true");
  await mergedWrapper.evaluate((element) => {
    element.scrollTop = 180;
    element.scrollLeft = 100;
  });
  const mergedGeometry = await tableGeometry(mergedWrapper);
  expect(Math.abs(mergedGeometry.headerTop - mergedGeometry.wrapperTop)).toBeLessThanOrEqual(2);
  expect(Math.abs(mergedGeometry.headerLeft - mergedGeometry.bodyLeft)).toBeLessThanOrEqual(1);
  expect(mergedGeometry.scrollTop).toBeGreaterThan(100);
  expect(mergedGeometry.scrollLeft).toBeGreaterThan(50);
  await expect(mergedTable.locator("tr")).toHaveCount(21);
});

test("Uncapped sticky headers follow window scrolling, preserve saved views, and stop at the table end", async ({
  page,
}) => {
  await page.goto(
    "/?tableStickyHeaderFixture=true&uncappedStickyHeader=true&narrowEditor=true&windowScroll=true&editableTransition=true",
  );
  await page.getByRole("button", { name: "Enable editing", exact: true }).click();
  const editor = editorFor(page);
  const wrapper = editor.locator(".tableWrapper").first();
  await enableStickyHeader(page, wrapper.locator("td").first());
  await expect(wrapper).toHaveAttribute("data-table-limit-height", "false");
  await expect(wrapper).toHaveAttribute("data-table-sticky-header-active", "true");
  await page.getByTestId("scribe-container").evaluate((element) => {
    element.style.setProperty("--scribe-table-sticky-header-offset", "24px");
  });

  const scrollWindowThroughTable = async () => {
    await wrapper.evaluate((element) => {
      const ownerWindow = element.ownerDocument.defaultView!;
      ownerWindow.scrollTo(0, element.getBoundingClientRect().top + ownerWindow.scrollY + 220);
      element.scrollLeft = 100;
    });
    await expect
      .poll(async () => Math.abs((await tableGeometry(wrapper)).headerTop - 24))
      .toBeLessThanOrEqual(2);
    const geometry = await tableGeometry(wrapper);
    expect(geometry.wrapperTop).toBeLessThan(-150);
    expect(geometry.scrollTop).toBe(0);
    expect(geometry.scrollLeft).toBeGreaterThan(50);
    expect(Math.abs(geometry.headerLeft - geometry.bodyLeft)).toBeLessThanOrEqual(1);
    await expect(wrapper.locator("th")).toHaveCount(3);
  };

  await scrollWindowThroughTable();
  await page.getByRole("button", { name: "Disable editing", exact: true }).click();
  await page.getByRole("button", { name: "Reload saved table content", exact: true }).click();
  await expect(editor).not.toBeEditable();
  await expect(controlsFor(page)).toHaveCount(0);
  await expect(wrapper).toHaveAttribute("data-table-sticky-header-active", "true");
  await scrollWindowThroughTable();
  expect(await page.getByTestId("serialized-html").textContent()).toContain(
    'data-table-sticky-header-row="true"',
  );

  await wrapper.evaluate((element) => {
    const ownerWindow = element.ownerDocument.defaultView!;
    const header = element.querySelector("th")!;
    ownerWindow.scrollTo(
      0,
      element.getBoundingClientRect().bottom +
        ownerWindow.scrollY -
        header.getBoundingClientRect().height / 2,
    );
  });
  await expect.poll(async () => (await tableGeometry(wrapper)).headerTop).toBeLessThan(0);
  const ending = await tableGeometry(wrapper);
  expect(ending.headerBottom).toBeLessThanOrEqual(ending.wrapperBottom + 2);
  await wrapper.evaluate((element) => {
    const ownerWindow = element.ownerDocument.defaultView!;
    ownerWindow.scrollTo(0, element.getBoundingClientRect().bottom + ownerWindow.scrollY + 30);
  });
  await expect.poll(async () => (await tableGeometry(wrapper)).headerBottom).toBeLessThan(0);
});

test("Uncapped sticky headers use the nearest vertical scroll pane and remain horizontally aligned", async ({
  page,
}) => {
  await page.goto(
    "/?tableStickyHeaderFixture=true&uncappedStickyHeader=true&narrowEditor=true&nestedScroll=true",
  );
  const wrapper = editorFor(page).locator(".tableWrapper").first();
  await enableStickyHeader(page, wrapper.locator("td").first());
  const pane = page.getByTestId("nested-scroll-container");
  const paneTop = await pane.evaluate(
    (element) => element.getBoundingClientRect().top + element.clientTop,
  );
  await wrapper.evaluate((element) => {
    const pane = element.closest<HTMLElement>('[data-testid="nested-scroll-container"]')!;
    pane.scrollTop += element.getBoundingClientRect().top - pane.getBoundingClientRect().top + 180;
    element.scrollLeft = 120;
  });
  await expect
    .poll(async () => Math.abs((await tableGeometry(wrapper)).headerTop - paneTop))
    .toBeLessThanOrEqual(2);
  const geometry = await tableGeometry(wrapper);
  expect(geometry.wrapperTop).toBeLessThan(paneTop - 100);
  expect(geometry.scrollTop).toBe(0);
  expect(geometry.scrollLeft).toBeGreaterThan(50);
  expect(Math.abs(geometry.headerLeft - geometry.bodyLeft)).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);

  await page.getByTestId("scribe-container").evaluate((element) => {
    element.style.setProperty("--scribe-table-sticky-header-offset", "18px");
  });
  await pane.evaluate((element) => {
    element.scrollTop += 40;
  });
  await expect
    .poll(async () => Math.abs((await tableGeometry(wrapper)).headerTop - paneTop - 18))
    .toBeLessThanOrEqual(2);
});

for (const limitHeight of [true, false]) {
  test(`${limitHeight ? "Capped" : "Uncapped"} headers preserve column resizing and reveal keyboard navigation below the header`, async ({
    page,
  }) => {
    await page.goto(
      `/?tableStickyHeaderFixture=true&narrowEditor=true${limitHeight ? "" : "&uncappedStickyHeader=true&nestedScroll=true"}`,
    );
    const editor = editorFor(page);
    const wrapper = editor.locator(".tableWrapper").first();
    const table = wrapper.locator("table");
    await enableStickyHeader(page, table.locator("td").first());
    await wrapper.evaluate((element, capped) => {
      if (capped) {
        element.scrollTop = 200;
      } else {
        const pane = element.closest<HTMLElement>('[data-testid="nested-scroll-container"]')!;
        pane.scrollTop +=
          element.getBoundingClientRect().top - pane.getBoundingClientRect().top + 200;
      }
      element.scrollLeft = 120;
    }, limitHeight);
    await expect
      .poll(async () =>
        wrapper.evaluate((element, capped) => {
          const header = element.querySelector("th")!;
          const scrollContainer = capped
            ? element
            : element.closest<HTMLElement>('[data-testid="nested-scroll-container"]')!;
          return Math.abs(
            header.getBoundingClientRect().top - scrollContainer.getBoundingClientRect().top,
          );
        }, limitHeight),
      )
      .toBeLessThanOrEqual(2);
    const secondHeader = table.locator("th").nth(1);
    const headerBox = await secondHeader.boundingBox();
    if (!headerBox) throw new Error("Expected a visible sticky header");
    const handleX = headerBox.x + headerBox.width - 1;
    const handleY = headerBox.y + headerBox.height / 2;
    await page.mouse.move(handleX, handleY);
    await expect(secondHeader.locator(".column-resize-handle")).toBeVisible();
    await page.mouse.down();
    await page.mouse.move(handleX + 35, handleY, { steps: 8 });
    await page.mouse.up();
    await expect
      .poll(async () => (await secondHeader.boundingBox())?.width ?? 0)
      .toBeGreaterThan(headerBox.width + 20);
    await expect(page.getByTestId("serialized-html")).toContainText('colwidth="215"');

    const selectedCell = table.locator("tr").nth(8).locator("td").first();
    await selectedCell.click();
    await wrapper.evaluate((element, capped) => {
      const tableElement = element.querySelector<HTMLTableElement>("table")!;
      const headerHeight = tableElement.rows[0].getBoundingClientRect().height;
      const cell = tableElement.rows[8].cells[0];
      if (capped) {
        element.scrollTop = cell.offsetTop - headerHeight - 8;
      } else {
        const pane = element.closest<HTMLElement>('[data-testid="nested-scroll-container"]')!;
        pane.scrollTop +=
          cell.getBoundingClientRect().top - pane.getBoundingClientRect().top - headerHeight - 8;
      }
    }, limitHeight);
    await expect
      .poll(async () =>
        wrapper.evaluate((element, capped) => {
          const header = element.querySelector("th")!;
          const scrollContainer = capped
            ? element
            : element.closest<HTMLElement>('[data-testid="nested-scroll-container"]')!;
          return Math.abs(
            header.getBoundingClientRect().top - scrollContainer.getBoundingClientRect().top,
          );
        }, limitHeight),
      )
      .toBeLessThanOrEqual(2);
    await page.keyboard.press("Shift+Tab");
    const previousCell = table.locator("tr").nth(7).locator("td").last();
    await expect
      .poll(async () =>
        previousCell.evaluate((element) => {
          const anchor = element.ownerDocument.defaultView?.getSelection()?.anchorNode;
          return Boolean(anchor && element.contains(anchor));
        }),
      )
      .toBe(true);
    await expect
      .poll(async () => {
        const geometry = await tableGeometry(wrapper);
        const caretTop = await previousCell.evaluate((element) => {
          const selection = element.ownerDocument.defaultView?.getSelection();
          return selection?.rangeCount ? selection.getRangeAt(0).getBoundingClientRect().top : 0;
        });
        return caretTop - geometry.headerBottom;
      })
      .toBeGreaterThanOrEqual(-1);
    await page.keyboard.insertText("Edited ");
    await expect(previousCell).toContainText("Edited ");
    await expect(wrapper).toHaveAttribute("data-table-sticky-header-active", "true");

    // ProseMirror's native scrolling stops at position:sticky cells. Moving
    // between header cells must still reveal the caret in the horizontal viewport.
    await table.locator("th").first().click();
    await wrapper.evaluate((element) => {
      element.scrollLeft = 0;
    });
    const expectHeaderCaretVisible = async (headerIndex: number) => {
      await expect
        .poll(async () =>
          table
            .locator("th")
            .nth(headerIndex)
            .evaluate((header) => {
              const selection = header.ownerDocument.defaultView?.getSelection();
              const focus = selection?.focusNode;
              const focusElement =
                focus?.nodeType === 1 ? (focus as Element) : focus?.parentElement;
              const cell = focusElement?.closest<HTMLTableCellElement>("th,td");
              const range = header.ownerDocument.createRange();
              if (focus) {
                range.setStart(focus, selection!.focusOffset);
                range.collapse(true);
              }
              const caret = focus ? range.getBoundingClientRect() : null;
              const wrapper = header.closest<HTMLElement>(".tableWrapper")!;
              const box = wrapper.getBoundingClientRect();
              const left = box.left + wrapper.clientLeft;
              const right = left + wrapper.clientWidth;
              return {
                inExpectedHeader: Boolean(focus && header.contains(focus)),
                caretVisible: Boolean(
                  caret && caret.height > 0 && caret.left >= left - 1 && caret.right <= right + 1,
                ),
                focusCell: cell
                  ? {
                      tag: cell.tagName,
                      row: (cell.parentElement as HTMLTableRowElement).rowIndex,
                      index: cell.cellIndex,
                    }
                  : null,
                caret: caret
                  ? { left: caret.left, right: caret.right, top: caret.top, height: caret.height }
                  : null,
                viewport: { left, right },
                scrollLeft: wrapper.scrollLeft,
              };
            }),
        )
        .toMatchObject({ inExpectedHeader: true, caretVisible: true });
    };
    await expectHeaderCaretVisible(0);
    await page.keyboard.press("Tab");
    await expectHeaderCaretVisible(1);
    await expect.poll(async () => (await tableGeometry(wrapper)).scrollLeft).toBeGreaterThan(0);
    await page.keyboard.press("Tab");
    await expectHeaderCaretVisible(2);
    const rightmostScroll = (await tableGeometry(wrapper)).scrollLeft;
    await page.keyboard.press("Shift+Tab");
    await expectHeaderCaretVisible(1);
    await page.keyboard.press("Shift+Tab");
    await expectHeaderCaretVisible(0);
    expect((await tableGeometry(wrapper)).scrollLeft).toBeLessThan(rightmostScroll);
  });
}
