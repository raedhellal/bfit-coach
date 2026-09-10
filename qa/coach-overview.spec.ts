import { expect, test, type Page } from "@playwright/test";

/**
 * The trainee overview's block 4: the weight tile and its caption (BUG-144).
 * Fixture mode — see playwright.config.ts.
 *
 * The three trainee ids below are the fixture's three states of block 4 (eight
 * weigh-ins, exactly one, none). The fixture answers `getClient` for them and 403 for
 * anything else.
 */

const EMAIL = "coach@evoli.fit";
const PASSWORD = "Password123!";

/** 8 weigh-ins, 71.2 → 70.4 kg. */
const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
/** Exactly one weigh-in, 72.5 kg — BUG-144's repro. */
const NILS = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0002";
/** No weigh-ins at all. */
const SARA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0003";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/");
}

/** The stat tile whose label is exactly "Weight" (not the "Weight trend" card). */
function weightTile(page: Page) {
  return page.getByText("Weight", { exact: true }).locator("..");
}

test.describe("AC5 block 4 — the weight tile and its caption agree", () => {
  test("several weigh-ins: the caption is the delta over the series", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${LINA}`);

    const tile = weightTile(page);
    await expect(tile).toContainText("70.4 kg");
    await expect(tile).toContainText("−0.8 kg over 8 weigh-ins");
    await expect(tile).not.toContainText("No weigh-ins");
  });

  test("exactly one weigh-in: a weight and no claim of a trend", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${NILS}`);

    const tile = weightTile(page);
    await expect(tile).toContainText("72.5 kg");
    // BUG-144: this tile read "72.5 kg" over "No weigh-ins in the last 8 weeks".
    await expect(tile).toContainText("1 weigh-in, no trend yet");
    await expect(tile).not.toContainText("No weigh-ins in the last 8 weeks");
    // The value, the caption and the sparkline all come from the one series, so the
    // chart must show the point rather than the card's empty state.
    await expect(page.getByLabel(/^Weight trend, last 8 weeks: /)).toBeVisible();
  });

  test("no weigh-ins: the empty-state sentence, and no number above it", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${SARA}`);

    const tile = weightTile(page);
    await expect(tile).toContainText("No weigh-ins in the last 8 weeks");
    await expect(tile).not.toContainText("kg");
    // AC5 block 4's empty state in the trend card as well.
    await expect(
      page.getByText("No weigh-ins in the last 8 weeks", { exact: true })
    ).toHaveCount(2);
  });
});
