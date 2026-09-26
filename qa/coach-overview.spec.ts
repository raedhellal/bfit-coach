import { expect, type Page } from "@playwright/test";
import { test } from "./fixture-test";

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
/** No weigh-ins at all — and a link that shares PROGRESS + WEIGH_INS, nothing else. */
const SARA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0003";
/**
 * ADR-0015 D5 / F1 — the three partial-consent links.
 *
 * The overview requires an ACTIVE link and NO data scope, so all three render 200 and
 * each block is present or absent according to `scopes`. These tests exist because the
 * failure mode they guard is silent: a `0` streak and an empty `redFlags` list look
 * exactly like data, and the bug is that the coach believes them.
 */
const PETRA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0006"; // NUTRITION only
const YUSUF = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0007"; // WORKOUTS only
const MARA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0008"; // nothing shared
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
  /**
   * Scoped to the STAT GRID, not to the page.
   *
   * EV-202b's progress block puts a second exact "Weight" on this screen — the label
   * of its metric row — so an unscoped `getByText("Weight", { exact: true })` resolves
   * to two elements and this helper dies of strict mode. Worse than the failure would
   * be the version that "fixed" it with `.first()`: the tile and the row would then be
   * one reorder apart from silently swapping, and this file's assertions about the
   * TILE would be checking the row. The grid is what identifies the tile.
   */
  return page.locator(".stat-grid").getByText("Weight", { exact: true }).locator("..");
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

test.describe("ADR-0015 D5 — the overview blanks per block, from `scopes`", () => {
  test("a link that shares nothing is still reachable, and asserts nothing", async ({ page }) => {
    await signIn(page);

    // Round one of the ADR required WORKOUTS on the overview, which 403s the whole
    // client area — including Nutrition — for a link like this one. R2-2 reversed it.
    const res = await page.goto(`/clients/${MARA}`);
    expect(res?.status(), "an ACTIVE link with no data scope still opens").toBe(200);
    await expect(page.getByRole("heading", { name: "Mara D." })).toBeVisible();

    const body = page.locator("body");
    // The F1 sign-off edit in one assertion: none of the three "absent" fields may
    // surface as a number or as an empty-list sentence that reads like data.
    await expect(body).not.toContainText("0 days");
    await expect(body).not.toContainText("No streak");
    await expect(body).not.toContainText("No red flags");
    await expect(body).not.toContainText("No weigh-ins in the last 8 weeks");
    await expect(body).not.toContainText("No sessions yet");
    await expect(body).not.toContainText("null");

    await expect(page.getByText("Not shared").first()).toBeVisible();
    await expect(
      page.getByText("This trainee has not shared their weigh-ins with you.")
    ).toBeVisible();
    await expect(
      page.getByText(
        "Red flags need this trainee's progress and weigh-ins, which they have not shared."
      )
    ).toBeVisible();
  });

  test("NUTRITION only: the overview is blank, and Nutrition still works", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${PETRA}`);

    // Block 2's tile: a dash, never "0 days" — the whole point of F1 change 1.
    const streak = page.getByText("Current streak", { exact: true }).locator("..");
    await expect(streak).toContainText("—");
    await expect(streak).toContainText("Not shared");
    await expect(streak).not.toContainText("0 days");

    // The tab is still there (EV-184b's decision), and it leads somewhere that works.
    await page.getByRole("link", { name: "Nutrition" }).click();
    await page.waitForURL(`/clients/${PETRA}/nutrition`);
    await expect(page.getByRole("button", { name: "Save targets" })).toBeVisible();
    await expect(page.locator("body")).not.toContainText(
      "This trainee has not shared their nutrition with you."
    );
  });

  test("WORKOUTS only: the same blanks, and the Routine tab works", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${YUSUF}`);

    const adherence = page.getByText("Adherence this week", { exact: true }).locator("..");
    await expect(adherence).toContainText("—");
    await expect(adherence).toContainText("Not shared");

    await page.getByRole("link", { name: "Routine" }).click();
    await page.waitForURL(`/clients/${YUSUF}/routine`);
    await expect(page.getByLabel("Plan name")).toHaveValue("Two Day Full Body");
  });

  test("a fully shared link is unchanged: real numbers, real empty states", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${SARA}`);

    // Sara shares PROGRESS and WEIGH_INS. `0` here is a real streak of zero days and
    // must keep reading as one — the nullability must not have turned every zero into
    // a dash, which is the obvious way to "fix" this and is wrong.
    const streak = page.getByText("Current streak", { exact: true }).locator("..");
    await expect(streak).toContainText("0 days");
    await expect(streak).not.toContainText("Not shared");
    // `[]` is still "No red flags", not "not shared".
    await expect(page.getByText("No weigh-ins in the last 8 weeks").first()).toBeVisible();
  });
});
