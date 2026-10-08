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
 *       slice (restated by J-R2 and carded EV-345, which meets it: see the end of this file).
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

test.describe("J-R4 — the summary counts the whole list (N), not the rows painted", () => {
  /**
   * The PO's ruling (EV-342 J-R4): on Lina (N = 10) and a trainee with 6–9 sessions (Nils,
   * N = 6) the four numbers sum to N, N is the summary's number, the control's label
   * carries the same N, and the opened list has N rows; with N ≤ 5 (Ruben) there is no
   * control and N equals the rows shown.
   */
  for (const [name, id] of [
    ["Lina", LINA],
    ["Nils", NILS],
    ["Ruben", RUBEN],
  ] as const) {
    test(`${name}: summary N, label N, N rows`, async ({ page }) => {
      await signInThroughForm(page);
      await page.goto(`/clients/${id}`);
      const card = activity(page);
      const summary = card.getByText(/^Of the last \d+ sessions: /);
      const [n, easy, ok, hard, none] = (await summary.textContent())!.match(/\d+/g)!.map(Number);
      expect(easy + ok + hard + none, "the four numbers sum to N").toBe(n);
      if (n <= 5) {
        await expect(card.getByRole("button")).toHaveCount(0);
        await expect(card.getByRole("listitem")).toHaveCount(n);
        return;
      }
      await expect(card.getByRole("listitem")).toHaveCount(5);
      await card.getByRole("button", { name: `Show the last ${n}`, exact: true }).click();
      await expect(card.getByRole("listitem")).toHaveCount(n);
    });
  }
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
   * J.3's history: EV-342j's fold took Lina's overview at 768 × 1024 from 3,222 to 2,791 px
   * (French, `next start`, c2768c2 → 04a5c3b), under half of a 1,024 px screen. The PO
   * re-anchored J.3 (J-R2: `next start`, French, ≤ 2,198 px) and carded the rest as EV-345.
   * The J-R6 regression guard that stood here (English, ≤ 2,900 px, "EV-342j J.3 partial:
   * regression guard (EV-345 owns J.3)") was deleted by EV-345, as J-R6 allows once J.3 is a
   * plain test: the two tests below hold a bound 702 px tighter in both languages, so undoing
   * the fold (+431 px) or EV-345's layout trips them.
   */
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

test.describe("J.3 as ruled (768 × 1024)", () => {
  /**
   * The PO's ruling (hub 3cec7b49, J-R2): J.3 is Lina, FR, Chromium, 768 × 1024, at most
   * 2,198 px (one 1,024 px screen under the 3,222 px measured at c2768c2 on `next start`).
   * EV-342j's fold reached 2,791 px; the train (sprint 1/1b + k, j, m) 2,851. EV-345's layout
   * between 768 and 1279 px closes it: 2,152 px FR / 2,099 px EN on `next start` (EV-345.1's
   * probe, 2026-10-08, on 6caecb8 + EV-345). This suite runs on `next dev`, which reads the
   * same heights for this page; EV-345's number of record is still the `next start` one.
   *
   * Title prescribed by the PO (EV-342 J-R3); EV-345.2 turned the `test.fixme` into a plain
   * `test` with its assertion unchanged. Failed before EV-345 at 2,851 px.
   */
  test.describe("French", () => {
    test.use({ locale: "fr-FR" });

    test("EV-342j J.3 (EV-345): at 768×1024 the overview is one screen shorter than at c2768c2", async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 });
      await signInFrench(page);
      await page.goto(`/clients/${LINA}`);
      await expect(page.getByRole("region", { name: "Activité récente" }).getByRole("listitem")).toHaveCount(5);
      const height = await page.evaluate(() => document.documentElement.scrollHeight);
      test.info().annotations.push({ type: "overview height at 768x1024 (fr)", description: `${height} px` });
      expect(height).toBeLessThanOrEqual(2198);
    });
  });

  /** EV-345.2's English limb: "EN is measured and recorded, and it is also ≤ 2,198 px". */
  test("EV-345.2 (EN): at 768×1024 the English overview is also at most 2,198 px", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await signInThroughForm(page);
    await page.goto(`/clients/${LINA}`);
    await expect(activity(page).getByRole("listitem")).toHaveCount(5);
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    test.info().annotations.push({ type: "overview height at 768x1024 (en)", description: `${height} px` });
    expect(height).toBeLessThanOrEqual(2198);
  });
});
