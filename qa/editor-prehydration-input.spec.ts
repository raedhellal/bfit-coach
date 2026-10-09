import { expect, type Locator, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import {
  CLICK_TIMEOUT,
  COPY,
  ENGINES,
  LANGS,
  WIDTHS,
  closeBrowsers,
  expectServerHtml,
  expectStateHoldsWhatIsShown,
  holdHydration,
  openPage,
  type Copy,
  type Engine,
  type Lang,
} from "./prehydration";

/**
 * BUG-686 follow-up — the portal's editors: what a coach types before React hydrates is
 * what gets SAVED.
 *
 * Before the fix (a862698) this was worse than the login's disabled button: an editor's
 * field kept the coach's pre-hydration text on screen while its state kept the SERVER's
 * value, and Save sent the server's value. The coach saw "saved" and the edit was gone on
 * the next load. `qa/prehydration-sweep.spec.ts` witnessed it field by field; this spec is
 * the behaviour, one form per describe block, each:
 *   type into server HTML (no fiber on the field) → release the held JS → React's value for
 *   the field is the shown one (and the form's "Unsaved changes" badge, where it has one)
 *   → Save → RELOAD → the stored value is the typed one.
 * Red on a862698: React's value stays the server's (and the badge never appears).
 *
 * Every value typed here is one the field validates as is, so the replay is the only
 * thing between the typing and the save.
 */

const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
const UPPER_LOWER = "7c2d0a11-0000-4000-8000-0000000000b1";
const CHICKEN_RICE_BOWL = "8e3f1b22-0000-4000-8000-0000000000c1";

test.afterAll(closeBrowsers);

type T = Copy;

interface EditorCase {
  name: string;
  path: string;
  /**
   * Fills the server HTML; returns the field whose stored value is checked after a reload,
   * and `also` any other fields of the same draft typed before hydration.
   */
  type: (page: Page, t: T) => Promise<{ field: Locator; value: string; also?: Array<{ field: Locator; value: string }> }>;
  /** What the form shows once the typed value is in its state. */
  holdsTheEdit: (page: Page, t: T) => Promise<void>;
  save: (page: Page, t: T) => Promise<void>;
  /** Where the stored value is read back (default: reload the same page). */
  readBack?: (page: Page, t: T, typed: string) => Promise<void>;
}

const CASES: EditorCase[] = [
  {
    name: "template editor (/templates/[id])",
    path: `/templates/${UPPER_LOWER}`,
    async type(page, t) {
      const field = page.getByLabel(t.templates.nameLabel, { exact: true });
      await field.fill("Prehydration split");
      return { field, value: "Prehydration split" };
    },
    async holdsTheEdit(page, t) {
      await expect(page.getByText(t.templates.unsavedBadge, { exact: true })).toBeVisible();
    },
    async save(page, t) {
      await page.getByRole("button", { name: t.templates.save, exact: true }).click({ timeout: CLICK_TIMEOUT });
      await expect(page.getByText(t.templates.saved, { exact: true })).toBeVisible();
    },
  },
  {
    // Two fields of ONE draft: each handler closes over the render's draft, so a replay that
    // is not committed before the next one loses the first (staff review: replaying inside
    // the mount effect lost 3 of 4 fields while the one-field cases stayed green).
    name: "template editor, two fields of one draft (/templates/[id])",
    path: `/templates/${UPPER_LOWER}`,
    async type(page, t) {
      const field = page.getByLabel(t.templates.nameLabel, { exact: true });
      await field.fill("Prehydration split");
      const sets = page.getByLabel(t.routine.sets, { exact: true }).first();
      await sets.fill("5");
      return { field, value: "Prehydration split", also: [{ field: sets, value: "5" }] };
    },
    async holdsTheEdit(page, t) {
      await expect(page.getByText(t.templates.unsavedBadge, { exact: true })).toBeVisible();
    },
    async save(page, t) {
      await page.getByRole("button", { name: t.templates.save, exact: true }).click({ timeout: CLICK_TIMEOUT });
      await expect(page.getByText(t.templates.saved, { exact: true })).toBeVisible();
    },
  },
  {
    name: "recipe editor, two fields of one draft (/recipes/[id])",
    path: `/recipes/${CHICKEN_RICE_BOWL}`,
    async type(page, t) {
      const field = page.getByLabel(t.recipes.nameLabel, { exact: true });
      await field.fill("Prehydration bowl");
      const quantity = page.getByLabel(t.recipes.quantityLabel, { exact: true }).first();
      await quantity.fill("200");
      return { field, value: "Prehydration bowl", also: [{ field: quantity, value: "200" }] };
    },
    async holdsTheEdit(page, t) {
      await expect(page.getByText(t.recipes.unsavedBadge, { exact: true })).toBeVisible();
    },
    async save(page, t) {
      await page.getByRole("button", { name: t.recipes.save, exact: true }).click({ timeout: CLICK_TIMEOUT });
      await expect(page.getByText(t.recipes.saved, { exact: true })).toBeVisible();
    },
  },
  {
    name: "recipe editor (/recipes/[id])",
    path: `/recipes/${CHICKEN_RICE_BOWL}`,
    async type(page, t) {
      const field = page.getByLabel(t.recipes.nameLabel, { exact: true });
      await field.fill("Prehydration bowl");
      return { field, value: "Prehydration bowl" };
    },
    async holdsTheEdit(page, t) {
      await expect(page.getByText(t.recipes.unsavedBadge, { exact: true })).toBeVisible();
    },
    async save(page, t) {
      await page.getByRole("button", { name: t.recipes.save, exact: true }).click({ timeout: CLICK_TIMEOUT });
      await expect(page.getByText(t.recipes.saved, { exact: true })).toBeVisible();
    },
  },
  {
    name: "nutrition template editor (/nutrition-templates/new)",
    path: "/nutrition-templates/new",
    async type(page, t) {
      const field = page.getByLabel(t.nutritionTemplates.nameLabel, { exact: true });
      await field.fill("Prehydration cut");
      await page.getByRole("textbox", { name: t.nutrition.calories, exact: true }).fill("2000");
      await page.getByRole("textbox", { name: t.nutrition.protein, exact: true }).fill("150");
      await page.getByRole("textbox", { name: t.nutrition.carbs, exact: true }).fill("200");
      await page.getByRole("textbox", { name: t.nutrition.fat, exact: true }).fill("67");
      return { field, value: "Prehydration cut" };
    },
    // The editor has no badge; its Save is the observable, and the saved row below.
    async holdsTheEdit() {},
    async save(page, t) {
      await page
        .getByRole("button", { name: t.nutritionTemplates.save, exact: true })
        .click({ timeout: CLICK_TIMEOUT });
      await page.waitForURL(/\/nutrition-templates$/);
    },
    async readBack(page, _t, typed) {
      // The library lists a template as a group named by it: the typed name was stored.
      await expect(page.getByRole("group", { name: typed, exact: true })).toBeVisible();
    },
  },
  {
    name: "routine editor (/clients/[id]/routine)",
    path: `/clients/${LINA}/routine`,
    async type(page, t) {
      const field = page.getByLabel(t.routine.planNameLabel, { exact: true });
      await field.fill("Prehydration plan");
      return { field, value: "Prehydration plan" };
    },
    async holdsTheEdit(page, t) {
      await expect(page.getByText(t.routine.unsavedBadge, { exact: true }).first()).toBeVisible();
    },
    async save(page, t) {
      await page.getByRole("button", { name: t.routine.saveDraft, exact: true }).click({ timeout: CLICK_TIMEOUT });
      await expect(page.getByText(t.routine.unsavedBadge, { exact: true })).toHaveCount(0);
    },
  },
  {
    name: "progress goal (/clients/[id])",
    path: `/clients/${LINA}`,
    async type(page, t) {
      const field = page.getByLabel(t.progressGoal.milestoneLabel);
      await field.fill("70");
      return { field, value: "70" };
    },
    async holdsTheEdit() {},
    async save(page, t) {
      const block = page.getByRole("region", { name: t.progressGoal.title });
      await block.getByRole("button", { name: t.progressGoal.save, exact: true }).click({ timeout: CLICK_TIMEOUT });
      await expect(block.getByRole("status")).toHaveText(t.progressGoal.saved);
    },
  },
];

async function run(c: EditorCase, engine: Engine, lang: Lang, width: number, baseURL: string | undefined) {
  const t = COPY[lang];
  const page = await openPage(engine, lang, width, baseURL);
  try {
    const hold = await holdHydration(page);
    await page.goto(c.path, { waitUntil: "domcontentloaded" });
    const { field, value, also = [] } = await c.type(page, t);
    for (const typed of [{ field, value }, ...also]) {
      await expectServerHtml(typed.field, `${c.name}: a field`);
      await expect(typed.field).toHaveValue(typed.value);
    }
    expect(await hold.release(), "JS chunks held until the form was typed into").toBeGreaterThan(0);

    for (const typed of [{ field, value }, ...also]) {
      await expectStateHoldsWhatIsShown(typed.field, c.name);
      await expect(typed.field).toHaveValue(typed.value);
    }
    await c.holdsTheEdit(page, t);
    await c.save(page, t);
    if (c.readBack) {
      await c.readBack(page, t, value);
    } else {
      await page.reload();
      for (const typed of [{ field, value }, ...also]) await expect(typed.field).toHaveValue(typed.value);
    }
  } finally {
    await page.context().close();
  }
}

for (const c of CASES) {
  test.describe(c.name, () => {
    for (const engine of Object.keys(ENGINES) as Engine[]) {
      for (const lang of LANGS) {
        for (const width of WIDTHS) {
          test(`${engine} · ${lang} · ${width} px: typed before hydration, saved as typed`, async ({ baseURL }) => {
            await run(c, engine, lang, width, baseURL);
          });
        }
      }
    }
  });
}

/**
 * EV-344.4 — "a value typed into the card before hydration is kept". The plan-settings card
 * is folded below 1280 px (`display: none` until the coach opens it, which needs React), so
 * before hydration it can only be typed into from 1280 px. Typed there, saved, read back; then
 * at 1024 px the FOLDED line prints what was typed, so an edit made in the card is never
 * invisible behind the fold.
 */
const ROUTINE_SETTINGS: EditorCase = {
  name: "routine plan settings, EV-344.4 (/clients/[id]/routine)",
  path: `/clients/${LINA}/routine`,
  async type(page, t) {
    const field = page.getByLabel(t.templates.minutesLabel, { exact: true });
    await field.fill("52");
    return { field, value: "52" };
  },
  async holdsTheEdit(page, t) {
    await expect(page.getByText(t.routine.unsavedBadge, { exact: true }).first()).toBeVisible();
  },
  async save(page, t) {
    await page.getByRole("button", { name: t.routine.saveDraft, exact: true }).click({ timeout: CLICK_TIMEOUT });
    await expect(page.getByText(t.routine.unsavedBadge, { exact: true })).toHaveCount(0);
  },
  async readBack(page, t, typed) {
    await page.reload();
    await expect(page.getByLabel(t.templates.minutesLabel, { exact: true })).toHaveValue(typed);
    await page.setViewportSize({ width: 1024, height: 800 });
    const line = page.locator(".plan-settings-text");
    await expect(line).toBeVisible();
    await expect(line).toHaveText(new RegExp(`· ${typed}\u00a0min$`));
  },
};

test.describe(ROUTINE_SETTINGS.name, () => {
  for (const engine of Object.keys(ENGINES) as Engine[]) {
    for (const lang of LANGS) {
      test(`${engine} · ${lang} · 1440 px: typed before hydration, saved as typed, shown on the folded line at 1024`, async ({
        baseURL,
      }) => {
        await run(ROUTINE_SETTINGS, engine, lang, 1440, baseURL);
      });
    }
  }
});

/**
 * EV-337g1 G1.2 — the daily targets (`/clients/[id]/nutrition`) left `CASES`. Their form is
 * closed on load and opened by « Modifier les objectifs », so its fields are not in the
 * server HTML any more and there is nothing to type into before hydration: the answer the
 * sweep records for the dialog forms (`prehydration-sweep.spec.ts`). This pins that answer
 * instead, and keeps the case's last half: a value typed once the form is open is saved.
 */
test.describe("daily targets (/clients/[id]/nutrition), EV-337g1: no field before hydration", () => {
  for (const engine of Object.keys(ENGINES) as Engine[]) {
    for (const lang of LANGS) {
      for (const width of WIDTHS) {
        test(`${engine} · ${lang} · ${width} px: no targets field in the server HTML, the opener opens nothing early, typed after it opens is saved`, async ({
          baseURL,
        }) => {
          const t = COPY[lang];
          const page = await openPage(engine, lang, width, baseURL);
          try {
            const hold = await holdHydration(page);
            await page.goto(`/clients/${LINA}/nutrition`, { waitUntil: "domcontentloaded" });
            const region = page.getByRole("region", { name: t.nutrition.targetsTitle, exact: true });
            const calories = region.getByRole("textbox", { name: t.nutrition.calories, exact: true });
            const opener = region.getByRole("button", { name: t.nutrition.editTargets, exact: true });
            await expect(opener, "the server HTML draws the opener").toBeVisible();
            await expect(region.getByRole("textbox"), "no targets field in the server HTML").toHaveCount(0);
            await opener.click();
            await expect(region.getByRole("textbox"), "the opener opens nothing before hydration").toHaveCount(0);
            expect(await hold.release(), "JS chunks held until the opener was pressed").toBeGreaterThan(0);

            await expect(async () => {
              if ((await calories.count()) === 0) await opener.click({ timeout: 2_000 });
              await expect(calories).toBeVisible({ timeout: 1_000 });
            }).toPass({ timeout: 30_000 });
            await calories.fill("2100");
            await region.getByRole("button", { name: t.nutrition.saveTargets, exact: true }).click({ timeout: CLICK_TIMEOUT });
            const dialog = page.getByRole("dialog", { name: t.nutrition.saveTargetsTitle });
            await dialog.getByRole("button", { name: t.nutrition.saveTargets, exact: true }).click({ timeout: CLICK_TIMEOUT });
            await expect(page.getByText(t.nutrition.targetsSaved, { exact: true })).toBeVisible();
            await page.reload();
            await expect(async () => {
              if ((await calories.count()) === 0) await opener.click({ timeout: 2_000 });
              await expect(calories).toBeVisible({ timeout: 1_000 });
            }).toPass({ timeout: 30_000 });
            await expect(calories).toHaveValue("2100");
          } finally {
            await page.context().close();
          }
        });
      }
    }
  }
});
