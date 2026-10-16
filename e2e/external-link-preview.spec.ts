import type { BrowserContext } from "@playwright/test";
import { expect, test, type Locator, type Page } from "./fixtures";

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
const pasteLegacyLink = async (page: Page, display: "compact" | "card") => {
  await page.evaluate(
    ({ href, display }) =>
      navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": new Blob(["Saved product"], { type: "text/plain" }),
          "text/html": new Blob(
            [
              `<p><span data-type="external-link-preview" data-href="${href}" data-link-text="Saved product" data-display="${display}" data-page-title="Provider title" data-description="Saved metadata" data-image-url="https://images.example/product.png"></span></p>`,
            ],
            { type: "text/html" },
          ),
        }),
      ]),
    { href: externalUrl, display },
  );
  await page.keyboard.press("ControlOrMeta+V");
};
const pasteStandaloneLink = async (page: Page, href = externalUrl) => {
  const editor = page.getByRole("textbox", { name: "Document content", exact: true });
  await editor.click();
  await editor.press("ControlOrMeta+A");
  await editor.press("Backspace");
  await pasteText(page, href);
  const link = editor.getByRole("link", { name: href, exact: true });
  await expect(link).toHaveAttribute("href", href);
  return { editor, link };
};

test("standalone URL paste stays ordinary and exposes only text and URL editing", async ({
  context,
  page,
}) => {
  await grantClipboardAccess(context);
  await page.goto("/?linkPreview=true");
  const { editor, link } = await pasteStandaloneLink(page);
  await expect(editor.locator('[data-type="external-link-preview"]')).toHaveCount(0);
  await link.click();
  const dialog = page.getByRole("dialog", { name: "Edit link", exact: true });
  await expect(dialog.getByRole("textbox", { name: "Text to display", exact: true })).toHaveValue(
    externalUrl,
  );
  await expect(dialog.getByRole("textbox", { name: "URL", exact: true })).toHaveValue(externalUrl);
  await expect(dialog.getByRole("button")).toHaveText(["Remove link", "Apply"]);
  await expect(page.getByTestId("preview-requests")).toHaveText("[]");
});

for (const [clipboardText, expectedText] of [
  ["replacement", "replacement"],
  ["2026", "2026"],
  ["**replacement**", "replacement"],
  ["https://example.com/path extra words", "https://example.com/path extra words"],
]) {
  test(`native paste replaces Select all: ${clipboardText}`, async ({ context, page }) => {
    await grantClipboardAccess(context);
    await page.goto("/?linkPreview=true");
    const editor = page.getByRole("textbox", { name: "Document content", exact: true });
    await editor.click();
    await editor.press("ControlOrMeta+A");
    await pasteText(page, clipboardText);
    await expect(editor).toHaveText(expectedText);
    await expect(editor.locator('[data-type="external-link-preview"]')).toHaveCount(0);
    await expect(page.getByTestId("preview-requests")).toHaveText("[]");
  });
}

test("native URL-only paste links selected text without changing its label", async ({
  context,
  page,
}) => {
  await grantClipboardAccess(context);
  await page.goto("/?linkPreview=true");
  const editor = page.getByRole("textbox", { name: "Document content", exact: true });
  await editor.click();
  await editor.press("ControlOrMeta+A");
  await pasteText(page, externalUrl);
  await expect(
    editor.getByRole("link", { name: "Package consumer content", exact: true }),
  ).toHaveAttribute("href", externalUrl);
  await expect(page.getByTestId("preview-requests")).toHaveText("[]");
});

