import { expect, test, type Page } from "./fixtures";

const documentText = "Package consumer content";
const linkHref = "https://example.com/reference";

const getEditorAndToolbar = async (page: Page) => {
  await page.goto("/");

  const editor = page.getByRole("textbox", { name: "Document content", exact: true });
  const toolbar = page.getByRole("toolbar", { name: "Text formatting", exact: true });

  await expect(editor).toBeEditable();
  await editor.click();
  await editor.press("ControlOrMeta+A");

  return { editor, toolbar };
};

const applyLink = async (page: Page) => {
  const linkSettings = page.getByRole("dialog", { name: "Link settings", exact: true });

  await page
    .getByRole("toolbar", { name: "Text formatting", exact: true })
    .getByRole("button", { name: "Link", exact: true })
    .click();
  await linkSettings.getByRole("textbox", { name: "URL", exact: true }).fill(linkHref);
  await linkSettings.getByRole("button", { name: "Save", exact: true }).click();
  await expect(linkSettings).toHaveCount(0);
};

const expectCombinedCodeLink = async (page: Page) => {
  const editor = page.getByRole("textbox", { name: "Document content", exact: true });

  await expect(editor.locator("code")).toHaveText(documentText);
  await expect(editor.getByRole("link", { name: documentText, exact: true })).toHaveAttribute(
    "href",
    linkHref,
  );
};

test("applying inline code preserves an existing link through undo and redo", async ({ page }) => {
  const { editor, toolbar } = await getEditorAndToolbar(page);

  await applyLink(page);
  await editor.press("ControlOrMeta+A");
  await toolbar.getByRole("button", { name: "Inline code", exact: true }).click();

  await expectCombinedCodeLink(page);

  await editor.press("ControlOrMeta+z");
  await expect(editor.locator("code")).toHaveCount(0);
  await expect(editor.getByRole("link", { name: documentText, exact: true })).toBeVisible();

  await editor.press("ControlOrMeta+Shift+z");
  await expectCombinedCodeLink(page);
});

test("applying a link preserves existing inline code", async ({ page }) => {
  const { toolbar } = await getEditorAndToolbar(page);

  await toolbar.getByRole("button", { name: "Inline code", exact: true }).click();
  await applyLink(page);

  await expectCombinedCodeLink(page);
});

test("applying inline code preserves existing bold formatting", async ({ page }) => {
  const { editor, toolbar } = await getEditorAndToolbar(page);

  await toolbar.getByRole("button", { name: "Bold", exact: true }).click();
  await toolbar.getByRole("button", { name: "Inline code", exact: true }).click();

  await expect(editor.getByRole("strong")).toHaveText(documentText);
  await expect(editor.locator("code")).toHaveText(documentText);

  await toolbar.getByRole("button", { name: "Inline code", exact: true }).click();
  await expect(editor.locator("code")).toHaveCount(0);
  await expect(editor.getByRole("strong")).toHaveText(documentText);
});
