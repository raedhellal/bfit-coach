import { expect, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";

/**
 * EV-186n — the routine AI proposal's comparison, repair marks, « Garder », « Réessayer » and
 * the STALE copy, in FIXTURE mode (see `qa/coach-routine-ai.spec.ts` for the switches).
 *
 * The fixture's « model » is deterministic (block « EV-186b — THE ROUTINE AI PROPOSAL » in
 * `src/lib/coachApi.fixture.ts`): day 1 unchanged, day 2 one exercise replaced + one prescription
 * changed, day 3 its last exercise removed, sessions added to reach the brief's day count.
 * Dana's Tuesday « Push » (day 1, unchanged) holds the two exercises her SHOULDER rule swaps.
 *
 * Sentences are LITERALS from the story's copy table, never imported from `src/lib/copy.ts`.
 */

const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
const DANA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0004";
const ROUTE = (id: string) => `/clients/${id}/routine`;
const DISCLOSURE = /^Drafted with AI on \d{1,2} [A-Z][a-z]{2} \d{4}\. Review it before you publish — you're the author\.$/;

async function cookie(page: Page, name: string, value: string) {
  await page.context().addCookies([{ name, value, domain: "localhost", path: "/" }]);
}
const panel = (page: Page) => page.getByTestId("routine-ai-panel");
const diff = (page: Page) => panel(page).getByTestId("routine-ai-diff");

async function calls(page: Page): Promise<{ api: { op: string; arg: string | null }[]; aiPosts: { briefKeys: string[]; outcome: string }[] }> {
  const res = await page.request.get("/api/fixture/calls", { maxRedirects: 0 });
  return res.json();
}

async function ready(page: Page, id: string, days?: string) {
  await page.goto(ROUTE(id));
  await page.getByRole("button", { name: "Regenerate with AI", exact: true }).click();
  if (days) await panel(page).getByLabel("Training days per week").selectOption(days);
  await panel(page).getByRole("button", { name: "Generate" }).click();
  await expect(panel(page)).toHaveAttribute("data-ai-state", "ready", { timeout: 10_000 });
}

test.beforeEach(async ({ page }) => {
  await signInThroughForm(page, { email: "coach@evoli.fit", password: "Password123!" });
  await cookie(page, "evoli_fixture_ai_caps", "on");
  await cookie(page, "evoli_fixture_ai_delay_ms", "0");
});

test.describe("N1/N2/N5 — the comparison, computed in the portal", () => {
  test("Dana: an added session, a changed day row by row, the marked unchanged day stays open", async ({ page }) => {
    await ready(page, DANA, "3");
    await expect(diff(page).getByText("Compared with the published plan.")).toBeVisible();
    // Tue « Push » is unchanged but carries the two marks, so it is drawn, not folded.
    const tuesday = diff(page).locator('[data-weekday="2"]');
    await expect(tuesday).toHaveAttribute("data-day-kind", "unchanged");
    await expect(tuesday.getByTestId("routine-ai-repair-mark")).toHaveText([
      "Will be swapped at publish: Dana's Shoulders",
      "Will be swapped at publish: Dana's Shoulders",
    ]);
    const friday = diff(page).locator('[data-weekday="5"]');
    await expect(friday).toHaveAttribute("data-day-kind", "changed");
    await expect(friday.locator("[data-row-kind]")).toHaveCount(2);
    await expect(friday.locator('[data-row-kind="replaced"]')).toContainText("Pull-Up →");
    await expect(friday.locator('[data-row-kind="prescription"]')).toContainText("Sets: 3 → 4");
    const monday = diff(page).locator('[data-weekday="1"]');
    await expect(monday).toHaveAttribute("data-day-kind", "added");
    await expect(monday).toContainText("New session");
    // N5: a LIVE-base proposal carries Dana's equipment and injuries; no subject-field row.
    await expect(diff(page).getByTestId("routine-ai-settings")).toHaveCount(0);
  });

  test("Lina: unmarked unchanged days fold into one line; a removed exercise is listed", async ({ page }) => {
    await ready(page, LINA);
    await expect(diff(page).getByTestId("routine-ai-unchanged")).toContainText("1 session unchanged");
    await expect(diff(page).locator('[data-row-kind="removed"]')).toHaveCount(1);
    await expect(diff(page).getByTestId("routine-ai-repair-mark")).toHaveCount(0);
  });

  test("French: the mark's sentence", async ({ page }) => {
    await cookie(page, "evoli_pro_locale", "fr");
    await page.goto(ROUTE(DANA));
    await page.getByRole("button", { name: "Régénérer avec l'IA", exact: true }).click();
    await panel(page).getByRole("button", { name: "Générer" }).click();
    await expect(panel(page).getByTestId("routine-ai-repair-mark").first()).toHaveText(
      "Sera remplacé à la publication\u00a0: Épaules de Dana"
    );
  });
});

test.describe("N3 — « Keep » lands the draft in the editor, discloses it, publishes nothing", () => {
  test("no draft: Keep → the editor holds the kept plan with the disclosure; it survives a reload", async ({ page }) => {
    await ready(page, LINA, "4");
    await panel(page).getByRole("button", { name: "Keep" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0); // nothing to replace: no confirm
    await expect(panel(page)).toHaveAttribute("data-ai-state", "idle");
    await expect(page.getByText("Draft — not yet published")).toBeVisible();
    await expect(page.getByTestId("routine-ai-drafted")).toHaveText(DISCLOSURE);
    await expect(page.getByText("Unsaved changes")).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId("routine-ai-drafted")).toHaveText(DISCLOSURE);
    // The kept suggestion is not offered again (Keep removed it, BUG-868).
    await expect(panel(page)).toHaveAttribute("data-ai-state", "idle");
    const { api } = await calls(page);
    expect(api.some((e) => e.op === "keepRoutineAiProposal" && e.arg === LINA)).toBe(true);
    expect(api.some((e) => e.op === "publishRoutine")).toBe(false);
  });

  test("Discard draft afterwards returns the published plan and drops the disclosure", async ({ page }) => {
    await ready(page, LINA, "4");
    await panel(page).getByRole("button", { name: "Keep" }).click();
    await expect(page.getByTestId("routine-ai-drafted")).toBeVisible();
    await page.getByRole("button", { name: "Discard draft" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Discard draft" }).click();
    await expect(page.getByText("Published plan")).toBeVisible();
    await expect(page.getByTestId("routine-ai-drafted")).toHaveCount(0);
  });

  test("with a saved draft: Keep asks first; Cancel changes nothing; Keep replaces it", async ({ page }) => {
    await page.goto(ROUTE(LINA));
    await page.getByLabel("Plan name").fill("Coach edit");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText(/^Draft saved /)).toBeVisible();
    await page.getByRole("button", { name: "Regenerate with AI", exact: true }).click();
    await panel(page).getByRole("button", { name: "Generate" }).click();
    await expect(panel(page)).toHaveAttribute("data-ai-state", "ready", { timeout: 10_000 });
    await expect(diff(page).getByText("Compared with your unpublished draft.")).toBeVisible();
    await panel(page).getByRole("button", { name: "Keep" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("This replaces your unpublished draft for Lina M. That draft cannot be recovered.");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(panel(page)).toHaveAttribute("data-ai-state", "ready");
    await expect(page.getByLabel("Plan name")).toHaveValue("Coach edit");
    await panel(page).getByRole("button", { name: "Keep" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Keep" }).click();
    await expect(page.getByTestId("routine-ai-drafted")).toHaveText(DISCLOSURE);
  });
});

test.describe("N4 — STALE and DRAFT_EXISTS at Keep: the sentence, « Try again » with the same brief", () => {
  test("the draft was saved after the suggestion → 409 COACH_DRAFT_EXISTS; the draft is unchanged", async ({ page }) => {
    await ready(page, LINA);
    await page.getByLabel("Plan name").fill("Saved after the suggestion");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText(/^Draft saved /)).toBeVisible();
    await panel(page).getByRole("button", { name: "Keep" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Keep" }).click();
    await expect(panel(page).getByRole("alert")).toHaveText(
      "Your draft for Lina changed after this suggestion was made. Try again to get a fresh one."
    );
    await expect(page.getByLabel("Plan name")).toHaveValue("Saved after the suggestion");
    await expect(page.getByTestId("routine-ai-drafted")).toHaveCount(0);
    await panel(page).getByRole("button", { name: "Try again" }).click();
    await expect(panel(page)).toHaveAttribute("data-ai-state", "ready", { timeout: 10_000 });
    const { aiPosts } = await calls(page);
    expect(aiPosts.filter((p) => p.outcome === "202")).toHaveLength(2);
    expect(aiPosts[1].briefKeys).toEqual(aiPosts[0].briefKeys);
  });

  test("the live plan was republished after the suggestion → 409 COACH_PROPOSAL_STALE; nothing is written", async ({
    page,
  }) => {
    await ready(page, LINA);
    // Publish a changed plan: a new `plans` row, so the proposal's live base has moved.
    await page.getByLabel("Plan name").fill("Republished meanwhile");
    const bar = page.getByRole("region", { name: "Routine actions", exact: true });
    await bar.getByRole("button", { name: "Publish", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Publish", exact: true }).click();
    await expect(page.getByText("Published. The trainee sees it next time they open the app.")).toBeVisible();
    await expect(panel(page)).toHaveAttribute("data-ai-state", "ready");
    await panel(page).getByRole("button", { name: "Keep" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0); // no draft to replace: no confirm
    await expect(panel(page).getByRole("alert")).toHaveText(
      "Lina's programme changed after this suggestion was made. Try again to get a fresh one."
    );
    await expect(panel(page).getByRole("button", { name: "Try again" })).toBeVisible();
    // Nothing was kept: still the published plan, no draft, no AI disclosure — before and after a reload.
    await expect(page.getByText("Published plan", { exact: true })).toBeVisible();
    await expect(page.getByTestId("routine-ai-drafted")).toHaveCount(0);
    await page.reload();
    await expect(page.getByText("Published plan", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Plan name")).toHaveValue("Republished meanwhile");
    await expect(page.getByTestId("routine-ai-drafted")).toHaveCount(0);
  });

  test("an expired proposal reads as STALE and offers « Try again »", async ({ page }) => {
    await cookie(page, "evoli_fixture_ai", "expired");
    await page.goto(ROUTE(LINA));
    await page.getByRole("button", { name: "Regenerate with AI", exact: true }).click();
    await panel(page).getByRole("button", { name: "Generate" }).click();
    await expect(panel(page)).toHaveAttribute("data-ai-state", "stale", { timeout: 10_000 });
    await expect(panel(page).getByRole("alert")).toHaveText(
      "Lina's programme changed after this suggestion was made. Try again to get a fresh one."
    );
    await expect(panel(page).getByRole("button", { name: "Try again" })).toBeVisible();
    await expect(panel(page).getByRole("button", { name: "Keep" })).toHaveCount(0);
  });
});
