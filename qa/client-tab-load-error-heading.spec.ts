import { expect, type Locator, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";

/**
 * BUG-713 — the routine and nutrition tabs, when the overview read fails, have one h1: the
 * tab's load-error sentence.
 *
 * Both pages passed `readClientOverview`'s null overview to `ClientHeader` as the name "",
 * and the header drew its name slot anyway: an empty `<h1 class="dt" title="">` and an
 * avatar with no initials. The tab's notice, the only thing that said what happened, was
 * not a heading. A screen reader's heading list held one blank h1.
 *
 * `evoli_fixture_overview=fail` makes the fixture's overview read a 500 (this browser
 * context only; set at the ROOT so it reaches `/clients/{id}/routine` too). In live mode
 * the api UNREACHABLE takes the same branch: `readClientOverview` returns
 * `{ overview: null, forbidden: false }` for a network error as for a 500.
 *
 * Expected, EN and FR, at 1280 and 390: exactly one h1, that tab's sentence verbatim; no
 * avatar drawn without initials; « Back to roster » and the three tab links present and each
 * navigates. Control: with the read succeeding, the one h1 is the client's name and the
 * avatar shows the initials (which also proves the avatar locator below points at the
 * avatar). The HTTP status during the outage is not asserted (ruling 713-R1). The malformed
 * id's 403 is `client-malformed-id.spec.ts`'s.
 */

const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";

const T = {
  en: {
    locale: "en-US",
    routine: "This trainee's routine could not be loaded.",
    nutrition: "This trainee's nutrition could not be loaded.",
    back: "Back to roster",
    nav: "Trainee sections",
    tabs: { overview: "Overview", routine: "Routine", nutrition: "Nutrition" },
  },
  fr: {
    locale: "fr-FR",
    routine: "Le programme de ce client n'a pas pu être chargé.",
    nutrition: "La nutrition de ce client n'a pas pu être chargée.",
    back: "Retour aux clients",
    nav: "Sections du client",
    tabs: { overview: "Vue d'ensemble", routine: "Programme", nutrition: "Nutrition" },
  },
} as const;

type Lang = keyof typeof T;
type Tab = "routine" | "nutrition";

const WIDTHS = [
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
] as const;

/** At the ROOT: `url: page.url()` would scope the cookie to the page's own path. */
async function failOverview(page: Page) {
  await page
    .context()
    .addCookies([{ name: "evoli_fixture_overview", value: "fail", url: new URL("/", page.url()).href }]);
}

function header(page: Page): Locator {
  return page.getByRole("main").locator(".client-head-wrap");
}

function tabBar(page: Page, lang: Lang): Locator {
  return page.getByRole("main").getByRole("navigation", { name: T[lang].nav, exact: true });
}

/**
 * The avatar is `.client-head-id`'s first child (`ClientHeader`). Returns its text for every
 * header identity block on the page: one string per avatar drawn.
 */
async function avatarTexts(page: Page): Promise<string[]> {
  return page
    .locator(".client-head-id > :first-child")
    .evaluateAll((els) => els.map((el) => (el.textContent ?? "").trim()));
}

/** The outage state of one tab: one h1, the sentence; no blank avatar; the way out drawn. */
async function expectOutageHead(page: Page, lang: Lang, tab: Tab) {
  const t = T[lang];
  await expect(page.getByRole("heading", { level: 1 }), "every h1 on the page").toHaveText([t[tab]]);
  // No empty heading of any level hidden from the role query (an h1 with no name is still an h1).
  expect(await page.locator("h1").count(), "h1 elements in the DOM").toBe(1);
  for (const text of await avatarTexts(page)) {
    expect(text, "an avatar drawn with no initials").not.toBe("");
  }
  await expect(header(page).getByRole("link", { name: t.back, exact: true })).toHaveCount(1);
  for (const name of Object.values(t.tabs)) {
    await expect(tabBar(page, lang).getByRole("link", { name, exact: true })).toHaveCount(1);
  }
}

async function openHydrated(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator("[data-nav-progress-ready]"), `${path} hydrated`).toHaveCount(1);
}

for (const lang of ["en", "fr"] as const) {
  test.describe(`BUG-713 (${lang})`, () => {
    test.use({ locale: T[lang].locale });

    for (const tab of ["routine", "nutrition"] as const) {
      for (const size of WIDTHS) {
        test(`${tab} at ${size.width}: the overview read fails, one h1, the tab's sentence`, async ({ page }) => {
          await page.setViewportSize(size);
          await signInThroughForm(page, { lang });
          await failOverview(page);
          await page.goto(`/clients/${LINA}/${tab}`);
          await expectOutageHead(page, lang, tab);
        });
      }

      test(`${tab}: control, the read succeeds, the one h1 is the name and the avatar has initials`, async ({ page }) => {
        await signInThroughForm(page, { lang });
        await page.goto(`/clients/${LINA}/${tab}`);
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(["Lina M."]);
        expect(await avatarTexts(page), "the avatar, located as the outage test locates it").toEqual(["LM"]);
      });
    }

    test("during the outage the back link and every tab link navigate", async ({ page }) => {
      const t = T[lang];
      await signInThroughForm(page, { lang });
      await failOverview(page);
      await openHydrated(page, `/clients/${LINA}/routine`);
      await expectOutageHead(page, lang, "routine");

      await tabBar(page, lang).getByRole("link", { name: t.tabs.nutrition, exact: true }).click();
      await page.waitForURL(`/clients/${LINA}/nutrition`);
      await expectOutageHead(page, lang, "nutrition");

      await tabBar(page, lang).getByRole("link", { name: t.tabs.routine, exact: true }).click();
      await page.waitForURL(`/clients/${LINA}/routine`);
      await expectOutageHead(page, lang, "routine");

      // The overview with the read failing is BUG-629's page (its own spec checks it).
      await tabBar(page, lang).getByRole("link", { name: t.tabs.overview, exact: true }).click();
      await page.waitForURL(`/clients/${LINA}`);

      await openHydrated(page, `/clients/${LINA}/nutrition`);
      await expectOutageHead(page, lang, "nutrition");
      await header(page).getByRole("link", { name: t.back, exact: true }).click();
      await page.waitForURL((url) => url.pathname === "/");
    });
  });
}
