import { expect, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";
import { signInFrench } from "./french";

/**
 * BUG-692 (audit A12) — the roster reads page 0 of `GET /coach-portal/clients` at size 100
 * (`ROSTER_PAGE_SIZE`, the api's maximum) and used `items` only, so at a roster past one page
 * rows 101+ vanished without a word.
 *
 * Expected: with 101 links the roster shows the 100 rows and « 1 client n'est pas affiché. » /
 * "1 client is not shown." (plural forms past 1); with 100 or fewer, no sentence.
 *
 * Populated scenario (`playwright.roster.config.ts`): six seeded links, and
 * `evoli_fixture_roster_extra=<n>` (this browser context only) appends n more, paged the api's
 * way (`items` sliced to the page, `totalElements` the whole count).
 *
 * Red on 05abea6: at 101 and 102 links no sentence is rendered (100 rows, silently).
 */

const SEEDED = 6;

const SENTENCE = {
  en: { one: "1 client is not shown.", two: "2 clients are not shown." },
  fr: { one: "1 client n'est pas affiché.", two: "2 clients ne sont pas affichés." },
} as const;

async function openRoster(page: Page, lang: "en" | "fr", links: number) {
  if (lang === "fr") await signInFrench(page);
  else await signInThroughForm(page, { email: "coach@evoli.fit", password: "Password123!" });
  await page
    .context()
    .addCookies([{ name: "evoli_fixture_roster_extra", value: String(links - SEEDED), url: page.url() }]);
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", lang);
}

const sentence = (page: Page) => page.getByRole("main").locator("[data-roster-not-shown]");
const rows = (page: Page) => page.getByRole("main").locator(".roster-row");

for (const lang of ["en", "fr"] as const) {
  test.describe(`BUG-692, ${lang.toUpperCase()}`, () => {
    if (lang === "fr") test.use({ locale: "fr-FR" });

    test("101 links: the 100 rows and the singular sentence", async ({ page }) => {
      await openRoster(page, lang, 101);
      await expect(rows(page)).toHaveCount(100);
      await expect(sentence(page)).toHaveCount(1);
      await expect(sentence(page)).toHaveText(SENTENCE[lang].one);
      await expect(sentence(page)).toBeVisible();
    });

    test("102 links: the plural sentence", async ({ page }) => {
      await openRoster(page, lang, 102);
      await expect(rows(page)).toHaveCount(100);
      await expect(sentence(page)).toHaveText(SENTENCE[lang].two);
    });

    test("100 links: every row, no sentence", async ({ page }) => {
      await openRoster(page, lang, 100);
      await expect(rows(page)).toHaveCount(100);
      await expect(sentence(page)).toHaveCount(0);
    });

    test("the seeded six: no sentence", async ({ page }) => {
      if (lang === "fr") await signInFrench(page);
      else await signInThroughForm(page, { email: "coach@evoli.fit", password: "Password123!" });
      await page.goto("/");
      await expect(rows(page)).toHaveCount(SEEDED);
      await expect(sentence(page)).toHaveCount(0);
    });
  });
}
