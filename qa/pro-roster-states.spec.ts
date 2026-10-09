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
  en: { locale: "en-US", email: "Email", password: "Password", signIn: "Sign in", h1: "Roster", empty: "No trainees yet", nav: "Portal", roster: "Roster", templates: "Templates", templatesH1: "Training templates", recipes: "Recipes", signingIn: "Signing in…" },
  fr: { locale: "fr-FR", email: "E-mail", password: "Mot de passe", signIn: "Se connecter", h1: "Clients", empty: "Aucun client pour l'instant", nav: "Portail", roster: "Clients", templates: "Modèles", templatesH1: "Modèles d'entraînement", recipes: "Recettes", signingIn: "Connexion…" },
} as const;

async function signIn(page: Page, lang: keyof typeof STATES) {
  await signInThroughForm(page, { email: "coach@evoli.fit", password: "Password123!", lang });
}

/**
 * BUG-667 — the frame around the content, read in ONE frame: whether the skeleton's shimmer is
 * on screen, and the box of every DISPLAYED navigation named `nav` (one per width: the sidebar's
 * from 1024 px, the tab bar below), each link's box, and every displayed banner's box.
 *
 * `css`: whether `globals.css` has applied (its `--ink` token resolves). On a streamed document
 * load a script can read the DOM before the head's stylesheet has loaded; the browser paints
 * nothing until it has, but a read in that window sees the unstyled page (both navigations,
 * stacked). The skeleton's `animation-name` is inline, so it reads `shimmer` there too. A frame
 * is only what the coach sees once `css` is true.
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
      css: getComputedStyle(document.documentElement).getPropertyValue("--ink").trim() !== "",
      navs: Array.from(document.querySelectorAll("nav"))
        .filter((n) => n.getAttribute("aria-label") === nav && shown(n))
        .map((n) => ({ box: box(n), links: Array.from(n.querySelectorAll("a")).map((a) => `${a.textContent?.trim()}@${box(a)}`) })),
      banners: Array.from(document.querySelectorAll("header")).filter(shown).map(box),
    };
  }, nav);
}

/**
 * From /templates, every fixture read held 1.5 s, a click on the side menu's roster link.
 * Returns the skeleton watcher (`watchSkeleton`), installed BEFORE the click.
 */
async function holdRosterFromTemplates(page: Page, baseURL: string, nav: string, roster: string) {
  await page.goto("/templates");
  await page.context().addCookies([{ name: "evoli_fixture_api_latency", value: "1500", url: baseURL }]);
  const skeleton = await watchSkeleton(page);
  await page.getByRole("navigation", { name: nav }).getByRole("link", { name: roster, exact: true }).click();
  // Something answered the click: the progress bar (a held navigation) or a skeleton.
  await expect(page.locator(BAR).or(page.locator(SKELETON)).first()).toBeVisible();
  return skeleton;
}

/** The navigation progress bar while it shows (`NavigationProgress`): a navigation is pending. */
const BAR = '[data-nav-progress="visible"]';
/** The kit's `Skeleton`: its inline style is the only `animation: shimmer` in the portal. */
const SKELETON = '[style*="shimmer"]';

/**
 * From now on, whether the kit's `Skeleton` (its inline `animation: shimmer`) is ever in the
 * DOM, recorded by a MutationObserver in the page — a skeleton that came and went between two
 * reads still counts. Returns a reader.
 */
