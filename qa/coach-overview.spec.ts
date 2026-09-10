import { expect, test, type Page } from "@playwright/test";

/**
 * The trainee overview: the status a denied read is served with (BUG-139) and block
 * 4's caption (BUG-144). Fixture mode — see playwright.config.ts.
 *
 * The three trainee ids below are the fixture's three states of block 4 (eight
 * weigh-ins, exactly one, none). The fixture answers `getClient` for them and 403 for
 * anything else, which is what b-fit-api does for an id outside the coach's roster.
 */

const EMAIL = "coach@evoli.fit";
const PASSWORD = "Password123!";

/** 8 weigh-ins, 71.2 → 70.4 kg. */
const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
/** Exactly one weigh-in, 72.5 kg — BUG-144's repro. */
const NILS = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0002";
/** No weigh-ins at all. */
const SARA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0003";
/** Nobody. The coach portal answers 403 for a foreign id and for one that never existed. */
const UNLINKED = "00000000-0000-0000-0000-000000000000";

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

test.describe("AC5 — a trainee the coach is not linked to", () => {
  test("the page is served 403, not 200", async ({ page }) => {
    await signIn(page);

    const res = await page.goto(`/clients/${UNLINKED}`);
    // BUG-139: this was 200. AC5: "returns 403, not an empty page."
    expect(res?.status(), "an unlinked trainee's overview must be served 403").toBe(403);

    // Friendly, and still exactly AC5's sentence.
    await expect(
      page.getByText("This trainee is not on your roster. They may have revoked access.")
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Back to roster" })).toBeVisible();
  });

  test("a monitor that never runs JavaScript sees the 403 too", async ({ page }) => {
    await signIn(page);

    // The same request a crawler or an uptime check makes: no renderer, redirects
    // followed. This is the reading BUG-139 is actually about.
    const res = await page.request.get(`/clients/${UNLINKED}`);
    expect(res.status()).toBe(403);
    expect(await res.text()).toContain("This trainee is not on your roster");
  });

  test("no trainee data is disclosed with the 403", async ({ page }) => {
    await signIn(page);
    const res = await page.request.get(`/clients/${UNLINKED}`);
    const body = await res.text();
    for (const leak of ["Adherence this week", "Current streak", "Red flags"]) {
      expect(body, `the denial page must not render "${leak}"`).not.toContain(leak);
    }
  });

  test("a linked trainee is still served 200", async ({ page }) => {
    await signIn(page);
    const res = await page.goto(`/clients/${LINA}`);
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Lina M." })).toBeVisible();
  });
});

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
