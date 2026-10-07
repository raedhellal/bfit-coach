import { expect, type Locator, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";
import { expectNoSidewaysScroll } from "./layout";
import { signInFrench } from "./french";

/**
 * EV-342j (audit A16) — the overview lists sessions once.
 *
 * The PO's ruling: « Historique des séances » folds into « Activité récente »: one list,
 * the latest 5 sessions, « Voir les 10 dernières » / "Show the last 10" opening the rest
 * in place. The adherence tile and the « Assiduité » series both stay.
 *
 *   J.1 one session list on the overview, 5 rows, expandable to 10, same row content as
 *       the old history block;
 *   J.2 nothing the old blocks showed is lost (each field of a history row appears in the
 *       new one);
 *   J.3 at 768 px the page is at least one screen shorter than 3,133 px — NOT met by this
 *       slice; what it does achieve is pinned below.
 *
 * Lina has twelve completed sessions in the seed; the api caps the history at ten. Nils
 * has six, Ruben five, Kaia none.
 */

const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
const NILS = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0002";
const KAIA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0010";
const RUBEN = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0011";

const FEEDBACK = ["Easy", "OK", "Hard", "No feedback given"];

function activity(page: Page): Locator {
  return page.getByRole("region", { name: "Recent activity" });
}

/** Each row's three fields, as the coach reads them. */
async function rowFields(card: Locator): Promise<{ date: string; title: string; meta: string }[]> {
  return card.locator(".activity-row").evaluateAll((rows) =>
    rows.map((row) => ({
      date: row.querySelector(".activity-date")?.textContent?.trim() ?? "",
      title: row.querySelector(".activity-title")?.textContent?.trim() ?? "",
      meta: row.querySelector(".activity-meta")?.textContent?.trim() ?? "",
    }))
  );
}

test.describe("J.1 — one session list: five rows, the rest opened in place", () => {
  test("Lina: five rows, « Show the last 10 », then ten in the SAME list, and focus on the first new row", async ({
    page,
  }) => {
    await signInThroughForm(page);
    await page.goto(`/clients/${LINA}`);

    // The old block is gone, and nothing else on the page lists a session.
    await expect(page.getByRole("region", { name: "Recent sessions" })).toHaveCount(0);
    const card = activity(page);
    await expect(card.getByRole("list")).toHaveCount(1);
    await expect(card.getByRole("listitem")).toHaveCount(5);
    const newest = (await rowFields(card))[0];
    await expect(page.locator("main li").filter({ hasText: newest.title }).filter({ hasText: newest.date })).toHaveCount(1);

    const more = card.getByRole("button", { name: "Show the last 10" });
    await more.click();
    await expect(card.getByRole("list")).toHaveCount(1);
    await expect(card.getByRole("listitem")).toHaveCount(10);
    await expect(more).toHaveCount(0);
    await expect(card.getByRole("listitem").nth(5)).toBeFocused();
  });

  test("fewer than ten names the real count; five or fewer has no control at all", async ({ page }) => {
    await signInThroughForm(page);
    await page.goto(`/clients/${NILS}`);
    const card = activity(page);
    await expect(card.getByRole("listitem")).toHaveCount(5);
    await expect(card.getByRole("button")).toHaveText(["Show the last 6"]);
    await card.getByRole("button", { name: "Show the last 6" }).click();
    await expect(card.getByRole("listitem")).toHaveCount(6);

    await page.goto(`/clients/${RUBEN}`);
    await expect(activity(page).getByRole("listitem")).toHaveCount(5);
    await expect(activity(page).getByRole("button")).toHaveCount(0);
  });

  test("no completed session: AC5's sentence, no list, no control", async ({ page }) => {
    await signInThroughForm(page);
    await page.goto(`/clients/${KAIA}`);
    const card = activity(page);
    await expect(card).toContainText("No completed sessions yet");
    await expect(card.getByRole("listitem")).toHaveCount(0);
    await expect(card.getByRole("button")).toHaveCount(0);
  });
});

test.describe("J.2 — nothing the history block showed is lost", () => {
  test("every row has its date, its session and what the trainee said, and the summary counts the rows", async ({
    page,
  }) => {
    await signInThroughForm(page);
    await page.goto(`/clients/${LINA}`);
    const card = activity(page);
    await card.getByRole("button", { name: "Show the last 10" }).click();
    const rows = await rowFields(card);
    expect(rows).toHaveLength(10);
    for (const row of rows) {
      expect(row.date, "a date on every row").toMatch(/^\d{1,2} \w{3,5} \d{4}$/);
      expect(row.title, "a session name (or the dash) on every row").not.toBe("");
      expect(FEEDBACK, `"${row.meta}" is one of the four answers`).toContain(row.meta);
    }

    // AC5's summary line moved with the rows, and its four numbers are the rows' own.
    const summary = card.getByText(/^Of the last \d+ sessions: /);
    await expect(summary).toBeVisible();
    const [returned, easy, ok, hard, none] = (await summary.textContent())!.match(/\d+/g)!.map(Number);
    const count = (meta: string) => rows.filter((r) => r.meta === meta).length;
    expect({ returned, easy, ok, hard, none }).toEqual({
      returned: rows.length,
      easy: count("Easy"),
      ok: count("OK"),
      hard: count("Hard"),
      none: count("No feedback given"),
    });
  });

  test("the adherence tile and the « Assiduité » series both stay", async ({ page }) => {
    await signInThroughForm(page);
    await page.goto(`/clients/${LINA}`);
    await expect(page.getByText("Sessions · last 8 weeks", { exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Adherence, last 8 weeks" })).toBeVisible();
  });
});

test.describe("in French", () => {
  test.use({ locale: "fr-FR" });

  test("« Voir les 10 dernières » and the French summary", async ({ page }) => {
    await signInFrench(page);
    await page.goto(`/clients/${LINA}`);
    const card = page.getByRole("region", { name: "Activité récente" });
    await expect(card.getByText(/^Sur les 10 dernières séances/)).toBeVisible();
    await card.getByRole("button", { name: "Voir les 10 dernières" }).click();
    await expect(card.getByRole("listitem")).toHaveCount(10);
  });
});

test.describe("J.3 — widths", () => {
  /**
   * ⚠ J.3 asks for "at least one screen shorter than 3,133 px"; this slice does NOT reach
   * that, and this test does not pretend it does. Measured at 768 × 1024 on Lina (the
   * audit's page), c2768c2 → this branch: 3,222 → 2,791 px under `next start`, 3,189 →
   * 2,758 px under `next dev` — 431 px either way, under half of a 1,024 px screen. The
   * ruling keeps every other block, so the rest is the PO's call.
   *
   * What is pinned is the fold's own saving (the old block's ~490 px, less the summary
   * line and the control that moved into the card): 2,820 px, with ~30 px of margin over
   * both servers' measurements, which c2768c2 fails by ~370 px. The history block cannot
   * come back below the card without this going red.
   */
  test("768 px: the overview loses the old block's height (J.3 partial: 2,820 px at most)", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await signInThroughForm(page);
    await page.goto(`/clients/${LINA}`);
    await expect(activity(page).getByRole("listitem")).toHaveCount(5);
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    test.info().annotations.push({ type: "overview height at 768x1024", description: `${height} px` });
    expect(height).toBeLessThanOrEqual(2820);
  });

  for (const width of [1440, 1024, 768, 390]) {
    test(`${width} px: the opened list scrolls nothing sideways`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await signInThroughForm(page);
      await page.goto(`/clients/${LINA}`);
      await activity(page).getByRole("button", { name: "Show the last 10" }).click();
      await expect(activity(page).getByRole("listitem")).toHaveCount(10);
      await expectNoSidewaysScroll(page, `the overview at ${width}`);
    });
  }
});