for (const display of ["compact", "card"] as const) {
  test(`saved ${display} HTML displays authored text and preserves metadata without images`, async ({
    context,
    page,
  }) => {
    await grantClipboardAccess(context);
    await page.goto("/?linkPreview=true&captureContent=true");
    const editor = page.getByRole("textbox", { name: "Document content", exact: true });
    await editor.click();
    await editor.press("ControlOrMeta+A");
    await pasteLegacyLink(page, display);
    const legacy = editor.locator('[data-type="external-link-preview"]');
    const link = legacy.getByRole("link", { name: "Saved product", exact: true });
    await expect(link).toHaveAttribute("href", externalUrl);
    await expect(legacy).toHaveAttribute("data-display", display);
    await expect(legacy).toHaveAttribute("data-page-title", "Provider title");
    await expect(legacy.locator("img")).toHaveCount(0);
    await expect(editor.locator("img[src]")).toHaveCount(0);
    await expect(page.getByTestId("preview-requests")).toHaveText("[]");
    await expect(page.getByTestId("serialized-html")).toContainText(
      'data-description="Saved metadata"',
    );
    await link.click();
    const dialog = page.getByRole("dialog", { name: "Edit link", exact: true });
    await expect(dialog.getByRole("textbox", { name: "Text to display", exact: true })).toHaveValue(
      "Saved product",
    );
    await dialog
      .getByRole("textbox", { name: "Text to display", exact: true })
      .fill("Updated label");
    await dialog.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(legacy.getByRole("link", { name: "Updated label", exact: true })).toBeVisible();
    await expect(legacy).toHaveAttribute("data-page-title", "Provider title");
    await editor.press("ControlOrMeta+Z");
    await expect(legacy.getByRole("link", { name: "Saved product", exact: true })).toBeVisible();
  });
}

const getAnchorGap = async (target: Locator, dialog: Locator) => {
  const targetBox = await target.boundingBox();
  const dialogBox = await dialog.boundingBox();
  return targetBox && dialogBox
    ? {
        horizontal: dialogBox.x - targetBox.x,
        vertical: dialogBox.y - (targetBox.y + targetBox.height),
      }
    : null;
};
for (const scrollCase of [
  {
    name: "nested scrolling",
    query: "nestedScroll=true",
    scroll: async (page: Page) => {
      await page
        .getByTestId("nested-scroll-container")
        .evaluate((element) => element.scrollBy(0, 24));
    },
  },
  {
    name: "window scrolling",
    query: "windowScroll=true",
    scroll: async (page: Page) => {
      await page.evaluate(() => window.scrollBy(0, 24));
    },
  },
]) {
  test(`reopened saved legacy link editing retains ${scrollCase.name} positioning`, async ({
    context,
    page,
  }) => {
    await grantClipboardAccess(context);
    await page.goto(`/?linkPreview=true&${scrollCase.query}`);
    const editor = page.getByRole("textbox", { name: "Document content", exact: true });
    await editor.click();
    await editor.press("ControlOrMeta+A");
    await editor.press("Backspace");
    await pasteLegacyLink(page, "compact");
    const link = editor.locator('[data-type="external-link-preview"] a');
    await expect(link).toHaveText("Saved product");
    await link.click();
    const dialog = page.getByRole("dialog", { name: "Edit link", exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog).toBeFocused();
    // The former Compact-creation flow opened the menu before this scroll check.
    // Preserve that reopened-menu coverage; first-open placement is tracked separately.
    await dialog.press("Escape");
    await expect(dialog).toHaveCount(0);
    await link.click();
    await expect(dialog).toBeVisible();
    await expect(dialog).toBeFocused();
    const before = await getAnchorGap(link, dialog);
    expect(before).not.toBeNull();
    await scrollCase.scroll(page);
    await expect
      .poll(async () => {
        const after = await getAnchorGap(link, dialog);
        return before && after
          ? Math.max(
              Math.abs(after.horizontal - before.horizontal),
              Math.abs(after.vertical - before.vertical),
            )
          : Number.POSITIVE_INFINITY;
      })
      .toBeLessThanOrEqual(2);
    const dialogBox = await dialog.boundingBox();
    expect(dialogBox).not.toBeNull();
    expect(dialogBox?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect((dialogBox?.x ?? 0) + (dialogBox?.width ?? 0)).toBeLessThanOrEqual(
      page.viewportSize()?.width ?? 0,
    );
  });
}
