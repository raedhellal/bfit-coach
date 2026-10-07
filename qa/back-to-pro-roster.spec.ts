import { existsSync } from "node:fs";
import { expect, webkit, type Browser, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";

/**
 * BUG-691 (audit A8) — the roster keeps its search, filter and scroll position after
 * « Retour aux clients », the URL carries them, and Back from the roster then leaves it.
 *
 * Expected, verbatim from the row: "with « Alertes » selected and « lin » typed, open a
 * client, then « Retour aux clients »: the roster shows « Alertes », « lin » and the same
 * scroll position; the URL carries them (`?filter=alerts&q=lin`), so a reload keeps them;
 * browser Back from the roster after that returns to the page before the roster, not to the
 * client; EN and FR, 1440 and 390 px."
 *
 * POPULATED fixture (`playwright.roster.config.ts`; the file name matches its `pro-roster`
 * entry). Lina M. is flagged, so « Alertes » + « lin » leaves her row alone. The viewport is
 * made shorter than the page so the roster scrolls and "the same scroll position" is a
 * number, not 0 = 0.
 *
 * Red on c2768c2: the return lands on `/`, « Tous », an empty search, at the top, and Back
 * from the roster goes to the client.
 */

const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
/** The window's height once the roster is narrowed (signing in happens at 700). */
const SHORT = 320;

const LANG = {
  en: { locale: "en-US", flagged: "Flagged", all: "All", search: "Search clients", back: "Back to roster", routine: "Routine" },
  fr: { locale: "fr-FR", flagged: "Alertes", all: "Tous", search: "Rechercher un client", back: "Retour aux clients", routine: "Programme" },
} as const;
type Lang = keyof typeof LANG;

function filters(page: Page) {
  return page.locator(".roster-filters");
}

function rosterPath(page: Page): string {
  const url = new URL(page.url());
  return `${url.pathname}${url.search}`;
}

async function scrollY(page: Page): Promise<number> {
  return page.evaluate(() => Math.round(window.scrollY));
}

/** From a page that is not the roster, to the roster by the navigation; « Alertes » + « lin »; scrolled down. */
async function narrowAndScroll(page: Page, lang: Lang): Promise<void> {
  const t = LANG[lang];
  await page.goto("/templates");
  await page.locator('nav a[href="/"]:visible').first().click();
  await expect(page).toHaveURL(/\/$/);
  await filters(page).getByRole("button", { name: t.flagged }).click();
  await page.getByRole("searchbox", { name: t.search }).fill("lin");
  await expect(page.locator(".roster-row")).toHaveCount(1);
  await expect.poll(() => rosterPath(page), "the URL carries the filter and the search").toBe("/?filter=alerts&q=lin");
  // A 320 px tall window, so the narrowed roster scrolls at every width (measured: 137 px
  // at 1440), scrolled as far as it goes.
  await page.setViewportSize({ width: page.viewportSize()!.width, height: SHORT });
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
}

/**
 * Opens Lina from the roster and returns the scroll position AT THE CLICK, read by a
 * capture listener of the test's own: Playwright's click first scrolls the row out from
 * under the 390 px tab bar (520 → 437 measured), and that is where the coach left the page.
 */
async function openLina(page: Page): Promise<number> {
  await page.evaluate(() =>
    window.addEventListener("click", () => ((window as unknown as { __yAtClick: number }).__yAtClick = Math.round(window.scrollY)), {
      capture: true,
      once: true,
    })
  );
  await page.locator(`a.roster-row[href="/clients/${LINA}"]`).click();
  await expect(page).toHaveURL(new RegExp(`/clients/${LINA}$`));
  const y = await page.evaluate(() => (window as unknown as { __yAtClick: number }).__yAtClick);
  expect(y, "the roster was scrolled when the coach left it (else the position check proves nothing)").toBeGreaterThan(40);
  return y;
}

async function expectRosterAsLeft(page: Page, lang: Lang, y: number) {
  const t = LANG[lang];
  await expect(page).toHaveURL(/\/\?filter=alerts&q=lin$/);
  await expect(filters(page).getByRole("button", { name: t.flagged })).toHaveAttribute("aria-pressed", "true");
  await expect(filters(page).getByRole("button", { name: t.all })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("searchbox", { name: t.search })).toHaveValue("lin");
  await expect(page.locator(".roster-row")).toHaveCount(1);
  await expect(page.locator(".roster-row")).toContainText("Lina");
  await expect.poll(() => scrollY(page), "the same scroll position").toBe(y);
}

for (const lang of ["en", "fr"] as const) {
  for (const width of [1440, 390] as const) {
    test.describe(`BUG-691, ${lang.toUpperCase()} at ${width} px`, () => {
      test.use({ locale: LANG[lang].locale, viewport: { width, height: 700 } });

      test("« Retour aux clients » shows the roster as it was left, and Back then leaves the roster", async ({
        page,
      }) => {
        await signInThroughForm(page, { lang });
        await narrowAndScroll(page, lang);
        const before = await page.evaluate(() => history.length);

        const y = await openLina(page);
        await page.getByRole("link", { name: LANG[lang].back, exact: true }).click();

        await expectRosterAsLeft(page, lang, y);
        expect(await page.evaluate(() => history.length), "the return added no history entry").toBe(before + 1);

        // Back from the roster: the page before the roster, not the client.
        await page.goBack();
        await expect(page).toHaveURL(/\/templates$/);
      });

      test("a reload of the roster keeps the filter and the search", async ({ page }) => {
        await signInThroughForm(page, { lang });
        await narrowAndScroll(page, lang);
        await page.reload();
        await expect(filters(page).getByRole("button", { name: LANG[lang].flagged })).toHaveAttribute(
          "aria-pressed",
          "true"
        );
        await expect(page.getByRole("searchbox", { name: LANG[lang].search })).toHaveValue("lin");
        await expect(page.locator(".roster-row")).toHaveCount(1);
        expect(rosterPath(page)).toBe("/?filter=alerts&q=lin");
      });
    });
  }
}

test.describe("BUG-691, the other paths back", () => {
  test.use({ viewport: { width: 1440, height: 700 } });

  test("from a second client page, the link still restores the roster (a new entry: the count cannot vouch for Back)", async ({
    page,
  }) => {
    await signInThroughForm(page);
    await narrowAndScroll(page, "en");
    const y = await openLina(page);
    await page.locator(`a[href="/clients/${LINA}/routine"]:visible`).first().click();
    await expect(page).toHaveURL(new RegExp(`/clients/${LINA}/routine$`));
    await page.getByRole("link", { name: "Back to roster", exact: true }).click();
    await expectRosterAsLeft(page, "en", y);
  });

  test("clearing the search and the filter gives the plain roster URL back", async ({ page }) => {
    await signInThroughForm(page);
    await narrowAndScroll(page, "en");
    await page.getByRole("searchbox", { name: "Search clients" }).fill("");
    await filters(page).getByRole("button", { name: "All" }).click();
    await expect.poll(() => rosterPath(page)).toBe("/");
  });

  test("the sort toggle (a server action) does not write the URL back to /", async ({ page }) => {
    await signInThroughForm(page);
    await narrowAndScroll(page, "en");
    await page.getByRole("radio", { name: "Recently active" }).click();
    await expect(page.getByRole("radio", { name: "Recently active" })).toHaveAttribute("aria-checked", "true");
    expect(rosterPath(page)).toBe("/?filter=alerts&q=lin");
    await expect(page.getByRole("searchbox", { name: "Search clients" })).toHaveValue("lin");
  });
});

test.describe("BUG-691 staff review", () => {
  test.use({ viewport: { width: 1440, height: 700 } });

  /*
   * B1 (staff probe, made a test): a Cmd/Ctrl+click opens the row in another tab and THIS tab
   * stays on the roster. It used to write the "leaving" note anyway; the browser Back that
   * followed was then counted as the push from the roster, and « Back to roster » went Back
   * past it, to /templates (or out of Evoli for a client opened from an email).
   */
  test("B1: a Cmd/Ctrl+click on a row notes nothing; after a browser Back, « Back to roster » lands on the roster", async ({
    page,
    context,
  }) => {
    await signInThroughForm(page);
    await page.goto("/templates");
    await page.goto(`/clients/${LINA}`);
    await page.getByRole("link", { name: "Back to roster", exact: true }).click();
    await expect.poll(() => rosterPath(page)).toBe("/");

    const opened = context.waitForEvent("page", { timeout: 5_000 }).catch(() => null);
    await page.locator(`a.roster-row[href="/clients/${LINA}"]`).click({ modifiers: ["ControlOrMeta"] });
    await (await opened)?.close();
    expect(rosterPath(page), "this tab stayed on the roster").toBe("/");
    expect(await page.evaluate(() => sessionStorage.getItem("evoli.roster.return")), "no note written").toBeNull();

    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/clients/${LINA}$`));
    await page.getByRole("link", { name: "Back to roster", exact: true }).click();
    await expect.poll(() => rosterPath(page), "on the roster, not the page before it").toBe("/");
  });

  /* S1: the note holds the coach's search and a client id; a session boundary drops it. */
  test("S1: signing out forgets the roster's note; the next session's back link is the plain roster", async ({ page }) => {
    await signInThroughForm(page);
    await narrowAndScroll(page, "en");
    await openLina(page);
    expect(await page.evaluate(() => sessionStorage.getItem("evoli.roster.return")), "the note exists").toContain(
      "q=lin"
    );

    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await page.waitForURL(/\/login/);
    await signInThroughForm(page);
    expect(
      await page.evaluate(() => [
        sessionStorage.getItem("evoli.roster.return"),
        sessionStorage.getItem("evoli.roster.restoreScroll"),
        sessionStorage.getItem("evoli.urlChanges"),
      ]),
      "nothing of the last session's roster survives"
    ).toEqual([null, null, null]);

    await page.goto(`/clients/${LINA}`);
    await expect(page.locator("[data-nav-progress-ready]")).toHaveCount(1);
    await expect(page.getByRole("link", { name: "Back to roster", exact: true })).toHaveAttribute("href", "/");
  });
});

/* The configs' project is Chromium; WebKit is launched here, like focus-clear-of-bars.spec.ts. */
test.describe("BUG-691 in WebKit, French, 390 px", () => {
  let browser: Browser;
  test.beforeAll(async () => {
    expect(existsSync(webkit.executablePath()), "WebKit is not installed: npx playwright install webkit").toBe(true);
    browser = await webkit.launch();
  });
  test.afterAll(async () => {
    await browser?.close();
  });

  test("« Retour aux clients » and Back", async ({ baseURL }) => {
    const context = await browser.newContext({ baseURL, locale: "fr-FR", viewport: { width: 390, height: 700 } });
    await context.addCookies([{ name: "evoli_pro_locale", value: "fr", url: baseURL! }]);
    const page = await context.newPage();
    try {
      await signInThroughForm(page, { lang: "fr" });
      await narrowAndScroll(page, "fr");
      const y = await openLina(page);
      await page.getByRole("link", { name: "Retour aux clients", exact: true }).click();
      await expectRosterAsLeft(page, "fr", y);
      await page.goBack();
      await expect(page).toHaveURL(/\/templates$/);
    } finally {
      await context.close();
    }
  });
});
