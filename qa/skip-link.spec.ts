import { existsSync } from "node:fs";
import { expect, webkit, type Browser, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";

/**
 * EV-342g (audit A11) — « Aller au contenu ».
 *
 *   G.1 On every signed-in page, the first Tab stop is a link « Aller au contenu » / "Skip
 *       to content", visible only when focused, ≥ 44 px.
 *   G.2 Enter moves focus to `<main id="main" tabIndex={-1}>` and the next Tab reaches the
 *       page's first control.
 *   G.3 On pages with a sticky action bar, EV-340's link is the next one and both work.
 *       EV-340 is NOT on main (c2768c2 has no such link), so what is checked here is the
 *       half that exists: on the two sticky-bar editors the skip link works and the next Tab
 *       is the page's first control. When EV-340 lands, its spec owns "the next one".
 *   G.4 The `/i/*` pages are unchanged: no skip link.
 *
 * "Signed-in page" = every page drawn in `CoachShell`, which is where the link lives; the
 * list below is every such route the default fixture serves. Also asserted: the skip adds
 * no history entry and no `#main` to the URL (a fragment navigation would fire `popstate`,
 * which the unsaved-changes guard reads as Back).
 *
 * Red on c2768c2: the first Tab stop is the logo link.
 */

const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
const PAGES = [
  "/",
  "/templates",
  "/templates/new",
  "/recipes",
  "/nutrition-templates",
  "/challenges",
  `/clients/${LINA}`,
  `/clients/${LINA}/routine`,
  `/clients/${LINA}/nutrition`,
] as const;

const LABEL = { en: "Skip to content", fr: "Aller au contenu" } as const;

/** The first control inside `main#main` in Tab order (document order; no positive tabindex in the portal). */
async function firstControlInMain(page: Page): Promise<string> {
  return page.evaluate(() => {
    const main = document.getElementById("main")!;
    const candidates = main.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    for (const el of Array.from(candidates)) {
      const style = getComputedStyle(el);
      if (el.getClientRects().length === 0 || style.visibility === "hidden" || el.closest("[hidden], [inert]")) continue;
      el.setAttribute("data-first-control", "");
      return `${el.tagName.toLowerCase()} ${el.textContent?.trim().slice(0, 40) ?? ""}`;
    }
    return "none";
  });
}

/**
 * `tab` is the key that moves focus through links: "Tab" in Chromium; macOS WebKit Tabs to
 * links only with Option held (Safari's default, and the reason focus-clear-of-bars.spec.ts
 * presses Alt+Tab), so a keyboard user there reaches the skip link with Option+Tab.
 */
async function expectSkipFirstAndWorking(page: Page, lang: "en" | "fr", path: string, tab = "Tab") {
  const link = page.getByRole("link", { name: LABEL[lang], exact: true });
  await expect(link, `${path}: one skip link`).toHaveCount(1);
  await expect(link, `${path}: off screen until focused`).not.toBeInViewport();

  // G.1: the first Tab stop, from a page nobody has touched yet.
  await page.locator("body").focus();
  await page.keyboard.press(tab);
  await expect(link, `${path}: the first Tab stop`).toBeFocused();
  await expect(link, `${path}: visible while focused`).toBeInViewport({ ratio: 1 });
  const box = (await link.boundingBox())!;
  expect(box.height, `${path}: 44 px tall`).toBeGreaterThanOrEqual(44);
  expect(box.width, `${path}: 44 px wide`).toBeGreaterThanOrEqual(44);
  // Painted on top: nothing else at its centre (the sticky top bar sits under it at 390).
  expect(
    await link.evaluate((el, p) => {
      const hit = document.elementFromPoint(p.x, p.y);
      return hit !== null && (hit === el || el.contains(hit));
    }, { x: box.x + box.width / 2, y: box.y + box.height / 2 }),
    `${path}: nothing painted over it`
  ).toBe(true);

  // G.2: Enter → main has focus; the next Tab is the page's first control.
  const url = page.url();
  const entries = await page.evaluate(() => history.length);
  const first = await firstControlInMain(page);
  expect(first, `${path}: the page has a first control`).not.toBe("none");
  await page.keyboard.press("Enter");
  await expect(page.locator("main#main"), `${path}: focus on main`).toBeFocused();
  expect(await page.locator("main#main").getAttribute("tabindex")).toBe("-1");
  await expect(link, `${path}: hidden again once it lost focus`).not.toBeInViewport();
  await page.keyboard.press(tab);
  await expect(page.locator("[data-first-control]"), `${path}: the next Tab is ${first}`).toBeFocused();
  expect(page.url(), `${path}: no #main in the URL`).toBe(url);
  expect(await page.evaluate(() => history.length), `${path}: no history entry`).toBe(entries);
}

for (const lang of ["en", "fr"] as const) {
  test.describe(`EV-342g, ${lang.toUpperCase()}`, () => {
    test.use({ locale: lang === "fr" ? "fr-FR" : "en-US" });

    for (const width of [1440, 390] as const) {
      test(`G.1 + G.2 on every signed-in page at ${width} px`, async ({ page }) => {
        test.setTimeout(120_000);
        await page.setViewportSize({ width, height: 900 });
        await signInThroughForm(page, { lang });
        for (const path of PAGES) {
          await page.goto(path);
          await expectSkipFirstAndWorking(page, lang, path);
        }
      });
    }
  });
}

/*
 * Staff review S1: the error page is a signed-in page too. Since BUG-689 the root error
 * boundary draws `ShellFrame`, so the skip link and `main#main` come with it. One case, the
 * one BUG-689's spec uses: a client's page whose server render always fails.
 */
for (const lang of ["en", "fr"] as const) {
  test.describe(`EV-342g on the error page, ${lang.toUpperCase()}`, () => {
    test.use({ locale: lang === "fr" ? "fr-FR" : "en-US" });

    test("G.1 + G.2 on the error boundary's page, which has exactly one main", async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await signInThroughForm(page, { lang });
      await page
        .context()
        .addCookies([{ name: "evoli_fixture_render_error", value: "always", url: new URL("/", page.url()).href }]);
      const path = `/clients/${LINA}`;
      await page.goto(path);
      await expect(page.locator("h1"), "the error page, not the overview").toHaveText(
        lang === "fr" ? "Une erreur est survenue." : "Something went wrong."
      );
      await expect(page.locator(".app-shell"), "drawn in the shell").toHaveCount(1);
      await expect(page.locator("main"), "one main").toHaveCount(1);
      await expectSkipFirstAndWorking(page, lang, `${path} (error page)`);
    });
  });
}

