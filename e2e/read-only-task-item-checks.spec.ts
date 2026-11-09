import { expect, test, type Page } from "./fixtures";

const readActions = (page: Page) =>
  page
    .getByTestId("checkbox-actions")
    .evaluate((element) => JSON.parse(element.textContent ?? "[]"));

const expectReadOnlyWithoutEditorFocus = async (page: Page) => {
  const editor = page.getByRole("textbox", { name: "Read-only checklist", exact: true });
  await expect(editor).toHaveAttribute("contenteditable", "false");
  await expect(editor).toHaveAttribute("aria-readonly", "true");
  await expect(editor.locator(".scribe-task-list > li > div > p")).toHaveText([
    "Same",
    "Same",
    "Same",
  ]);
  await expect(editor).not.toContainText("NoTextInsertion");
  await expect(page.getByTestId("editor-focus-count")).toHaveText("0");
};

test("Read-only checkboxes are disabled by default and while the capability is paused", async ({
  page,
}) => {
  await page.goto("/?taskItemChecks=default");
  const checkboxes = page.getByRole("checkbox");
  await expect(checkboxes).toHaveCount(3);
  for (const checkbox of await checkboxes.all()) await expect(checkbox).toBeDisabled();
  // Bypass Playwright's enabled check; the browser must still reject a native disabled input.
  await checkboxes.nth(2).locator("..").click({ force: true });
  expect(await readActions(page)).toEqual([]);

  await page.getByRole("button", { name: "Allow checkbox changes", exact: true }).click();
  await expect(checkboxes.nth(2)).toBeEnabled();
  await page.getByRole("button", { name: "Pause checkbox changes", exact: true }).click();
  for (const checkbox of await checkboxes.all()) await expect(checkbox).toBeDisabled();
  await checkboxes.nth(2).locator("..").click({ force: true });
  expect(await readActions(page)).toEqual([]);

  await page.getByRole("button", { name: "Resume checkbox changes", exact: true }).click();
  await checkboxes.nth(2).click();
  await expect(checkboxes.nth(2)).toBeChecked();
  await expect(checkboxes.nth(0)).not.toBeChecked();
  await expect(checkboxes.nth(1)).not.toBeChecked();
  expect(await readActions(page)).toEqual([
    { checkboxIndex: 2, previousChecked: false, checked: true },
  ]);

  await page.getByRole("button", { name: "Revoke checkbox changes", exact: true }).click();
  for (const checkbox of await checkboxes.all()) await expect(checkbox).toBeDisabled();
  await expectReadOnlyWithoutEditorFocus(page);
});

test("Tab and Space toggle duplicate and nested items exactly once without entering text editing", async ({
  page,
}) => {
  await page.goto("/?taskItemChecks=enabled");
  const checkboxes = page.getByRole("checkbox");
  await expect(checkboxes).toHaveCount(3);
  const sourcesBefore = JSON.parse(
    (await page.getByTestId("content-change-sources").textContent()) ?? "[]",
  );
  await page.getByRole("button", { name: "Before checklist", exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(checkboxes.nth(0)).toBeFocused();
  await page.keyboard.press("Space");
  await expect(checkboxes.nth(0)).toBeChecked();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(checkboxes.nth(2)).toBeFocused();
  await page.keyboard.press("Space");
  await expect(checkboxes.nth(2)).toBeChecked();
  await expect(checkboxes.nth(1)).not.toBeChecked();
  await page.keyboard.type("NoTextInsertion");
  expect(await readActions(page)).toEqual([
    { checkboxIndex: 0, previousChecked: false, checked: true },
    { checkboxIndex: 2, previousChecked: false, checked: true },
  ]);
  await expectReadOnlyWithoutEditorFocus(page);

  await page.getByRole("button", { name: "Restore canonical content", exact: true }).click();
  for (const checkbox of await checkboxes.all()) await expect(checkbox).not.toBeChecked();
  expect(await readActions(page)).toHaveLength(2);
  await expect(page.getByTestId("content-change-sources")).toHaveText(
    JSON.stringify([...sourcesBefore, "programmatic", "programmatic", "programmatic"]),
  );
  await expectReadOnlyWithoutEditorFocus(page);
});

test.describe("Touch read-only checkbox actions", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("A label tap changes the nested checkbox once without focusing editable text", async ({
    page,
  }) => {
    await page.goto("/?taskItemChecks=enabled");
    const checkboxes = page.getByRole("checkbox");
    await expect(checkboxes).toHaveCount(3);
    await checkboxes.nth(2).locator("..").tap();
    await expect(checkboxes.nth(2)).toBeChecked();
    await expect(checkboxes.nth(0)).not.toBeChecked();
    await expect(checkboxes.nth(1)).not.toBeChecked();
    expect(await readActions(page)).toEqual([
      { checkboxIndex: 2, previousChecked: false, checked: true },
    ]);
    await expectReadOnlyWithoutEditorFocus(page);
  });
});
