import { expect, type Page } from "@playwright/test";
import { test } from "./fixture-test";

/**
 * EV-283b AC5 — the coach sees that the trainee changed the routine, and when.
 *
 * The routine page's half, on the default (`empty` roster) fixture server: the
 * per-trainee reads answer for every seeded id whatever the roster serves. The roster's
 * "Plan changed" marker needs the populated scenario and lives in
 * `coach-roster-plan-changed.spec.ts` (roster config).
 *
 * The sentences are LITERALS, not imports from `src/lib/copy.ts`: an assertion built
 * from the shipped string agrees with it by construction and cannot witness a reword.
 * The date is the fixture's fixed `lastChangedAt`, formatted the way every date on this
 * portal is (`formatInstant`: en-GB, UTC — see `src/lib/format.ts` for why UTC).
 *
 * The fixture's four routine states:
 *   Yusuf — TRAINEE, and changed since this coach's publish (the roster flags him).
 *   Omar  — TRAINEE, and this coach never published to him: the banner still shows,
 *           because the story keys it on `lastChangedBy`, not on the flag.
 *   Lina  — COACH: no banner.
 *   Dana  — never recorded (null): no banner, nothing inferred (AC3).
 */

const EMAIL = "coach@evoli.fit";
const PASSWORD = "Password123!";

const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
const DANA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0004";
const OMAR = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0005";
const YUSUF = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0007";

/**
 * The portal's one date format (en-GB, UTC — `src/lib/format.ts`), built here from
 * `Intl` directly rather than imported, so a change to the portal's formatter is not
 * agreed with by construction. ICU spells September "Sept" in en-GB today; deriving it
 * keeps the assertion about the SENTENCE, not about one ICU build.
 */
const onDay = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso));

const YUSUF_SENTENCE = `Yusuf changed this plan on ${onDay("2026-09-24T18:40:00Z")}. You're seeing their version.`;
const OMAR_SENTENCE = `Omar changed this plan on ${onDay("2026-09-19T08:15:00Z")}. You're seeing their version.`;

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/");
}

/** Any banner at all, located by the half of the sentence that does not vary. */
function anyBanner(page: Page) {
  return page.getByText("changed this plan on");
}

test.describe("EV-283b AC5 — the routine page says the trainee changed the plan", () => {
  test("a TRAINEE change reads exactly as the story, above the editor", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${YUSUF}/routine`);

    const banner = page.getByRole("note").filter({ hasText: "changed this plan on" });
    await expect(banner).toHaveCount(1);
    await expect(banner).toHaveText(YUSUF_SENTENCE);

    // "above the editor": the banner's bottom edge is above the editor's first field.
    const planName = page.getByLabel("Plan name");
    await expect(planName).toBeVisible();
    const b = await banner.boundingBox();
    const e = await planName.boundingBox();
    expect(b && e, "both boxes measured").toBeTruthy();
    expect(b!.y + b!.height).toBeLessThanOrEqual(e!.y);
  });

  test("a TRAINEE change this coach never published over still shows the banner", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/clients/${OMAR}/routine`);
    await expect(page.getByRole("note").filter({ hasText: "changed this plan on" })).toHaveText(
      OMAR_SENTENCE
    );
  });

  test("a COACH plan and a never-recorded author show no banner", async ({ page }) => {
    await signIn(page);
    for (const id of [LINA, DANA]) {
      await page.goto(`/clients/${id}/routine`);
      // Wait for the editor so an absent banner is not just a page still loading.
      await expect(page.getByLabel("Plan name")).toBeVisible();
      await expect(anyBanner(page)).toHaveCount(0);
    }
  });

  test("publishing clears it, and it stays cleared after a reload", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${YUSUF}/routine`);
    await expect(page.getByText(YUSUF_SENTENCE)).toBeVisible();

    await page.getByRole("button", { name: "Publish", exact: true }).click();
    const modal = page.getByRole("dialog");
    const confirm = modal.getByRole("button", { name: /^Publish/ });
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await expect(
      page.getByText("Published. The trainee sees it next time they open the app.")
    ).toBeVisible();

    await expect(anyBanner(page)).toHaveCount(0);
    await page.reload();
    await expect(page.getByLabel("Plan name")).toBeVisible();
    await expect(anyBanner(page)).toHaveCount(0);
  });
});