async function watchSkeleton(page: Page): Promise<() => Promise<boolean>> {
  await page.evaluate(() => {
    const w = window as unknown as { __skeletonEver?: boolean };
    w.__skeletonEver = !!document.querySelector('[style*="shimmer"]');
    new MutationObserver(() => {
      if (document.querySelector('[style*="shimmer"]')) w.__skeletonEver = true;
    }).observe(document.body, { subtree: true, childList: true, attributes: true });
  });
  return () => page.evaluate(() => (window as unknown as { __skeletonEver?: boolean }).__skeletonEver === true);
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
     * Fluidity batch 1, F2 — the roster has NO loading state any more: `(roster)/loading.tsx`
     * is deleted. A held roster (the fixture's latency cookie) reached from the side menu
     * keeps the page the coach is on until the roster arrives, with the navigation progress
     * bar after 400 ms (`NavigationProgress`). No skeleton is ever drawn: "ever" is recorded
     * by a MutationObserver from before the click (`watchSkeleton`), not sampled.
     *
     * Until d717e57 this test asserted the opposite (« the held roster shows its skeleton »).
     * The skeleton was React's ~300 ms reveal throttle on every side-menu return, the same
     * cost EV-342a removed from the other routes' loading files.
     */
    test("loading: a side-menu return keeps the page on screen until the roster arrives, and draws no skeleton", async ({ page, context, baseURL }) => {
      await signIn(page, lang);
      const l = STATES[lang];
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        const skeleton = await holdRosterFromTemplates(page, baseURL!, l.nav, l.roster);
        expect(await skeleton(), `${lang} at ${width}: no skeleton while the roster loads`).toBe(false);
        await expect(page.locator(BAR), `${lang} at ${width}: the roster is still loading`).toBeVisible();
        const facts = await page.evaluate(() => ({
          h1: Array.from(document.querySelectorAll("h1")).map((h) => h.textContent?.trim()),
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        }));
        expect(facts.h1, `${lang} loading at ${width}: the page left is still the one on screen`).toEqual([l.templatesH1]);
        expect(facts.overflow, `${lang} loading at ${width}`).toBeLessThanOrEqual(1);
        await expect(page.getByText(l.empty, { exact: true })).toBeVisible({ timeout: 15_000 });
        await expect(page.locator("h1")).toHaveCount(1);
        expect(await skeleton(), `${lang} at ${width}: no skeleton was drawn on the way to the roster`).toBe(false);
        await context.clearCookies({ name: "evoli_fixture_api_latency" });
      }
    });

    /**
     * BUG-667 (roster half) — the navigation stays on screen and in place while the roster
     * loads. With no loading state the two ways in are:
     *   · a click from another section: the page left is held, shell and all, and the
     *     roster's shell lands in the same boxes;
     *   · a document load of `/`: the response's first byte waits for the reads, so the
     *     document never holds a frame of shell without content — the served HTML has no
     *     skeleton in it (until d717e57 the streamed fallback was in the HTML).
     */
    test("loading: the navigation stays on screen and in place while the roster loads (BUG-667)", async ({ page, context, baseURL }) => {
      await signIn(page, lang);
      const l = STATES[lang];
      for (const width of [390, 1440]) {
        const label = `${lang} click at ${width}`;
        await page.setViewportSize({ width, height: 900 });
        const skeleton = await holdRosterFromTemplates(page, baseURL!, l.nav, l.roster);
        await expect(page.locator(BAR), `${label}: the roster is still loading`).toBeVisible();
        await expect.poll(async () => (await frameFacts(page, l.nav)).css).toBe(true);
        const loading = await frameFacts(page, l.nav);
        expect(loading.navs, `${label}: exactly one navigation is displayed while loading`).toHaveLength(1);
        expect(loading.navs[0].links, `${label}: its five sections`).toHaveLength(5);
        await expect(page.getByText(l.empty, { exact: true })).toBeVisible({ timeout: 15_000 });
        const loaded = await frameFacts(page, l.nav);
        expect(await skeleton(), `${label}: no skeleton at any point`).toBe(false);
        expect(loaded.navs, `${label}: the navigation did not move when the content landed`).toEqual(loading.navs);
        expect(loaded.banners, `${label}: the banners did not move when the content landed`).toEqual(loading.banners);
        await context.clearCookies({ name: "evoli_fixture_api_latency" });
      }

      await context.addCookies([{ name: "evoli_fixture_api_latency", value: "1500", url: baseURL! }]);
      const html = await (await page.request.get("/", { headers: { "Accept-Language": STATES[lang].locale } })).text();
      await context.clearCookies({ name: "evoli_fixture_api_latency" });
      expect(html, `${lang} document: the roster's content is in the response`).toContain(l.empty.replace(/'/g, "&#x27;"));
      expect(html.includes("animation:shimmer"), `${lang} document: no skeleton was streamed ahead of the roster`).toBe(false);
    });

    test("loading: a navigation link can be followed while the roster loads (BUG-667)", async ({ page, context, baseURL }) => {
      await signIn(page, lang);
      const l = STATES[lang];
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await holdRosterFromTemplates(page, baseURL!, l.nav, l.roster);
        await expect(page.locator(BAR), `${lang} at ${width}: the roster is still loading`).toBeVisible();
        // Clicked while the roster is still loading; the latency cookie is cleared first, so the
        // recipes page answers at once and the click is what moves the coach.
        await context.clearCookies({ name: "evoli_fixture_api_latency" });
        const before = await frameFacts(page, l.nav);
        expect(before.navs, `${lang} at ${width}: the navigation is there to click`).toHaveLength(1);
        const nav = page.getByRole("navigation", { name: l.nav });
        await nav.getByRole("link", { name: l.recipes, exact: true }).click({ timeout: 1_000 });
        await page.waitForURL("**/recipes");
        await expect(nav.getByRole("link", { name: l.recipes, exact: true })).toHaveAttribute("aria-current", "page");
        await expect(page.getByText(l.empty, { exact: true })).toHaveCount(0);
      }
    });

    /**
     * F2's other way in: signing in is a DOCUMENT load of `/` (`crossSessionBoundary`). The
     * sign-in page stays on screen, its button reading « Signing in… », until the roster's
     * document arrives; nothing in between draws a skeleton. Recorded across the document
     * swap by an init script (one per document) reporting to the test.
     */
    test("loading: signing in goes from « signing in » straight to the roster, with no skeleton", async ({ page, context, baseURL }) => {
      const seen: string[] = [];
      await page.exposeFunction("__f2Saw", (what: string) => void seen.push(what));
      await page.addInitScript(() => {
        const report = (window as unknown as { __f2Saw: (w: string) => void }).__f2Saw;
        const scan = () => {
          if (document.querySelector('[style*="shimmer"]')) report(`skeleton on ${location.pathname}`);
        };
        new MutationObserver(scan).observe(document, { subtree: true, childList: true, attributes: true });
        addEventListener("pagehide", () => {
          const submit = document.querySelector("form button[type=submit]");
          if (submit) report(`left ${location.pathname} reading ${submit.textContent?.trim()}`);
        });
      });
      // Every fixture read held 1 s (under the identity race's 1.5 s), so the roster's
      // document is slow enough that a streamed skeleton would have been painted first.
      await context.addCookies([{ name: "evoli_fixture_api_latency", value: "1000", url: baseURL! }]);
      await signIn(page, lang);
      const l = STATES[lang];
      await expect(page.getByText(l.empty, { exact: true })).toBeVisible({ timeout: 15_000 });
      await context.clearCookies({ name: "evoli_fixture_api_latency" });
      expect(seen.filter((w) => w.startsWith("skeleton")), `${lang}: no skeleton between sign-in and the roster`).toEqual([]);
      expect(seen, `${lang}: the sign-in page was left still saying it was signing in`).toContain(`left /login reading ${l.signingIn}`);
    });
  });
}
