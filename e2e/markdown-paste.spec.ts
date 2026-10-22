import { expect, test } from "./fixtures";

const markdown = [
  "# Release checklist",
  "",
  "- Review the change",
  "- Read the [Scribe guide](https://example.com/scribe).",
].join("\n");

test("Plain-text Markdown paste creates rich text", async ({ context, page }) => {
  await page.goto("/");
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: new URL(page.url()).origin,
  });

  const editor = page.getByRole("textbox", {
    name: "Document content",
    exact: true,
  });

  await expect(editor).toBeEditable();
  await page.evaluate((clipboardText) => navigator.clipboard.writeText(clipboardText), markdown);
  await editor.click();
  await editor.press("ControlOrMeta+A");
  await editor.press("ControlOrMeta+V");

  await expect(
    editor.getByRole("heading", {
      name: "Release checklist",
      level: 1,
      exact: true,
    }),
  ).toBeVisible();

  const list = editor.getByRole("list");

  await expect(list).toBeVisible();
  await expect(list.getByRole("listitem")).toHaveCount(2);
  await expect(list).toContainText("Review the change");
  await expect(list).toContainText("Read the Scribe guide");
  await expect(list.getByRole("link", { name: "Scribe guide", exact: true })).toHaveAttribute(
    "href",
    "https://example.com/scribe",
  );
  await expect(editor).not.toContainText("# Release checklist");
  await expect(editor).not.toContainText("- Review the change");
  await expect(editor).not.toContainText("[Scribe guide]");
});

for (const shortcut of ["ControlOrMeta+V", "ControlOrMeta+Shift+V"]) {
  test(`Titled URL clipboard preserves selected words and formatting with ${shortcut}`, async ({
    context,
    page,
  }) => {
    await page.goto("/");
    await context.grantPermissions(["clipboard-read", "clipboard-write"], {
      origin: new URL(page.url()).origin,
    });
    const editor = page.getByRole("textbox", { name: "Document content", exact: true });
    await expect(editor).toBeEditable();
    await editor.click();
    await editor.press("ControlOrMeta+A");
    await page.keyboard.insertText("Keep selected words after");
    await expect(editor).toHaveText("Keep selected words after");
    await editor.press("Home");
    await editor.press("ControlOrMeta+ArrowRight");
    await editor.press("ControlOrMeta+Shift+ArrowRight");
    await editor.press("ControlOrMeta+Shift+ArrowRight");
    await editor.press("Shift+ArrowLeft");
    await expect
      .poll(() => page.evaluate(() => window.getSelection()?.toString()))
      .toBe("selected words");
    await editor.press("ControlOrMeta+B");
    await expect(editor.locator("strong")).toHaveText("selected words");

    // This reproduces the formats captured from a real titled-link paste. It
    // exercises the browser clipboard, not Edge's address-bar copy command.
    await page.evaluate(async () => {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": new Blob(["https://www.reddit.com/"], { type: "text/plain" }),
          "text/html": new Blob(
            [
              '<html>\r\n<body>\r\n<!--StartFragment--><a href="https://www.reddit.com/">Reddit - The heart of the internet</a><!--EndFragment-->\r\n</body>\r\n</html>',
            ],
            { type: "text/html" },
          ),
        }),
      ]);
    });
    await editor.press(shortcut);

    await expect(editor).toHaveText("Keep selected words after");
    const link = editor.getByRole("link", { name: "selected words", exact: true });
    await expect(link).toHaveAttribute("href", "https://www.reddit.com/");
    await expect(link.locator("strong")).toHaveText("selected words");
    await expect(editor.getByRole("link")).toHaveCount(1);
  });
}
