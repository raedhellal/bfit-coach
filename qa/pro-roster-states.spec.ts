import { expect, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";
import { expectNoSidewaysScroll } from "./layout";

/**
 * EV-337d — the roster's empty and loading states, on the DEFAULT suite's `empty` scenario
 * (the populated states are `qa/pro-roster.spec.ts`, on the roster config). X1/X4 in both
 * languages: no sideways scroll and exactly one h1, whatever the state; D3: no count in the
 * navigation while nothing is listed — never a 0.
 */

const STATES = {
  en: { locale: "en-US", email: "Email", password: "Password", signIn: "Sign in", h1: "Roster", empty: "No trainees yet", nav: "Portal", roster: "Roster", templates: "Templates", templatesH1: "Training templates" },
  fr: { locale: "fr-FR", email: "E-mail", password: "Mot de passe", signIn: "Se connecter", h1: "Clients", empty: "Aucun client pour l'instant", nav: "Portail", roster: "Clients", templates: "Modèles", templatesH1: "Modèles d'entraînement" },
} as const;

async function signIn(page: Page, lang: keyof typeof STATES) {
  await signInThroughForm(page, { email: "coach@evoli.fit", password: "Password123!", lang });
}

/**
 * BUG-667 — the frame around the content, read in ONE frame: whether the skeleton's shimmer is
 * on screen, and the box of every DISPLAYED navigation named `nav` (one per width: the sidebar's
 * from 1024 px, the tab bar below), each link's box, and every displayed banner's box.
 */
function frameFacts(page: Page, nav: string) {
  return page.evaluate((nav) => {
    const box = (e: Element) => {
      const r = e.getBoundingClientRect();
      return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)].join(",");
    };
    const shown = (e: Element) => e.checkVisibility() && e.getBoundingClientRect().width > 0;
    return {
      shimmer: Array.from(document.querySelectorAll("*")).some((e) => getComputedStyle(e).animationName === "shimmer"),
      navs: Array.from(document.querySelectorAll("nav"))
        .filter((n) => n.getAttribute("aria-label") === nav && shown(n))
        .map((n) => ({ box: box(n), links: Array.from(n.querySelectorAll("a")).map((a) => `${a.textContent?.trim()}@${box(a)}`) })),
      banners: Array.from(document.querySelectorAll("header")).filter(shown).map(box),
    };
  }, nav);
}

async function holdRosterFromTemplates(page: Page, baseURL: string, nav: string, roster: string) {
  await page.goto("/templates");
  await page.context().addCookies([{ name: "evoli_fixture_api_latency", value: "1500", url: baseURL }]);
  await page.getByRole("navigation", { name: nav }).getByRole("link", { name: roster, exact: true }).click();
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

    /**
     * BUG-667 (roster half) — the held roster's loading state keeps the shell: the navigation of
     * the width is on screen during the load, it is the same navigation (same boxes) as the loaded
     * page's, and nothing in the frame moves when the content lands. Both ways in: a click from
     * another section (the client transition) and a document load of `/`.
     */
    test("loading: the navigation stays on screen and in place while the roster loads (BUG-667)", async ({ page, context, baseURL }) => {
      await signIn(page, lang);
      const l = STATES[lang];
      for (const width of [390, 1440]) {
        for (const way of ["click", "document"] as const) {
          const label = `${lang} ${way} at ${width}`;
          await page.setViewportSize({ width, height: 900 });
          if (way === "click") await holdRosterFromTemplates(page, baseURL!, l.nav, l.roster);
          else {
            await context.addCookies([{ name: "evoli_fixture_api_latency", value: "1500", url: baseURL! }]);
            await page.goto("/", { waitUntil: "commit" });
          }
          await expect.poll(async () => (await frameFacts(page, l.nav)).shimmer, { message: `${label}: the skeleton never showed` }).toBe(true);
          const loading = await frameFacts(page, l.nav);
          expect(loading.shimmer, `${label}: read in the skeleton's frame`).toBe(true);
          expect(loading.navs, `${label}: exactly one navigation is displayed while loading`).toHaveLength(1);
          expect(loading.navs[0].links, `${label}: its five sections`).toHaveLength(5);
          await expect(page.getByText(l.empty, { exact: true })).toBeVisible({ timeout: 15_000 });
          const loaded = await frameFacts(page, l.nav);
          expect(loaded.shimmer, `${label}: the content has landed`).toBe(false);
          expect(loaded.navs, `${label}: the navigation did not move when the content landed`).toEqual(loading.navs);
          expect(loaded.banners, `${label}: the banners did not move when the content landed`).toEqual(loading.banners);
          await context.clearCookies({ name: "evoli_fixture_api_latency" });
        }
      }
    });

    test("loading: a navigation link can be followed while the roster loads (BUG-667)", async ({ page, context, baseURL }) => {
      await signIn(page, lang);
      const l = STATES[lang];
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await holdRosterFromTemplates(page, baseURL!, l.nav, l.roster);
        await expect.poll(async () => (await frameFacts(page, l.nav)).shimmer, { message: `${lang} at ${width}: the skeleton never showed` }).toBe(true);
        // Clicked while the roster is still loading; the latency cookie is cleared first, so the
        // templates page answers at once and the click is what moves the coach.
        await context.clearCookies({ name: "evoli_fixture_api_latency" });
        const before = await frameFacts(page, l.nav);
        expect(before.shimmer, `${lang} at ${width}: still loading when the link is clicked`).toBe(true);
        expect(before.navs, `${lang} at ${width}: the navigation is there to click`).toHaveLength(1);
        await page.getByRole("navigation", { name: l.nav }).getByRole("link", { name: l.templates, exact: true }).click({ timeout: 1_000 });
        await page.waitForURL("**/templates");
        await expect(page.getByRole("heading", { level: 1, name: l.templatesH1, exact: true })).toBeVisible();
      }
    });
  });
}
