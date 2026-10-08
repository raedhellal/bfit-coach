import { expect, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";

/**
 * BUG-671 — after the coaching link ends, a tab change lands on `/clients/denied`.
 *
 * A cold load of a client URL is decided by `clients/[id]/layout.tsx` (403 → the denial
 * page). A TAB CHANGE is a client transition between two pages under that same layout, and
 * Next does not render a layout again when its segment is unchanged: only the new page asks
 * the api. Each page read the overview with `readClientOverview` and kept `overview` alone,
 * so a 403 there was "no overview", i.e. the tab's load error, served with the old page's
 * frame (« … could not be loaded »), instead of the denial page.
 *
 * `evoli_fixture_link=ended` (this browser context only) makes every read about a trainee
 * the guard's 403, mid-session: the page is opened linked, the link ends, a tab is clicked.
 * The click is made on a HYDRATED page (`[data-nav-progress-ready]`): before hydration the
 * tab is a plain `<a>`, a document load, and the layout would decide, which proves nothing.
 */

const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
const PAGES = [
  { key: 0, path: `/clients/${LINA}` },
  { key: 1, path: `/clients/${LINA}/routine` },
  { key: 2, path: `/clients/${LINA}/nutrition` },
] as const;

const LANG = {
  en: {
    locale: "en-US",
    nav: "Trainee sections",
    tabs: ["Overview", "Routine", "Nutrition"],
    denied: "This trainee is not on your roster. They may have revoked access.",
  },
  fr: {
    locale: "fr-FR",
    nav: "Sections du client",
    tabs: ["Vue d'ensemble", "Programme", "Nutrition"],
    denied: "Ce client ne fait pas partie de votre liste. Il a peut-être révoqué l'accès.",
  },
} as const;

async function openHydrated(page: Page, path: string, lang: keyof typeof LANG) {
  await page.goto(path);
  await expect(page.locator("[data-nav-progress-ready]"), `${path} hydrated`).toHaveCount(1);
  await expect(tabBar(page, lang)).toBeVisible();
}

function tabBar(page: Page, lang: keyof typeof LANG) {
  return page.getByRole("main").getByRole("navigation", { name: LANG[lang].nav, exact: true });
}

for (const lang of ["en", "fr"] as const) {
  test.describe(`BUG-671 (${lang})`, () => {
    test.use({ locale: LANG[lang].locale });

    for (const from of PAGES) {
      for (const to of PAGES.filter((p) => p.key !== from.key)) {
        const name = `${LANG[lang].tabs[from.key]} → ${LANG[lang].tabs[to.key]}`;

        test(`link ended: ${name} lands on /clients/denied`, async ({ page }) => {
          const l = LANG[lang];
          await signInThroughForm(page, { lang });
          await openHydrated(page, from.path, lang);
          // At the ROOT: a cookie set with `url: page.url()` on `/clients/{id}/routine` gets the
          // path `/clients/{id}/`, which `/clients/{id}` (the overview) does not match.
          await page
            .context()
            .addCookies([{ name: "evoli_fixture_link", value: "ended", url: new URL("/", page.url()).href }]);
          await tabBar(page, lang).getByRole("link", { name: l.tabs[to.key], exact: true }).click();
          await page.waitForURL("**/clients/denied");
          await expect(page.getByRole("heading", { level: 1 })).toHaveText([l.denied]);
        });

        test(`still linked: ${name} opens the tab`, async ({ page }) => {
          const l = LANG[lang];
          await signInThroughForm(page, { lang });
          await openHydrated(page, from.path, lang);
          await tabBar(page, lang).getByRole("link", { name: l.tabs[to.key], exact: true }).click();
          await page.waitForURL((url) => url.pathname === to.path);
          await expect(tabBar(page, lang).getByRole("link", { name: l.tabs[to.key], exact: true })).toHaveAttribute(
            "aria-current",
            "page"
          );
          await expect(page.getByRole("heading", { level: 1 })).not.toHaveText([l.denied]);
        });
      }
    }
  });
}
