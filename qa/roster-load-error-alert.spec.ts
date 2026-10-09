import { expect, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";

/**
 * BUG-683 — when the roster cannot be loaded, the sentence that says so is announced.
 *
 * The failure is the page's only content, so a screen-reader user who lands on it must be
 * told: the sentence sits in an element with `role="alert"`. `evoli_fixture_roster=fail`
 * makes `GET /coach-portal/clients` a 500 (this browser context only), in either scenario.
 *
 * Next's route announcer (`#__next-route-announcer__`) is also `role="alert"`, and it is
 * empty on a document load, so the page-wide check counts the alerts that SAY something:
 * exactly one, and it is the sentence. The Reload control is unchanged (one link to `/`).
 */

const T = {
  en: { locale: "en-US", sentence: "The roster could not be loaded.", reload: "Reload" },
  fr: { locale: "fr-FR", sentence: "La liste des clients n'a pas pu être chargée.", reload: "Recharger" },
} as const;

async function failedRoster(page: Page, lang: keyof typeof T) {
  await signInThroughForm(page, { lang });
  await page.context().addCookies([{ name: "evoli_fixture_roster", value: "fail", url: page.url() }]);
  await page.goto("/");
}

for (const lang of ["en", "fr"] as const) {
  test.describe(`BUG-683 (${lang})`, () => {
    test.use({ locale: T[lang].locale });

    test("the roster's load error is the one alert on the page, and the Reload is unchanged", async ({ page }) => {
      const t = T[lang];
      await failedRoster(page, lang);
      const alert = page.getByRole("main").getByRole("alert");
      await expect(alert).toHaveCount(1);
      await expect(alert).toHaveText(t.sentence);
      // Page-wide, the alerts with any text: only the sentence (the route announcer is empty).
      await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveText([t.sentence]);
      const reload = page.getByRole("main").getByRole("link", { name: t.reload, exact: true });
      await expect(reload).toHaveCount(1);
      await expect(reload).toHaveAttribute("href", "/");
    });
  });
}
