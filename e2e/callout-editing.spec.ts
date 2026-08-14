import { expect, test, type Locator, type Page } from "./fixtures";

const documentText = "Package consumer content";

const insertCalloutFromSlashMenu = async (page: Page) => {
  const editor = page.getByRole("textbox", {
    name: "Document content",
    exact: true,
  });

  await editor.getByText(documentText, { exact: true }).click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.insertText("/callout");

  const suggestions = page.getByRole("group", {
    name: "Block suggestions",
    exact: true,
  });
  const calloutSuggestion = suggestions.getByRole("button", {
    name: "Callout",
    exact: true,
  });

  await expect(calloutSuggestion).toBeVisible();
  await expect(calloutSuggestion).toHaveAccessibleDescription(
    "Add an info, tip, warning, or caution",
  );
  await calloutSuggestion.click();

  const callout = editor.locator('[data-type="callout"]');

  await expect(suggestions).toHaveCount(0);
  await expect(callout).toHaveAttribute("data-variant", "info");
  await expect(callout.locator("[data-callout-label]")).toHaveText("Info");
  await expect(callout).not.toHaveAttribute("role", "alert");

  return { callout, editor };
};

const getMenuGap = async (callout: Locator, controls: Locator) => {
  const calloutBox = await callout.boundingBox();
  const controlsBox = await controls.boundingBox();

  if (!calloutBox || !controlsBox) {
    throw new Error("Expected the Callout and its controls to have bounding boxes");
  }

  return calloutBox.y - (controlsBox.y + controlsBox.height);
};

test("Slash insertion exposes understandable Callout variants and preserves content", async ({
  page,
}) => {
  await page.goto("/");

  const { callout, editor } = await insertCalloutFromSlashMenu(page);

  await page.keyboard.insertText("A quiet heads-up");

  const controls = page.getByRole("toolbar", {
    name: "Callout type",
    exact: true,
  });

  await expect(controls).toBeVisible();
  await expect(controls.getByRole("button", { name: "Info", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  for (const name of ["Info", "Tip", "Warning", "Caution", "Turn into text"] as const) {
    await expect(controls.getByRole("button", { name, exact: true })).toBeVisible();
  }

  await controls.getByRole("button", { name: "Warning", exact: true }).click();
  await expect(callout).toHaveAttribute("data-variant", "warning");
  await expect(callout.locator("[data-callout-label]")).toHaveText("Warning");
  await expect(editor).toContainText("A quiet heads-up");

  await controls.getByRole("button", { name: "Turn into text", exact: true }).click();
  await expect(callout).toHaveCount(0);
  await expect(editor).toContainText("A quiet heads-up");
});

test("Keyboard users can enter, change, navigate, and leave Callout controls", async ({ page }) => {
  await page.goto("/?callout=true");

  const editor = page.getByRole("textbox", {
    name: "Document content",
    exact: true,
  });
  const callout = editor.locator('[data-type="callout"]');
  const controls = page.getByRole("toolbar", {
    name: "Callout type",
    exact: true,
  });
  const info = controls.getByRole("button", { name: "Info", exact: true });
  const tip = controls.getByRole("button", { name: "Tip", exact: true });
  const warning = controls.getByRole("button", { name: "Warning", exact: true });
  const turnIntoText = controls.getByRole("button", {
    name: "Turn into text",
    exact: true,
  });

  await callout.getByText("Review the deployment settings before continuing.").click();
  await expect(controls).toHaveAttribute("aria-keyshortcuts", "Alt+F10");

  await page.keyboard.press("Alt+F10");
  await expect(info).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(tip).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(warning).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(callout).toHaveAttribute("data-variant", "warning");
  await expect(editor).toBeFocused();

  await page.keyboard.press("Alt+F10");
  await page.keyboard.press("End");
  await expect(turnIntoText).toBeFocused();
  await page.keyboard.press("Home");
  await expect(info).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(editor).toBeFocused();
  await expect(controls).toBeVisible();
});

test("Callouts render quietly while read-only and gain controls when editing starts", async ({
  page,
}) => {
  await page.goto("/?callout=true&editableTransition=true");

  const editor = page.getByRole("textbox", {
    name: "Document content",
    exact: true,
  });
  const callout = editor.locator('[data-type="callout"]');
  const controls = page.getByRole("toolbar", {
    name: "Callout type",
    exact: true,
  });

  await expect(editor).not.toBeEditable();
  await expect(callout).toBeVisible();
  await expect(callout.locator("[data-callout-label]")).toHaveText("Warning");
  await expect(controls).toHaveCount(0);

  await page.getByRole("button", { name: "Enable editing", exact: true }).click();
  await callout.getByText("Review the deployment settings before continuing.").click();
  await expect(editor).toBeEditable();
  await expect(controls).toBeVisible();

  await page.getByRole("button", { name: "Disable editing", exact: true }).click();
  await expect(editor).not.toBeEditable();
  await expect(controls).toHaveCount(0);
  await expect(callout).toBeVisible();
});

test("Callout controls remain anchored and contained in a narrow scrolling editor", async ({
  page,
}) => {
  await page.goto("/?callout=true&narrowEditor=true&nestedScroll=true");

  const container = page.getByTestId("scribe-container");
  const scrollContainer = page.getByTestId("nested-scroll-container");
  const editor = page.getByRole("textbox", {
    name: "Document content",
    exact: true,
  });
  const callout = editor.locator('[data-type="callout"]');
  const controls = page.getByRole("toolbar", {
    name: "Callout type",
    exact: true,
  });

  await callout.getByText("Review the deployment settings before continuing.").click();
  await expect(controls).toBeVisible();

  const containerBox = await container.boundingBox();
  const controlsBox = await controls.boundingBox();

  if (!containerBox || !controlsBox) {
    throw new Error("Expected the narrow editor and Callout controls to have bounding boxes");
  }

  expect(controlsBox.x).toBeGreaterThanOrEqual(containerBox.x - 1);
  expect(controlsBox.x + controlsBox.width).toBeLessThanOrEqual(
    containerBox.x + containerBox.width + 1,
  );

  const initialGap = await getMenuGap(callout, controls);
  const initialScrollTop = await scrollContainer.evaluate((element) => element.scrollTop);

  await scrollContainer.evaluate((element) => element.scrollBy(0, 80));
  await expect
    .poll(() => scrollContainer.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(initialScrollTop);
  await expect
    .poll(async () => Math.abs((await getMenuGap(callout, controls)) - initialGap))
    .toBeLessThan(5);

  await controls
    .getByRole("button", { name: "Turn into text", exact: true })
    .scrollIntoViewIfNeeded();
  await expect(controls.getByRole("button", { name: "Turn into text", exact: true })).toBeVisible();
});
