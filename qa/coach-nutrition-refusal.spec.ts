import { expect, type ConsoleMessage, type Locator, type Page } from "@playwright/test";
import { test } from "./fixture-test";

/**
 * EV-071b (coach portal) and EV-242b, in **fixture mode** (see playwright.config.ts).
 *
 * EV-071b — b-fit-api answers 422 `NO_SAFE_MEAL_PLAN` when the trainee's allergies and food
 * rules rule out every recipe it can check, on the week apply and on a day regenerate, and
 * writes nothing. Before this the portal said "The meal week could not be applied." /
 * "The day could not be regenerated.", which reads as a fault and invites a retry. The
 * story's ruling 2.3 (week) and 2.4 (day) blocks are asserted verbatim, with the placement
 * rule of 2.2 (a week on screen stays, identical, under the block; with none, the block
 * stands in for it) and AC13's "no quota sentence on a day".
 *
 * NO quota sentence is on the week block (staff ruling 2026-10-01, option a): Q1, Q2 and
 * Q3 are all asserted ABSENT, on a first and a second refusal in one page. b-fit-api main
 * releases the apply claim on EVERY refusal, so Q2 and Q3's "trying again will use it" are
 * false, and Q1 needs the api to say so (EV-196).
 *
 * EV-242b — 429 `COACH_DAY_REGEN_LIMIT` names the cap (AC3's first sentence, in the staff
 * ruling's wording: the counter is the TRAINEE's), disables every Regenerate until an
 * Apply succeeds (the apply resets the trainee's counter), logs `coach_day_regen_capped`
 * with no properties, and does not read the
 * api's message: the fixture's 429 carries the api's own sentence, "…they reset tomorrow",
 * and the page must not show "tomorrow". AC3's "after {local time}" is NOT asserted: the
 * api sends no reset instant (EV-242a's second half is not on api main).
 *
 * The refusals are forced with fixture cookies (`evoli_fixture_week=no_safe_plan`,
 * `evoli_fixture_regen=no_safe_plan|capped|fail`), one browser context each. Every
 * sentence is a LITERAL here, never imported from `copy.ts`.
 */

const PASSWORD = "Password123!";
const EMAIL = "coach@evoli.fit";
/** Targets + a current week (P1). */
const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
/** No targets and no week (P2). */
const NILS = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0002";

/* ── verbatim, English ─────────────────────────────────────────────────────── */
const RULED_OUT =
  "Their recorded allergies and food rules rule out every recipe we're able to check. Nothing was changed.";
const Q1 = "This hasn't used today's apply — you can try again.";
const Q2_LEAD = "This has used today's apply.";
/** The three quota sentences ruling 2.1 wrote; none may render (see the header). */
const Q3 =
  "Your first refusal for a trainee each day doesn't use your daily apply. If this is the second one today, trying again will use it.";
const APPLY_FAILED = "The meal week could not be applied.";
const REGEN_FAILED = "The day could not be regenerated.";

test.describe.configure({ mode: "serial" });

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/");
}

