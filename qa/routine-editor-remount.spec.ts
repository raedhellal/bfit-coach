import { expect, type Locator, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";

/**
 * `fix/routine-editor-load-saved-remount` — two follow-ups from staff's re-review of
 * `fix/recipes-and-editor-polish` (69618e8), both about BUG-490's stash: the seconds an
 * `ExerciseRow` keeps when its exercise is switched to « Charge et répétitions ». The stash
 * lives in the ROW, so it must be dropped whenever the exercise under that row might change.
 *
 *   (E) A document REPLACED from the server — « Load the saved version », Discard, the
 *       re-seed after a publish — kept every row mounted. A row keyed by name + position then held another
 *       exercise's stash: the Plank the other tab moved into day 2's slot came back
 *       with day 2's 45 s. `RoutineEditor` now keys `RoutineDocumentEditor` on a load
 *       counter, so a replaced document remounts every row.
 *   (R) The Remove bump (`onRemove` → `reshaped()`) had no test of its own: staff S1's
 *       (C) covers Remove DAY, and (A) covers Move.
 *
 * Every test here is red with its fix removed: Load and Discard on 69618e8, and (R) with
 * only `reshaped()` taken out of `onRemove`, each at its LAST assertion (« Seconds »
 * shows 45). Publish, with only the re-seed effect's `replaced()` taken out, is red at
 * its remount wait: without the bump the row is never remounted.
 *
 * Sentences are LITERALS, never imported from `src/lib/copy.ts`.
 */

const PASSWORD = "Password123!";
/** Three published days with 4 / 3 / 3 exercises, no draft. */
const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";

async function signIn(page: Page) {
  await signInThroughForm(page, { email: "coach@evoli.fit", password: PASSWORD });
}

function group(page: Page, name: string): Locator {
  return page.getByRole("group", { name, exact: true });
}

async function addTo(page: Page, dayIndex: number, name: string) {
  await page.getByRole("button", { name: "Add exercise" }).nth(dayIndex).click();
  const picker = page.getByRole("dialog");
  await picker.getByLabel("Search the catalog").fill(name);
  await picker.getByRole("button", { name: new RegExp(`^${name}`) }).click();
  await expect(picker.getByText(`Added ${name}.`)).toBeVisible();
  await picker.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

async function saveDraft(page: Page) {
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText(/^Draft saved /)).toBeVisible();
}

test.describe("(E) a document replaced from the server remounts the rows; no stash lands on another exercise", () => {
  test("« Load the saved version »: the Plank tab B moved into day 2's slot is not given day 2's 45", async ({
    page,
    context,
  }) => {
    // 1. Tab A: a Plank at the END of day 2 (45 s) and of day 3 (20 s). Days 2 and 3 both
    //    have three exercises, so both Planks sit at index 3 of their card.
    await signIn(page);
    await page.goto(`/clients/${LINA}/routine`);
    await expect(page.getByText("Published plan")).toBeVisible();
    await addTo(page, 1, "Plank");
    await addTo(page, 2, "Plank");
    const planksA = group(page, "Plank");
    await expect(planksA).toHaveCount(2);
    await planksA.nth(0).getByLabel("Seconds").fill("45");
    await planksA.nth(1).getByLabel("Seconds").fill("20");
    await saveDraft(page);

    // 2. Tab B opens the same draft: day 3's Plank → Charge, day 2 removed, saved. Day 3's
    //    Plank now sits in day 2's card at day 2's Plank's index.
    const other = await context.newPage();
    await other.goto(`/clients/${LINA}/routine`);
    await expect(other.getByText("Draft — not yet published")).toBeVisible();
    const planksB = group(other, "Plank");
    await expect(planksB).toHaveCount(2);
    await expect(planksB.nth(1).getByLabel("Seconds")).toHaveValue("20");
    await planksB.nth(1).getByLabel("Tracked as").selectOption("WEIGHT_REPS");
    await other.getByRole("button", { name: /^Remove day/ }).nth(1).click();
    await expect(other.getByRole("button", { name: "Add exercise" })).toHaveCount(2);
    await expect(planksB).toHaveCount(1);
    await saveDraft(other);

    // 3. Tab A: day 2's Plank → Charge (its row stashes 45), Save draft → 409 → Load.
    await planksA.nth(0).getByLabel("Tracked as").selectOption("WEIGHT_REPS");
    await page.getByRole("button", { name: "Save draft" }).click();
    const conflict = page.getByRole("dialog", { name: "This draft changed somewhere else" });
    await expect(conflict).toBeVisible();
    await conflict.getByRole("button", { name: "Load the saved version" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByText("You are looking at the version that was saved elsewhere. Your changes were not saved.")
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Add exercise" })).toHaveCount(2);
    await expect(planksA).toHaveCount(1);
    await expect(planksA.nth(0).getByLabel("Tracked as")).toHaveValue("WEIGHT_REPS");

    // 4. The remaining Plank is day 3's, saved in Charge with no seconds: back to Durée is
    //    an empty box. 69618e8 showed 45 — tab A's day-2 number, on another exercise.
    await planksA.nth(0).getByLabel("Tracked as").selectOption("DURATION");
    await expect(planksA.nth(0).getByLabel("Seconds")).toHaveValue("");
  });

  test("Discard: the published exercise in the same slot does not get the discarded draft's seconds", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/clients/${LINA}/routine`);
    await expect(page.getByText("Published plan")).toBeVisible();
    const bench = group(page, "Barbell Bench Press");
    await expect(bench).toHaveCount(1);
    await bench.getByLabel("Tracked as").selectOption("DURATION");
    await bench.getByLabel("Seconds").fill("45");
    await bench.getByLabel("Tracked as").selectOption("WEIGHT_REPS");

    await page.getByRole("button", { name: "Discard draft" }).click();
    const dialog = page.getByRole("dialog", { name: "Discard draft?" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Discard draft" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText("Published plan")).toBeVisible();
    await expect(bench.getByLabel("Tracked as")).toHaveValue("WEIGHT_REPS");

    // The published Bench Press has never had seconds. 69618e8 showed the discarded 45.
    await bench.getByLabel("Tracked as").selectOption("DURATION");
    await expect(bench.getByLabel("Seconds")).toHaveValue("");
  });

  test("Publish: the re-seeded plan does not bring back seconds that were never published", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${LINA}/routine`);
    await expect(page.getByText("Published plan")).toBeVisible();
    const bench = group(page, "Barbell Bench Press");
    await bench.getByLabel("Tracked as").selectOption("DURATION");
    await bench.getByLabel("Seconds").fill("45");
    await bench.getByLabel("Tracked as").selectOption("WEIGHT_REPS");
    await bench.getByLabel("Reps").fill("6-8");
    /**
     * The sync point is the REMOUNT, not the notice. Load and Discard replace the document
     * in the same update that shows their cue; Publish does not. « Published. » is set by
     * the action's continuation, and the re-seed runs later, in RoutineEditor's effect,
     * when `router.refresh()` delivers the new `planId`. Staff measured the gap under load:
     * 3 of 33 runs read the old row. So mark this row's DOM node, and wait for a new one.
     */
    await bench.evaluate((el) => {
      (el as HTMLElement & { __old?: number }).__old = 1;
    });

    await page.getByRole("button", { name: "Publish", exact: true }).click();
    const modal = page.getByRole("dialog", { name: "No changes were needed" });
    await expect(modal).toBeVisible();
    await modal.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(page.getByText("Published. The trainee sees it next time they open the app.")).toBeVisible();
    await expect(page.getByText("Published plan")).toBeVisible();
    await expect
      .poll(() => bench.evaluate((el) => !(el as HTMLElement & { __old?: number }).__old))
      .toBe(true);

    // What was published is Weight & reps with no seconds; the editor now shows that plan.
    await bench.getByLabel("Tracked as").selectOption("DURATION");
    await expect(bench.getByLabel("Seconds")).toHaveValue("");
  });
});

test.describe("(R) Remove drops the stash; the next same-named exercise does not inherit it", () => {
  test("two Planks (45 s, 60 s) in one day, both to Charge, the first removed: the remaining one comes back empty", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/templates/new");
    await addTo(page, 0, "Plank");
    await addTo(page, 0, "Plank");
    const planks = group(page, "Plank");
    await expect(planks).toHaveCount(2);
    await planks.nth(0).getByLabel("Seconds").fill("45");
    await planks.nth(1).getByLabel("Seconds").fill("60");
    await planks.nth(0).getByLabel("Tracked as").selectOption("WEIGHT_REPS");
    await planks.nth(1).getByLabel("Tracked as").selectOption("WEIGHT_REPS");

    await planks.nth(0).getByRole("button", { name: "Remove: Plank", exact: true }).click();
    await expect(planks).toHaveCount(1);

    // The removed Plank's row (index 0) would otherwise stay mounted for the one that
    // moved up into it, and bring back 45. Its own 60 is dropped with the re-key too:
    // a Remove drops every stash, it never moves one.
    await planks.nth(0).getByLabel("Tracked as").selectOption("DURATION");
    await expect(planks.nth(0).getByLabel("Seconds")).toHaveValue("");
  });
});
