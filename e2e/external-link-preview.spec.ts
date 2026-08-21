import type { BrowserContext } from "@playwright/test";
import { expect, test, type Locator, type Page } from "./fixtures";

const externalUrl =
  "https://store.example/products/edward-jacket?utm_source=wishlist&color=navy%20blue";
const updatedExternalUrl = "https://sounds.example/presets/lucid-serum?utm_source=wishlist";
const policyRejectedUrl = "https://clevertask.example/tasks/123";

const grantClipboardAccess = async (context: BrowserContext) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: "http://127.0.0.1:5174",
  });
};

const pasteText = async (page: Page, text: string) => {
  await page.evaluate((clipboardText) => navigator.clipboard.writeText(clipboardText), text);
  await page.keyboard.press("ControlOrMeta+V");
};

const pasteStandalonePreview = async (page: Page) => {
  const editor = page.getByRole("textbox", { name: "Document content", exact: true });

  await editor.click();
  await editor.press("ControlOrMeta+A");
  await editor.press("Backspace");
  await pasteText(page, externalUrl);

  const preview = editor.locator('[data-type="external-link-preview"]');

  await expect(preview).toHaveCount(0);

  const plainLink = editor.getByRole("link", { name: externalUrl, exact: true });

  await expect(plainLink).toHaveAttribute("href", externalUrl);
  await expect(page.getByTestId("preview-requests")).toHaveText("[]");
  await plainLink.click();

  const dialog = page.getByRole("dialog", { name: "Edit link", exact: true });

  await expect(dialog.getByRole("button", { name: "Plain link", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await dialog.getByRole("button", { name: "Compact", exact: true }).click();

  await expect(preview).toHaveAttribute("data-display", "compact");
  await expect(preview.locator("[data-link-preview-title]")).toHaveText("Edward Jacket");
  await expect(page.getByTestId("preview-requests")).toHaveText(JSON.stringify([externalUrl]));

  return { editor, preview };
};

const openPreviewEditor = async (page: Page, preview: Locator) => {
  await preview.locator("a[data-link-preview-target]").click();

  const dialog = page.getByRole("dialog", { name: "Edit link", exact: true });

  await expect(dialog).toBeVisible();

  return dialog;
};

const getAnchorGap = async (target: Locator, dialog: Locator) => {
  const targetBox = await target.boundingBox();
  const dialogBox = await dialog.boundingBox();

  if (!targetBox || !dialogBox) {
    return null;
  }

  return {
    horizontal: dialogBox.x - targetBox.x,
    vertical: dialogBox.y - (targetBox.y + targetBox.height),
  };
};

test("a standalone URL stays Plain until Compact is explicitly selected", async ({
  context,
  page,
}) => {
  await grantClipboardAccess(context);
  await page.goto("/?linkPreview=true");

  const { editor, preview } = await pasteStandalonePreview(page);
  const target = preview.locator("a[data-link-preview-target]");

  await expect(target).toHaveAttribute("href", externalUrl);
  await expect(page.getByTestId("preview-requests")).toHaveText(JSON.stringify([externalUrl]));
  await expect(editor).not.toContainText(externalUrl);
  await expect(preview.getByRole("button", { name: "Link options", exact: true })).toHaveCount(0);

  let dialog = await openPreviewEditor(page, preview);
  let displayGroup = dialog.getByRole("group", { name: "Display as", exact: true });

  await expect(displayGroup.getByRole("button", { name: "Compact", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await displayGroup.getByRole("button", { name: "Preview card", exact: true }).click();

  await expect(preview).toHaveAttribute("data-display", "card");
  await expect(preview.locator("[data-link-preview-image]")).toHaveAttribute(
    "src",
    "/link-preview-assets/edward-jacket.svg",
  );
  await expect(preview.locator("[data-link-preview-description]")).toHaveText(
    "A navy wool jacket saved for later.",
  );

  await expect(dialog).toHaveCount(0);
  dialog = await openPreviewEditor(page, preview);
  displayGroup = dialog.getByRole("group", { name: "Display as", exact: true });
  await displayGroup.getByRole("button", { name: "Plain link", exact: true }).click();

  await expect(preview).toHaveCount(0);
  await expect(editor).toBeFocused();
  await expect(editor.getByRole("link", { name: externalUrl, exact: true })).toHaveAttribute(
    "href",
    externalUrl,
  );
});

test("the shared link dialog edits a preview URL and refreshes its metadata", async ({
  context,
  page,
}) => {
  await grantClipboardAccess(context);
  await page.goto("/?linkPreview=true");

  const { preview } = await pasteStandalonePreview(page);
  const dialog = await openPreviewEditor(page, preview);

  await dialog.getByRole("textbox", { name: "URL", exact: true }).fill(updatedExternalUrl);
  await dialog.getByRole("button", { name: "Save", exact: true }).click();

  await expect(dialog).toHaveCount(0);
  await expect(preview.locator("a[data-link-preview-target]")).toHaveAttribute(
    "href",
    updatedExternalUrl,
  );
  await expect(preview.locator("[data-link-preview-title]")).toHaveText("Lucid Serum");
  await expect(page.getByTestId("preview-requests")).toHaveText(
    JSON.stringify([externalUrl, updatedExternalUrl]),
  );
});

test("the shared link dialog rejects a URL outside the consumer preview policy", async ({
  context,
  page,
}) => {
  await grantClipboardAccess(context);
  await page.goto("/?linkPreview=true");

  const { preview } = await pasteStandalonePreview(page);
  let dialog = await openPreviewEditor(page, preview);
  const urlInput = dialog.getByRole("textbox", { name: "URL", exact: true });

  await urlInput.fill(policyRejectedUrl);
  await dialog.getByRole("button", { name: "Save", exact: true }).click();

  await expect(dialog.getByRole("alert")).toContainText(/can't be used as a preview/i);
  await expect(dialog).toBeVisible();
  await expect(urlInput).toHaveValue(policyRejectedUrl);
  await expect(preview.locator("a[data-link-preview-target]")).toHaveAttribute("href", externalUrl);
  await expect(page.getByTestId("preview-requests")).toHaveText(JSON.stringify([externalUrl]));

  await page.getByRole("button", { name: "Outside focus target", exact: true }).click();
  await expect(dialog).toHaveCount(0);

  dialog = await openPreviewEditor(page, preview);
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await expect(dialog.getByRole("textbox", { name: "URL", exact: true })).toHaveValue(externalUrl);
});

test("refresh exposes loading status and resolves without another document gesture", async ({
  context,
  page,
}) => {
  await grantClipboardAccess(context);
  await page.goto("/?linkPreview=true&slowLinkPreview=true");

  const { preview } = await pasteStandalonePreview(page);
  const dialog = await openPreviewEditor(page, preview);
  const refresh = dialog.getByRole("button", { name: "Refresh preview", exact: true });
  const status = dialog.getByRole("status");

  await refresh.click();

  await expect(refresh).toHaveAttribute("aria-disabled", "true");
  await expect(refresh).toBeFocused();
  await expect(status).toHaveText("Loading preview…");
  await expect(page.getByTestId("preview-requests")).toHaveText(
    JSON.stringify([externalUrl, externalUrl]),
  );
  await expect(status).toHaveText("Example Store");
  await expect(refresh).toHaveAttribute("aria-disabled", "false");
  await expect(refresh).toBeFocused();
});

test("a full-line plain link discovers Compact and Preview card in the same dialog", async ({
  context,
  page,
}) => {
  await grantClipboardAccess(context);
  await page.goto("/?linkPreview=true");

  const editor = page.getByRole("textbox", { name: "Document content", exact: true });

  await editor.click();
  await editor.press("ControlOrMeta+A");
  await pasteText(page, externalUrl);

  let plainLink = editor.getByRole("link", {
    name: "Package consumer content",
    exact: true,
  });

  await expect(editor.locator('[data-type="external-link-preview"]')).toHaveCount(0);
  await plainLink.click();

  let dialog = page.getByRole("dialog", { name: "Edit link", exact: true });
  let displayGroup = dialog.getByRole("group", { name: "Display as", exact: true });

  await expect(
    displayGroup.getByRole("button", { name: "Plain link", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(displayGroup.getByRole("button", { name: "Compact", exact: true })).toBeEnabled();
  await expect(
    displayGroup.getByRole("button", { name: "Preview card", exact: true }),
  ).toBeEnabled();
  await displayGroup.getByRole("button", { name: "Compact", exact: true }).click();

  let preview = editor.locator('[data-type="external-link-preview"]');

  await expect(preview).toHaveAttribute("data-display", "compact");
  dialog = await openPreviewEditor(page, preview);
  await dialog
    .getByRole("group", { name: "Display as", exact: true })
    .getByRole("button", { name: "Plain link", exact: true })
    .click();

  await expect(preview).toHaveCount(0);
  plainLink = editor.getByRole("link", {
    name: "Package consumer content",
    exact: true,
  });
  await plainLink.click();

  dialog = page.getByRole("dialog", { name: "Edit link", exact: true });
  displayGroup = dialog.getByRole("group", { name: "Display as", exact: true });
  await displayGroup.getByRole("button", { name: "Preview card", exact: true }).click();

  preview = editor.locator('[data-type="external-link-preview"]');
  await expect(preview).toHaveAttribute("data-display", "card");
  await expect(preview.locator("[data-link-preview-title]")).toHaveText("Edward Jacket");
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

test("preview editing supports Alt+F10 and restores editor focus on Escape", async ({
  context,
  page,
}) => {
  await grantClipboardAccess(context);
  await page.goto("/?linkPreview=true");

  const { editor, preview } = await pasteStandalonePreview(page);

  await editor.press("ArrowLeft");
  await expect(preview.locator("..")).toHaveClass(/ProseMirror-selectednode/);
  await editor.press("Alt+F10");

  const dialog = page.getByRole("dialog", { name: "Edit link", exact: true });
  const urlInput = dialog.getByRole("textbox", { name: "URL", exact: true });

  await expect(dialog).toBeVisible();
  await expect(dialog).toBeFocused();
  await expect(urlInput).not.toBeFocused();
  await dialog.press("Escape");

  await expect(dialog).toHaveCount(0);
  await expect(editor).toBeFocused();
});

test("a Preview card remains full-width without overflow inside a narrow list item", async ({
  context,
  page,
}) => {
  await grantClipboardAccess(context);
  await page.goto("/?linkPreviewList=true&narrowEditor=true");

  const editor = page.getByRole("textbox", { name: "Document content", exact: true });
  const listItem = editor.locator("li").first();

  await listItem.locator("p").click();
  await pasteText(page, externalUrl);

  const preview = listItem.locator('[data-type="external-link-preview"]');

  await expect(preview).toHaveCount(0);

  const plainLink = listItem.getByRole("link", { name: externalUrl, exact: true });

  await expect(page.getByTestId("preview-requests")).toHaveText("[]");
  await plainLink.click();

  let dialog = page.getByRole("dialog", { name: "Edit link", exact: true });

  await dialog.getByRole("button", { name: "Compact", exact: true }).click();
  await expect(preview).toHaveAttribute("data-display", "compact");
  await expect(page.getByTestId("preview-requests")).toHaveText(JSON.stringify([externalUrl]));

  dialog = await openPreviewEditor(page, preview);

  await dialog
    .getByRole("group", { name: "Display as", exact: true })
    .getByRole("button", { name: "Preview card", exact: true })
    .click();

  await expect(preview).toHaveAttribute("data-display", "card");
  await expect(
    listItem.locator("p > .node-externalLinkPreview > [data-type='external-link-preview']"),
  ).toHaveCount(1);
  await expect(preview.getByRole("button", { name: "Link options", exact: true })).toHaveCount(0);

  const containerBox = await page.getByTestId("scribe-container").boundingBox();
  const previewBox = await preview.boundingBox();
  const targetBox = await preview.locator("[data-link-preview-target]").boundingBox();
  const horizontalOverflow = await editor.evaluate(
    (element) => element.scrollWidth - element.clientWidth,
  );

  expect(containerBox).not.toBeNull();
  expect(previewBox).not.toBeNull();
  expect(targetBox).not.toBeNull();
  expect((previewBox?.x ?? 0) + (previewBox?.width ?? 0)).toBeLessThanOrEqual(
    (containerBox?.x ?? 0) + (containerBox?.width ?? 0) + 1,
  );
  expect(targetBox?.width ?? 0).toBeGreaterThanOrEqual((previewBox?.width ?? 0) - 2);
  expect(horizontalOverflow).toBeLessThanOrEqual(1);
});

test("read-only previews use their native link and recover editing behavior", async ({
  context,
  page,
}) => {
  await grantClipboardAccess(context);
  await context.route("https://store.example/**", (route) =>
    route.fulfill({ contentType: "text/html", body: "<title>Example Store</title>" }),
  );
  await page.goto("/?linkPreview=true&editableTransition=true");

  const editor = page.getByRole("textbox", { name: "Document content", exact: true });

  await page.getByRole("button", { name: "Enable editing", exact: true }).click();
  const { preview } = await pasteStandalonePreview(page);
  const target = preview.locator("a[data-link-preview-target]");
  const pageCount = context.pages().length;

  let dialog = await openPreviewEditor(page, preview);

  expect(context.pages()).toHaveLength(pageCount);
  await dialog.getByRole("textbox", { name: "URL", exact: true }).press("Escape");
  await page.getByRole("button", { name: "Disable editing", exact: true }).click();

  await expect(editor).toHaveAttribute("aria-readonly", "true");
  await expect(page.getByRole("dialog", { name: "Edit link", exact: true })).toHaveCount(0);
  await expect(preview.getByRole("button")).toHaveCount(0);
  await expect(target).toHaveAttribute("href", externalUrl);

  const popupPromise = page.waitForEvent("popup");

  await target.click();

  const popup = await popupPromise;

  await popup.waitForLoadState("domcontentloaded");
  await expect(popup).toHaveURL(externalUrl);
  await popup.close();

  await page.getByRole("button", { name: "Enable editing", exact: true }).click();
  dialog = await openPreviewEditor(page, preview);
  await expect(dialog).toBeFocused();
  await expect(dialog.getByRole("textbox", { name: "URL", exact: true })).not.toBeFocused();
});

for (const scrollCase of [
  {
    name: "nested scrolling",
    query: "nestedScroll=true",
    scroll: async (page: Page) => {
      await page.getByTestId("nested-scroll-container").evaluate((element) => {
        element.scrollBy(0, 24);
      });
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
  test(`the shared link dialog follows its preview during ${scrollCase.name}`, async ({
    context,
    page,
  }) => {
    await grantClipboardAccess(context);
    await page.goto(`/?linkPreview=true&${scrollCase.query}`);

    const { preview } = await pasteStandalonePreview(page);
    const target = preview.locator("a[data-link-preview-target]");
    const dialog = await openPreviewEditor(page, preview);
    const beforeGap = await getAnchorGap(target, dialog);

    expect(beforeGap).not.toBeNull();
    await scrollCase.scroll(page);

    await expect
      .poll(async () => {
        const nextGap = await getAnchorGap(target, dialog);

        if (!beforeGap || !nextGap) {
          return Number.POSITIVE_INFINITY;
        }

        return Math.max(
          Math.abs(nextGap.horizontal - beforeGap.horizontal),
          Math.abs(nextGap.vertical - beforeGap.vertical),
        );
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
