import type { BrowserContext } from "@playwright/test";
import { expect, test, type Page } from "./fixtures";

const externalUrl =
  "https://store.example/products/edward-jacket?utm_source=wishlist&color=navy%20blue";

const grantClipboardAccess = async (context: BrowserContext) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: "http://127.0.0.1:5174",
  });
};

const pasteText = async (page: Page, text: string) => {
  await page.evaluate((clipboardText) => navigator.clipboard.writeText(clipboardText), text);
  await page.keyboard.press("ControlOrMeta+V");
};

test("a standalone external URL resolves to Compact and can change presentation", async ({
  context,
  page,
}) => {
  await grantClipboardAccess(context);
  await page.goto("/?linkPreview=true");

  const editor = page.getByRole("textbox", { name: "Document content", exact: true });

  await editor.click();
  await editor.press("ControlOrMeta+A");
  await editor.press("Backspace");
  await pasteText(page, externalUrl);

  const preview = editor.locator('[data-type="external-link-preview"]');
  const target = preview.locator("a[data-link-preview-target]");

  await expect(preview).toHaveAttribute("data-display", "compact");
  await expect(target).toHaveAttribute("href", externalUrl);
  await expect(preview.locator("[data-link-preview-title]")).toHaveText("Edward Jacket");
  await expect(page.getByTestId("preview-requests")).toHaveText(JSON.stringify([externalUrl]));
  await expect(editor).not.toContainText(externalUrl);

  const linkOptions = preview.getByRole("button", { name: "Link options", exact: true });

  await linkOptions.focus();
  await expect(linkOptions).toBeFocused();
  await linkOptions.press("Enter");
  await page.getByRole("button", { name: /Preview card/ }).click();

  await expect(preview).toHaveAttribute("data-display", "card");
  await expect(preview.locator("[data-link-preview-image]")).toHaveAttribute(
    "src",
    "/link-preview-assets/edward-jacket.svg",
  );
  await expect(preview.locator("[data-link-preview-description]")).toHaveText(
    "A navy wool jacket saved for later.",
  );

  const plainLinkOption = page.getByRole("button", { name: /Plain link/ });

  await expect(plainLinkOption).toBeHidden();
  await linkOptions.focus();
  await linkOptions.press("Enter");
  await expect(plainLinkOption).toBeVisible();
  await plainLinkOption.click();

  await expect(preview).toHaveCount(0);
  await expect(editor).toBeFocused();
  const plainLink = editor.getByRole("link", { name: externalUrl, exact: true });

  await expect(plainLink).toHaveAttribute("href", externalUrl);
});

test("pasting a URL over selected text keeps an ordinary labeled link", async ({
  context,
  page,
}) => {
  await grantClipboardAccess(context);
  await page.goto("/?linkPreview=true");

  const editor = page.getByRole("textbox", { name: "Document content", exact: true });

  await editor.click();
  await editor.press("ControlOrMeta+A");
  await pasteText(page, externalUrl);

  await expect(editor.locator('[data-type="external-link-preview"]')).toHaveCount(0);
  await expect(
    editor.getByRole("link", { name: "Package consumer content", exact: true }),
  ).toHaveAttribute("href", externalUrl);
  await expect(page.getByTestId("preview-requests")).toHaveText("[]");
});

test("a Preview card remains valid inside a list-item paragraph", async ({ context, page }) => {
  await grantClipboardAccess(context);
  await page.goto("/?linkPreviewList=true&narrowEditor=true");

  const editor = page.getByRole("textbox", { name: "Document content", exact: true });
  const listItem = editor.locator("li").first();

  await listItem.locator("p").click();
  await pasteText(page, externalUrl);

  const preview = listItem.locator('[data-type="external-link-preview"]');

  await preview.getByRole("button", { name: "Link options", exact: true }).click();
  await page.getByRole("button", { name: /Preview card/ }).click();

  await expect(preview).toHaveAttribute("data-display", "card");
  await expect(
    listItem.locator("p > .node-externalLinkPreview > [data-type='external-link-preview']"),
  ).toHaveCount(1);

  const containerBox = await page.getByTestId("scribe-container").boundingBox();
  const previewBox = await preview.boundingBox();
  const targetBox = await preview.locator("[data-link-preview-target]").boundingBox();
  const optionsBox = await preview
    .getByRole("button", { name: "Link options", exact: true })
    .boundingBox();

  expect(containerBox).not.toBeNull();
  expect(previewBox).not.toBeNull();
  expect(targetBox).not.toBeNull();
  expect(optionsBox).not.toBeNull();
  expect((previewBox?.x ?? 0) + (previewBox?.width ?? 0)).toBeLessThanOrEqual(
    (containerBox?.x ?? 0) + (containerBox?.width ?? 0) + 1,
  );
  expect(targetBox?.width ?? 0).toBeGreaterThanOrEqual((previewBox?.width ?? 0) - 2);
  expect(optionsBox?.y ?? 0).toBeGreaterThanOrEqual(
    (targetBox?.y ?? 0) + (targetBox?.height ?? 0) - 1,
  );
});

test("preview controls follow read-only to editable transitions", async ({ context, page }) => {
  await grantClipboardAccess(context);
  await page.goto("/?linkPreview=true&editableTransition=true");

  const editor = page.getByRole("textbox", { name: "Document content", exact: true });

  await page.getByRole("button", { name: "Enable editing", exact: true }).click();
  await editor.click();
  await editor.press("ControlOrMeta+A");
  await editor.press("Backspace");
  await pasteText(page, externalUrl);

  const preview = editor.locator('[data-type="external-link-preview"]');

  await expect(preview.getByRole("button", { name: "Link options", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Disable editing", exact: true }).click();

  await expect(editor).toHaveAttribute("aria-readonly", "true");
  await expect(preview.getByRole("button", { name: "Link options", exact: true })).toHaveCount(0);
  await expect(preview.locator("a[data-link-preview-target]")).toHaveAttribute("href", externalUrl);

  await page.getByRole("button", { name: "Enable editing", exact: true }).click();
  await expect(preview.getByRole("button", { name: "Link options", exact: true })).toBeVisible();
});
