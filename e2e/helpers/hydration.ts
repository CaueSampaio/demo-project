import { expect, type Page } from "@playwright/test";

export async function waitForHydration(page: Page) {
  await expect
    .poll(async () =>
      page.evaluate(() =>
        [...document.querySelectorAll("main *")].some((el) =>
          Object.keys(el).some((k) => k.startsWith("__reactFiber")),
        ),
      ),
    )
    .toBe(true, { timeout: 15_000 });
}
