import { expect, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";

/**
 * BUG-865 / BUG-866 — a held « Generate » always has a visible reason.
 *
 * A 429 holds « Generate » per KIND until Retry-After (staff B1 on EV-186f: the api's REGEN and
 * EDIT counters are separate). Opening a form cleared the panel's notice while the hold stayed, so
 * after « Cancel » and reopening, the coach saw a disabled « Generate » and no sentence saying why:
 *   · BUG-865 — the Update box, after a REVISE 429 (the 10-edits sentence);
 *   · BUG-866 — the Regenerate brief, after a REGENERATE 429 (the 3-regenerations sentence).
 * The form of a held kind now re-derives its kind's 429 sentence from the hold, and the sentence
 * goes when the hold lifts (Retry-After = the next UTC midnight; the browser clock is driven past it).
 *
 * FIXTURE mode: `evoli_fixture_ai=rate_link|rate_coach` answers every POST with a 429 carrying
 * Retry-After to the next UTC midnight. Sentences are LITERALS from the story's copy table.
 */

const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
const ROUTE = (id: string) => `/clients/${id}/routine`;

const EDIT_429 = "You've used today's 10 AI edits for Lina. You can still edit by hand, or try again tomorrow.";
const REGEN_429 = "You've used today's 3 AI regenerations for Lina. You can still edit by hand, or try again tomorrow.";
const COACH_429 = "You've used all of today's AI suggestions across your clients. Try again tomorrow.";
const EDIT_429_FR =
  "Vous avez utilisé les 10 modifications IA du jour pour Lina. Vous pouvez modifier à la main, ou réessayer demain.";
/** More than any Retry-After the fixture can name (≤ 86 400 s to the next UTC midnight). */
const PAST_ANY_HOLD_MS = 86_400_000 + 60_000;

async function cookie(page: Page, name: string, value: string) {
  await page.context().addCookies([{ name, value, domain: "localhost", path: "/" }]);
}

const panel = (page: Page) => page.getByTestId("routine-ai-panel");
const notice = (page: Page) => panel(page).getByTestId("routine-ai-notice");
const box = (page: Page) => panel(page).getByTestId("routine-ai-update");
const updateButton = (page: Page) => page.getByRole("button", { name: "Update with AI", exact: true });
const regenButton = (page: Page) => page.getByRole("button", { name: "Regenerate with AI", exact: true });
const request = (page: Page) => box(page).getByRole("textbox");
const send = (page: Page) => box(page).getByRole("button", { name: "Generate", exact: true });
/** The Regenerate brief is the panel's only form while the view is `brief`. */
const brief = (page: Page) => panel(page).locator("form");
const briefSend = (page: Page) => brief(page).getByRole("button", { name: "Generate", exact: true });

/** BUG-865's repro, up to the first 429: open the box, type "swap", press « Generate ». */
async function reviseRefused(page: Page, sentence = EDIT_429) {
  await page.goto(ROUTE(LINA));
  await updateButton(page).click();
  await request(page).fill("swap");
  await send(page).click();
  await expect(notice(page)).toHaveText(sentence);
  await expect(send(page)).toBeDisabled();
}

/** BUG-866's repro, up to the first 429: open the brief, press « Generate » on its defaults. */
async function regenerateRefused(page: Page) {
  await page.goto(ROUTE(LINA));
  await regenButton(page).click();
  await briefSend(page).click();
  await expect(notice(page)).toHaveText(REGEN_429);
  await expect(briefSend(page)).toBeDisabled();
}

test.beforeEach(async ({ page }) => {
  await signInThroughForm(page, { email: "coach@evoli.fit", password: "Password123!" });
  await cookie(page, "evoli_fixture_ai_delay_ms", "0");
  await cookie(page, "evoli_fixture_ai_caps", "instruction");
});

test.describe("BUG-865 — the Update box after a REVISE 429", () => {
  test("Cancel, then « Update with AI » again: Generate stays disabled AND the 10-edits sentence shows", async ({ page }) => {
    await cookie(page, "evoli_fixture_ai", "rate_link");
    await reviseRefused(page);
    await box(page).getByRole("button", { name: "Cancel" }).click();
    await updateButton(page).click();
    await expect(box(page)).toBeVisible();
    await expect(notice(page)).toHaveText(EDIT_429);
    await request(page).fill("swap");
    await expect(send(page)).toBeDisabled();
    await expect(notice(page)).toHaveText(EDIT_429);
  });

  test("the hold's own sentence: a coach-scope 429 reopens with the coach sentence", async ({ page }) => {
    await cookie(page, "evoli_fixture_ai", "rate_coach");
    await reviseRefused(page, COACH_429);
    await box(page).getByRole("button", { name: "Cancel" }).click();
    await updateButton(page).click();
    await expect(notice(page)).toHaveText(COACH_429);
    await expect(send(page)).toBeDisabled();
  });

  test("French: the reopened box says « …les 10 modifications IA du jour pour Lina… »", async ({ page }) => {
    await cookie(page, "evoli_fixture_ai", "rate_link");
    await cookie(page, "evoli_pro_locale", "fr");
    await page.goto(ROUTE(LINA));
    const open = page.getByRole("button", { name: "Modifier avec l'IA", exact: true });
    await open.click();
    await request(page).fill("échange");
    await box(page).getByRole("button", { name: "Générer", exact: true }).click();
    await expect(notice(page)).toHaveText(EDIT_429_FR);
    await box(page).getByRole("button", { name: "Annuler" }).click();
    await open.click();
    await expect(notice(page)).toHaveText(EDIT_429_FR);
    await expect(box(page).getByRole("button", { name: "Générer", exact: true })).toBeDisabled();
  });

  test("B1 kept: the REVISE hold puts no sentence on the Regenerate brief, whose Generate is enabled", async ({ page }) => {
    await cookie(page, "evoli_fixture_ai", "rate_link");
    await reviseRefused(page);
    await box(page).getByRole("button", { name: "Cancel" }).click();
    await regenButton(page).click();
    await expect(briefSend(page)).toBeEnabled();
    await expect(notice(page)).toHaveCount(0);
  });
});

test.describe("BUG-866 — the Regenerate brief after a REGENERATE 429", () => {
  test("Cancel, then « Regenerate with AI » again: Generate stays disabled AND the 3-regenerations sentence shows", async ({ page }) => {
    await cookie(page, "evoli_fixture_ai", "rate_link");
    await regenerateRefused(page);
    await brief(page).getByRole("button", { name: "Cancel" }).click();
    await regenButton(page).click();
    await expect(briefSend(page)).toBeDisabled();
    await expect(notice(page)).toHaveText(REGEN_429);
  });

  test("B1 kept: the REGENERATE hold puts no sentence on the Update box, whose Generate sends", async ({ page }) => {
    await cookie(page, "evoli_fixture_ai", "rate_link");
    await regenerateRefused(page);
    await brief(page).getByRole("button", { name: "Cancel" }).click();
    await updateButton(page).click();
    await request(page).fill("swap");
    await expect(send(page)).toBeEnabled();
    await expect(notice(page)).toHaveCount(0);
  });
});

test.describe("The sentence clears once the hold expires", () => {
  test.beforeEach(async ({ page }) => {
    // The hold is the BROWSER's clock + Retry-After; install a controllable clock before the page loads.
    await page.clock.install();
    await cookie(page, "evoli_fixture_ai", "rate_link");
  });

  test("Update box: past Retry-After the reopened box has no sentence and Generate is enabled", async ({ page }) => {
    await reviseRefused(page);
    await box(page).getByRole("button", { name: "Cancel" }).click();
    await updateButton(page).click();
    await expect(notice(page)).toHaveText(EDIT_429); // the control: still held, still explained
    await page.clock.fastForward(PAST_ANY_HOLD_MS);
    await expect(notice(page)).toHaveCount(0);
    await request(page).fill("swap");
    await expect(send(page)).toBeEnabled();
    await box(page).getByRole("button", { name: "Cancel" }).click();
    await updateButton(page).click();
    await expect(notice(page)).toHaveCount(0);
  });

  test("Update box left open on the 429: the press's own sentence goes when the hold lifts", async ({ page }) => {
    await reviseRefused(page);
    await page.clock.fastForward(PAST_ANY_HOLD_MS);
    await expect(notice(page)).toHaveCount(0);
    await expect(send(page)).toBeEnabled();
  });

  test("Regenerate brief: past Retry-After the reopened brief has no sentence and Generate is enabled", async ({ page }) => {
    await regenerateRefused(page);
    await brief(page).getByRole("button", { name: "Cancel" }).click();
    await regenButton(page).click();
    await expect(notice(page)).toHaveText(REGEN_429);
    await page.clock.fastForward(PAST_ANY_HOLD_MS);
    await expect(notice(page)).toHaveCount(0);
    await expect(briefSend(page)).toBeEnabled();
  });
});
