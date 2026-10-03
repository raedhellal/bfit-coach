import { expect, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";
import { signInFrench } from "./french";

/**
 * EV-337m M3 (BUG-674), the roster half: a WORKOUTS-only link whose missed-sessions rule
 * fired shows the SAME count on its roster row and on its overview. Before the fix the
 * roster said « 1 alerte » under « À traiter » and the overview said the flags were not
 * shared (it gated them on PROGRESS; the api evaluates that rule on WORKOUTS).
 *
 * POPULATED fixture (`playwright.roster.config.ts`). Yann is not one of the six seeded rows:
 * `evoli_fixture_roster_workouts_flag=1` adds his row for this browser context only, so no
 * other roster spec has to absorb a seventh row.
 */

const YANN = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0020";

async function signIn(page: Page) {
  await signInThroughForm(page, { email: "coach@evoli.fit", password: "Password123!" });
}

async function withYann(page: Page) {
  await page.context().addCookies([{ name: "evoli_fixture_roster_workouts_flag", value: "1", url: page.url() }]);
  await page.goto("/");
}

for (const [locale, rowPill, review, chip] of [
  ["en-US", "1 flag", "To review", /^1\s*1 alert$/],
  ["fr-FR", "1 alerte", "À traiter", /^1\s*1 alerte$/],
] as const) {
  test.describe(locale, () => {
    test.use({ locale });
    test("the roster row's count and the overview's alert cards agree", async ({ page }) => {
      if (locale === "fr-FR") await signInFrench(page);
      else await signIn(page);
      await withYann(page);

      const row = page.locator(`a.roster-row[href="/clients/${YANN}"]`);
      await expect(row).toHaveCount(1);
      await expect(row).toHaveAttribute("data-group", "attention");
      await expect(row.locator(`#roster-${YANN}-pill`)).toHaveText(rowPill);

      await row.click();
      await page.waitForURL(`/clients/${YANN}`);
      const section = page.getByRole("region", { name: review, exact: true });
      await expect(section.locator(".alert-card")).toHaveCount(1);
      await expect(section.locator(".count-chip")).toHaveText(chip);
    });
  });
}
