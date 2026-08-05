import type { BrowserContext } from "@playwright/test";
import { expect, test, type Locator, type Page } from "./fixtures";

const documentText = "Package consumer content";
const initialUrl = "initial.example/docs";
const initialHref = "https://initial.example/docs";
const linkedMarkdown = `[${documentText}](${initialHref})`;

const pasteLinkedMarkdown = async (context: BrowserContext, page: Page) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: "http://127.0.0.1:5174",
  });
  await page.goto("/");

  const editor = page.getByRole("textbox", { name: "Document content", exact: true });

  await page.evaluate(
    (clipboardText) => navigator.clipboard.writeText(clipboardText),
    linkedMarkdown,
  );
  await editor.click();
  await editor.press("ControlOrMeta+A");
  await editor.press("Backspace");
  await editor.press("ControlOrMeta+V");

  const link = editor.getByRole("link", { name: documentText, exact: true });

  await expect(link).toHaveAttribute("href", initialHref);

  return { editor, link };
};

const dragAcrossLink = async (page: Page, link: Locator) => {
  const box = await link.boundingBox();

  if (!box) {
    throw new Error("Expected the link to have a bounding box");
  }

  const y = box.y + box.height / 2;

  await page.mouse.move(box.x + 1, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 1, y, { steps: 12 });
  await page.mouse.up();
};

const createLink = async (page: Page) => {
  await page.goto("/");

  const editor = page.getByRole("textbox", { name: "Document content", exact: true });
  const toolbar = page.getByRole("toolbar", { name: "Text formatting", exact: true });

  await expect(editor).toBeEditable();
  await editor.click();
  await editor.press("ControlOrMeta+A");
  await toolbar.getByRole("button", { name: "Link", exact: true }).click();

  const linkSettings = page.getByRole("dialog", { name: "Link settings", exact: true });

  await expect(linkSettings).toBeVisible();
  await expect(
    linkSettings.getByRole("button", { name: "Remove link", exact: true }),
  ).toBeDisabled();
  await linkSettings.getByRole("textbox", { name: "URL", exact: true }).fill(initialUrl);
  await linkSettings.getByRole("button", { name: "Save", exact: true }).click();
  await expect(linkSettings).toHaveCount(0);

  const link = editor.getByRole("link", { name: documentText, exact: true });

  await expect(link).toHaveAttribute("href", initialHref);

  return { editor, link };
};

test("Existing link opens for editing without navigation and updates", async ({
  context,
  page,
}) => {
  const { editor, link } = await createLink(page);
  const editLink = page.getByRole("dialog", { name: "Edit link", exact: true });
  const pageCount = context.pages().length;
  const editorUrl = page.url();
  let popupCount = 0;
  const recordPopup = () => {
    popupCount += 1;
  };

  await editor.focus();
  await editor.press("ControlOrMeta+A");
  await expect(editLink).toHaveCount(0);

  page.on("popup", recordPopup);
  await link.click();

  const urlInput = editLink.getByRole("textbox", { name: "URL", exact: true });

  await expect(editLink).toBeVisible();
  expect(popupCount).toBe(0);
  expect(context.pages()).toHaveLength(pageCount);
  await expect(page).toHaveURL(editorUrl);
  await expect(urlInput).toHaveValue(initialHref);

  await urlInput.fill("updated.example/reference");
  await editLink.getByRole("button", { name: "Save", exact: true }).click();
  await expect(editLink).toHaveCount(0);
  await expect(link).toHaveAttribute("href", "https://updated.example/reference");

  page.off("popup", recordPopup);
});

test("Selecting a pasted link keeps editing focus in the document", async ({ context, page }) => {
  const { editor } = await pasteLinkedMarkdown(context, page);
  const editLink = page.getByRole("dialog", { name: "Edit link", exact: true });
  const replacementText = "Replacement package consumer content";

  await editor.focus();
  await editor.press("ControlOrMeta+A");

  await expect(editLink).toHaveCount(0);
  await expect(editor).toBeFocused();

  await page.keyboard.type(replacementText);

  await expect(editor).toHaveText(replacementText);
});

test("Dragging across a pasted link keeps editing focus in the document", async ({
  context,
  page,
}) => {
  const { editor, link } = await pasteLinkedMarkdown(context, page);
  const editLink = page.getByRole("dialog", { name: "Edit link", exact: true });
  const replacementText = "Pointer replacement content";

  await dragAcrossLink(page, link);

  await expect(editLink).toHaveCount(0);
  await expect(editor).toBeFocused();

  await page.keyboard.type(replacementText);

  await expect(editor).toHaveText(replacementText);
});

test("Existing link can be removed without removing its text", async ({ page }) => {
  const { editor, link } = await createLink(page);

  await link.click();

  const editLink = page.getByRole("dialog", { name: "Edit link", exact: true });

  await expect(editLink).toBeVisible();
  await editLink.getByRole("button", { name: "Remove link", exact: true }).click();
  await expect(editLink).toHaveCount(0);
  await expect(link).toHaveCount(0);
  await expect(editor).toContainText(documentText);
});
