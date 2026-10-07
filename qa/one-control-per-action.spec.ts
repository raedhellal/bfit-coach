import { expect, type Locator, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";
import { signInFrench } from "./french";

/**
 * BUG-616 (audit A10) — a link wrapped round a <button>: one action, two interactive
 * elements. A screen reader announced two controls and the keyboard stopped twice.
 *
 * The two places the row names:
 *   - `ClientNotice`'s way back (« Retour aux clients » / "Back to roster"), reached here
 *     through the overview's load-error branch (`evoli_fixture_overview=fail`, this
 *     browser context only), the one route where the notice IS the page;
 *   - the roster's load-error card (« Recharger » / "Reload"), reached through
 *     `evoli_fixture_roster=fail` (`GET /coach-portal/clients` answers 500).
 *
 * Expected, both places, EN and FR: one link with the accessible name, no <button> with
 * that name and none inside the link, ONE Tab stop (from the link, Tab leaves the link's
 * subtree), and the secondary-button look (`.link-button[data-variant="secondary"]`, the
 * 44 px floor).
 *
 * Red on 05abea6: the link holds a <button>, so `button` count is 1 and Tab from the link
 * lands on that button.
 */

const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";

const T = {
  en: { back: "Back to roster", reload: "Reload", rosterError: "The roster could not be loaded." },
  fr: { back: "Retour aux clients", reload: "Recharger", rosterError: "La liste des clients n'a pas pu être chargée." },
} as const;

type Lang = keyof typeof T;

async function signIn(page: Page, lang: Lang) {
  if (lang === "fr") await signInFrench(page);
  else await signInThroughForm(page, { email: "coach@evoli.fit", password: "Password123!" });
}

async function expectOneControl(page: Page, name: string, href: string) {
  const main = page.getByRole("main");
  const link = main.getByRole("link", { name, exact: true });
  await expect(link).toHaveCount(1);
  await expect(link).toHaveAttribute("href", href);
  // Not announced twice: no button carries the name, and the link holds nothing focusable.
  await expect(main.getByRole("button", { name, exact: true })).toHaveCount(0);
  await expect(link.locator("button, a, input, select, textarea, [tabindex]")).toHaveCount(0);
  // Drawn as the secondary button, the 44 px floor kept.
  await expect(link).toHaveClass(/(^|\s)link-button(\s|$)/);
  await expect(link).toHaveAttribute("data-variant", "secondary");
  const box = await link.boundingBox();
  expect(box && box.height).toBeGreaterThanOrEqual(44);
  await expectOneTabStop(page, link);
}

/** From the focused link, one Tab leaves it: nothing inside it takes the focus next. */
async function expectOneTabStop(page: Page, link: Locator) {
  await link.focus();
  await expect(link).toBeFocused();
  await page.keyboard.press("Tab");
  const stillInside = await link.evaluate((el) => {
    const active = document.activeElement;
    return active !== null && active !== el && el.contains(active);
  });
  expect(stillInside, "a second Tab stop inside the link").toBe(false);
}

for (const lang of ["en", "fr"] as const) {
  test.describe(`BUG-616, ${lang.toUpperCase()}`, () => {
    if (lang === "fr") test.use({ locale: "fr-FR" });
    const t = T[lang];

    test("ClientNotice: the way back is one link drawn as a button", async ({ page }) => {
      await signIn(page, lang);
      await page.context().addCookies([{ name: "evoli_fixture_overview", value: "fail", url: page.url() }]);
      await page.goto(`/clients/${LINA}`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      await expectOneControl(page, t.back, "/");
    });

    test("roster load error: the reload is one link drawn as a button", async ({ page }) => {
      await signIn(page, lang);
      await page.context().addCookies([{ name: "evoli_fixture_roster", value: "fail", url: page.url() }]);
      await page.goto("/");
      await expect(page.getByRole("main").getByText(t.rosterError, { exact: true })).toBeVisible();
      await expectOneControl(page, t.reload, "/");
    });
  });
}
