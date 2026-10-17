import { expect, type Locator, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";

/**
 * BUG-867 — a refused « Discard » on a FAILED proposal never repeats the run's sentence; and the
 * staff a11y nit on BUG-865/866 — a held « Generate » is described by the sentence saying why.
 *
 * BUG-867: on a FAILED view (a failed REVISE's box, or a failed Regenerate's Try again / Discard), a
 * Discard refused by a dropped connection resolved to the generic FAILED code, whose sentence is the
 * FAILED run's own: « We couldn't prepare this suggestion… » appeared twice, both role="alert". A
 * refused Discard now says its own sentence (OURS, `routineAi.discardFailed`), and no line equal to
 * the view's own sentence is drawn again.
 *
 * Staff B1 on the first cut: a refused RESTART on a FAILED view (the box's « Generate » again, or
 * « Try again ») is a new event and must be announced. It says its own sentence (OURS,
 * `routineAi.startFailed`) in a NEW role="alert" line; no press line is ever dropped because its words
 * equal the view's (that dedupe made the second failure silent: staff's probe `silent.spec.ts`).
 *
 * A11y: the held form's « Generate » carries `aria-describedby` naming the VISIBLE element that holds
 * the hold's 429 sentence; the hold's second line (`routine-ai-held-notice`) is role="status".
 *
 * FIXTURE mode: `evoli_fixture_ai=fail` settles every run FAILED with `evoli_fixture_ai_error`'s code
 * (default COACH_AI_TIMEOUT → the generic Failed sentence); `rate_link` answers POSTs with a 429. The
 * Discard's refusal is the server-action POST aborted (connection reset), as senior-qa reproduced it.
 * Sentences are LITERALS: table copy from EV-186's FR/EN table; OURS lines as senior-po ruled them (2026-10-17).
 */

const ROUTE = "/clients/6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001/routine";

const FAILED = "We couldn't prepare this suggestion. Nothing was changed. Try again.";
const FAILED_FR = "Impossible de préparer cette suggestion. Rien n'a été modifié. Réessayez.";
const DISCARD_FAILED = "We couldn't confirm this suggestion was discarded. Try again.";
const DISCARD_FAILED_FR = "Impossible de confirmer que cette suggestion a été écartée. Réessayez.";
const START_FAILED = "We couldn't start this suggestion. Nothing was changed. Try again.";
const START_FAILED_FR =
  "Impossible de lancer cette suggestion. Rien n'a été modifié. Réessayez.";
const NOTHING_APPLIED =
  "The AI found no change to apply for this request. Nothing was changed. Rephrase it or try again.";
const EDIT_429 = "You've used today's 10 AI edits for Lina. You can still edit by hand, or try again tomorrow.";
const REGEN_429 = "You've used today's 3 AI regenerations for Lina. You can still edit by hand, or try again tomorrow.";

async function cookie(page: Page, name: string, value: string) {
  await page.context().addCookies([{ name, value, domain: "localhost", path: "/" }]);
}

const panel = (page: Page) => page.getByTestId("routine-ai-panel");
const notice = (page: Page) => panel(page).getByTestId("routine-ai-notice");
const heldNotice = (page: Page) => panel(page).getByTestId("routine-ai-held-notice");
const failedLine = (page: Page) => panel(page).getByTestId("routine-ai-failed");
const box = (page: Page) => panel(page).getByTestId("routine-ai-update");

/** The next server-action POST is dropped (connection reset); every later request goes through. */
async function dropNextAction(page: Page) {
  let hit = 0;
  await page.route("**/*", async (route) => {
    const r = route.request();
    if (hit === 0 && r.method() === "POST" && r.headers()["next-action"]) {
      hit++;
      return route.abort("connectionreset");
    }
    return route.continue();
  });
}

/** How many of the panel's lines read exactly `text`: never more than one (BUG-867). */
async function linesReading(page: Page, text: string): Promise<number> {
  const all = await panel(page).locator("p").allTextContents();
  return all.filter((t) => t.trim() === text).length;
}

/** The element `aria-describedby` names on `control`: exactly one id, resolving to a visible element. */
async function describedBy(page: Page, control: Locator): Promise<Locator> {
  await expect(control).toHaveAttribute("aria-describedby", /\S/);
  const ids = (await control.getAttribute("aria-describedby"))?.trim().split(/\s+/) ?? [];
  expect(ids, "Generate names exactly one description").toHaveLength(1);
  const target = page.locator(`[id="${ids[0]}"]`);
  await expect(target).toHaveCount(1);
  await expect(target).toBeVisible();
  return target;
}

/** A REVISE that settles FAILED: the box comes back with the coach's text and the failed sentence. */
async function failedRevise(page: Page, labels = { open: "Update with AI", send: "Generate" }) {
  await page.goto(ROUTE);
  await page.getByRole("button", { name: labels.open, exact: true }).click();
  await box(page).getByRole("textbox").fill("swap");
  await box(page).getByRole("button", { name: labels.send, exact: true }).click();
  await expect(failedLine(page)).toBeVisible({ timeout: 20_000 });
}

/** A Regenerate that settles FAILED: its sentence, Try again and Discard. */
async function failedRegenerate(page: Page) {
  await page.goto(ROUTE);
  await page.getByRole("button", { name: "Regenerate with AI", exact: true }).click();
  await panel(page).locator("form").getByRole("button", { name: "Generate", exact: true }).click();
  await expect(failedLine(page)).toBeVisible({ timeout: 20_000 });
  await expect(panel(page).getByRole("button", { name: "Try again", exact: true })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await signInThroughForm(page, { email: "coach@evoli.fit", password: "Password123!" });
  await cookie(page, "evoli_fixture_ai_delay_ms", "0");
  await cookie(page, "evoli_fixture_ai_caps", "instruction");
});

test.describe("BUG-867 — a refused Discard on a FAILED proposal", () => {
  test.beforeEach(async ({ page }) => {
    await cookie(page, "evoli_fixture_ai", "fail"); // default code COACH_AI_TIMEOUT → the Failed sentence
  });

  test("failed REVISE box: the run's sentence once, the Discard's own below it; Discard again then clears", async ({ page }) => {
    await failedRevise(page);
    await expect(failedLine(page)).toHaveText(FAILED);
    await dropNextAction(page);
    await box(page).getByRole("button", { name: "Discard", exact: true }).click();
    await expect(notice(page)).toHaveText(DISCARD_FAILED);
    await expect(failedLine(page)).toHaveText(FAILED);
    expect(await linesReading(page, FAILED)).toBe(1);
    expect(await linesReading(page, DISCARD_FAILED)).toBe(1);
    // The run is still on screen, and pressing Discard again (idempotent) now lands.
    await expect(panel(page)).toHaveAttribute("data-ai-state", "failed");
    await box(page).getByRole("button", { name: "Discard", exact: true }).click();
    await expect(panel(page)).toHaveAttribute("data-ai-state", "idle");
    await expect(notice(page)).toHaveCount(0);
  });

  test("failed Regenerate: the run's sentence once, the Discard's own below it", async ({ page }) => {
    await failedRegenerate(page);
    await expect(failedLine(page)).toHaveText(FAILED);
    await dropNextAction(page);
    await panel(page).getByRole("button", { name: "Discard", exact: true }).click();
    await expect(notice(page)).toHaveText(DISCARD_FAILED);
    await expect(failedLine(page)).toHaveText(FAILED);
    expect(await linesReading(page, FAILED)).toBe(1);
    await expect(panel(page)).toHaveAttribute("data-ai-state", "failed");
  });

  test("French, failed REVISE box: « Impossible de préparer… » once, « Impossible de confirmer… » for the Discard", async ({ page }) => {
    await cookie(page, "evoli_pro_locale", "fr");
    await failedRevise(page, { open: "Modifier avec l'IA", send: "Générer" });
    await expect(failedLine(page)).toHaveText(FAILED_FR);
    await dropNextAction(page);
    await box(page).getByRole("button", { name: "Écarter", exact: true }).click();
    await expect(notice(page)).toHaveText(DISCARD_FAILED_FR);
    expect(await linesReading(page, FAILED_FR)).toBe(1);
  });

  test("French, failed Regenerate: « Impossible de préparer… » once", async ({ page }) => {
    await cookie(page, "evoli_pro_locale", "fr");
    await page.goto(ROUTE);
    await page.getByRole("button", { name: "Régénérer avec l'IA", exact: true }).click();
    await panel(page).locator("form").getByRole("button", { name: "Générer", exact: true }).click();
    await expect(failedLine(page)).toHaveText(FAILED_FR, { timeout: 20_000 });
    await dropNextAction(page);
    await panel(page).getByRole("button", { name: "Écarter", exact: true }).click();
    await expect(notice(page)).toHaveText(DISCARD_FAILED_FR);
    expect(await linesReading(page, FAILED_FR)).toBe(1);
  });
});

test.describe("Staff B1 — a refused restart on a FAILED view is announced, never silent", () => {
  test.beforeEach(async ({ page }) => {
    await cookie(page, "evoli_fixture_ai", "fail"); // default code COACH_AI_TIMEOUT → the Failed sentence
  });

  /** A new alert line: absent before the press, then present, role="alert", with `text`. */
  async function expectNewAlert(page: Page, text: string) {
    await expect(notice(page)).toHaveText(text);
    await expect(notice(page)).toHaveAttribute("role", "alert");
  }

  test("failed REVISE box: « Generate » again with no answer puts a new alert line under the run's", async ({ page }) => {
    await failedRevise(page);
    await expect(failedLine(page)).toHaveText(FAILED);
    await expect(notice(page)).toHaveCount(0);
    await dropNextAction(page);
    await box(page).getByRole("button", { name: "Generate", exact: true }).click();
    await expectNewAlert(page, START_FAILED);
    await expect(failedLine(page)).toHaveText(FAILED);
    await expect(panel(page)).toHaveAttribute("data-ai-state", "failed");
    expect(await linesReading(page, FAILED)).toBe(1);
    // The coach's text survives for the next try (U5).
    await expect(box(page).getByRole("textbox")).toHaveValue("swap");
  });

  test("failed Regenerate: « Try again » with no answer puts a new alert line under the run's", async ({ page }) => {
    await failedRegenerate(page);
    await expect(notice(page)).toHaveCount(0);
    await dropNextAction(page);
    await panel(page).getByRole("button", { name: "Try again", exact: true }).click();
    await expectNewAlert(page, START_FAILED);
    await expect(failedLine(page)).toHaveText(FAILED);
    await expect(panel(page)).toHaveAttribute("data-ai-state", "failed");
  });

  test("French, failed REVISE box: « Générer » again with no answer says « Impossible de lancer cette suggestion… »", async ({ page }) => {
    await cookie(page, "evoli_pro_locale", "fr");
    await failedRevise(page, { open: "Modifier avec l'IA", send: "Générer" });
    await dropNextAction(page);
    await box(page).getByRole("button", { name: "Générer", exact: true }).click();
    await expectNewAlert(page, START_FAILED_FR);
    await expect(failedLine(page)).toHaveText(FAILED_FR);
  });

  test("French, failed Regenerate: « Réessayer » with no answer is announced", async ({ page }) => {
    await cookie(page, "evoli_pro_locale", "fr");
    await page.goto(ROUTE);
    await page.getByRole("button", { name: "Régénérer avec l'IA", exact: true }).click();
    await panel(page).locator("form").getByRole("button", { name: "Générer", exact: true }).click();
    await expect(failedLine(page)).toHaveText(FAILED_FR, { timeout: 20_000 });
    await dropNextAction(page);
    await panel(page).getByRole("button", { name: "Réessayer", exact: true }).click();
    await expectNewAlert(page, START_FAILED_FR);
  });
});

test.describe("Staff a11y nit — a held Generate is described by its visible sentence", () => {
  test("Update box after a REVISE 429: aria-describedby names the alert line with the 10-edits sentence", async ({ page }) => {
    await cookie(page, "evoli_fixture_ai", "rate_link");
    await page.goto(ROUTE);
    await page.getByRole("button", { name: "Update with AI", exact: true }).click();
    await box(page).getByRole("textbox").fill("swap");
    const send = box(page).getByRole("button", { name: "Generate", exact: true });
    await send.click();
    await expect(notice(page)).toHaveText(EDIT_429); // the refusal has landed, not just the press pending
    await expect(send).toBeDisabled();
    const target = await describedBy(page, send);
    await expect(target).toHaveText(EDIT_429);
    await expect(target).toHaveAttribute("data-testid", "routine-ai-notice");
    // Reopened: the sentence is re-derived from the hold (BUG-865), and still describes Generate.
    await box(page).getByRole("button", { name: "Cancel" }).click();
    await page.getByRole("button", { name: "Update with AI", exact: true }).click();
    await expect(send).toBeDisabled();
    await expect(await describedBy(page, send)).toHaveText(EDIT_429);
  });

  test("Regenerate brief after a REGENERATE 429: aria-describedby names the 3-regenerations sentence", async ({ page }) => {
    await cookie(page, "evoli_fixture_ai", "rate_link");
    await page.goto(ROUTE);
    await page.getByRole("button", { name: "Regenerate with AI", exact: true }).click();
    const send = panel(page).locator("form").getByRole("button", { name: "Generate", exact: true });
    await send.click();
    await expect(notice(page)).toHaveText(REGEN_429);
    await expect(send).toBeDisabled();
    await expect(await describedBy(page, send)).toHaveText(REGEN_429);
    await panel(page).locator("form").getByRole("button", { name: "Cancel" }).click();
    await page.getByRole("button", { name: "Regenerate with AI", exact: true }).click();
    await expect(send).toBeDisabled();
    await expect(await describedBy(page, send)).toHaveText(REGEN_429);
  });

  test("no hold: Generate names no description", async ({ page }) => {
    await page.goto(ROUTE);
    await page.getByRole("button", { name: "Update with AI", exact: true }).click();
    await expect(box(page).getByRole("button", { name: "Generate", exact: true })).not.toHaveAttribute(
      "aria-describedby",
      /.+/
    );
  });

  for (const [name, code, runSentence] of [
    ["NOTHING_APPLIED", "COACH_AI_NOTHING_APPLIED", NOTHING_APPLIED],
    ["the default TIMEOUT (BUG-867's T2)", null, FAILED],
  ] as const) {
    test(`failed REVISE box (${name}) + REVISE hold + refused Discard: three distinct lines; the hold's is role=status and describes Generate`, async ({ page }) => {
      await cookie(page, "evoli_fixture_ai", "fail");
      if (code) await cookie(page, "evoli_fixture_ai_error", code);
      await failedRevise(page);
      await expect(failedLine(page)).toHaveText(runSentence);
      await cookie(page, "evoli_fixture_ai", "rate_link");
      const send = box(page).getByRole("button", { name: "Generate", exact: true });
      await send.click();
      await expect(notice(page)).toHaveText(EDIT_429);
      await expect(send).toBeDisabled();
      await dropNextAction(page);
      await box(page).getByRole("button", { name: "Discard", exact: true }).click();
      await expect(notice(page)).toHaveText(DISCARD_FAILED);
      await expect(heldNotice(page)).toHaveText(EDIT_429);
      await expect(heldNotice(page)).toHaveAttribute("role", "status");
      await expect(failedLine(page)).toHaveText(runSentence);
      for (const line of [runSentence, DISCARD_FAILED, EDIT_429]) expect(await linesReading(page, line)).toBe(1);
      const target = await describedBy(page, send);
      await expect(target).toHaveAttribute("data-testid", "routine-ai-held-notice");
      await expect(target).toHaveText(EDIT_429);
    });
  }
});
