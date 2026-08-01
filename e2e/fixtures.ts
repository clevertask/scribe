import { expect, test as base } from "@playwright/test";

type BrowserErrorFixtures = {
  browserErrors: void;
};

export const test = base.extend<BrowserErrorFixtures>({
  browserErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      const recordPageError = (error: Error) => {
        errors.push(error.stack ?? error.message);
      };

      page.on("pageerror", recordPageError);
      await use();
      page.off("pageerror", recordPageError);

      expect(errors, `Unexpected browser page errors:\n\n${errors.join("\n\n")}`).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
export type { Locator, Page } from "@playwright/test";
