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
 * BUG-686 follow-up — the libraries' list controls: a search or filter set before React
 * hydrates FILTERS the list.
 *
 * Before the fix (a862698), /templates' search box and /recipes' meal-time filter showed
 * the coach's pre-hydration query / choice while the state behind them stayed "" / "ALL",
 * so the list was filtered by nothing the coach could see. Witnessed by
 * `qa/prehydration-sweep.spec.ts`; the roster's search box is the same defect, in
 * `qa/roster-search-prehydration.spec.ts` (it needs the populated roster).
 * Red on a862698 (Chromium and WebKit): React holds "" / "ALL" under the shown "zzz" /
 * "BREAKFAST".
 */

const UPPER_LOWER_NAME = "Upper / Lower split";

test.afterAll(closeBrowsers);

for (const engine of Object.keys(ENGINES) as Engine[]) {
  for (const lang of LANGS) {
    for (const width of WIDTHS) {
      const t = COPY[lang];
      test.describe(`${engine} · ${lang} · ${width} px`, () => {
        test("/templates: a search typed before hydration filters the library", async ({ baseURL }) => {
          const page = await openPage(engine, lang, width, baseURL);
          try {
            const hold = await holdHydration(page);
            await page.goto("/templates", { waitUntil: "domcontentloaded" });
            await expect(page.getByText(UPPER_LOWER_NAME, { exact: true }).first()).toBeVisible();
            const search = page.getByRole("searchbox", { name: t.templateLibrary.searchLabel });
            await search.fill("zzz");
            await expectServerHtml(search, "the template search");
            expect(await hold.release(), "JS chunks held until the search was typed").toBeGreaterThan(0);

            await expectStateHoldsWhatIsShown(search, "the template search");
            await expect(page.getByText(UPPER_LOWER_NAME, { exact: true })).toHaveCount(0);
            await expect(page.getByRole("status").filter({ hasText: t.templateLibrary.shown(0) })).toHaveCount(1);
            await expect(search).toHaveValue("zzz");
          } finally {
            await page.context().close();
          }
        });

        test("/recipes: a meal time chosen before hydration filters the library", async ({ baseURL }) => {
          const page = await openPage(engine, lang, width, baseURL);
          try {
            const hold = await holdHydration(page);
            await page.goto("/recipes", { waitUntil: "domcontentloaded" });
            await expect(page.getByText("Chicken rice bowl", { exact: true })).toBeVisible();
            const filter = page.getByLabel(t.recipes.filterLabel, { exact: true });
            await filter.selectOption("BREAKFAST");
            await expectServerHtml(filter, "the meal-time filter");
            expect(await hold.release(), "JS chunks held until the filter was chosen").toBeGreaterThan(0);

            await expectStateHoldsWhatIsShown(filter, "the meal-time filter");
            // Untagged = lunch and dinner by default: not a breakfast.
            await expect(page.getByText("Chicken rice bowl", { exact: true })).toHaveCount(0);
            await expect(page.getByText("Overnight oats", { exact: true })).toBeVisible();
            await expect(page.getByText("Quark pancakes", { exact: true })).toBeVisible();
            await expect(filter).toHaveValue("BREAKFAST");
          } finally {
            await page.context().close();
          }
        });
      });
    }
  }
}
