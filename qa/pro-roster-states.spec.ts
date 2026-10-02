import { expect, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { expectNoSidewaysScroll } from "./layout";

/**
 * EV-337d — the roster's empty and loading states, on the DEFAULT suite's `empty` scenario
 * (the populated states are `qa/pro-roster.spec.ts`, on the roster config). X1/X4 in both
 * languages: no sideways scroll and exactly one h1, whatever the state; D3: no count in the
 * navigation while nothing is listed — never a 0.
 */

const STATES = {
  en: { locale: "en-US", email: "Email", password: "Password", signIn: "Sign in", h1: "Roster", empty: "No trainees yet", nav: "Portal", roster: "Roster" },
  fr: { locale: "fr-FR", email: "E-mail", password: "Mot de passe", signIn: "Se connecter", h1: "Clients", empty: "Aucun client pour l'instant", nav: "Portail", roster: "Clients" },
} as const;

async function signIn(page: Page, lang: keyof typeof STATES) {
  const l = STATES[lang];
  await page.goto("/login");
  await page.getByLabel(l.email).fill("coach@evoli.fit");
  await page.getByLabel(l.password).fill("Password123!");
  await page.getByRole("button", { name: l.signIn }).click();
  await page.waitForURL("/");
}

for (const lang of ["fr", "en"] as const) {
  test.describe(`${lang.toUpperCase()}`, () => {
    test.use({ locale: STATES[lang].locale });

    test("empty roster: its own words, one h1, no count, no search or sort over zero rows", async ({ page }) => {
      await signIn(page, lang);
      const l = STATES[lang];
      for (const width of [320, 390, 768, 1023, 1024, 1280, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto("/");
        await expect(page.getByText(l.empty, { exact: true })).toBeVisible();
        await expect(page.locator("h1")).toHaveCount(1);
        await expect(page.getByRole("heading", { level: 1, name: l.h1, exact: true })).toBeVisible();
        await expectNoSidewaysScroll(page, `${lang} empty at ${width}`);
        await expect(page.locator(".shell-nav-count")).toHaveCount(0);
        await expect(page.getByRole("navigation", { name: l.nav }).getByRole("link", { name: l.roster, exact: true })).toHaveAttribute(
          "aria-current",
          "page"
        );
        await expect(page.getByRole("searchbox")).toHaveCount(0);
        await expect(page.locator("main").getByRole("radio")).toHaveCount(0);
      }
    });

    /**
     * The loading state is the existing `(roster)/loading.tsx` (this branch does not touch
     * loading files: `perf/coach-fast-routes-no-skeleton` owns them). It is HELD on the server
     * with the fixture's latency cookie, so the test really sees it.
     */
    test("loading: the held roster shows its skeleton with one h1 and no sideways scroll", async ({ page, context, baseURL }) => {
      await signIn(page, lang);
      const l = STATES[lang];
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto("/templates");
        await context.addCookies([{ name: "evoli_fixture_api_latency", value: "1500", url: baseURL! }]);
        await page.getByRole("navigation", { name: l.nav }).getByRole("link", { name: l.roster, exact: true }).click();
        // The shimmer is the skeleton's mark; read the layout in the same frame.
        await expect
          .poll(() => page.evaluate(() => Array.from(document.querySelectorAll("*")).some((e) => getComputedStyle(e).animationName === "shimmer")))
          .toBe(true);
        const facts = await page.evaluate(() => ({
          h1: document.querySelectorAll("h1").length,
          // D3: no count while the roster read is loading.
          count: document.querySelectorAll(".shell-nav-count").length,
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          shimmer: Array.from(document.querySelectorAll("*")).some((e) => getComputedStyle(e).animationName === "shimmer"),
        }));
        expect(facts, `${lang} loading at ${width}`).toMatchObject({ h1: 1, shimmer: true, count: 0 });
        expect(facts.overflow, `${lang} loading at ${width}`).toBeLessThanOrEqual(1);
        await expect(page.getByText(l.empty, { exact: true })).toBeVisible({ timeout: 15_000 });
        await context.clearCookies({ name: "evoli_fixture_api_latency" });
      }
    });
  });
}
