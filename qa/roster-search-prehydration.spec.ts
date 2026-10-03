import { expect } from "@playwright/test";
import { test } from "./fixture-test";
import {
  COPY,
  ENGINES,
  LANGS,
  WIDTHS,
  closeBrowsers,
  expectServerHtml,
  expectStateHoldsWhatIsShown,
  holdHydration,
  openPage,
  type Engine,
} from "./prehydration";

/**
 * BUG-686 follow-up — the roster's search box: a query typed before React hydrates filters
 * the roster. Populated scenario (`playwright.roster.config.ts`): the empty roster has no
 * search box.
 *
 * Before the fix (a862698) the box showed the query and the roster kept all six rows under
 * it. The same defect as the library searches (`qa/library-filter-prehydration.spec.ts`).
 * Red on a862698's RosterBrowser (Chromium and WebKit): React holds "" under the shown "lina".
 */

test.afterAll(closeBrowsers);

for (const engine of Object.keys(ENGINES) as Engine[]) {
  for (const lang of LANGS) {
    for (const width of WIDTHS) {
      const t = COPY[lang];
      test.describe(`${engine} · ${lang} · ${width} px`, () => {
        test("a search typed before hydration filters the roster", async ({ baseURL }) => {
          const page = await openPage(engine, lang, width, baseURL);
          try {
            const hold = await holdHydration(page);
            await page.goto("/", { waitUntil: "domcontentloaded" });
            await expect(page.locator(".roster-row")).toHaveCount(6);
            const search = page.getByRole("searchbox", { name: t.roster.searchLabel });
            await search.fill("lina");
            await expectServerHtml(search, "the roster search");
            expect(await hold.release(), "JS chunks held until the search was typed").toBeGreaterThan(0);

            await expectStateHoldsWhatIsShown(search, "the roster search");
            await expect(page.locator(".roster-row .roster-name")).toHaveText(["Lina M."]);
            await expect(page.locator(".roster-browser").getByRole("status")).toHaveText(t.roster.shown(1));
            await expect(search).toHaveValue("lina");
          } finally {
            await page.context().close();
          }
        });
      });
    }
  }
}
