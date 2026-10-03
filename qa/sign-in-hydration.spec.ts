import { existsSync } from "node:fs";
import { expect, webkit, type Browser, type Page, type Route } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";

/**
 * The shared form sign-in (`qa/sign-in.ts`) survives typing that lands BEFORE React hydrates.
 *
 * Under load, the WebKit project typed into /login before hydration. The fill reached the
 * DOM but never React's state, so « Sign in » stayed disabled, and the sign-in hung until
 * the test timed out. That depended on load and timing. This file makes the same race
 * happen every time: it holds every JS chunk of the page until the password field has a
 * value. So the helper's first fill always lands on server HTML, and React hydrates over a
 * filled-in form.
 *
 * Red with the old pattern (fill, fill, click): the click waits on the disabled button
 * until the test times out. Green with `signInThroughForm`, in both engines.
 */

/** Hold `/_next/static/chunks/*` until the password field is filled; then let all through. */
async function hydrateOnlyAfterTyping(page: Page): Promise<{ released: Promise<number> }> {
  const held: Route[] = [];
  let heldCount = 0;
  let open = false;
  await page.route(/\/_next\/static\/chunks\//, async (route) => {
    if (open) return route.continue();
    held.push(route);
    heldCount += 1;
  });
  const released = page
    .waitForFunction(() => {
      const field = document.querySelector<HTMLInputElement>('input[type="password"]');
      return !!field && field.value.length > 0;
    }, undefined, { timeout: 45_000 })
    .then(async () => {
      open = true;
      for (const route of held.splice(0)) await route.continue();
      return heldCount;
    });
  return { released };
}

let webkitBrowser: Browser | undefined;
test.afterAll(async () => {
  await webkitBrowser?.close();
});

for (const engine of ["chromium", "webkit"] as const) {
  test(`${engine}: typing before hydration still signs in, and the form was typed into before it hydrated`, async ({
    page: chromiumPage,
    baseURL,
  }) => {
    let page = chromiumPage;
    if (engine === "webkit") {
      expect(existsSync(webkit.executablePath()), "WebKit is not installed: npx playwright install webkit").toBe(true);
      webkitBrowser ??= await webkit.launch();
      const context = await webkitBrowser.newContext({
        baseURL,
        locale: "en-US",
        extraHTTPHeaders: { "Accept-Language": "en-US" },
      });
      page = await context.newPage();
    }
    try {
      const { released } = await hydrateOnlyAfterTyping(page);
      await signInThroughForm(page);
      // The race really happened: chunks were held until a value was in the field. A route
      // pattern that matched nothing would let the page hydrate first and prove nothing.
      expect(await released, "JS chunks held back until the password field had a value").toBeGreaterThan(0);
      await expect(page).toHaveURL(new URL("/", baseURL).href);
      await expect(page.getByRole("button", { name: "Sign in" })).toHaveCount(0);
    } finally {
      if (engine === "webkit") await page.context().close();
    }
  });
}
