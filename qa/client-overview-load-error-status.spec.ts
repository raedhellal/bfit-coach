import { expect, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";

/**
 * BUG-629 — when the trainee overview read fails (not a 403), `/clients/[id]` answers a 5xx.
 *
 * It rendered the load-error notice under a 200, so anything that reads the status (a
 * monitor, Raed's uptime check) saw an api outage through the portal as a success. The page
 * now throws a digest-tagged error before the first byte (`src/lib/clientLoadError.ts`): the
 * response is a 500 and the root error boundary draws the same notice it always was.
 *
 * `evoli_fixture_overview=fail` makes the fixture's overview read a 500 (this browser context
 * only). Expected, EN and FR: a status in 500–599; the page unchanged — BUG-617's single h1
 * sentence, the way back to the roster, inside the shell under « Clients »; a successful read
 * still 200; a client not on the roster still 403.
 *
 * Not exercised here: the api UNREACHABLE. In live mode that is `apiFetch` throwing a
 * network error, which `readClientOverview` returns as `{ overview: null, forbidden: false }`
 * — the same branch as the 500 below.
 */

const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
const NOT_MINE = "0b0b0b0b-0000-4000-8000-00000000dead";

const T = {
  en: {
    locale: "en-US",
    sentence: "This trainee could not be loaded.",
    back: "Back to roster",
    nav: "Portal",
    roster: "Roster",
    tabs: "Trainee sections",
    overviewTab: "Overview",
  },
  fr: {
    locale: "fr-FR",
    sentence: "Ce client n'a pas pu être chargé.",
    back: "Retour aux clients",
    nav: "Portail",
    roster: "Clients",
    tabs: "Sections du client",
    overviewTab: "Vue d'ensemble",
  },
} as const;

/** At the ROOT: `url: page.url()` on `/clients/{id}/routine` would scope it to `/clients/{id}/`. */
async function failOverview(page: Page) {
  await page
    .context()
    .addCookies([{ name: "evoli_fixture_overview", value: "fail", url: new URL("/", page.url()).href }]);
}

/** The load-error page as BUG-617 left it: one h1, the sentence; one way back; the shell. */
async function expectLoadErrorPage(page: Page, lang: keyof typeof T) {
  const t = T[lang];
  await expect(page.getByRole("heading", { level: 1 })).toHaveText([t.sentence]);
  const back = page.getByRole("main").locator("[data-notice-back]");
  await expect(back).toHaveCount(1);
  await expect(back).toHaveText(t.back);
  await expect(back).toHaveAttribute("href", "/");
  await expect(page.getByRole("navigation", { name: t.nav }).getByRole("link", { name: t.roster, exact: true })).toHaveAttribute(
    "aria-current",
    "page"
  );
  // Not the generic crash screen and its retry.
  await expect(page.getByRole("main").getByRole("button")).toHaveCount(0);
}

for (const lang of ["en", "fr"] as const) {
  test.describe(`BUG-629 (${lang})`, () => {
    test.use({ locale: T[lang].locale });

    test("the overview read fails: a 5xx, and the same load-error page", async ({ page }) => {
      await signInThroughForm(page, { lang });
      await failOverview(page);
      const response = await page.goto(`/clients/${LINA}`);
      const status = response?.status() ?? 0;
      expect(status, "the status of a failed overview read").toBeGreaterThanOrEqual(500);
      expect(status).toBeLessThanOrEqual(599);
      await expect(page).toHaveURL(`/clients/${LINA}`);
      await expectLoadErrorPage(page, lang);
    });

    test("a tab change to the overview with the read failing shows the same page", async ({ page }) => {
      await signInThroughForm(page, { lang });
      await page.goto(`/clients/${LINA}/routine`);
      await expect(page.locator("[data-nav-progress-ready]"), "hydrated").toHaveCount(1);
      await failOverview(page);
      await page
        .getByRole("main")
        .getByRole("navigation", { name: T[lang].tabs, exact: true })
        .getByRole("link", { name: T[lang].overviewTab, exact: true })
        .click();
      await page.waitForURL(`/clients/${LINA}`);
      await expectLoadErrorPage(page, lang);
    });

    test("control: a read that succeeds is 200, a client not on the roster is 403", async ({ page }) => {
      await signInThroughForm(page, { lang });
      expect((await page.goto(`/clients/${LINA}`))?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).not.toHaveText([T[lang].sentence]);
      expect((await page.goto(`/clients/${NOT_MINE}`))?.status()).toBe(403);
      await expect(page).toHaveURL(/\/clients\/denied$/);
    });
  });
}