async function signInFrench(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(EMAIL);
  await page.getByLabel("Mot de passe").fill(PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL("/");
}

async function fixtureCookie(page: Page, name: string, value: string) {
  await page.context().addCookies([{ name, value, domain: "localhost", path: "/" }]);
}

/** Every meal row's full text, in order: names, slots, macros and markers. */
async function weekText(page: Page): Promise<string[]> {
  return page.locator("[data-meal-id]").evaluateAll((els) => els.map((el) => (el as HTMLElement).innerText));
}

/** The paragraphs of a refusal block, in order. */
async function lines(block: Locator): Promise<string[]> {
  return block.locator("p").allInnerTexts();
}

/** Retried until the dialog answers: a click before hydration is a no-op. */
async function apply(page: Page, buttonName: string, confirmName: string) {
  const dialog = page.getByRole("dialog");
  await expect(async () => {
    await page.getByRole("button", { name: buttonName }).click();
    await expect(dialog).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  await dialog.getByRole("button", { name: confirmName, exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

/** None of ruling 2.1's quota sentences, nor any part of one, is on the page. */
async function expectNoQuotaLine(page: Page) {
  for (const sentence of [Q1, Q2_LEAD, Q3]) await expect(page.getByText(sentence)).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("today's apply");
  await expect(page.locator("body")).not.toContainText("daily apply");
}

/** The weekday heading of the day card a block sits in (its parent is the card). */
async function cardWeekday(block: Locator): Promise<string | null> {
  return block.evaluate((el) =>
    el.parentElement?.querySelector("button[aria-label]")?.getAttribute("aria-label") ?? null
  );
}

test.describe("EV-071b — a refused week apply is a refusal, not an error", () => {
  test("P1: the block is above the week, the week is untouched, and there is no quota line", async ({
    page,
  }) => {
    await signIn(page);
    await fixtureCookie(page, "evoli_fixture_week", "no_safe_plan");
    await page.goto(`/clients/${LINA}/nutrition`);
    await expect(page.getByRole("button", { name: /^Regenerate day: / })).toHaveCount(7);
    const before = await weekText(page);
    expect(before).toHaveLength(28);

    await apply(page, "Apply to Lina M.", "Apply");

    const block = page.getByTestId("week-refusal");
    await expect(block).toBeVisible();
    expect(await lines(block)).toEqual([
      "We couldn't build a meal week for Lina.",
      RULED_OUT,
      "The week below is still Lina's current week — it hasn't been touched.",
      "You can't change Lina's food preferences from here. Ask them to review them in the app.",
    ]);
    await expect(page.getByText(APPLY_FAILED)).toHaveCount(0);
    // Ruling 2.2: the week stays rendered and interactive, identical item by item.
    await expect(page.getByRole("button", { name: /^Regenerate day: / })).toHaveCount(7);
    await expect(page.getByRole("button", { name: /^Regenerate day: / }).first()).toBeEnabled();
    expect(await weekText(page)).toEqual(before);
    // The block is above the week: before the first day card in document order.
    const above = await block.evaluate((el) => {
      const firstDay = document.querySelector('button[aria-label^="Regenerate day:"]');
      return !!firstDay && !!(el.compareDocumentPosition(firstDay) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(above, "the refusal renders above the week").toBe(true);
    // The api's developer sentence never reaches the screen.
    await expect(page.locator("body")).not.toContainText("satisfies this account's dietary rules");

    await expectNoQuotaLine(page);

    // A second refusal in the same page: still no quota line. Every refusal gives the
    // apply back on b-fit-api main, so "this has used today's apply" would be false.
    await apply(page, "Apply to Lina M.", "Apply");
    await expect(block).toBeVisible();
    expect(await lines(block)).toHaveLength(4);
    await expectNoQuotaLine(page);
    expect(await weekText(page)).toEqual(before);
  });

  test("P2: with no week, the block stands in for one", async ({ page }) => {
    await signIn(page);
    await fixtureCookie(page, "evoli_fixture_week", "no_safe_plan");
    await page.goto(`/clients/${NILS}/nutrition`);
    // The week card's own empty line (the page's empty state above says it too).
    const weekEmpty = page.locator("p").filter({ hasText: /^Set the targets, then apply a meal week\.$/ });
    await expect(weekEmpty).toHaveCount(1);

    await apply(page, "Apply to Nils K.", "Apply");

    const block = page.getByTestId("week-refusal");
    await expect(block).toBeVisible();
    expect(await lines(block)).toEqual([
      "We couldn't build a meal week for Nils.",
      RULED_OUT,
      "Nils has no meal week right now.",
      "You can't change Nils's food preferences from here. Ask them to review them in the app.",
    ]);
    await expect(page.getByText(APPLY_FAILED)).toHaveCount(0);
    await expect(weekEmpty).toHaveCount(0);
    await expectNoQuotaLine(page);
    await expect(page.getByRole("button", { name: /^Regenerate day: / })).toHaveCount(0);
  });
});

test.describe("EV-071b ruling 2.4 — a refused day says what was refused", () => {
  test("the block is in that day's card, verbatim, with no quota sentence and nothing replaced", async ({
    page,
  }) => {
    await signIn(page);
    await fixtureCookie(page, "evoli_fixture_regen", "no_safe_plan");
    await page.goto(`/clients/${LINA}/nutrition`);
    await expect(page.getByRole("button", { name: /^Regenerate day: / })).toHaveCount(7);
    const before = await weekText(page);

    await expect(async () => {
      await page.getByRole("button", { name: "Regenerate day: Wednesday" }).click();
      await expect(page.getByTestId("day-refusal")).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 20_000 });

    const block = page.getByTestId("day-refusal");
    await expect(block).toHaveCount(1);
    expect(await lines(block)).toEqual([
      "We couldn't rebuild Wednesday for Lina.",
      "Their recorded allergies and food rules rule out every recipe we're able to check for that day.",
      "Wednesday is unchanged — nothing was replaced.",
      "You can't change Lina's food preferences from here. Ask them to review them in the app.",
    ]);
    expect(await cardWeekday(block)).toBe("Regenerate day: Wednesday");
    // AC13: no sentence about applies, credits or quota.
    const text = (await block.innerText()).toLowerCase();
    expect(text).not.toContain("apply");
    expect(text).not.toContain("credit");
    await expect(page.getByText(REGEN_FAILED)).toHaveCount(0);
    await expect(page.getByTestId("week-refusal")).toHaveCount(0);
    // That day's meals and the other six are exactly as they were.
    expect(await weekText(page)).toEqual(before);

    // A regenerate that SUCCEEDS replaces the day, so the block no longer describes it.
    await fixtureCookie(page, "evoli_fixture_regen", "off");
    await page.getByRole("button", { name: "Regenerate day: Wednesday" }).click();
    await expect.poll(async () => (await weekText(page)).slice(8, 12)).not.toEqual(before.slice(8, 12));
    await expect(page.getByTestId("day-refusal")).toHaveCount(0);
  });

  test("a non-422 failure still reads the generic sentence", async ({ page }) => {
    await signIn(page);
    await fixtureCookie(page, "evoli_fixture_regen", "fail");
    await page.goto(`/clients/${LINA}/nutrition`);
    await expect(async () => {
      await page.getByRole("button", { name: "Regenerate day: Monday" }).click();
      await expect(page.getByText(REGEN_FAILED)).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 20_000 });
    await expect(page.getByTestId("day-refusal")).toHaveCount(0);
  });
});

test.describe("EV-242b — the day-regeneration cap is named", () => {
  test("the cap sentence, every Regenerate disabled, the event, and no time made up", async ({
    page,
  }) => {
    const events: string[] = [];
    page.on("console", (msg: ConsoleMessage) => {
      if (msg.text().includes("coach_day_regen_capped")) events.push(msg.text());
    });
    await signIn(page);
    await fixtureCookie(page, "evoli_fixture_regen", "capped");
    await page.goto(`/clients/${LINA}/nutrition`);
    const before = await weekText(page);

    await expect(async () => {
      await page.getByRole("button", { name: "Regenerate day: Monday" }).click();
      await expect(page.getByTestId("day-regen-capped")).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 20_000 });

    await expect(page.getByTestId("day-regen-capped")).toHaveText(
      "Today's day regenerations for Lina M. are used up."
    );
    await expect(page.getByText(REGEN_FAILED)).toHaveCount(0);
    const regenerate = page.getByRole("button", { name: /^Regenerate day: / });
    await expect(regenerate).toHaveCount(7);
    for (let i = 0; i < 7; i += 1) await expect(regenerate.nth(i)).toBeDisabled();
    // Swap is a different allowance and stays usable.
    await expect(page.getByRole("button", { name: /^Swap meal: / }).first()).toBeEnabled();
    // The api's message says "they reset tomorrow"; the portal reads the code only.
    await expect(page.locator("body")).not.toContainText("tomorrow");
    await expect(page.locator("body")).not.toContainText("meal-day regenerations");
    expect(await weekText(page)).toEqual(before);
    await expect.poll(() => events.length).toBe(1);
    expect(JSON.parse(events[0])).toEqual({ event: "coach_day_regen_capped" });
  });

  test("an Apply that succeeds lifts the cap: the line goes and every Regenerate is enabled", async ({
    page,
  }) => {
    // The coach apply writes the week with the trainee's regenDate null and regenCount 0
    // (b-fit-api WeeklyMealPlanService's week save), so after it the cap line is false.
    await signIn(page);
    await fixtureCookie(page, "evoli_fixture_regen", "capped");
    await page.goto(`/clients/${LINA}/nutrition`);
    await expect(async () => {
      await page.getByRole("button", { name: "Regenerate day: Monday" }).click();
      await expect(page.getByTestId("day-regen-capped")).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 20_000 });
    const regenerate = page.getByRole("button", { name: /^Regenerate day: / });
    for (let i = 0; i < 7; i += 1) await expect(regenerate.nth(i)).toBeDisabled();
    const before = await weekText(page);

    await apply(page, "Apply to Lina M.", "Apply");
    await expect.poll(() => weekText(page)).not.toEqual(before);

    await expect(page.getByTestId("day-regen-capped")).toHaveCount(0);
    await expect(regenerate).toHaveCount(7);
    for (let i = 0; i < 7; i += 1) await expect(regenerate.nth(i)).toBeEnabled();
  });
});

test.describe("French — both refusals and the cap, with the elisions", () => {
  test.use({ locale: "fr-FR" });

  test("a vowel-initial name elides, and the weekday is lower-cased mid-sentence", async ({
    page,
  }) => {
    await signInFrench(page);
    await fixtureCookie(page, "evoli_fixture_display_name", `${LINA}:${encodeURIComponent("Inès Roux")}`);
    await fixtureCookie(page, "evoli_fixture_week", "no_safe_plan");
    await fixtureCookie(page, "evoli_fixture_regen", "no_safe_plan");
    await page.goto(`/clients/${LINA}/nutrition`);
    await expect(page.getByRole("button", { name: /^Régénérer le jour/ })).toHaveCount(7);

    await apply(page, "Appliquer à Inès Roux", "Appliquer");
    const week = page.getByTestId("week-refusal");
    await expect(week).toBeVisible();
    expect(await lines(week)).toEqual([
      "Nous n'avons pas pu construire de semaine de repas pour Inès.",
      "Ses allergies et règles alimentaires enregistrées excluent toutes les recettes que nous pouvons vérifier. Rien n'a été modifié.",
      "La semaine ci-dessous reste la semaine en cours d'Inès — elle n'a pas été modifiée.",
      "Vous ne pouvez pas modifier les préférences alimentaires d'Inès ici. Demandez-lui de les vérifier dans l'app.",
    ]);
    await expect(page.getByText("La semaine de repas n'a pas pu être appliquée.")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("premier refus");

    await page.getByRole("button", { name: /^Régénérer le jour.*Mercredi$/ }).click();
    const day = page.getByTestId("day-refusal");
    await expect(day).toBeVisible();
    expect(await lines(day)).toEqual([
      "Nous n'avons pas pu reconstruire le mercredi pour Inès.",
      "Ses allergies et règles alimentaires enregistrées excluent toutes les recettes que nous pouvons vérifier pour ce jour.",
      "Le mercredi n'a pas changé — aucun repas n'a été remplacé.",
      "Vous ne pouvez pas modifier les préférences alimentaires d'Inès ici. Demandez-lui de les vérifier dans l'app.",
    ]);
    await expect(page.getByText("Le jour n'a pas pu être régénéré.")).toHaveCount(0);
  });

  test("the cap reads in French, with « d'Inès »", async ({ page }) => {
    await signInFrench(page);
    await fixtureCookie(page, "evoli_fixture_display_name", `${LINA}:${encodeURIComponent("Inès Roux")}`);
    await fixtureCookie(page, "evoli_fixture_regen", "capped");
    await page.goto(`/clients/${LINA}/nutrition`);
    await expect(async () => {
      await page.getByRole("button", { name: /^Régénérer le jour.*Lundi$/ }).click();
      await expect(page.getByTestId("day-regen-capped")).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 20_000 });
    await expect(page.getByTestId("day-regen-capped")).toHaveText(
      "Les régénérations de jour d'Inès sont épuisées pour aujourd'hui."
    );
  });

  test("the cap reads in French, and a consonant-initial name does not elide", async ({ page }) => {
    await signInFrench(page);
    await fixtureCookie(page, "evoli_fixture_regen", "capped");
    await fixtureCookie(page, "evoli_fixture_week", "no_safe_plan");
    await page.goto(`/clients/${LINA}/nutrition`);
    await expect(async () => {
      await page.getByRole("button", { name: /^Régénérer le jour.*Lundi$/ }).click();
      await expect(page.getByTestId("day-regen-capped")).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 20_000 });
    await expect(page.getByTestId("day-regen-capped")).toHaveText(
      "Les régénérations de jour de Lina sont épuisées pour aujourd'hui."
    );
    await expect(page.locator("body")).not.toContainText("demain");

    await apply(page, "Appliquer à Lina M.", "Appliquer");
    await expect(page.getByTestId("week-refusal").locator("p").nth(2)).toHaveText(
      "La semaine ci-dessous reste la semaine en cours de Lina — elle n'a pas été modifiée."
    );
  });
});

/*
 * ADR-0030 — b-fit-api (branch `fix/week-generation-in-progress-409`) answers the coach's
 * week apply 409 `WEEK_GENERATION_IN_PROGRESS` while the TRAINEE's own generation of that
 * week is still running. Nothing is written and the api releases the day's apply, so the
 * card says to try again later, in the warning tone, instead of "could not be applied".
 * Forced with `evoli_fixture_week=generating`, which carries the api's own body (code and
 * fixed message); the message must never reach the screen. A plain 500
 * (`evoli_fixture_week=fail`) still reads the generic sentence.
 */
const IN_PROGRESS_API_MESSAGE = "A meal plan is already being generated for this week.";
/** `--warn-ink` / `--err-ink` from globals.css, as the browser computes them. */
const WARN_INK = "rgb(154, 91, 5)";
const ERR_INK = "rgb(176, 28, 28)";

test.describe("ADR-0030 — an apply over a week still generating says to retry later", () => {
  test("the 409 reads the in-progress sentence as a warning, the week is untouched, and a retry clears it", async ({
    page,
  }) => {
    await signIn(page);
    await fixtureCookie(page, "evoli_fixture_week", "generating");
    await page.goto(`/clients/${LINA}/nutrition`);
    await expect(page.getByRole("button", { name: /^Regenerate day: / })).toHaveCount(7);
    const before = await weekText(page);

    await apply(page, "Apply to Lina M.", "Apply");

    const line = page.getByTestId("week-generating");
    await expect(line).toHaveText("Lina's meal week is still being prepared. Try again in a few minutes.");
    await expect(line).toHaveCSS("color", WARN_INK);
    await expect(page.getByText(APPLY_FAILED)).toHaveCount(0);
    await expect(page.getByTestId("week-refusal")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(IN_PROGRESS_API_MESSAGE);
    // The api releases the apply on this refusal: no sentence may say it was used.
    await expectNoQuotaLine(page);
    expect(await weekText(page)).toEqual(before);

    // Once the trainee's week is ready the retry succeeds, and the warning no longer holds.
    await fixtureCookie(page, "evoli_fixture_week", "off");
    await apply(page, "Apply to Lina M.", "Apply");
    await expect.poll(() => weekText(page)).not.toEqual(before);
    await expect(page.getByTestId("week-generating")).toHaveCount(0);
    await expect(page.getByText(APPLY_FAILED)).toHaveCount(0);
  });

  test("a plain 500 still reads « could not be applied », in the error tone", async ({ page }) => {
    await signIn(page);
    await fixtureCookie(page, "evoli_fixture_week", "fail");
    await page.goto(`/clients/${LINA}/nutrition`);
    await expect(page.getByRole("button", { name: /^Regenerate day: / })).toHaveCount(7);

    await apply(page, "Apply to Lina M.", "Apply");

    const failed = page.getByText(APPLY_FAILED, { exact: true });
    await expect(failed).toBeVisible();
    await expect(failed).toHaveCSS("color", ERR_INK);
    await expect(page.getByTestId("week-generating")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("still being prepared");
  });
});

test.describe("ADR-0030 — the in-progress sentence in French, with the elision", () => {
  test.use({ locale: "fr-FR" });

  test("a vowel-initial name elides: « d'Inès »", async ({ page }) => {
    await signInFrench(page);
    await fixtureCookie(page, "evoli_fixture_display_name", `${LINA}:${encodeURIComponent("Inès Roux")}`);
    await fixtureCookie(page, "evoli_fixture_week", "generating");
    await page.goto(`/clients/${LINA}/nutrition`);
    await expect(page.getByRole("button", { name: /^Régénérer le jour/ })).toHaveCount(7);

    await apply(page, "Appliquer à Inès Roux", "Appliquer");

    await expect(page.getByTestId("week-generating")).toHaveText(
      "La semaine de repas d'Inès est encore en préparation. Réessayez dans quelques minutes."
    );
    await expect(page.getByText("La semaine de repas n'a pas pu être appliquée.")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(IN_PROGRESS_API_MESSAGE);
  });

  test("a consonant-initial name does not elide: « de Lina »", async ({ page }) => {
    await signInFrench(page);
    await fixtureCookie(page, "evoli_fixture_week", "generating");
    await page.goto(`/clients/${LINA}/nutrition`);
    await expect(page.getByRole("button", { name: /^Régénérer le jour/ })).toHaveCount(7);

    await apply(page, "Appliquer à Lina M.", "Appliquer");

    await expect(page.getByTestId("week-generating")).toHaveText(
      "La semaine de repas de Lina est encore en préparation. Réessayez dans quelques minutes."
    );
    await expect(page.getByText("La semaine de repas n'a pas pu être appliquée.")).toHaveCount(0);
  });
});
