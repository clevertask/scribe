import type { BrowserContext } from "@playwright/test";
import { expect, test, type Locator, type Page } from "./fixtures";

const documentText = "Package consumer content";
const initialUrl = "initial.example/docs";
const initialHref = "https://initial.example/docs";
const linkedMarkdown = `[${documentText}](${initialHref})`;

const pasteLinkedMarkdown = async (
  context: BrowserContext,
  page: Page,
  markdown = linkedMarkdown,
) => {
  await page.goto("/");
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: new URL(page.url()).origin,
  });

  const editor = page.getByRole("textbox", { name: "Document content", exact: true });

  await page.evaluate((clipboardText) => navigator.clipboard.writeText(clipboardText), markdown);
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

const expectSimpleLinkEditor = async (dialog: Locator, hasEditAction = false) => {
  await expect(dialog.getByRole("textbox")).toHaveCount(2);
  await expect(dialog.getByRole("textbox", { name: "Text to display", exact: true })).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "URL", exact: true })).toBeVisible();
  await expect(dialog.getByRole("button")).toHaveCount(hasEditAction ? 3 : 2);
  await expect(dialog.getByRole("button", { name: "Apply", exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Remove link", exact: true })).toBeVisible();
  if (hasEditAction) {
    await expect(dialog.getByRole("button", { name: "Edit URL", exact: true })).toBeVisible();
  }
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
  await expectSimpleLinkEditor(linkSettings);
  await expect(linkSettings.getByRole("textbox", { name: "URL", exact: true })).toBeFocused();
  await expect(
    linkSettings.getByRole("textbox", { name: "Text to display", exact: true }),
  ).toHaveValue(documentText);
  await expect(
    linkSettings.getByRole("button", { name: "Remove link", exact: true }),
  ).toBeDisabled();
  await linkSettings.getByRole("textbox", { name: "URL", exact: true }).fill(initialUrl);
  await linkSettings.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(linkSettings).toHaveCount(0);

  const link = editor.getByRole("link", { name: documentText, exact: true });

  await expect(link).toHaveAttribute("href", initialHref);

  return { editor, link };
};

test("Existing link opens for inspection without input focus or navigation and updates", async ({
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
  await expectSimpleLinkEditor(editLink, true);
  await expect(editLink).toBeFocused();
  await expect(urlInput).not.toBeFocused();
  await expect(editLink.getByRole("textbox", { name: "Text to display", exact: true })).toHaveValue(
    documentText,
  );
  expect(popupCount).toBe(0);
  expect(context.pages()).toHaveLength(pageCount);
  await expect(page).toHaveURL(editorUrl);
  await expect(urlInput).toHaveValue(initialHref);

  await urlInput.click();
  await expect(urlInput).toBeFocused();
  await urlInput.fill("updated.example/reference");
  await editLink.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(editLink).toHaveCount(0);
  await expect(link).toHaveAttribute("href", "https://updated.example/reference");

  page.off("popup", recordPopup);
});

test("Edit URL deliberately focuses the input and Escape restores the document", async ({
  page,
}) => {
  const { editor, link } = await createLink(page);
  await link.click();
  const editLink = page.getByRole("dialog", { name: "Edit link", exact: true });
  const urlInput = editLink.getByRole("textbox", { name: "URL", exact: true });
  await expect(editLink).toBeFocused();

  await editLink.getByRole("button", { name: "Edit URL", exact: true }).click();

  await expect(urlInput).toBeFocused();
  await expect(urlInput).toHaveJSProperty("selectionStart", 0);
  await expect(urlInput).toHaveJSProperty("selectionEnd", initialHref.length);
  await urlInput.press("Escape");
  await expect(editLink).toHaveCount(0);
  await expect(editor).toBeFocused();
  await expect(link).toHaveAttribute("href", initialHref);

  await link.click();
  await expect(editLink).toBeFocused();
  await expect(urlInput).not.toBeFocused();
});

test("Alt+F10 keeps deliberate URL focus for an existing plain link", async ({ page }) => {
  const { editor, link } = await createLink(page);
  await link.click();
  const editLink = page.getByRole("dialog", { name: "Edit link", exact: true });
  await expect(editLink).toBeFocused();
  await editLink.press("Escape");
  await expect(editor).toBeFocused();
  await editor.press("ArrowLeft");

  await editor.press("Alt+F10");

  await expect(editLink).toBeVisible();
  await expect(editLink.getByRole("textbox", { name: "URL", exact: true })).toBeFocused();
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

test("Editing a link label and URL only changes the targeted link", async ({ context, page }) => {
  const otherLabel = "Untouched link";
  const renamedLabel = "Updated link label";
  const updatedHref = "https://updated.example/reference";
  const { editor, link } = await pasteLinkedMarkdown(
    context,
    page,
    `Before ${linkedMarkdown} between [${otherLabel}](${initialHref}) after`,
  );
  const otherLink = editor.getByRole("link", { name: otherLabel, exact: true });

  await expect(otherLink).toHaveAttribute("href", initialHref);
  await link.click();

  const editLink = page.getByRole("dialog", { name: "Edit link", exact: true });

  await expect(editLink).toBeVisible();
  await editLink.getByRole("textbox", { name: "Text to display", exact: true }).fill(renamedLabel);
  await editLink.getByRole("textbox", { name: "URL", exact: true }).fill(updatedHref);

  await expect(link).toHaveAttribute("href", initialHref);
  await expect(editor).toHaveText(`Before ${documentText} between ${otherLabel} after`);

  await editLink.getByRole("button", { name: "Apply", exact: true }).click();

  await expect(editLink).toHaveCount(0);
  await expect(link).toHaveCount(0);
  await expect(editor.getByRole("link", { name: renamedLabel, exact: true })).toHaveAttribute(
    "href",
    updatedHref,
  );
  await expect(otherLink).toHaveAttribute("href", initialHref);
  await expect(editor.getByRole("link")).toHaveCount(2);
  await expect(editor).toHaveText(`Before ${renamedLabel} between ${otherLabel} after`);
});

for (const { name, label, expectedText } of [
  { name: "the supplied label", label: "Inserted link label", expectedText: "Inserted link label" },
  { name: "the normalized URL when the label is blank", label: "", expectedText: initialHref },
]) {
  test(`A new link at an empty cursor inserts ${name}`, async ({ page }) => {
    await page.goto("/");

    const editor = page.getByRole("textbox", { name: "Document content", exact: true });
    const toolbar = page.getByRole("toolbar", { name: "Text formatting", exact: true });

    await editor.click();
    await editor.press("ControlOrMeta+A");
    await editor.press("Backspace");
    await toolbar.getByRole("button", { name: "Link", exact: true }).click();

    const linkSettings = page.getByRole("dialog", { name: "Link settings", exact: true });
    const labelInput = linkSettings.getByRole("textbox", { name: "Text to display", exact: true });

    await expect(linkSettings).toBeVisible();
    await expect(labelInput).toHaveValue("");
    await expect(
      linkSettings.getByRole("button", { name: "Remove link", exact: true }),
    ).toBeDisabled();
    await labelInput.fill(label);
    await linkSettings.getByRole("textbox", { name: "URL", exact: true }).fill(initialUrl);
    await linkSettings.getByRole("button", { name: "Apply", exact: true }).click();

    await expect(linkSettings).toHaveCount(0);
    await expect(editor.getByRole("link", { name: expectedText, exact: true })).toHaveAttribute(
      "href",
      initialHref,
    );
    await expect(editor.getByRole("link")).toHaveCount(1);
    await expect(editor).toHaveText(expectedText);
  });
}

test("Escape dismisses pending label and URL changes without changing the link", async ({
  page,
}) => {
  const { editor, link } = await createLink(page);

  await link.click();

  const editLink = page.getByRole("dialog", { name: "Edit link", exact: true });
  const labelInput = editLink.getByRole("textbox", { name: "Text to display", exact: true });
  const urlInput = editLink.getByRole("textbox", { name: "URL", exact: true });

  await expect(editLink).toBeVisible();
  await labelInput.fill("Unapplied label");
  await urlInput.fill("unapplied.example/path");
  await urlInput.press("Escape");

  await expect(editLink).toHaveCount(0);
  await expect(link).toHaveAttribute("href", initialHref);
  await expect(editor).toHaveText(documentText);

  await link.click();

  await expect(editLink).toBeVisible();
  await expect(labelInput).toHaveValue(documentText);
  await expect(urlInput).toHaveValue(initialHref);
});
