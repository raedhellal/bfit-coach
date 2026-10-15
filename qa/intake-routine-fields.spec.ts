import { expect, type Locator, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import {
  LINA,
  grant,
  openIntake,
  panel,
  plain,
  putSection,
  puts,
  sectionTab,
  seedSection,
  setSwitch,
  settledSaved,
  signIn,
  waitForPuts,
} from "./intake-harness";

/**
 * EV-341y2 — the routine-generation fields in the interview page (YP1–YP8), in fixture mode, with
 * `COACH_INTAKE_REQUEST=on` (this suite's server, as EV-341b's specs).
 *
 * The fixture is b-fit-api EV-341y1 @ 443ac5d8 ported (`coachApi.fixture.ts`): `emphasis` must be
 * a value of the catalogue's `muscles` facet and an exercise a catalogue `name`, unless already
 * stored in that field (Y1b / Y2). Two fixture switches stand in for a catalogue re-sync:
 * `evoli_fixture_catalog_drop_muscle` and `evoli_fixture_catalog_drop_exercise`.
 *
 * The fixture's facet, labelled as the day editor's muscle filter labels it (`catalogLabels.ts`):
 * back, biceps, calves, chest, core, glutes, hamstrings, quads, shoulders, triceps.
 *
 * The story's sentences are LITERALS here, never read from `src/lib/copy.ts`. Where the story
 * names an existing control (the day editor's « Ajouter un exercice », its « Terminé »), the
 * literal is that control's.
 */

const T = {
  en: {
    locale: "en-US",
    saved: "Saved",
    sections: { GOALS: "Goals and motivation", HISTORY: "Training history", AVAILABILITY: "Availability and equipment" },
    emphasis: "Muscle groups to emphasise",
    upTo5: "Up to 5.",
    liked: "Liked exercises",
    avoided: "Exercises to avoid",
    remove: (name: string) => `Remove ${name}`,
    max10: "10 exercises at most.",
    inOther: "Already in the other list",
    dropped: "(no longer in the catalogue)",
    injury: "Don't record an injury or pain here: the plan always respects the injuries in Lina's profile.",
    split: "Session split",
    splitOptions: ["Full body", "Upper / lower body", "Push / pull / legs", "No preference"],
    clear: "Clear",
    add: "Add exercise",
    done: "Done",
    muscles: ["Back", "Biceps", "Calves", "Chest", "Core", "Glutes", "Hamstrings", "Quads", "Shoulders", "Triceps"],
    glutes: "Glutes",
    notes: "Notes",
  },
  fr: {
    locale: "fr-FR",
    saved: "Enregistré",
    sections: { GOALS: "Objectifs et motivation", HISTORY: "Historique sportif", AVAILABILITY: "Disponibilités et matériel" },
    emphasis: "Groupes musculaires à privilégier",
    upTo5: "Jusqu'à 5.",
    liked: "Exercices appréciés",
    avoided: "Exercices à éviter",
    remove: (name: string) => `Retirer ${name}`,
    max10: "10 exercices au maximum.",
    inOther: "Déjà dans l'autre liste",
    dropped: "(plus dans le catalogue)",
    // U+00A0 before the colon (the portal's copy files).
    injury: "Une blessure ou une douleur ne se note pas ici : le programme respecte toujours les blessures du profil de Lina.",
    split: "Répartition des séances",
    splitOptions: ["Corps entier", "Haut / bas du corps", "Poussée / tirage / jambes", "Pas de préférence"],
    clear: "Effacer",
    add: "Ajouter un exercice",
    done: "Terminé",
    muscles: ["Biceps", "Dos", "Épaules", "Fessiers", "Ischio-jambiers", "Mollets", "Pectoraux", "Quadriceps", "Sangle abdominale", "Triceps"],
    glutes: "Fessiers",
    notes: "Notes",
  },
} as const;
type Lang = keyof typeof T;

/** Nine catalogue names (none of them « Goblet Squat » or « Plank »). */
const NINE = [
  "Barbell Back Squat",
  "Leg Press",
  "Romanian Deadlift",
  "Seated Leg Curl",
  "Hip Thrust",
  "Walking Lunge",
  "Standing Calf Raise",
  "Barbell Bench Press",
  "Dumbbell Bench Press",
];

/** Opens a section by its list entry, or by the `<select>` below 768 px (B2). */
async function openSection(page: Page, section: string) {
  const entry = sectionTab(page, section);
  if (await entry.isVisible()) await entry.click();
  else await page.locator(".intake-select").selectOption(section);
  await expect(panel(page, section)).toBeVisible();
}

function group(page: Page, section: string, name: string): Locator {
  return panel(page, section).getByRole("group", { name, exact: true });
}

function chip(scope: Locator, value: string): Locator {
  return scope.locator(`[data-intake-chip="${value}"]`);
}

function notesOf(page: Page, section: string, lang: Lang): Locator {
  return panel(page, section).getByRole("textbox", { name: T[lang].notes, exact: true });
}

async function lastPut(page: Page, section: string) {
  return (await puts(page, section)).at(-1)!;
}

/** Waits for the section's PUT count to grow by one, and returns that PUT. */
async function nextPut(page: Page, section: string, before: number) {
  await waitForPuts(page, section, before + 1);
  return (await puts(page, section))[before];
}

// ── YP1 ──────────────────────────────────────────────────────────────────────

for (const lang of ["en", "fr"] as const) {
  test.describe(`YP1 muscle groups (${lang.toUpperCase()})`, () => {
    test.use({ locale: T[lang].locale });

    test("under the goal: label, « Jusqu'à 5. », the facet as the day editor labels it; with 5 chosen the others rest", async ({ page }) => {
      const t = T[lang];
      await signIn(page, lang);
      await grant(page);
      await openIntake(page);
      const goals = panel(page, "GOALS");
      // Under the goal: the second group of the section, right after « Objectif principal ».
      const legends = await goals.locator("fieldset > legend").allTextContents();
      expect(legends.indexOf(t.emphasis)).toBe(1);
      const emphasis = group(page, "GOALS", t.emphasis);
      await expect(emphasis).toHaveAccessibleDescription(t.upTo5);
      const boxes = emphasis.getByRole("checkbox");
      expect((await boxes.evaluateAll((els) => els.map((e) => (e.closest("label")?.textContent ?? "").trim())))).toEqual([...t.muscles]);

      // Five chosen, in a deliberate order: the chips keep it, and so does the PUT.
      const order = lang === "en" ? ["Quads", "Back", "Core", "Chest", "Biceps"] : ["Quadriceps", "Dos", "Sangle abdominale", "Pectoraux", "Biceps"];
      for (const label of order) await emphasis.getByRole("checkbox", { name: label, exact: true }).check();
      await expect(emphasis.locator(".intake-chip-text")).toHaveText(order);
      for (const label of t.muscles) {
        const box = emphasis.getByRole("checkbox", { name: label, exact: true });
        if ((order as readonly string[]).includes(label)) await expect(box).toBeEnabled();
        else await expect(box, `${label} rests at 5`).toBeDisabled();
      }
      await waitForPuts(page, "GOALS", 1, 10_000);
      await expect.poll(async () => (await lastPut(page, "GOALS")).body.values.emphasis).toEqual(["quads", "back", "core", "chest", "biceps"]);
      await settledSaved(page, t.saved);

      // One unticked: the others are back.
      await emphasis.getByRole("checkbox", { name: order[3], exact: true }).uncheck();
      await expect(emphasis.getByRole("checkbox", { name: t.glutes, exact: true })).toBeEnabled();
      // A chip's remove button is named « Retirer {libellé} ».
      await emphasis.getByRole("button", { name: t.remove(order[0]), exact: true }).click();
      await expect(emphasis.locator(".intake-chip-text")).toHaveText([order[1], order[2], order[4]]);
      await expect.poll(async () => (await lastPut(page, "GOALS")).body.values.emphasis, { timeout: 10_000 }).toEqual(["back", "core", "biceps"]);
    });
  });
}

// ── YP2 / YP3 ────────────────────────────────────────────────────────────────

for (const lang of ["en", "fr"] as const) {
  test.describe(`YP2 / YP3 exercise lists (${lang.toUpperCase()})`, () => {
    test.use({ locale: T[lang].locale });

    test("picked in the day editor's search, shown as chips with « Retirer … »; the other list's name rests with « Déjà dans l'autre liste »", async ({
      page,
    }) => {
      const t = T[lang];
      await signIn(page, lang);
      await grant(page);
      await openIntake(page);
      await openSection(page, "HISTORY");
      const liked = group(page, "HISTORY", t.liked);
      const avoided = group(page, "HISTORY", t.avoided);

      await liked.getByRole("button", { name: t.add, exact: true }).click();
      const likedSearch = page.getByRole("dialog", { name: t.liked, exact: true });
      await expect(likedSearch).toBeVisible();
      await likedSearch.getByRole("textbox").fill("Goblet");
      await likedSearch.locator('[data-catalog-row="Goblet Squat"]').click();
      await likedSearch.getByRole("button", { name: t.done, exact: true }).click();
      await expect(likedSearch).toHaveCount(0);
      await expect(chip(liked, "Goblet Squat").locator(".intake-chip-text")).toHaveText("Goblet Squat");
      await expect(liked.getByRole("button", { name: t.remove("Goblet Squat"), exact: true })).toBeVisible();
      await waitForPuts(page, "HISTORY", 1, 10_000);
      expect((await lastPut(page, "HISTORY")).body.values.likedExercises).toEqual(["Goblet Squat"]);

      // The other list: the same row rests, and says why.
      await avoided.getByRole("button", { name: t.add, exact: true }).click();
      const avoidedSearch = page.getByRole("dialog", { name: t.avoided, exact: true });
      await avoidedSearch.getByRole("textbox").fill("Goblet");
      const row = avoidedSearch.locator('[data-catalog-row="Goblet Squat"]');
      await expect(row).toBeDisabled();
      await expect(row.locator("[data-catalog-row-note]")).toHaveText(t.inOther);
      await row.click({ force: true });
      await avoidedSearch.getByRole("button", { name: t.done, exact: true }).click();
      await expect(chip(avoided, "Goblet Squat")).toHaveCount(0);

      // Removing sends the list without it.
      const before = (await puts(page, "HISTORY")).length;
      await liked.getByRole("button", { name: t.remove("Goblet Squat"), exact: true }).click();
      await expect(chip(liked, "Goblet Squat")).toHaveCount(0);
      expect((await nextPut(page, "HISTORY", before)).body.values.likedExercises).toEqual([]);
    });

    test("10 at most: with 10 picked the search's rows and « Ajouter » rest, and « 10 exercices au maximum. » shows", async ({ page }) => {
      const t = T[lang];
      await signIn(page, lang);
      await grant(page);
      await seedSection(page, "HISTORY", { likedExercises: NINE });
      await openIntake(page);
      await openSection(page, "HISTORY");
      const liked = group(page, "HISTORY", t.liked);
      await expect(liked.locator("[data-intake-chip]")).toHaveCount(9);
      await expect(page.locator("[data-intake-limit]")).toHaveCount(0);

      await liked.getByRole("button", { name: t.add, exact: true }).click();
      const search = page.getByRole("dialog", { name: t.liked, exact: true });
      await search.getByRole("textbox").fill("Plank");
      await search.locator('[data-catalog-row="Plank"]').click();
      // The tenth: every row now rests, and the search says why.
      await expect(search.locator("[data-catalog-limit]")).toHaveText(t.max10);
      await search.getByRole("textbox").fill("Curl");
      await expect(search.locator("[data-catalog-row]").first()).toBeVisible();
      for (const r of await search.locator("[data-catalog-row]").all()) await expect(r).toBeDisabled();
      await search.getByRole("button", { name: t.done, exact: true }).click();

      await expect(liked.locator("[data-intake-chip]")).toHaveCount(10);
      const opener = liked.getByRole("button", { name: t.add, exact: true });
      await expect(opener).toBeDisabled();
      await expect(liked.locator('[data-intake-limit="HISTORY.likedExercises"]')).toHaveText(t.max10);
      await expect(opener).toHaveAccessibleDescription(t.max10);
      await expect.poll(async () => (await lastPut(page, "HISTORY")).body.values.likedExercises, { timeout: 10_000 }).toEqual([...NINE, "Plank"]);
      // The other list is not full.
      await expect(group(page, "HISTORY", t.avoided).getByRole("button", { name: t.add, exact: true })).toBeEnabled();
    });

    test("YP3: the injury line under « Exercices à éviter », exactly", async ({ page }) => {
      const t = T[lang];
      await signIn(page, lang);
      await grant(page);
      await openIntake(page);
      await openSection(page, "HISTORY");
      const avoided = group(page, "HISTORY", t.avoided);
      const line = avoided.locator('[data-intake-hint="HISTORY.avoidedExercises"]');
      // Raw text: the no-break space before the colon is part of the sentence in French.
      expect(await line.textContent()).toBe(t.injury);
      await expect(avoided).toHaveAccessibleDescription(plain(t.injury));
      // Under « Exercices à éviter » only.
      await expect(panel(page, "HISTORY").locator('[data-intake-hint="HISTORY.likedExercises"]')).toHaveCount(0);
    });
  });
}

// ── YP4 ──────────────────────────────────────────────────────────────────────

for (const lang of ["en", "fr"] as const) {
  test.describe(`YP4 session split (${lang.toUpperCase()})`, () => {
    test.use({ locale: T[lang].locale });

    test("one choice of four, nothing pre-selected; « Effacer » undoes it", async ({ page }) => {
      const t = T[lang];
      await signIn(page, lang);
      await grant(page);
      await openIntake(page);
      await openSection(page, "AVAILABILITY");
      const split = group(page, "AVAILABILITY", t.split);
      const radios = split.getByRole("radio");
      expect(await radios.evaluateAll((els) => els.map((e) => (e.closest("label")?.textContent ?? "").trim()))).toEqual([...t.splitOptions]);
      for (const r of await radios.all()) await expect(r).not.toBeChecked();
      await expect(split.getByRole("button", { name: t.clear, exact: true })).toHaveCount(0);

      await split.getByRole("radio", { name: t.splitOptions[1], exact: true }).check();
      await waitForPuts(page, "AVAILABILITY", 1, 10_000);
      expect((await lastPut(page, "AVAILABILITY")).body.values.splitPreference).toBe("UPPER_LOWER");
      await settledSaved(page, t.saved);

      const before = (await puts(page, "AVAILABILITY")).length;
      await split.getByRole("button", { name: t.clear, exact: true }).click();
      for (const r of await radios.all()) await expect(r).not.toBeChecked();
      await expect(split.getByRole("button", { name: t.clear, exact: true })).toHaveCount(0);
      expect((await nextPut(page, "AVAILABILITY", before)).body.values.splitPreference).toBeNull();
      await settledSaved(page, t.saved);
    });
  });
}

// ── YP5 ──────────────────────────────────────────────────────────────────────

test.describe("YP5 saved with the section", () => {
  test("each change is in the section's next PUT within 1.5 s, exactly as chosen; a reload shows the same values", async ({ page }) => {
    test.setTimeout(120_000);
    const t = T.en;
    await signIn(page);
    await grant(page);
    await openIntake(page);

    // Section 1: two muscles, in the order picked (not the facet's).
    const emphasis = group(page, "GOALS", t.emphasis);
    await emphasis.getByRole("checkbox", { name: "Hamstrings", exact: true }).check();
    await emphasis.getByRole("checkbox", { name: "Glutes", exact: true }).check();
    const changedAt = Date.now();
    await waitForPuts(page, "GOALS", 1, 10_000);
    const goals = await lastPut(page, "GOALS");
    expect(goals.at - changedAt, "within 1.5 s of the last change").toBeLessThan(1_500 + 400);
    expect(goals.body.values.emphasis).toEqual(["hamstrings", "glutes"]);

    // Section 2: two liked, one avoided.
    await openSection(page, "HISTORY");
    const pick = async (list: string, query: string, name: string) => {
      await group(page, "HISTORY", list).getByRole("button", { name: t.add, exact: true }).click();
      const search = page.getByRole("dialog", { name: list, exact: true });
      await search.getByRole("textbox").fill(query);
      await search.locator(`[data-catalog-row="${name}"]`).click();
      await search.getByRole("button", { name: t.done, exact: true }).click();
      await expect(search).toHaveCount(0);
    };
    await pick(t.liked, "Plank", "Plank");
    await pick(t.liked, "Goblet", "Goblet Squat");
    await pick(t.avoided, "Push", "Push-Up");
    const pickedAt = Date.now();
    await expect
      .poll(async () => (await lastPut(page, "HISTORY")).body.values, { timeout: 10_000 })
      .toMatchObject({ likedExercises: ["Plank", "Goblet Squat"], avoidedExercises: ["Push-Up"] });
    expect((await lastPut(page, "HISTORY")).at - pickedAt).toBeLessThan(1_500 + 400);

    // Section 3: the split.
    await openSection(page, "AVAILABILITY");
    await group(page, "AVAILABILITY", t.split).getByRole("radio", { name: "Push / pull / legs", exact: true }).check();
    await waitForPuts(page, "AVAILABILITY", 1, 10_000);
    expect((await lastPut(page, "AVAILABILITY")).body.values.splitPreference).toBe("PUSH_PULL_LEGS");
    await settledSaved(page);

    // B6: the reload shows them, in the same order (it opens on the first unanswered section).
    await openIntake(page);
    await expect(panel(page, "LIFESTYLE")).toBeVisible();
    await openSection(page, "GOALS");
    await expect(group(page, "GOALS", t.emphasis).locator(".intake-chip-text")).toHaveText(["Hamstrings", "Glutes"]);
    await expect(group(page, "GOALS", t.emphasis).getByRole("checkbox", { name: "Glutes", exact: true })).toBeChecked();
    await openSection(page, "HISTORY");
    await expect(group(page, "HISTORY", t.liked).locator(".intake-chip-text")).toHaveText(["Plank", "Goblet Squat"]);
    await expect(group(page, "HISTORY", t.avoided).locator(".intake-chip-text")).toHaveText(["Push-Up"]);
    await openSection(page, "AVAILABILITY");
    await expect(group(page, "AVAILABILITY", t.split).getByRole("radio", { name: "Push / pull / legs", exact: true })).toBeChecked();
    // Nothing is sent by a reload.
    const count = (await puts(page)).length;
    await page.waitForTimeout(2_000);
    expect((await puts(page)).length).toBe(count);
  });
});

// ── YP6 / YP6b ───────────────────────────────────────────────────────────────

for (const lang of ["en", "fr"] as const) {
  test.describe(`YP6 / YP6b values the catalogue dropped (${lang.toUpperCase()})`, () => {
    test.use({ locale: T[lang].locale });

    test("YP6: a stored exercise the catalogue no longer has is a marked chip, kept on save, removable, not re-addable", async ({ page }) => {
      const t = T[lang];
      await signIn(page, lang);
      await grant(page);
      await seedSection(page, "HISTORY", { likedExercises: ["Goblet Squat", "Plank"] });
      await setSwitch(page.context(), page, "evoli_fixture_catalog_drop_exercise", encodeURIComponent("Goblet Squat"));
      await openIntake(page);
      await openSection(page, "HISTORY");
      const liked = group(page, "HISTORY", t.liked);
      expect(plain(await chip(liked, "Goblet Squat").locator(".intake-chip-text").textContent())).toBe(`Goblet Squat ${t.dropped}`);
      expect(plain(await chip(liked, "Plank").locator(".intake-chip-text").textContent())).toBe("Plank");

      // Another field of the section: the dropped name goes back unchanged, and the api takes it.
      const before = (await puts(page, "HISTORY")).length;
      await notesOf(page, "HISTORY", lang).fill("Likes kettlebells");
      await notesOf(page, "HISTORY", lang).press("Tab");
      expect((await nextPut(page, "HISTORY", before)).body.values.likedExercises).toEqual(["Goblet Squat", "Plank"]);
      await settledSaved(page, t.saved);
      await expect(chip(liked, "Goblet Squat")).toHaveCount(1);

      // Removed by the coach: sent without it, and it cannot be picked again.
      await liked.getByRole("button", { name: t.remove("Goblet Squat"), exact: true }).click();
      expect((await nextPut(page, "HISTORY", before + 1)).body.values.likedExercises).toEqual(["Plank"]);
      await settledSaved(page, t.saved);
      await liked.getByRole("button", { name: t.add, exact: true }).click();
      const search = page.getByRole("dialog", { name: t.liked, exact: true });
      await search.getByRole("textbox").fill("Goblet");
      await expect(search.locator("[data-catalog-row]")).toHaveCount(0);
    });

    test("YP6b: stored [glutes, calves], facet without calves: a raw marked chip that counts toward 5, kept on save, removable for good", async ({
      page,
    }) => {
      const t = T[lang];
      await signIn(page, lang);
      await grant(page);
      await seedSection(page, "GOALS", { emphasis: ["glutes", "calves"] });
      await setSwitch(page.context(), page, "evoli_fixture_catalog_drop_muscle", "calves");
      await openIntake(page);
      await openSection(page, "GOALS");
      const emphasis = group(page, "GOALS", t.emphasis);
      expect(plain(await chip(emphasis, "glutes").locator(".intake-chip-text").textContent())).toBe(t.glutes);
      expect(plain(await chip(emphasis, "calves").locator(".intake-chip-text").textContent())).toBe(`calves ${t.dropped}`);
      await expect(emphasis.getByRole("button", { name: t.remove("calves"), exact: true })).toBeVisible();
      // Not among the options: it cannot be added back.
      await expect(emphasis.locator('input[type="checkbox"][value="calves"]')).toHaveCount(0);
      await expect(emphasis.getByRole("checkbox")).toHaveCount(9);

      // An edit to another field of section 1 sends it unchanged, and the api answers 200.
      const before = (await puts(page, "GOALS")).length;
      await notesOf(page, "GOALS", lang).fill("Wants stronger legs");
      await notesOf(page, "GOALS", lang).press("Tab");
      expect((await nextPut(page, "GOALS", before)).body.values.emphasis).toEqual(["glutes", "calves"]);
      await settledSaved(page, t.saved);

      // It counts toward the 5: three more fill the list.
      for (const value of ["back", "biceps", "chest"]) await emphasis.locator(`input[type="checkbox"][value="${value}"]`).check();
      await expect(emphasis.locator('input[type="checkbox"][value="core"]')).toBeDisabled();
      await expect.poll(async () => (await lastPut(page, "GOALS")).body.values.emphasis, { timeout: 10_000 }).toEqual([
        "glutes",
        "calves",
        "back",
        "biceps",
        "chest",
      ]);
      await settledSaved(page, t.saved);

      // Removing it sends the list without it; the boxes come back.
      const n = (await puts(page, "GOALS")).length;
      await emphasis.getByRole("button", { name: t.remove("calves"), exact: true }).click();
      expect((await nextPut(page, "GOALS", n)).body.values.emphasis).toEqual(["glutes", "back", "biceps", "chest"]);
      await settledSaved(page, t.saved);
      await expect(emphasis.locator('input[type="checkbox"][value="core"]')).toBeEnabled();
      await expect(chip(emphasis, "calves")).toHaveCount(0);

      // Control: the fixture is the api's rule, not a pass-through. No longer stored, calves is refused.
      const stored = (await (await page.request.get(`/api/bff/clients/${LINA}/intake`)).json()) as {
        sections: { GOALS: { version: number } };
      };
      const refused = await putSection(page, "GOALS", stored.sections.GOALS.version, { emphasis: ["glutes", "calves"] });
      expect(refused.status).toBe(400);
      expect(refused.body).toMatchObject({ field: "emphasis" });
    });
  });
}

// ── YP7 ──────────────────────────────────────────────────────────────────────

test.describe("YP7 no equipment control", () => {
  test("no section PUT carries an equipment key; section 3's equipment is read-only", async ({ page }) => {
    const t = T.en;
    await signIn(page);
    await grant(page);
    await openIntake(page);
    await group(page, "GOALS", t.emphasis).getByRole("checkbox", { name: "Glutes", exact: true }).check();
    await openSection(page, "HISTORY");
    await notesOf(page, "HISTORY", "en").fill("History");
    await openSection(page, "AVAILABILITY");
    await group(page, "AVAILABILITY", t.split).getByRole("radio", { name: "Full body", exact: true }).check();
    await panel(page, "AVAILABILITY").getByRole("checkbox", { name: "Gym", exact: true }).check();
    await openSection(page, "LIFESTYLE");
    await notesOf(page, "LIFESTYLE", "en").fill("Lifestyle");
    await notesOf(page, "LIFESTYLE", "en").press("Tab");
    await settledSaved(page);
    const all = await puts(page);
    expect(new Set(all.map((p) => p.section))).toEqual(new Set(["GOALS", "HISTORY", "AVAILABILITY", "LIFESTYLE"]));
    for (const p of all) {
      expect(Object.keys(p.body.values).filter((k) => /equip/i.test(k)), `${p.section} PUT`).toEqual([]);
    }
    // B10's read-only line is text: no control inside it.
    const readonly = panel(page, "AVAILABILITY").locator(".intake-readonly");
    await expect(readonly).toHaveCount(1);
    await expect(readonly.locator("input, select, textarea, button")).toHaveCount(0);
  });
});

// ── YP8 ──────────────────────────────────────────────────────────────────────

test.describe("YP8 keyboard, widths, targets", () => {
  const active = (page: Page) =>
    page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return "";
      const input = el as HTMLInputElement;
      if (el.tagName === "INPUT") return `${input.type}:${input.value}`;
      return `${el.tagName}:${el.getAttribute("aria-label") ?? (el.textContent ?? "").trim()}`;
    });

  test("an exercise picker by Tab / Enter / Escape: open, search, pick, close back on its opener, remove", async ({ page }) => {
    test.setTimeout(120_000);
    const t = T.en;
    await signIn(page);
    await grant(page);
    await openIntake(page);
    // The section list by keyboard: from GOALS' entry, ArrowDown to HISTORY.
    await sectionTab(page, "GOALS").focus();
    await page.keyboard.press("ArrowDown");
    await expect(panel(page, "HISTORY")).toBeVisible();
    const opener = group(page, "HISTORY", t.liked).getByRole("button", { name: t.add, exact: true });
    for (let i = 0; i < 40 && !(await opener.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab");
    await expect(opener).toBeFocused();

    await page.keyboard.press("Enter");
    const search = page.getByRole("dialog", { name: t.liked, exact: true });
    await expect(search).toBeVisible();
    await expect(search.getByRole("textbox")).toBeFocused();
    await page.keyboard.type("Plank");
    const row = search.locator('[data-catalog-row="Plank"]');
    await expect(row).toBeVisible();
    await expect(search.locator("[data-catalog-row]")).toHaveCount(1);
    for (let i = 0; i < 10 && !(await row.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab");
    await expect(row).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(chip(group(page, "HISTORY", t.liked), "Plank")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(search).toHaveCount(0);
    await expect(opener).toBeFocused();
    await expect.poll(async () => (await lastPut(page, "HISTORY"))?.body.values.likedExercises, { timeout: 10_000 }).toEqual(["Plank"]);

    // The chip's remove button is the stop before the opener; Enter removes, and the focus stays in the control.
    await page.keyboard.press("Shift+Tab");
    expect(await active(page)).toBe(`BUTTON:${t.remove("Plank")}`);
    await page.keyboard.press("Enter");
    await expect(chip(group(page, "HISTORY", t.liked), "Plank")).toHaveCount(0);
    await expect(opener).toBeFocused();
    await expect.poll(async () => (await lastPut(page, "HISTORY")).body.values.likedExercises, { timeout: 10_000 }).toEqual([]);
  });

  test("the muscle groups and the split by keyboard: Space ticks, a chip is removed by Enter, « Clear » by Enter", async ({ page }) => {
    test.setTimeout(120_000);
    const t = T.en;
    await signIn(page);
    await grant(page);
    await openIntake(page);
    await sectionTab(page, "GOALS").focus();
    await page.keyboard.press("Tab"); // the goal's radio group
    await page.keyboard.press("Tab"); // the muscle groups' first box
    expect(await active(page)).toBe("checkbox:back");
    await page.keyboard.press("Space");
    await expect(chip(group(page, "GOALS", t.emphasis), "back")).toHaveCount(1);
    await page.keyboard.press("Shift+Tab");
    expect(await active(page)).toBe(`BUTTON:${t.remove("Back")}`);
    await page.keyboard.press("Enter");
    await expect(chip(group(page, "GOALS", t.emphasis), "back")).toHaveCount(0);
    expect(await active(page), "the focus stays in the group").toBe("checkbox:back");
    await expect(group(page, "GOALS", t.emphasis).getByRole("checkbox", { name: "Back", exact: true })).not.toBeChecked();

    await sectionTab(page, "GOALS").focus();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown"); // AVAILABILITY
    await expect(panel(page, "AVAILABILITY")).toBeVisible();
    for (let i = 0; i < 40 && (await active(page)) !== "radio:FULL_BODY"; i++) await page.keyboard.press("Tab");
    expect(await active(page)).toBe("radio:FULL_BODY");
    await page.keyboard.press("ArrowRight"); // UPPER_LOWER, one Tab stop with arrows (B8)
    const split = group(page, "AVAILABILITY", t.split);
    await expect(split.getByRole("radio", { name: "Upper / lower body", exact: true })).toBeChecked();
    await expect.poll(async () => (await lastPut(page, "AVAILABILITY"))?.body.values.splitPreference, { timeout: 10_000 }).toBe("UPPER_LOWER");
    await page.keyboard.press("Tab");
    expect(await active(page)).toBe(`BUTTON:${t.clear}`);
    await page.keyboard.press("Enter");
    for (const r of await split.getByRole("radio").all()) await expect(r).not.toBeChecked();
    await expect.poll(() => active(page)).toBe("radio:FULL_BODY");
    await expect.poll(async () => (await lastPut(page, "AVAILABILITY"))?.body.values.splitPreference, { timeout: 10_000 }).toBeNull();
  });

  for (const width of [1440, 1024, 768, 390]) {
    test(`at ${width} px: no sideways scroll, every new control ≥ 44 px`, async ({ page }) => {
      test.setTimeout(120_000);
      const t = T.en;
      await page.setViewportSize({ width, height: 900 });
      await signIn(page);
      await grant(page);
      // The longest catalogue name, ten chips in one list, five muscles.
      await seedSection(page, "HISTORY", { likedExercises: [...NINE, "Single-Arm Standing Cable Lateral Raise With Pause"], avoidedExercises: ["Plank"] });
      await seedSection(page, "GOALS", { emphasis: ["glutes", "hamstrings", "quads", "back", "chest"] });
      await seedSection(page, "AVAILABILITY", { splitPreference: "FULL_BODY" });
      await openIntake(page);
      const noSideways = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
      const atLeast44 = async (scope: Locator, what: string) => {
        const boxes = await scope.evaluateAll((els) =>
          els.filter((el) => (el as HTMLElement).offsetParent !== null).map((el) => el.getBoundingClientRect())
        );
        expect(boxes.length, `${what} on screen`).toBeGreaterThan(0);
        for (const b of boxes) {
          expect(b.height, `${what} height`).toBeGreaterThanOrEqual(44);
          expect(b.width, `${what} width`).toBeGreaterThanOrEqual(44);
        }
      };

      await openSection(page, "GOALS");
      await atLeast44(panel(page, "GOALS").locator(".intake-chip-remove"), "a muscle chip's remove button");
      await atLeast44(group(page, "GOALS", t.emphasis).locator(".intake-choice"), "a muscle choice");
      expect(await noSideways()).toBe(true);

      await openSection(page, "HISTORY");
      await atLeast44(panel(page, "HISTORY").locator(".intake-chip-remove"), "an exercise chip's remove button");
      await atLeast44(group(page, "HISTORY", t.avoided).locator("[data-intake-picker-open] button"), "the search's opener");
      expect(await noSideways()).toBe(true);
      await group(page, "HISTORY", t.avoided).getByRole("button", { name: t.add, exact: true }).click();
      const search = page.getByRole("dialog", { name: t.avoided, exact: true });
      await expect(search.locator("[data-catalog-row]").first()).toBeVisible();
      await atLeast44(search.locator("[data-catalog-row]"), "a search row");
      const box = (await search.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      await page.keyboard.press("Escape");
      await expect(search).toHaveCount(0);

      await openSection(page, "AVAILABILITY");
      await atLeast44(group(page, "AVAILABILITY", t.split).locator("[data-intake-clear] button"), "« Clear »");
      expect(await noSideways()).toBe(true);
    });
  }
});
