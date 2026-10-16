import { createHash } from "node:crypto";
import { expect, type Locator, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";
import { formatIntakeFinishedOn } from "../src/lib/format";

/**
 * EV-341c — the intake page's sections 5–8 and « Terminer l'entretien », in fixture mode with the
 * release hold ON (this suite sets `COACH_INTAKE_REQUEST=on`): C1, C2, C3, C3b, C4 and C5's page
 * half, in English and in French. C6 (the overview's summary card) is NOT built on this branch (see
 * the branch report), so C5's "opening « Vue d'ensemble » next shows the card's finished line" has
 * no card to read; what this spec pins of it is that the finish is stored (COMPLETE, the date kept)
 * and that the action revalidated (a reload, and a fresh read, show it). C8 is the live api's
 * (`qa/intake-token-expiry.live.spec.ts`).
 *
 * The subjects (`src/lib/coachApi.fixture.ts`), each granted through `POST /api/fixture/intake`:
 *   · Lina — every scope, no injury, a weight (70.4 kg yesterday), Peanuts / HALAL / Olives;
 *   · Dana — every scope, two injuries (the SHOULDER chip and a free-text sentence), no food fact;
 *   · Kaia — every scope and literally no data (no weight ever: C2's empty state);
 *   · Mara — an ACTIVE link that shares nothing (each block's own "not shared" sentence);
 *   · staff F1 on fb2374f, the MIXED scopes, so that each block is witnessed on its own scope and a
 *     block gated on the wrong one fails: Pablo (WORKOUTS + WEIGH_INS), Sara (PROGRESS + WEIGH_INS:
 *     weigh-ins without workouts) and Petra (NUTRITION only).
 *
 * The expected sentences are LITERALS from the story, never read from `src/lib/copy.ts`. French is
 * compared with no-break spaces read as spaces.
 */

const ID = {
  lina: "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001",
  dana: "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0004",
  mara: "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0008",
  kaia: "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0010",
  sara: "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0003",
  petra: "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0006",
  pablo: "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0021",
} as const;
type Who = keyof typeof ID;

const T = {
  en: {
    locale: "en-US",
    sections: [
      "Goals and motivation",
      "Training history",
      "Availability and equipment",
      "Lifestyle",
      "Health",
      "Measurements and assessment",
      "Nutrition",
      "Coach's notes",
    ],
    fromProfile: "From the trainee's profile — you cannot change these here.",
    injuries: "Injuries",
    noInjuries: "No injuries recorded.",
    trainingNotShared: (n: string) => `${n} doesn't share their training.`,
    noMeasurements: "No measurements yet.",
    measurementsNotShared: (n: string) => `${n} doesn't share their measurements.`,
    weight: /^Weight: 70\.4 kg · \d{1,2} [A-Z][a-z]{2,3} \d{4}$/,
    nutritionNotShared: (n: string) => `${n} doesn't share their nutrition.`,
    allergies: "Allergies",
    rules: "Dietary rules",
    dislikes: "Dislikes",
    lina: { allergies: ["Peanuts"], rules: ["Halal"], dislikes: ["Olives"] },
    dana: ["Shoulders", "Sharp pain in the left shoulder on anything overhead"],
    foodRules: (n: string) => `Food rules (halal, kosher…) are entered by ${n} in the app, not here.`,
    fields: {
      usualMealsPerDay: "Meals per day",
      snacking: "Snacking",
      cooking: "Home cooking",
      mealsOutPerWeek: "Meals out per week",
      alcoholPerWeek: "Alcohol per week",
      waterPerDay: "Water per day",
    },
    often: "Often",
    rarely: "Rarely",
    drinks: "1 to 3 drinks",
    water: "1 to 2 L",
    notes: "Notes",
    counter: (n: string) => `${n} / 4,000`,
    tooLong: "Too long: 4,000 characters at most.",
    finish: "Finish the intake",
    finishedOn: (d: string) => `Intake finished on ${d}`,
    finishFailed: "The intake could not be finished. Try again.",
    saved: "Saved",
    sessionEnded: "Your session has expired. Sign in again in a new tab: your answers are still on this page.",
    denied: "This trainee is not on your roster. They may have revoked access.",
    tabs: { overview: "Overview" },
  },
  fr: {
    locale: "fr-FR",
    sections: [
      "Objectifs et motivation",
      "Historique sportif",
      "Disponibilités et matériel",
      "Mode de vie",
      "Santé",
      "Mensurations et bilan",
      "Alimentation",
      "Notes du coach",
    ],
    fromProfile: "Issu du profil du client — vous ne pouvez pas le modifier ici.",
    injuries: "Blessures",
    noInjuries: "Aucune blessure indiquée.",
    trainingNotShared: (n: string) => `${n} ne partage pas son programme.`,
    noMeasurements: "Aucune mesure pour l'instant.",
    measurementsNotShared: (n: string) => `${n} ne partage pas ses mesures.`,
    weight: /^Poids : 70,4 kg · \d{1,2}(er)? [a-zéû]{3,5}\.? \d{4}$/,
    nutritionNotShared: (n: string) => `${n} ne partage pas son alimentation.`,
    allergies: "Allergies",
    rules: "Règles alimentaires",
    dislikes: "Aversions",
    lina: { allergies: ["Arachides"], rules: ["Halal"], dislikes: ["Olives"] },
    dana: ["Épaules", "Sharp pain in the left shoulder on anything overhead"],
    foodRules: (n: string) => `Les règles alimentaires (halal, casher…) sont saisies par ${n} dans l'app, pas ici.`,
    fields: {
      usualMealsPerDay: "Repas par jour",
      snacking: "Grignotage",
      cooking: "Cuisine maison",
      mealsOutPerWeek: "Repas à l'extérieur par semaine",
      alcoholPerWeek: "Alcool par semaine",
      waterPerDay: "Eau par jour",
    },
    often: "Souvent",
    rarely: "Rarement",
    drinks: "1 à 3 verres",
    water: "1 à 2 L",
    notes: "Notes",
    counter: (n: string) => `${n} / 4 000`,
    tooLong: "Trop long : 4 000 caractères au maximum.",
    finish: "Terminer l'entretien",
    finishedOn: (d: string) => `Entretien terminé le ${d}`,
    finishFailed: "L'entretien n'a pas pu être terminé. Réessayez.",
    saved: "Enregistré",
    sessionEnded: "Votre session a expiré. Reconnectez-vous dans un nouvel onglet : vos réponses restent sur cette page.",
    denied: "Ce client ne fait pas partie de votre liste. Il a peut-être révoqué l'accès.",
    tabs: { overview: "Vue d'ensemble" },
  },
} as const;

const plain = (text: string | null) => (text ?? "").replace(/[  ]/g, " ");

type IntakePut = { clientId: string; section: string; body: { version: number; values: Record<string, unknown> }; at: number };

async function puts(page: Page, who: Who, section?: string): Promise<IntakePut[]> {
  const res = await page.request.get("/api/fixture/calls", { maxRedirects: 0 });
  expect(res.status(), "GET /api/fixture/calls (fixture mode only)").toBe(200);
  const all = ((await res.json()) as { intakePuts: IntakePut[] }).intakePuts;
  return all.filter((p) => p.clientId === ID[who] && (!section || p.section === section));
}

/** The fixture's api journal (`src/lib/fixtureApiJournal.ts`): every `CoachApi` call about `who`, by method. */
async function apiOps(page: Page, who: Who): Promise<string[]> {
  const res = await page.request.get("/api/fixture/calls", { maxRedirects: 0 });
  expect(res.status(), "GET /api/fixture/calls (fixture mode only)").toBe(200);
  const api = ((await res.json()) as { api: { op: string; arg: string | null }[] }).api;
  return api.filter((e) => e.arg === ID[who]).map((e) => e.op);
}

async function grant(page: Page, who: Who): Promise<void> {
  const res = await page.request.post("/api/fixture/intake", { data: { clientId: ID[who], answer: "grant" }, maxRedirects: 0 });
  expect(res.status(), `${who}'s grant`).toBe(200);
}

/** The page's account header (`src/lib/sessionSubject.ts`), from the context's own access cookie. */
async function subjectHeader(page: Page): Promise<Record<string, string>> {
  const token = (await page.context().cookies()).find((c) => c.name === "evoli_pro_at")?.value ?? "";
  const sub = (JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8") || "{}") as { sub?: string }).sub ?? "";
  return { "x-evoli-session-subject": createHash("sha256").update(`evoli-session-subject:${sub}`).digest("hex").slice(0, 32) };
}

/** Today's date as the page prints the finish (UTC, `formatIntakeFinishedOn`): the fixture stamps `completedAt` now. */
const today = (lang: "en" | "fr") => formatIntakeFinishedOn(new Date().toISOString(), lang);

async function openIntake(page: Page, who: Who, ready: "ready" | "disabled" = "ready") {
  await page.goto(`/clients/${ID[who]}/intake`);
  await expect(page.locator("[data-nav-progress-ready]"), "the page hydrated").toHaveCount(1);
  await expect(page.locator(`[data-intake-ready="${ready}"]`)).toHaveCount(1);
}

function panel(page: Page, section: string): Locator {
  return page.locator(`[data-intake-panel="${section}"]`);
}

async function show(page: Page, section: string): Promise<Locator> {
  await page.locator(`[data-intake-section="${section}"]`).click();
  await expect(panel(page, section)).toBeVisible();
  return panel(page, section);
}

function readOnly(page: Page, section: string): Locator {
  return panel(page, section).locator(`[data-intake-readonly="${section}"]`);
}

async function expectSaved(page: Page, saved: string) {
  await expect.poll(async () => plain(await page.locator("[data-intake-status]").textContent()), { timeout: 10_000 }).toBe(saved);
  await page.waitForFunction(() => window.history.state?.evoliUnsavedGuard !== true);
}

for (const lang of ["en", "fr"] as const) {
  const t = T[lang];
  const signIn = (page: Page) => signInThroughForm(page, { lang });

  test.describe(`EV-341c sections 5–8 (${lang.toUpperCase()})`, () => {
    test.use({ locale: t.locale });

    test("the section list holds the eight sections, in the catalogue's order and words", async ({ page }) => {
      await signIn(page);
      await grant(page, "lina");
      await openIntake(page, "lina");
      await expect(page.getByRole("tablist").locator(".intake-section-name")).toHaveText([...t.sections]);
      // 390 px: the <select> lists the same eight.
      await page.setViewportSize({ width: 390, height: 844 });
      const options = page.getByRole("combobox", { name: "Section", exact: true }).locator("option");
      await expect(options).toHaveCount(8);
      for (const [i, title] of t.sections.entries()) expect(plain(await options.nth(i).textContent())).toContain(title);
    });

    test("C1: section 5 shows the stored injuries read-only with « fromProfile », or « No injuries recorded. »", async ({ page }) => {
      await signIn(page);
      await grant(page, "dana");
      await openIntake(page, "dana");
      await show(page, "HEALTH");
      const block = readOnly(page, "HEALTH");
      await expect(block.locator(`[data-profile-group="${t.injuries}"] [data-profile-values] > *`)).toHaveText([...t.dana]);
      await expect(block).toContainText(t.fromProfile);
      // Text only: nothing in the block can change an injury (Ruling 1).
      await expect(block.locator("input, textarea, select, button")).toHaveCount(0);
      // The note is under the block.
      const box = await block.boundingBox();
      const note = await panel(page, "HEALTH").getByRole("textbox", { name: t.notes, exact: true }).boundingBox();
      expect(note!.y).toBeGreaterThan(box!.y);

      await grant(page, "lina");
      await openIntake(page, "lina");
      await show(page, "HEALTH");
      await expect(readOnly(page, "HEALTH").locator(`[data-profile-group="${t.injuries}"]`)).toContainText(t.noInjuries);
      await expect(readOnly(page, "HEALTH")).toContainText(t.fromProfile);
    });

    test("C1 / C2 / C3: without the scope, each block says so in its own sentence (Mara shares nothing)", async ({ page }) => {
      await signIn(page);
      await grant(page, "mara");
      await openIntake(page, "mara");
      await show(page, "HEALTH");
      expect(plain(await readOnly(page, "HEALTH").textContent())).toBe(t.trainingNotShared("Mara"));
      await show(page, "MEASUREMENTS");
      expect(plain(await readOnly(page, "MEASUREMENTS").textContent())).toBe(t.measurementsNotShared("Mara"));
      await show(page, "NUTRITION");
      expect(plain(await readOnly(page, "NUTRITION").textContent())).toBe(t.nutritionNotShared("Mara"));
      // The notes still save: a block that is not shared costs that block only.
      await panel(page, "NUTRITION").getByRole("textbox", { name: t.notes, exact: true }).fill("Eats late");
      await expectSaved(page, t.saved);
      expect((await puts(page, "mara", "NUTRITION")).at(-1)?.body.values.notes).toBe("Eats late");
    });

    test("C1 / C2 / C3 (staff F1): each block reads its OWN scope — mixed-scope links, and no nutrition read without NUTRITION", async ({
      page,
    }) => {
      // Pablo: WORKOUTS + WEIGH_INS, no NUTRITION. Training and measurements are drawn; food is the sentence.
      await signIn(page);
      await grant(page, "pablo");
      await openIntake(page, "pablo");
      await show(page, "HEALTH");
      await expect(readOnly(page, "HEALTH").locator(`[data-profile-group="${t.injuries}"]`)).toContainText(t.noInjuries);
      await expect(readOnly(page, "HEALTH")).toContainText(t.fromProfile);
      await show(page, "MEASUREMENTS");
      expect(plain(await readOnly(page, "MEASUREMENTS").textContent())).toBe(t.noMeasurements);
      await show(page, "NUTRITION");
      expect(plain(await readOnly(page, "NUTRITION").textContent())).toBe(t.nutritionNotShared("Pablo"));
      // ADR-0015 D5: withheld data is never asked for — no `GET …/nutrition` for Pablo at all.
      const pablo = await apiOps(page, "pablo");
      expect(pablo, "the routine read (WORKOUTS) was made").toContain("getRoutine");
      expect(pablo, "no nutrition read without NUTRITION").not.toContain("getNutrition");

      // Sara: WEIGH_INS without WORKOUTS. Measurements are drawn; training and food are sentences.
      await grant(page, "sara");
      await openIntake(page, "sara");
      await show(page, "HEALTH");
      expect(plain(await readOnly(page, "HEALTH").textContent())).toBe(t.trainingNotShared("Sara"));
      await show(page, "MEASUREMENTS");
      expect(plain(await readOnly(page, "MEASUREMENTS").textContent())).toBe(t.noMeasurements);
      await show(page, "NUTRITION");
      expect(plain(await readOnly(page, "NUTRITION").textContent())).toBe(t.nutritionNotShared("Sara"));
      const sara = await apiOps(page, "sara");
      expect(sara, "no routine read without WORKOUTS").not.toContain("getRoutine");
      expect(sara, "no nutrition read without NUTRITION").not.toContain("getNutrition");

      // Petra: NUTRITION only. Food is drawn; training and measurements are sentences.
      await grant(page, "petra");
      await openIntake(page, "petra");
      await show(page, "HEALTH");
      expect(plain(await readOnly(page, "HEALTH").textContent())).toBe(t.trainingNotShared("Petra"));
      await show(page, "MEASUREMENTS");
      expect(plain(await readOnly(page, "MEASUREMENTS").textContent())).toBe(t.measurementsNotShared("Petra"));
      await show(page, "NUTRITION");
      await expect(readOnly(page, "NUTRITION")).toContainText(t.fromProfile);
      await expect(readOnly(page, "NUTRITION").locator("[data-intake-readonly-state]")).toHaveCount(0);
      const petra = await apiOps(page, "petra");
      expect(petra, "the nutrition read (NUTRITION) was made: the journal sees it").toContain("getNutrition");
      expect(petra, "no routine read without WORKOUTS").not.toContain("getRoutine");
    });

    test("C2: section 6 shows the latest weight and its date, or « No measurements yet. »", async ({ page }) => {
      await signIn(page);
      await grant(page, "lina");
      await openIntake(page, "lina");
      await show(page, "MEASUREMENTS");
      expect(plain(await readOnly(page, "MEASUREMENTS").locator("[data-intake-weight]").textContent())).toMatch(t.weight);

      await grant(page, "kaia");
      await openIntake(page, "kaia");
      await show(page, "MEASUREMENTS");
      expect(plain(await readOnly(page, "MEASUREMENTS").textContent())).toBe(t.noMeasurements);
    });

    test("C3: section 7's fields save the whole section; the food facts are read-only with EV-185 AC1's sentence", async ({ page }) => {
      await signIn(page);
      await grant(page, "lina");
      await openIntake(page, "lina");
      const nut = await show(page, "NUTRITION");
      const block = readOnly(page, "NUTRITION");
      await expect(block.locator(`[data-profile-group="${t.allergies}"] [data-profile-values] > *`)).toHaveText([...t.lina.allergies]);
      await expect(block.locator(`[data-profile-group="${t.rules}"] [data-profile-values] > *`)).toHaveText([...t.lina.rules]);
      await expect(block.locator(`[data-profile-group="${t.dislikes}"] [data-profile-values] > *`)).toHaveText([...t.lina.dislikes]);
      await expect(block).toContainText(t.fromProfile);
      await expect(block.locator("input, textarea, select, button")).toHaveCount(0);

      await nut.getByRole("textbox", { name: t.fields.usualMealsPerDay, exact: true }).fill("3");
      await nut.getByRole("group", { name: t.fields.snacking, exact: true }).getByRole("radio", { name: t.often, exact: true }).check();
      await nut.getByRole("group", { name: t.fields.cooking, exact: true }).getByRole("radio", { name: t.rarely, exact: true }).check();
      await nut.getByRole("textbox", { name: t.fields.mealsOutPerWeek, exact: true }).fill("2");
      await nut.getByRole("group", { name: t.fields.alcoholPerWeek, exact: true }).getByRole("radio", { name: t.drinks, exact: true }).check();
      await nut.getByRole("group", { name: t.fields.waterPerDay, exact: true }).getByRole("radio", { name: t.water, exact: true }).check();
      await expectSaved(page, t.saved);
      expect((await puts(page, "lina", "NUTRITION")).at(-1)?.body.values).toEqual({
        usualMealsPerDay: 3,
        snacking: "OFTEN",
        cooking: "RARELY",
        mealsOutPerWeek: 2,
        alcoholPerWeek: "D1_3",
        waterPerDay: "L1_2",
        notes: null,
      });
      // Resume: the stored answers come back on a reload.
      await openIntake(page, "lina");
      await show(page, "NUTRITION");
      await expect(panel(page, "NUTRITION").getByRole("textbox", { name: t.fields.usualMealsPerDay, exact: true })).toHaveValue("3");
      await expect(
        panel(page, "NUTRITION").getByRole("group", { name: t.fields.waterPerDay, exact: true }).getByRole("radio", { name: t.water, exact: true })
      ).toBeChecked();
    });

    test("C3: meals per day outside 1–6 is not sent", async ({ page }) => {
      await signIn(page);
      await grant(page, "lina");
      await openIntake(page, "lina");
      const nut = await show(page, "NUTRITION");
      await nut.getByRole("textbox", { name: t.fields.usualMealsPerDay, exact: true }).fill("7");
      await nut.getByRole("textbox", { name: t.fields.usualMealsPerDay, exact: true }).blur();
      await expect(nut.locator('[data-intake-error="usualMealsPerDay"]')).toBeVisible();
      await page.waitForTimeout(2_500);
      expect(await puts(page, "lina", "NUTRITION")).toHaveLength(0);
    });

    test("C3b: under section 7's note, the food-rules helper, wired to the note", async ({ page }) => {
      await signIn(page);
      await grant(page, "lina");
      await openIntake(page, "lina");
      const nut = await show(page, "NUTRITION");
      const helper = nut.locator('[data-intake-helper="foodRules"]');
      expect(plain(await helper.textContent())).toBe(t.foodRules("Lina"));
      const note = nut.getByRole("textbox", { name: t.notes, exact: true });
      const id = await helper.getAttribute("id");
      expect((await note.getAttribute("aria-describedby"))?.split(" ")).toContain(id);
      expect((await helper.boundingBox())!.y).toBeGreaterThan((await note.boundingBox())!.y);
      // Only section 7 has it.
      await expect(page.locator('[data-intake-helper="foodRules"]')).toHaveCount(1);
    });

    test("C4: section 8 is one textarea, a live « {n} / 4 000 » counter in code points, no maxLength; 4,000 Arabic + emoji saves", async ({
      page,
    }) => {
      await signIn(page);
      await grant(page, "lina");
      await openIntake(page, "lina");
      const notes = await show(page, "COACH_NOTES");
      await expect(notes.getByRole("textbox")).toHaveCount(1);
      const area = notes.getByRole("textbox", { name: t.notes, exact: true });
      await expect(area).not.toHaveAttribute("maxlength", /.*/);
      const counter = notes.locator(".intake-counter");
      expect(plain(await counter.textContent())).toBe(t.counter("0"));

      // The story's edge case: a 4,000-code-point note in Arabic (with emoji, 2 UTF-16 units each).
      const full = "ب".repeat(2000) + "\u{1F600}".repeat(2000);
      await area.fill(full);
      expect(plain(await counter.textContent())).toBe(t.counter(lang === "fr" ? "4 000" : "4,000"));
      await expect(notes.locator('[data-intake-error="notes"]')).toHaveCount(0);
      await expectSaved(page, t.saved);
      expect((await puts(page, "lina", "COACH_NOTES")).at(-1)?.body.values).toEqual({ notes: full });
    });

    test("C4: at 4,001 the counter and B16's sentence show in the error style and no save is sent", async ({ page }) => {
      await signIn(page);
      await grant(page, "lina");
      await openIntake(page, "lina");
      const notes = await show(page, "COACH_NOTES");
      const area = notes.getByRole("textbox", { name: t.notes, exact: true });
      await area.fill("\u{1F600}".repeat(4001));
      const error = notes.locator('[data-intake-error="notes"]');
      expect(plain(await error.textContent())).toBe(t.tooLong);
      await expect(notes.locator(".intake-counter")).toHaveAttribute("data-over", "true");
      expect(plain(await notes.locator(".intake-counter").textContent())).toBe(t.counter(lang === "fr" ? "4 001" : "4,001"));
      await expect(area).toHaveAttribute("aria-invalid", "true");
      await area.blur();
      await page.waitForTimeout(2_500);
      expect(await puts(page, "lina", "COACH_NOTES"), "no save while over 4,000").toHaveLength(0);
      // Back to 4,000: it saves.
      await area.press("End");
      await area.press("Backspace");
      await expectSaved(page, t.saved);
      expect(Array.from(String((await puts(page, "lina", "COACH_NOTES")).at(-1)?.body.values.notes)).length).toBe(4000);
    });

    test("C5: « Finish the intake » sets COMPLETE; the page shows « Intake finished on {date} »; sections stay editable", async ({
      page,
    }) => {
      await signIn(page);
      await grant(page, "lina");
      await openIntake(page, "lina");
      await expect(page.locator('[data-intake-finish="todo"]')).toHaveCount(1);
      const finish = page.getByRole("button", { name: t.finish, exact: true });
      await finish.click();
      const line = page.locator("[data-intake-finished]");
      await expect(line).toBeVisible();
      expect(plain(await line.textContent())).toBe(plain(t.finishedOn(today(lang))));
      await expect(finish).toHaveCount(0);
      // The pressed button is gone: the focus is on the line that replaced it, not lost to <body>.
      await expect(line).toBeFocused();

      // The sections stay editable, and a later save keeps the interview finished (EV-341a AC9).
      const note = (await show(page, "HEALTH")).getByRole("textbox", { name: t.notes, exact: true });
      await expect(note).toBeEditable();
      await note.fill("Knee fine after the finish");
      await expectSaved(page, t.saved);
      expect((await puts(page, "lina", "HEALTH")).at(-1)?.body.values).toEqual({ notes: "Knee fine after the finish" });

      // A load of the finished interview shows the line, from the api's read (`completedAt`), and no button.
      await openIntake(page, "lina");
      expect(plain(await page.locator("[data-intake-finished]").textContent())).toBe(plain(t.finishedOn(today(lang))));
      await expect(page.getByRole("button", { name: t.finish, exact: true })).toHaveCount(0);
    });

    test("C5: the finish is a server action (one Next-Action POST), never a section PUT; the overview opened next is rendered fresh", async ({
      page,
    }) => {
      await signIn(page);
      await grant(page, "lina");
      await openIntake(page, "lina");
      const posts: string[] = [];
      page.on("request", (r) => {
        if (r.method() === "POST" && r.headers()["next-action"]) posts.push(new URL(r.url()).pathname);
      });
      await page.getByRole("button", { name: t.finish, exact: true }).click();
      await expect(page.locator("[data-intake-finished]")).toBeVisible();
      expect(posts).toEqual([`/clients/${ID.lina}/intake`]);
      expect(await puts(page, "lina")).toHaveLength(0);
      // « Vue d'ensemble » next, client-side, renders (the router cache was dropped by the revalidation).
      await page.getByRole("main").getByRole("link", { name: t.tabs.overview, exact: true }).click();
      await expect(page).toHaveURL(`/clients/${ID.lina}`);
      await expect(page.locator("h1")).toHaveText("Lina M.");
    });

    test("C5: a failed finish says so, keeps the button, and changes nothing", async ({ page, context }) => {
      await signIn(page);
      await grant(page, "lina");
      await openIntake(page, "lina");
      await context.addCookies([{ name: "evoli_fixture_intake_complete", value: "fail", url: new URL("/", page.url()).href }]);
      await page.getByRole("button", { name: t.finish, exact: true }).click();
      const alert = page.locator("[data-intake-finish-failed]");
      await expect(alert).toBeVisible();
      expect(plain(await alert.textContent())).toBe(t.finishFailed);
      await expect(alert).toHaveAttribute("role", "alert");
      await expect(page.getByRole("button", { name: t.finish, exact: true })).toBeEnabled();
      await expect(page.locator("[data-intake-finished]")).toHaveCount(0);
      // Nothing was stored: a reload still offers the button.
      await openIntake(page, "lina");
      await expect(page.locator('[data-intake-finish="todo"]')).toHaveCount(1);
    });

    test("C5b: the failure sentence clears on a successful retry", async ({ page, context }) => {
      await signIn(page);
      await grant(page, "lina");
      await openIntake(page, "lina");
      await context.addCookies([{ name: "evoli_fixture_intake_complete", value: "fail", url: new URL("/", page.url()).href }]);
      const finish = page.getByRole("button", { name: t.finish, exact: true });
      await finish.click();
      await expect(page.locator("[data-intake-finish-failed]")).toBeVisible();
      // The api recovers; the same button, pressed again, finishes and the sentence is gone.
      const kept = (await context.cookies()).filter((c) => c.name !== "evoli_fixture_intake_complete");
      await context.clearCookies();
      await context.addCookies(kept);
      await finish.click();
      await expect(page.locator("[data-intake-finished]")).toBeVisible();
      expect(plain(await page.locator("[data-intake-finished]").textContent())).toBe(plain(t.finishedOn(today(lang))));
      await expect(page.locator("[data-intake-finish-failed]")).toHaveCount(0);
    });

    test("C5b: a 403 on « Finish » is the access-ended path (the denied page), never the failure sentence", async ({ page, context }) => {
      await signIn(page);
      await grant(page, "lina");
      await openIntake(page, "lina");
      // Any appearance of the failure sentence, at any moment until the denied page, is recorded.
      await page.evaluate(() => {
        new MutationObserver(() => {
          if (document.querySelector("[data-intake-finish-failed]")) sessionStorage.setItem("finishFailedShown", "1");
        }).observe(document.body, { childList: true, subtree: true });
      });
      await context.addCookies([{ name: "evoli_fixture_link", value: "ended", url: new URL("/", page.url()).href }]);
      await page.getByRole("button", { name: t.finish, exact: true }).click();
      await page.waitForURL("/clients/denied", { timeout: 15_000 });
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(t.denied);
      expect(await page.evaluate(() => sessionStorage.getItem("finishFailedShown")), "the failure sentence never appeared").toBeNull();
      // Nothing was stored: the fixture's link still has no finish (read with the link restored).
      const kept = (await context.cookies()).filter((c) => c.name !== "evoli_fixture_link");
      await context.clearCookies();
      await context.addCookies(kept);
      await openIntake(page, "lina");
      await expect(page.locator('[data-intake-finish="todo"]')).toHaveCount(1);
    });

    test("C5: before the grant « Finish » is disabled, wired to B11's sentence", async ({ page }) => {
      await signIn(page);
      await openIntake(page, "lina", "disabled");
      const finish = page.getByRole("button", { name: t.finish, exact: true });
      await expect(finish).toBeDisabled();
      expect(await finish.getAttribute("aria-describedby")).toBe("intake-grant-missing");
    });
  });
}

test.describe("EV-341c staff N1: « Finish » while signed out is B15's session state, never « Try again »", () => {
  const t = T.en;
  /** The session ends (signed out in another tab): every cookie but the session epoch is gone (B15's own setup). */
  async function endSession(page: Page) {
    const epoch = (await page.context().cookies()).filter((c) => c.name === "evoli_pro_epoch");
    await page.context().clearCookies();
    await page.context().addCookies(epoch);
  }

  test("pressed after the session ended: the session sentence (role=alert), no failure sentence, no finish, and the button waits", async ({
    page,
  }) => {
    await signInThroughForm(page, { lang: "en" });
    await grant(page, "lina");
    await openIntake(page, "lina");
    await endSession(page);
    const finish = page.getByRole("button", { name: t.finish, exact: true });
    await finish.click();
    const alert = page.locator('[data-intake-alert="signedOut"]');
    await expect(alert).toBeVisible();
    await expect(alert).toHaveAttribute("role", "alert");
    expect(plain(await alert.locator("p").textContent())).toBe(t.sessionEnded);
    await expect(page.locator("[data-intake-finish-failed]")).toHaveCount(0);
    await expect(page.locator("[data-intake-finished]")).toHaveCount(0);
    await expect(finish).toBeDisabled();
    // The disabled button names why: the session sentence.
    const describedBy = await finish.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(plain(await page.locator(`[id="${describedBy}"]`).textContent())).toBe(t.sessionEnded);
  });

  test("a save that already found the session ended disables « Finish » before any press", async ({ page }) => {
    await signInThroughForm(page, { lang: "en" });
    await grant(page, "lina");
    await openIntake(page, "lina");
    await endSession(page);
    const note = (await show(page, "HEALTH")).getByRole("textbox", { name: t.notes, exact: true });
    await note.fill("Typed after the session ended");
    await note.press("Tab");
    await expect(page.locator('[data-intake-alert="signedOut"]')).toBeVisible();
    await expect(page.getByRole("button", { name: t.finish, exact: true })).toBeDisabled();
    await expect(page.locator("[data-intake-finish-failed]")).toHaveCount(0);
  });
});

test.describe("EV-341c the route handler saves sections 5–8 (and still refuses a section that does not exist)", () => {
  test("PUT HEALTH, MEASUREMENTS, NUTRITION and COACH_NOTES answer 200; an unknown section is 400 before any api call", async ({ page }) => {
    await signInThroughForm(page, { lang: "en" });
    await grant(page, "lina");
    const headers = { "Content-Type": "application/json", ...(await subjectHeader(page)) };
    for (const section of ["HEALTH", "MEASUREMENTS", "NUTRITION", "COACH_NOTES"]) {
      const res = await page.request.put(`/api/clients/${ID.lina}/intake/${section}`, { data: { version: 0, values: { notes: "n" } }, headers });
      expect(res.status(), section).toBe(200);
    }
    const before = (await puts(page, "lina")).length;
    for (const section of ["TRIAL", "health", "COACH-NOTES"]) {
      const res = await page.request.put(`/api/clients/${ID.lina}/intake/${section}`, { data: { version: 0, values: { notes: "n" } }, headers });
      expect(res.status(), section).toBe(400);
      expect(await res.json()).toEqual({ code: "INVALID_REQUEST", field: "section" });
    }
    expect((await puts(page, "lina")).length, "no request reached the backend").toBe(before);
  });
});
