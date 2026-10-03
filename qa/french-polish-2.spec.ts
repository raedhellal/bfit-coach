import { expect, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";
import { signInFrench } from "./french";
import { en } from "../src/lib/copy";
import { fr } from "../src/lib/copy.fr";
import { formatDate, formatDayLabel, formatInstant, formatShortDate } from "../src/lib/format";
import { buildProgressGoalRequest, seedFormState } from "../src/lib/progressGoal";
import { forSave, fromRecipe, readQuantity } from "../src/lib/recipeDocument";
import { equipmentLabel, muscleLabel, musclesLabel } from "../src/lib/catalogLabels";
import type { CoachRecipe, TraineeProgressGoal } from "../src/lib/coachApi";

/**
 * The French portal's second polish pass before the 2026-10-03 demo (`fix/portal-french-polish-2`).
 *
 *   BUG-461 — the roster phone card's "Dernière séance: …" (in `coach-french-roster.spec.ts`:
 *             it needs the populated roster).
 *   BUG-462 — editor aria-labels "Monter: …" → "Monter : …" (U+00A0 before the colon).
 *   BUG-464 — the weight milestone field pre-filled "70.4" on a French page → "70,4".
 *   BUG-465 / BUG-571 — a stored recipe quantity pre-filled "150.5" / "1000.5" → "150,5" / "1 000,5".
 *   BUG-572 — the quantity range sentence's "5000" → "5 000" (U+202F).
 *   BUG-491 — a French date on the 1st: "1 oct." → "1er oct.".
 *   BUG-210 — every English September date read "Sept" → "Sep".
 *   BUG-489 — the catalogue picker printed raw api values ("t_spine", "NONE", "quads,glutes").
 *
 * Sentences on screen are LITERALS. Every pre-filled number is also read BACK through the
 * field's own reader, because a pre-fill that the field then refuses, or reads as another
 * number, would turn a cosmetic fix into a lost value.
 */

const NBSP = String.fromCharCode(0xa0);
const NNBSP = String.fromCharCode(0x202f);

const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
const CHICKEN_RICE_BOWL = "8e3f1b22-0000-4000-8000-0000000000c1";

/* ── BUG-491 / BUG-210: dates ─────────────────────────────────────────────────── */

test.describe("BUG-491 — the first of the month is « 1er » in a French date", () => {
  test("every French date formatter writes 1er on the 1st, and only on the 1st", () => {
    expect(formatDate("2026-10-01", "fr")).toBe("1er oct. 2026");
    expect(formatInstant("2026-10-01T09:30:00Z", "fr")).toBe("1er oct. 2026");
    expect(formatShortDate("2026-10-01", "fr")).toBe("1er oct.");
    // The bug's own line: the day strip's label for a challenge day on 1 October.
    expect(formatDayLabel("2026-10-01", "fr")).toBe("jeu. 1er oct.");
    // 11, 21 and 31 end in a 1 and are cardinals.
    expect(formatDate("2026-10-11", "fr")).toBe("11 oct. 2026");
    expect(formatDate("2026-10-21", "fr")).toBe("21 oct. 2026");
    expect(formatDate("2026-10-31", "fr")).toBe("31 oct. 2026");
    expect(formatDate("2026-10-02", "fr")).toBe("2 oct. 2026");
  });

  test("English keeps the cardinal", () => {
    expect(formatDate("2026-10-01", "en")).toBe("1 Oct 2026");
    expect(formatDayLabel("2026-10-01", "en")).toBe("Thu 1 Oct");
  });
});

test.describe("BUG-210 — September is « Sep » in English, like the eleven other months", () => {
  test("every English date formatter writes Sep", () => {
    expect(formatDate("2026-09-15", "en")).toBe("15 Sep 2026");
    expect(formatInstant("2026-09-15T08:00:00Z", "en")).toBe("15 Sep 2026");
    expect(formatShortDate("2026-09-15", "en")).toBe("15 Sep");
    expect(formatDayLabel("2026-09-29", "en")).toBe("Tue 29 Sep");
  });

  test("all twelve English months are three letters", () => {
    const months = Array.from({ length: 12 }, (_, i) => formatShortDate(`2026-${String(i + 1).padStart(2, "0")}-15`, "en"));
    expect(months).toEqual([
      "15 Jan", "15 Feb", "15 Mar", "15 Apr", "15 May", "15 Jun",
      "15 Jul", "15 Aug", "15 Sep", "15 Oct", "15 Nov", "15 Dec",
    ]);
  });

  test("French September stays « sept. », the French abbreviation", () => {
    expect(formatDate("2026-09-15", "fr")).toBe("15 sept. 2026");
  });
});

/* ── BUG-464: the weight milestone field ──────────────────────────────────────── */

function goal(milestoneWeightKg: number | null, milestoneBodyFatPct: number | null): TraineeProgressGoal {
  return {
    startedOn: "2026-06-01",
    startedOnSource: "COACH",
    milestoneWeightKg,
    milestoneBodyFatPct,
    milestoneSetByName: "Alex R.",
    milestoneSource: "COACH",
    milestoneUpdatedAt: "2026-09-20T10:00:00Z",
    startWeight: null,
    currentWeight: null,
    startBodyFat: null,
    currentBodyFat: null,
    weightDeltaKg: null,
    bodyFatDeltaPts: null,
    weightToGoKg: null,
  };
}

test.describe("BUG-464 — the milestone fields are pre-filled the page's way, and read back unchanged", () => {
  test("French: « 70,4 » and « 20,5 »; English: 70.4 and 20.5 as before", () => {
    const french = seedFormState(goal(70.4, 20.5), "fr");
    expect(french.milestone).toBe("70,4");
    expect(french.bodyFat).toBe("20,5");
    const english = seedFormState(goal(70.4, 20.5), "en");
    expect(english.milestone).toBe("70.4");
    expect(english.bodyFat).toBe("20.5");
    // A whole number has no comma to add.
    expect(seedFormState(goal(68, null), "fr").milestone).toBe("68");
  });

  test("a French pre-fill saved untouched sends the stored numbers", () => {
    const seeded = seedFormState(goal(70.4, 20.5), "fr");
    const built = buildProgressGoalRequest(seeded.startedOn, seeded.milestone, { text: seeded.bodyFat, touched: true });
    expect(built).toEqual({
      ok: true,
      body: { startedOn: "2026-06-01", milestoneWeightKg: 70.4, milestoneBodyFatPct: 20.5 },
    });
  });
});

/* ── BUG-465 / BUG-571 / BUG-572: recipe quantities ───────────────────────────── */

function storedRecipe(quantities: number[]): CoachRecipe {
  return {
    id: CHICKEN_RICE_BOWL,
    name: "Chicken rice bowl",
    kcal: 560,
    proteinG: 50,
    carbsG: 62,
    fatG: 12,
    ingredients: quantities.map((quantity, i) => ({ key: `k${i}`, label: `item ${i}`, quantity, unit: "g" as const })),
    steps: ["Cook the rice."],
    unknownKeys: [],
    mealSlots: null,
  };
}

test.describe("BUG-465 / BUG-571 — a reopened recipe's quantities in French", () => {
  const stored = [150.5, 12.5, 1000.5, 0.25, 150, 1000, 5000];

  test("French writes a decimal comma and groups thousands with U+202F", () => {
    const shown = fromRecipe(storedRecipe(stored), "fr").ingredients.map((l) => l.quantity);
    expect(shown).toEqual(["150,5", "12,5", `1${NNBSP}000,5`, "0,25", "150", `1${NNBSP}000`, `5${NNBSP}000`]);
  });

  test("English is unchanged", () => {
    const shown = fromRecipe(storedRecipe(stored), "en").ingredients.map((l) => l.quantity);
    expect(shown).toEqual(["150.5", "12.5", "1000.5", "0.25", "150", "1000", "5000"]);
  });

  test("every French pre-fill reads back as the stored number, and a save sends it unchanged", () => {
    const draft = fromRecipe(storedRecipe(stored), "fr");
    for (const [i, line] of draft.ingredients.entries()) {
      expect(readQuantity(line.quantity), line.quantity).toEqual({ kind: "quantity", value: stored[i] });
    }
    const sent = forSave(draft, { recipe: "stored", mealSlots: null }).ingredients.map((l) => l.quantity);
    expect(sent).toEqual(stored);
  });
});

test("BUG-572 — the French quantity range sentence groups 5 000 like the format sentence beside it", () => {
  expect(fr.recipes.quantityRange).toBe(
    `Une quantité est supérieure à 0 et au plus égale à 5${NNBSP}000, avec 2 décimales au plus.`
  );
  expect(fr.recipes.quantityFormat).toBe(`Saisissez une quantité, par exemple 1${NNBSP}000 ou 12,5.`);
  // English unchanged.
  expect(en.recipes.quantityRange).toBe("A quantity is more than 0 and at most 5000, with up to 2 decimals.");
});

/* ── BUG-461 / BUG-462: "label : value" ────────────────────────────────────────── */

test("staff nit 4 — the challenge day strip's labels put U+00A0 before the colon too", () => {
  expect(fr.challenges.dayLabel("jeu. 1er oct.", "à venir")).toBe(`jeu. 1er oct.${NBSP}: à venir`);
  expect(fr.challenges.dayLabelSteps("mer. 30 sept.", `8${NNBSP}000`, "objectif atteint")).toBe(
    `mer. 30 sept.${NBSP}: 8${NNBSP}000 pas, objectif atteint`
  );
  expect(en.challenges.dayLabel("Thu 1 Oct", "upcoming")).toBe("Thu 1 Oct: upcoming");
});

test("BUG-461 / BUG-462 — « label : value » in French (U+00A0 before the colon), « label: value » in English", () => {
  expect(fr.common.labelled("Monter", "Barbell Back Squat")).toBe(`Monter${NBSP}: Barbell Back Squat`);
  expect(fr.common.labelled("Dernière séance", "21 sept. 2026")).toBe(`Dernière séance${NBSP}: 21 sept. 2026`);
  expect(en.common.labelled("Move up", "Barbell Back Squat")).toBe("Move up: Barbell Back Squat");
});

/* ── BUG-489: the catalogue's values as words ─────────────────────────────────── */

/**
 * A SEED-provider api's vocabulary (`EXERCISE_PROVIDER=seed`): b-fit-api's seeded catalogue,
 * V21, as the BUG-195c / EV-321b gate's picker served it
 * (`docs/qa/evidence/2026-09-30-BUG-195c-EV-321b-gate/logs/b1-i6-copy-dump.json`) — plus V21's
 * `front_delts`, `obliques` and `upper_back`. NOT production's: see MUSCLEWIKI_* below.
 */
const LIVE_MUSCLES = [
  "adductors", "back", "biceps", "calves", "cardio", "chest", "core", "forearms", "full_body",
  "glutes", "grip", "hamstrings", "hip_flexors", "hips", "lats", "legs", "quads", "rear_delts",
  "shoulders", "spine", "triceps", "t_spine", "front_delts", "obliques", "upper_back",
];
const LIVE_EQUIPMENT = ["BAND", "BARBELL", "BODYWEIGHT", "CABLE", "DUMBBELLS", "KETTLEBELL", "MACHINE", "NONE"];

/**
 * PRODUCTION's vocabulary (`EXERCISE_PROVIDER:musclewiki`): `SyncExercisesUseCase.toEntry`
 * stores MuscleWiki's first primary muscle verbatim and its category upper-cased. These are
 * the values a local catalogue synced by that provider held that the first cut of BUG-489 did
 * not label (staff review, 2026-10-01) — "BOSU-BALL" and "MEDICINE-BALL" printed RAW.
 */
const MUSCLEWIKI_MUSCLES = [
  "Anterior Deltoid", "Lateral Deltoid", "Posterior Deltoid", "Lower Abdominals", "Upper Abdominals",
  "Tibialis", "Traps (mid-back)",
];
const MUSCLEWIKI_EQUIPMENT = ["BOSU-BALL", "MEDICINE-BALL", "TRX", "VITRUVIAN", "YOGA", "CARDIO"];

/** A raw token on screen: an underscore, or an upper-case word of four or more with or without hyphens. */
const RAW_TOKEN = /_|^[A-Z0-9-]{4,}$/;

test.describe("BUG-489 — catalogue muscles and equipment are words, never the api's raw values", () => {
  test("French labels for every value the live api serves", () => {
    expect(LIVE_MUSCLES.map((m) => muscleLabel(m, fr))).toEqual([
      "Adducteurs", "Dos", "Biceps", "Mollets", "Cardio", "Pectoraux", "Sangle abdominale", "Avant-bras",
      "Corps entier", "Fessiers", "Préhension", "Ischio-jambiers", "Fléchisseurs de la hanche", "Hanches",
      "Grands dorsaux", "Jambes", "Quadriceps", "Deltoïdes postérieurs", "Épaules", "Colonne vertébrale",
      "Triceps", "Colonne thoracique", "Deltoïdes antérieurs", "Obliques", "Haut du dos",
    ]);
    expect(LIVE_EQUIPMENT.map((e) => equipmentLabel(e, fr))).toEqual([
      "Élastique", "Barre", "Poids du corps", "Poulie", "Haltères", "Kettlebell", "Machine", "Sans matériel",
    ]);
  });

  test("English labels, not raw keys", () => {
    expect(LIVE_MUSCLES.map((m) => muscleLabel(m, en))).toEqual([
      "Adductors", "Back", "Biceps", "Calves", "Cardio", "Chest", "Core", "Forearms", "Full body",
      "Glutes", "Grip", "Hamstrings", "Hip flexors", "Hips", "Lats", "Legs", "Quads", "Rear delts",
      "Shoulders", "Spine", "Triceps", "Thoracic spine", "Front delts", "Obliques", "Upper back",
    ]);
    expect(LIVE_EQUIPMENT.map((e) => equipmentLabel(e, en))).toEqual([
      "Band", "Barbell", "Bodyweight", "Cable", "Dumbbells", "Kettlebell", "Machine", "No equipment",
    ]);
  });

  test("production's MuscleWiki values get words in both languages; none prints raw", () => {
    expect(MUSCLEWIKI_MUSCLES.map((m) => muscleLabel(m, fr))).toEqual([
      "Deltoïde antérieur", "Deltoïde latéral", "Deltoïde postérieur", "Abdominaux inférieurs",
      "Abdominaux supérieurs", "Tibial antérieur", "Trapèzes (milieu du dos)",
    ]);
    expect(MUSCLEWIKI_MUSCLES.map((m) => muscleLabel(m, en))).toEqual([
      "Anterior deltoid", "Lateral deltoid", "Posterior deltoid", "Lower abdominals", "Upper abdominals",
      "Tibialis", "Traps (mid-back)",
    ]);
    expect(MUSCLEWIKI_EQUIPMENT.map((e) => equipmentLabel(e, fr))).toEqual([
      "Bosu", "Médecine-ball", "TRX", "Vitruvian", "Yoga", "Cardio",
    ]);
    expect(MUSCLEWIKI_EQUIPMENT.map((e) => equipmentLabel(e, en))).toEqual([
      "Bosu ball", "Medicine ball", "TRX", "Vitruvian", "Yoga", "Cardio",
    ]);
    // Title case as MuscleWiki writes it is the same key.
    expect(equipmentLabel("Medicine-Ball", fr)).toBe("Médecine-ball");
    for (const copy of [en, fr]) {
      for (const raw of [...LIVE_MUSCLES, ...MUSCLEWIKI_MUSCLES]) {
        expect(muscleLabel(raw, copy), raw).not.toMatch(RAW_TOKEN);
      }
      for (const raw of [...LIVE_EQUIPMENT, ...MUSCLEWIKI_EQUIPMENT]) {
        expect(equipmentLabel(raw, copy), raw).not.toMatch(RAW_TOKEN);
      }
    }
  });

  test("an UNSEEN upper-case hyphenated value is humanised, not printed raw", () => {
    expect(equipmentLabel("FOAM-ROLLER", fr)).toBe("Foam roller");
    expect(equipmentLabel("SMITH-MACHINE-PLUS", en)).toBe("Smith machine plus");
    expect(muscleLabel("Rear-Delt Head", en)).toBe("Rear-Delt Head"); // words: as served
  });

  test("a row's comma-joined muscles; any spelling of a known value; an unknown one is humanised, never raw", () => {
    expect(musclesLabel("quads,glutes", fr)).toBe("Quadriceps, Fessiers");
    expect(musclesLabel("quads, glutes,quads", en)).toBe("Quads, Glutes");
    expect(equipmentLabel("Barbell", fr)).toBe("Barre");
    expect(equipmentLabel("smith-machine", en)).toBe("Smith machine");
    expect(muscleLabel("upper_arms", fr)).toBe("Upper arms");
    expect(equipmentLabel("RESISTANCE_BAND", en)).toBe("Resistance band");
    expect(muscleLabel("Inner Thigh (adductors)", fr)).toBe("Inner Thigh (adductors)"); // unseen words: as served
    expect(equipmentLabel("TRX", en)).toBe("TRX");
  });
});

/* ── in a browser ─────────────────────────────────────────────────────────────── */

async function openPicker(page: Page, addLabel: string) {
  await page.goto(`/clients/${LINA}/routine`);
  await page.getByRole("button", { name: addLabel }).first().click();
  const picker = page.getByRole("dialog");
  await expect(picker.getByRole("button", { name: /^Barbell Back Squat/ })).toBeVisible();
  return picker;
}

async function optionLabels(page: Page, select: ReturnType<Page["getByLabel"]>): Promise<string[]> {
  return select.locator("option").allTextContents();
}

test.describe("a French browser (fr-FR)", () => {
  test.use({ locale: "fr-FR" });

  test("BUG-462 — the routine editor's aria-labels put U+00A0 before every colon", async ({ page }) => {
    await signInFrench(page);
    await page.goto(`/clients/${LINA}/routine`);
    const squat = "Barbell Back Squat";
    for (const label of ["Monter", "Descendre", "Remplacer", "Retirer", "Notes"]) {
      await expect(page.locator(`[aria-label="${label}${NBSP}: ${squat}"]`), label).toHaveCount(1);
      await expect(page.locator(`[aria-label="${label}: ${squat}"]`), label).toHaveCount(0);
    }
    await expect(page.locator(`[aria-label="Retirer le jour${NBSP}: Lundi"]`)).toHaveCount(1);
    // The sweep: no aria-label on the page puts a colon straight after a word or a plain space.
    const glued = await page.evaluate(() =>
      Array.from(document.querySelectorAll("[aria-label]"))
        .map((el) => el.getAttribute("aria-label") ?? "")
        .filter((label) => new RegExp("[^\\u00a0]:").test(label))
    );
    expect(glued).toEqual([]);
  });

  test("BUG-489 — the picker's filters and badges are French words; the filter still sends the api's value", async ({
    page,
  }) => {
    await signInFrench(page);
    const picker = await openPicker(page, "Ajouter un exercice");
    const muscles = await optionLabels(page, picker.getByLabel("Muscle"));
    expect(muscles).toEqual([
      "Tous", "Biceps", "Dos", "Épaules", "Fessiers", "Ischio-jambiers", "Mollets", "Pectoraux",
      "Quadriceps", "Sangle abdominale", "Triceps",
    ]);
    const equipment = await optionLabels(page, picker.getByLabel("Matériel"));
    expect(equipment).toEqual(["Tous", "Barre", "Haltères", "Machine", "Poulie"]);

    const squat = picker.getByRole("button", { name: /^Barbell Back Squat/ });
    await expect(squat.getByText("Quadriceps, Fessiers", { exact: true })).toBeVisible();
    await expect(squat.getByText("Barre", { exact: true })).toBeVisible();
    for (const raw of ["quads,glutes", "quads", "BARBELL", "DUMBBELLS", "chest"]) {
      await expect(picker.getByText(raw, { exact: true })).toHaveCount(0);
    }

    // The option's VALUE is the api's: "Dos" filters on `back`. Both halves are checked
    // after the filter lands (the squat GONE first — before the 180 ms debounce the whole
    // list, Lat Pulldown included, is still showing), and the server action's own argument
    // list is read: `searchCatalogAction(query, muscle, equipment)`.
    const searches: unknown[][] = [];
    page.on("request", (req) => {
      if (req.method() === "POST" && req.headers()["next-action"] !== undefined) {
        searches.push(JSON.parse(req.postData() ?? "[]") as unknown[]);
      }
    });
    await picker.getByLabel("Muscle").selectOption({ label: "Dos" });
    await expect(picker.getByRole("button", { name: /^Barbell Back Squat/ })).toHaveCount(0);
    await expect(picker.getByRole("button", { name: /^Lat Pulldown/ })).toBeVisible();
    await expect.poll(() => searches.map((args) => JSON.stringify(args))).toContain(JSON.stringify(["", "back", ""]));
    expect(searches.some((args) => args.includes("Dos")), "the label is never sent").toBe(false);
  });

  test("BUG-464 — a milestone saved as « 70,4 » is shown as « 70,4 » after a reload, and sent as 70.4", async ({
    page,
  }) => {
    await signInFrench(page);
    await page.goto(`/clients/${LINA}`);
    const block = page.getByRole("region", { name: "Progression et objectif" });
    const field = block.getByLabel("Objectif de poids (kg)");
    // Lina's seeded milestone, 68.0, has no decimal to show; set one.
    const bodies: unknown[][] = [];
    page.on("request", (req) => {
      if (req.method() === "POST" && req.headers()["next-action"] !== undefined) {
        bodies.push(JSON.parse(req.postData() ?? "[]") as unknown[]);
      }
    });
    await field.fill("70,4");
    const answered = page.waitForResponse(
      (r) => r.request().method() === "POST" && r.request().headers()["next-action"] !== undefined
    );
    await block.getByRole("button", { name: "Enregistrer" }).click();
    await answered;
    await expect(block.getByText("Enregistré.", { exact: true })).toBeVisible();
    expect(JSON.stringify(bodies)).toContain('"milestoneWeightKg":70.4');

    await page.reload();
    await expect(page.getByRole("region", { name: "Progression et objectif" }).getByLabel("Objectif de poids (kg)")).toHaveValue(
      "70,4"
    );
  });

  test("BUG-465 / BUG-571 — a quantity saved as « 150,5 » reopens as « 150,5 »; a name-only save sends 150.5", async ({
    page,
  }) => {
    await signInFrench(page);
    await page.goto(`/recipes/${CHICKEN_RICE_BOWL}`);
    const quantity = () => page.locator('[data-field="ingredients.0"] input').first();
    const save = page.getByRole("button", { name: "Enregistrer la recette" });
    const bodies: unknown[][] = [];
    page.on("request", (req) => {
      if (req.method() === "POST" && req.headers()["next-action"] !== undefined) {
        bodies.push(JSON.parse(req.postData() ?? "[]") as unknown[]);
      }
    });
    const saveAndSettle = async () => {
      const answered = page.waitForResponse(
        (r) => r.request().method() === "POST" && r.request().headers()["next-action"] !== undefined
      );
      await save.click();
      await answered;
      await expect(page.getByText("Recette enregistrée.", { exact: true })).toBeVisible();
      await expect(page.getByText("Modifications non enregistrées", { exact: true })).toHaveCount(0);
    };

    await expect(async () => {
      await quantity().fill("150,5");
      await expect(page.getByText("Modifications non enregistrées", { exact: true })).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 20_000 });
    await saveAndSettle();

    await page.goto(`/recipes/${CHICKEN_RICE_BOWL}`);
    await expect(quantity()).toHaveValue("150,5");

    // Touch the NAME only: the pre-filled « 150,5 » goes back as the stored 150.5.
    bodies.length = 0;
    await expect(async () => {
      await page.getByLabel("Nom de la recette").fill("Bol poulet riz");
      await expect(page.getByText("Modifications non enregistrées", { exact: true })).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 20_000 });
    await saveAndSettle();
    expect(bodies).toHaveLength(1);
    const [, body] = bodies[0] as [string, { name: string; ingredients: { quantity: unknown }[] }];
    expect(body.name).toBe("Bol poulet riz");
    expect(body.ingredients[0].quantity).toBe(150.5);
  });
});

test.describe("an English browser", () => {
  test("BUG-489 — the picker's filters and badges are English words, not the api's raw values", async ({ page }) => {
    await signInThroughForm(page);
    const picker = await openPicker(page, "Add exercise");
    expect(await optionLabels(page, picker.getByLabel("Muscle"))).toEqual([
      "All", "Back", "Biceps", "Calves", "Chest", "Core", "Glutes", "Hamstrings", "Quads", "Shoulders", "Triceps",
    ]);
    expect(await optionLabels(page, picker.getByLabel("Equipment"))).toEqual([
      "All", "Barbell", "Cable", "Dumbbells", "Machine",
    ]);
    const squat = picker.getByRole("button", { name: /^Barbell Back Squat/ });
    await expect(squat.getByText("Quads, Glutes", { exact: true })).toBeVisible();
    await expect(squat.getByText("Barbell", { exact: true })).toBeVisible();
    await expect(picker.getByText("BARBELL", { exact: true })).toHaveCount(0);
  });
});
