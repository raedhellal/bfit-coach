import { expect, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";

/**
 * BUG-689 (audit A4) and BUG-672 — the root error boundary (`src/app/error.tsx`).
 *
 *   · « Réessayer » RECOVERS from a transient server error: with a render error that
 *     clears after the first attempt, the retry shows the page. Before the fix the button
 *     called `reset()` only, which re-renders the same failed payload, so the error stayed.
 *   · While the error persists, it is drawn inside the coach shell, with the navigation
 *     of that width, on `/`, `/clients/{id}` and a library page; a nav link leaves it.
 *   · BUG-672: exactly one `h1`, and its text is the error sentence.
 *
 * `evoli_fixture_render_error=<once|always>` makes the server render throw, from the seam at
 * the top of `CoachShell` (`src/lib/fixtureFault.ts`; the decision is `renderErrorSwitch` in
 * `coachApi.fixture.ts`); `once` is consumed by the first render after the per-test reset.
 * `qa/render-error-every-route.spec.ts` (BUG-704) walks every signed-in route.
 */

const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";

const L = {
  en: {
    unexpected: "Something went wrong.",
    tryAgain: "Try again",
    rosterError: "The roster could not be loaded.",
    reload: "Reload",
    nav: "Portal",
    recipes: "Recipes",
  },
  fr: {
    unexpected: "Une erreur est survenue.",
    tryAgain: "Réessayer",
    rosterError: "La liste des clients n'a pas pu être chargée.",
    reload: "Recharger",
    nav: "Portail",
    recipes: "Recettes",
  },
} as const;

async function renderError(page: Page, mode: "once" | "always") {
  await page.context().addCookies([
    { name: "evoli_fixture_render_error", value: mode, url: new URL("/", page.url()).href },
  ]);
}

/** The navigation actually on screen at this width (the other one is display: none). */
function shownNav(page: Page, lang: "en" | "fr") {
  return page.getByRole("navigation", { name: L[lang].nav, exact: true });
}

for (const lang of ["en", "fr"] as const) {
  test.describe(`BUG-689 (${lang})`, () => {
    test.use({ locale: lang === "en" ? "en-US" : "fr-FR" });

    test("a transient server error on a client's page: the retry shows the page", async ({ page }) => {
      await signInThroughForm(page, { lang });
      await renderError(page, "once");
      await page.goto(`/clients/${LINA}`);

      const h1 = page.locator("h1");
      await expect(h1).toHaveCount(1);
      await expect(h1).toHaveText(L[lang].unexpected);
      await expect(shownNav(page, lang)).toBeVisible();

      await page.getByRole("button", { name: L[lang].tryAgain, exact: true }).click();
      // The page, not the error: the overview's sections, and the error sentence gone.
      await expect(page.locator("section[aria-label]").first()).toBeVisible();
      await expect(page.getByText(L[lang].unexpected, { exact: true })).toHaveCount(0);
      await expect(page).toHaveURL(`/clients/${LINA}`);
      await expect(h1).toHaveCount(1);
    });

    for (const [path, sentence, button, section] of [
      ["/", "rosterError", "reload", "/"],
      [`/clients/${LINA}`, "unexpected", "tryAgain", "/"],
      ["/templates", "unexpected", "tryAgain", "/templates"],
    ] as const) {
      test(`a persisting error on ${path} is drawn in the shell, with one h1, and the nav leaves it`, async ({
        page,
      }) => {
        await signInThroughForm(page, { lang });
        await renderError(page, "always");
        for (const width of [1440, 390]) {
          await page.setViewportSize({ width, height: 900 });
          await page.goto(path);
          const where = `${path} at ${width}`;
          await expect(page.locator("h1"), where).toHaveCount(1);
          await expect(page.locator("h1"), where).toHaveText(L[lang][sentence]);
          await expect(shownNav(page, lang), where).toBeVisible();
          await expect(page.locator(width >= 1024 ? ".shell-sidebar" : ".shell-tabbar"), where).toBeVisible();
          // The section the URL sits under is the current one.
          await expect(
            shownNav(page, lang).locator(`a[href="${section}"]`),
            where
          ).toHaveAttribute("aria-current", "page");
        }
        // A retry while the error persists keeps the error on screen (never a blank page).
        await page.getByRole("button", { name: L[lang][button], exact: true }).click();
        await expect(page.locator("h1")).toHaveText(L[lang][sentence]);
        // The navigation is a way out: it leaves for another section.
        await shownNav(page, lang).getByRole("link", { name: L[lang].recipes, exact: true }).click();
        await expect(page).toHaveURL("/recipes");
      });
    }
  });
}