test("G.4: the /i/* invite page has no skip link", async ({ page }) => {
  await page.goto("/i/abc");
  await expect(page.getByRole("link", { name: LABEL.en })).toHaveCount(0);
  await expect(page.getByRole("link", { name: LABEL.fr })).toHaveCount(0);
  await expect(page.locator(".skip-link, #main")).toHaveCount(0);
});

/* The configs' project is Chromium; WebKit is launched here, like focus-clear-of-bars.spec.ts. */
test.describe("EV-342g in WebKit", () => {
  let browser: Browser;
  test.beforeAll(async () => {
    expect(existsSync(webkit.executablePath()), "WebKit is not installed: npx playwright install webkit").toBe(true);
    browser = await webkit.launch();
  });
  test.afterAll(async () => {
    await browser?.close();
  });

  test("French, 1024 px: the skip link, then the routine editor's first control (a sticky-bar page)", async ({
    baseURL,
  }) => {
    const context = await browser.newContext({ baseURL, locale: "fr-FR", viewport: { width: 1024, height: 800 } });
    await context.addCookies([{ name: "evoli_pro_locale", value: "fr", url: baseURL! }]);
    const page = await context.newPage();
    try {
      await signInThroughForm(page, { lang: "fr" });
      for (const path of [`/clients/${LINA}/routine`, "/templates/new"]) {
        await page.goto(path);
        await expectSkipFirstAndWorking(page, "fr", path, process.platform === "darwin" ? "Alt+Tab" : "Tab");
      }
    } finally {
      await context.close();
    }
  });
});
