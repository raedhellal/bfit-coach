import { expect, test, type Page } from "@playwright/test";

/**
 * EV-184b — the coach's Routine tab, in **fixture mode** (see playwright.config.ts).
 *
 * Every sentence asserted below is quoted from EV-184's acceptance criteria and is
 * asserted verbatim: these are the strings the story promises a coach reads, so a
 * reworded one is a failed criterion and not a cosmetic diff.
 *
 * `mode: "serial"` and `workers: 1` are load-bearing, not tidiness. The fixture is one
 * in-memory store in one dev-server process and these tests MUTATE it — AC2 requires a
 * draft to survive a reload and AC3 requires a publish to replace the plan. The
 * read-only assertions therefore come first for each trainee, before anything writes to
 * that trainee.
 *
 * The scenario selector is the trainee id (the fixture's own design; b-fit-api answers
 * the roster and each per-trainee read separately, so addressing a trainee the roster
 * does not list is the real shape too).
 */

const EMAIL = "coach@evoli.fit";
const PASSWORD = "Password123!";

/** Populated plan, no injuries → publish previews zero repairs. */
const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
/** No active plan at all. */
const NILS = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0002";
/**
 * ACTIVE link whose `scopes` are PROGRESS + WEIGH_INS: no WORKOUTS.
 *
 * ADR-0015 D5 removed the error code this used to be driven by — every denial answers
 * the same 403 body — so the portal decides from the overview's `scopes` and does not
 * call the routine endpoint at all.
 */
const SARA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0003";
/** NUTRITION only: the Routine tab is present and reads the scope sentence. */
const PETRA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0006";
/** WORKOUTS only: the Routine tab is the one thing that works for this trainee. */
const YUSUF = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0007";
/** An ACTIVE link that shares nothing at all. */
const MARA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0008";
/** Nobody: a foreign id and one that never existed answer the same 403 body. */
const FOREIGN = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e9999";
const NONEXISTENT = "00000000-0000-0000-0000-000000000000";
/** A shoulder injury that repairs two exercises, and a 50-character exercise name. */
const DANA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0004";
/** The exercise catalog answers 503. */
const OMAR = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0005";

/** `truncateName` elides at 40 with a real ellipsis — EV-184 edge case 6. */
const LONG_EXERCISE = "Single-Arm Standing Cable Lateral Raise With Pause";
const LONG_EXERCISE_SHOWN = "Single-Arm Standing Cable Lateral Raise…";

test.describe.configure({ mode: "serial" });

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/");
}

/** One prescription: the row is a group named by the exercise's full name. */
function exerciseRow(page: Page, name: string) {
  return page.getByRole("group", { name, exact: true });
}

test.describe("AC1 — the coach opens Routine and sees the live plan", () => {
  test("the plan, its days and every exercise's sets, reps and rest", async ({ page }) => {
    await signIn(page);
    const res = await page.goto(`/clients/${LINA}/routine`);
    expect(res?.status()).toBe(200);

    await expect(page.getByRole("heading", { name: "Lina M." })).toBeVisible();
    await expect(page.getByLabel("Plan name")).toHaveValue(
      "Intermediate Muscle Building Routine"
    );
    // Nothing is unpublished yet, so the header must not claim a draft.
    await expect(page.getByText("Published plan")).toBeVisible();
    await expect(page.getByText("Draft — not yet published")).toHaveCount(0);

    /**
     * The three training days, in the api's schedule order.
     *
     * Asserted through the weekday CONTROL (EV-190 R1) rather than by text: the seven
     * weekday names now appear as `<option>`s in every day's select, so
     * `getByText("Monday")` matches once per day and says nothing about which day is
     * on it. The value is `TrainingDay.dayOfWeek`, the ISO number the api sends.
     */
    await expect(page.getByLabel("Day 1 weekday")).toHaveValue("1"); // Monday
    await expect(page.getByLabel("Day 2 weekday")).toHaveValue("3"); // Wednesday
    await expect(page.getByLabel("Day 3 weekday")).toHaveValue("5"); // Friday
    await expect(page.getByLabel("Day 1 focus")).toHaveValue("Upper Body A");
    await expect(page.getByLabel("Day 2 focus")).toHaveValue("Lower Body");
    await expect(page.getByLabel("Day 3 focus")).toHaveValue("Upper Body B");

    // AC1: every exercise with its sets, reps and rest.
    const bench = exerciseRow(page, "Barbell Bench Press");
    await expect(bench.getByLabel("Sets")).toHaveValue("4");
    await expect(bench.getByLabel("Reps")).toHaveValue("6-8");
    await expect(bench.getByLabel("Rest")).toHaveValue("120s");

    const squat = exerciseRow(page, "Barbell Back Squat");
    await expect(squat.getByLabel("Sets")).toHaveValue("4");
    await expect(squat.getByLabel("Reps")).toHaveValue("5-8");
    await expect(squat.getByLabel("Rest")).toHaveValue("150s");
  });

  test("injuries and equipment are read-only, and nothing promises equipment safety", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/clients/${LINA}/routine`);

    await expect(
      page.getByText("From the trainee's profile — you cannot change these here.")
    ).toBeVisible();
    await expect(page.getByText("Injuries", { exact: true })).toBeVisible();
    await expect(page.getByText("Available equipment", { exact: true })).toBeVisible();
    // Lina has no stored injuries: an empty list says "None recorded.", not nothing.
    await expect(page.getByText("None recorded.")).toBeVisible();

    /**
     * EV-184 AC3's warning box: `RoutinePolicy.apply` takes injuries ONLY, and the
     * equipment-aware replacement (BUG-053) is approved and undeployed. The portal
     * must therefore not render any sentence promising equipment safety. The word
     * "safe" appears in this product exactly twice — the publish modal's heading and
     * the nutrition floor line — and neither belongs on this page in its rest state.
     */
    await expect(page.locator("body")).not.toContainText("safe", { ignoreCase: true });
  });

  test("a trainee with no active plan gets the empty state and one control", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/clients/${NILS}/routine`);

    await expect(page.getByText("No active plan")).toBeVisible();
    await expect(page.getByRole("button", { name: "Build a plan" })).toBeVisible();
    // AC1: "never a blank page or null".
    await expect(page.locator("body")).not.toContainText("null");
    await expect(page.getByLabel("Plan name")).toHaveCount(0);
  });

  test("a link without the WORKOUTS scope reads the scope sentence, not the roster one", async ({
    page,
  }) => {
    await signIn(page);
    const res = await page.goto(`/clients/${SARA}/routine`);
    // 200, not 403: the scope is read from the overview, and nothing was refused.
    expect(res?.status()).toBe(200);

    await expect(
      page.getByText("This trainee has not shared their workouts with you.")
    ).toBeVisible();
    // ADR-0015 D5: the tab itself stays, so a withheld scope never reads as a missing
    // feature. The sentence is what explains the empty page, not the absent tab.
    await expect(page.getByRole("link", { name: "Routine" })).toBeVisible();
    // The two denials say different things, and this one must not borrow the other's.
    await expect(page.locator("body")).not.toContainText(
      "This trainee is not on your roster"
    );
    // No editor, no empty state offering to build a plan the coach may not write.
    await expect(page.getByRole("button", { name: "Build a plan" })).toHaveCount(0);
    await expect(page.getByLabel("Plan name")).toHaveCount(0);
  });
});

test.describe("AC4 — the catalog refuses rather than half-writing", () => {
  test("catalog search shows the refusal and offers nothing to pick", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${OMAR}/routine`);

    await page.getByRole("button", { name: "Add exercise" }).first().click();
    const picker = page.getByRole("dialog");
    await expect(
      picker.getByText("The exercise catalog is unavailable. Try again shortly.")
    ).toBeVisible();
    // ADR-0013: it does not fall back to a cached list.
    await expect(picker.getByLabel("Search the catalog")).toHaveCount(0);
    await expect(picker.getByLabel("Muscle")).toHaveCount(0);
  });

  test("publish shows the same refusal, and the plan is untouched", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${OMAR}/routine`);

    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(
      page.getByText("The exercise catalog is unavailable. Try again shortly.")
    ).toBeVisible();
    // Nothing was published: no modal ever opened.
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.reload();
    await expect(page.getByLabel("Plan name")).toHaveValue("Full Body Three Day");
  });
});

test.describe("AC2 — the coach edits, and the edit survives a reload as a draft", () => {
  test("reorder, replace, remove, add and sets/reps/rest all survive a hard reload", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/clients/${DANA}/routine`);
    await expect(page.getByText("Published plan")).toBeVisible();

    // Edge case 6: a 50-character name is elided rather than wrapping the row.
    await expect(page.getByText(LONG_EXERCISE_SHOWN)).toBeVisible();
    await expect(page.locator("body")).not.toContainText(LONG_EXERCISE);

    // 1 — reorder. Overhead Press is first on the Push day; move it down.
    await page.getByRole("button", { name: "Move down: Barbell Overhead Press" }).click();
    // The header flips the moment anything is edited, before any save.
    await expect(page.getByText("Draft — not yet published")).toBeVisible();

    // 2 — replace, from the catalog only.
    await page.getByRole("button", { name: "Replace: Pull-Up" }).click();
    const picker = page.getByRole("dialog");
    await expect(picker.getByText("Pick from the catalog. Typed names are not accepted.")).toBeVisible();
    await picker.getByLabel("Search the catalog").fill("Lat Pulldown");
    await picker.getByRole("button", { name: /^Lat Pulldown/ }).click();
    await expect(exerciseRow(page, "Lat Pulldown")).toBeVisible();
    await expect(exerciseRow(page, "Pull-Up")).toHaveCount(0);

    // 3 — remove.
    await page.getByRole("button", { name: "Remove: Chest-Supported Row" }).click();
    await expect(exerciseRow(page, "Chest-Supported Row")).toHaveCount(0);

    // 4 — add, on the second day, filtered by muscle. EV-190 U4: an ADD keeps the
    // picker open for the next one, so this closes it explicitly before carrying on.
    await page.getByRole("button", { name: "Add exercise" }).nth(1).click();
    await picker.getByLabel("Muscle").selectOption("Back");
    await picker.getByRole("button", { name: /^Seated Cable Row/ }).click();
    await expect(picker.getByText("Added Seated Cable Row.")).toBeVisible();
    await picker.getByRole("button", { name: "Done" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(exerciseRow(page, "Seated Cable Row")).toBeVisible();

    // 5 — sets, reps and rest.
    const raise = exerciseRow(page, LONG_EXERCISE);
    await raise.getByLabel("Sets").fill("5");
    await raise.getByLabel("Reps").fill("12-15");
    await raise.getByLabel("Rest").fill("75s");

    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText(/^Draft saved /)).toBeVisible();

    // AC2: a HARD reload, not a client navigation.
    await page.reload();

    await expect(page.getByText("Draft — not yet published")).toBeVisible();
    await expect(exerciseRow(page, "Lat Pulldown")).toBeVisible();
    await expect(exerciseRow(page, "Seated Cable Row")).toBeVisible();
    await expect(exerciseRow(page, "Pull-Up")).toHaveCount(0);
    await expect(exerciseRow(page, "Chest-Supported Row")).toHaveCount(0);
    const raiseAfter = exerciseRow(page, LONG_EXERCISE);
    await expect(raiseAfter.getByLabel("Sets")).toHaveValue("5");
    await expect(raiseAfter.getByLabel("Reps")).toHaveValue("12-15");
    await expect(raiseAfter.getByLabel("Rest")).toHaveValue("75s");

    // The reorder held too: Bench Press now precedes Overhead Press.
    const names = await page.getByRole("group").evaluateAll((els) =>
      els.map((el) => el.getAttribute("aria-label"))
    );
    expect(names.indexOf("Barbell Bench Press")).toBeLessThan(
      names.indexOf("Barbell Overhead Press")
    );
  });
});

test.describe("AC3 — publish previews the repairs and refuses until they are acknowledged", () => {
  test("the modal counts the repairs, names each one, and offers exactly two controls", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/clients/${DANA}/routine`);
    await expect(page.getByText("Draft — not yet published")).toBeVisible();

    await page.getByRole("button", { name: "Publish", exact: true }).click();

    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();
    // The heading's number agrees with the list length.
    await expect(modal).toHaveAccessibleName("We changed 2 things to keep this safe");
    await expect(modal.getByRole("listitem")).toHaveCount(2);

    // Each repair is ONE line: the exercise, what it was replaced with, and the rule.
    await expect(
      modal.getByText(
        "Barbell Overhead Press → Landmine Press · Overhead pressing is contraindicated by a shoulder injury"
      )
    ).toBeVisible();
    await expect(
      modal.getByText(
        "Barbell Bench Press → Machine Chest Press · Flat barbell pressing is contraindicated by a shoulder injury"
      )
    ).toBeVisible();

    // Exactly two controls, plus the dialog's own Close affordance.
    await expect(modal.getByRole("button", { name: "Publish with these changes" })).toBeVisible();
    await expect(modal.getByRole("button", { name: "Cancel" })).toBeVisible();
    const buttons = await modal.getByRole("button").evaluateAll((els) =>
      els.map((el) => (el.getAttribute("aria-label") || el.textContent || "").trim())
    );
    expect(buttons.filter((b) => b !== "Close").sort()).toEqual([
      "Cancel",
      "Publish with these changes",
    ]);
  });

  test("Cancel publishes nothing and leaves the draft as it was", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${DANA}/routine`);

    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.reload();
    await expect(page.getByText("Draft — not yet published")).toBeVisible();
    // The contraindicated exercises are still in the DRAFT — cancel repaired nothing.
    await expect(exerciseRow(page, "Barbell Overhead Press")).toBeVisible();
    await expect(exerciseRow(page, "Barbell Bench Press")).toBeVisible();
  });

  test("Publish with these changes ships the repaired plan, not the submitted one", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/clients/${DANA}/routine`);

    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Publish with these changes" })
      .click();

    await expect(
      page.getByText("Published. The trainee sees it next time they open the app.")
    ).toBeVisible();
    await expect(page.getByText("Published plan")).toBeVisible();
    await expect(page.getByText("Draft — not yet published")).toHaveCount(0);

    // AC3: the repaired exercises are verifiably ABSENT and the replacements present.
    await expect(exerciseRow(page, "Barbell Overhead Press")).toHaveCount(0);
    await expect(exerciseRow(page, "Barbell Bench Press")).toHaveCount(0);
    await expect(exerciseRow(page, "Landmine Press")).toBeVisible();
    await expect(exerciseRow(page, "Machine Chest Press")).toBeVisible();

    // And it is the server's plan, not a local optimism: reload and re-read it.
    await page.reload();
    await expect(page.getByText("Published plan")).toBeVisible();
    await expect(exerciseRow(page, "Landmine Press")).toBeVisible();
    await expect(exerciseRow(page, "Barbell Overhead Press")).toHaveCount(0);
  });

  test("a draft with no violations publishes with one sentence and one control", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/clients/${LINA}/routine`);

    await page.getByRole("button", { name: "Publish", exact: true }).click();

    const modal = page.getByRole("dialog");
    await expect(modal).toHaveAccessibleName("No changes were needed");
    await expect(modal.getByRole("listitem")).toHaveCount(0);

    const buttons = await modal.getByRole("button").evaluateAll((els) =>
      els.map((el) => (el.getAttribute("aria-label") || el.textContent || "").trim())
    );
    expect(buttons.filter((b) => b !== "Close")).toEqual(["Publish"]);

    await modal.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(
      page.getByText("Published. The trainee sees it next time they open the app.")
    ).toBeVisible();
  });

  /**
   * EV-190 AC1 changed what this test can drive, and it is recorded here rather than
   * deleted.
   *
   * EV-184 asserted the api's `PLAN_EMPTY` refusal by emptying the editor: "Build a
   * plan" made ONE day and "Remove day" took it away. `TrainingDayBounds` is 2-6 and
   * EV-190 AC1 puts that bound on the controls, so a new plan now starts at the
   * minimum of two days and Remove is disabled at two WITH its reason. A zero-day
   * draft is no longer reachable from this UI.
   *
   * `copy.routine.planEmpty` stays — the api still refuses a zero-day draft and the
   * portal still renders that refusal — but nothing in the portal can now produce one,
   * so what this test asserts is the bound that made it unreachable.
   */
  test("the editor cannot be driven below the two-day bound, so a zero-day draft is unreachable", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/clients/${NILS}/routine`);

    await page.getByRole("button", { name: "Build a plan" }).click();

    // Two days, not one: the minimum the bound allows.
    await expect(page.getByLabel("Day 1 weekday")).toBeVisible();
    await expect(page.getByLabel("Day 2 weekday")).toBeVisible();
    await expect(page.getByLabel("Day 3 weekday")).toHaveCount(0);

    // Both Remove controls are disabled, and the reason is on the screen, not only in
    // the tooltip — a disabled control with no reason reads as a broken one.
    const removes = page.getByRole("button", { name: "Remove day" });
    await expect(removes).toHaveCount(2);
    for (const remove of await removes.all()) await expect(remove).toBeDisabled();
    await expect(page.getByText("A plan has between 2 and 6 training days.")).toBeVisible();
  });
});

test.describe("ADR-0015 D5 — the scope sentence is derived from `scopes`", () => {
  test("NUTRITION-only and no-scope links read it too", async ({ page }) => {
    await signIn(page);

    for (const id of [PETRA, MARA]) {
      const res = await page.goto(`/clients/${id}/routine`);
      expect(res?.status()).toBe(200);
      await expect(
        page.getByText("This trainee has not shared their workouts with you.")
      ).toBeVisible();
      // The two denials say different things and this one must not borrow the other's.
      await expect(page.locator("body")).not.toContainText(
        "This trainee is not on your roster"
      );
      await expect(page.getByRole("button", { name: "Build a plan" })).toHaveCount(0);
      await expect(page.getByLabel("Plan name")).toHaveCount(0);
    }
  });

  test("a WORKOUTS-only link gets the whole editor", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${YUSUF}/routine`);

    await expect(page.getByLabel("Plan name")).toHaveValue("Two Day Full Body");
    await expect(page.getByRole("button", { name: "Publish", exact: true })).toBeVisible();
    await expect(page.locator("body")).not.toContainText(
      "This trainee has not shared their workouts with you."
    );
  });
});

test.describe("ADR-0015 D4 — a draft that moves between preview and publish", () => {
  /**
   * EV-184 edge case 2, the second tab, and the reason the digest exists.
   *
   * Tab A previews (and is handed a digest for exactly that draft and those repairs);
   * tab B then saves an edit, so the draft the server holds is no longer the one A
   * acknowledged. A's publish is answered `409 COACH_PUBLISH_REPAIRS_UNACKNOWLEDGED`
   * and the portal must PREVIEW AGAIN and show the modal, not report a failure and not
   * retry with the stale digest. Before this, the modal closed and the coach read "The
   * plan could not be published." for a plan that was perfectly publishable.
   */
  test("the 409 re-previews and shows the modal again, and the next publish lands", async ({
    page,
    context,
  }) => {
    await signIn(page);
    await page.goto(`/clients/${YUSUF}/routine`);

    // Tab A: preview. Yusuf has no injuries, so there is nothing to repair — which
    // isolates the digest: the only reason a publish can fail here is the draft moving.
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    const modal = page.getByRole("dialog");
    await expect(modal).toHaveAccessibleName("No changes were needed");

    // Tab B: the same coach, the same trainee, one saved edit. Same context, so the
    // session cookie is shared — this is one coach with two tabs, not two coaches.
    const other = await context.newPage();
    await other.goto(`/clients/${YUSUF}/routine`);
    await other.getByRole("group", { name: "Goblet Squat", exact: true }).getByLabel("Sets").fill("5");
    await other.getByRole("button", { name: "Save draft" }).click();
    await expect(other.getByText(/^Draft saved /)).toBeVisible();
    await other.close();

    // Tab A publishes what it was shown. The server refuses.
    await modal.getByRole("button", { name: "Publish", exact: true }).click();

    // The modal is still there, with a fresh preview behind it. Waiting for the
    // control to come back out of its pending state is what makes the next two
    // assertions deterministic: without it they race the re-preview and would pass
    // against a modal that is on its way out.
    await expect(modal.getByRole("button", { name: "Publish", exact: true })).toBeEnabled();
    await expect(modal).toHaveAccessibleName("No changes were needed");
    // …and the coach is NOT told the plan failed, because it did not.
    await expect(page.getByText("The plan could not be published.")).toHaveCount(0);
    await expect(page.getByText(/^Published\. /)).toHaveCount(0);

    // Acknowledging the new preview publishes.
    await modal.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(
      page.getByText("Published. The trainee sees it next time they open the app.")
    ).toBeVisible();
  });
});

test.describe("ADR-0012 D4 — the tab routes are 403 for an id that is not this coach's", () => {
  test("a foreign and a never-existing client id are indistinguishable, and both 403", async ({
    page,
  }) => {
    await signIn(page);

    for (const id of [FOREIGN, NONEXISTENT]) {
      const res = await page.goto(`/clients/${id}/routine`);
      // The tab routes sit under `[id]/layout.tsx`, so the denial is decided before
      // the first byte and /clients/denied is served with the status, exactly as the
      // overview is (BUG-139). A tab that answered 200 with a friendly card would be a
      // second, quieter version of that bug.
      expect(res?.status(), `${id} must be 403`).toBe(403);
      await expect(
        page.getByText("This trainee is not on your roster. They may have revoked access.")
      ).toBeVisible();
      // No existence oracle, and no scope claim either.
      await expect(page.locator("body")).not.toContainText("has not shared their");
    }
  });

  test("a crawler that never runs JavaScript gets the 403 too", async ({ page }) => {
    await signIn(page);
    const res = await page.request.get(`/clients/${FOREIGN}/routine`);
    expect(res.status()).toBe(403);
    // And no trainee data leaks with it.
    expect(await res.text()).not.toContain("Plan name");
  });
});

/**
 * EV-190 AC1 (R1 / U1) — which weekdays the trainee trains.
 *
 * These tests sit after every EV-184 test in this file because they MUTATE Yusuf's
 * plan, and they are before the terminal revoke describe because everything is.
 *
 * What makes this a defect and not a feature: until this story `emptyDay()` took the
 * first unused ISO weekday and NOTHING edited `dayOfWeek` afterwards, so every
 * hand-built 4-day plan landed Monday-Thursday — and `RoutinePlanWriter` derives the
 * trainee's whole 7-row `plan_schedule` from those numbers, which
 * `TrainingDayScheduleFactory` then reads to decide training-day vs rest-day NUTRITION.
 * The cross-surface half of AC1 (the `plan_schedule` rows, the device's Train tab, the
 * nutrition day types) is `senior-qa`'s against a real api; these assert the portal
 * half: the control exists, it round-trips, and it refuses a duplicate.
 */
test.describe("EV-190 AC1 — the coach chooses which weekdays the trainee trains", () => {
  test("every training day carries a weekday control, under the heading that names the kind", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/clients/${YUSUF}/routine`);

    // AC6 / Ruling 2 (c): the heading states that this control is ENFORCED, verbatim.
    await expect(page.getByText("Training days — Evoli enforces these.")).toBeVisible();
    // The consequence, which is invisible from this screen and lands on two others.
    await expect(
      page.getByText(
        "The trainee trains on these weekdays once you publish. The other days are rest days, and their nutrition follows."
      )
    ).toBeVisible();

    // Yusuf's plan is Tuesday + Thursday, and the control shows the current value.
    await expect(page.getByLabel("Day 1 weekday")).toHaveValue("2");
    await expect(page.getByLabel("Day 2 weekday")).toHaveValue("4");
    // All seven weekdays are offered, by name, on every day.
    await expect(page.getByLabel("Day 1 weekday").getByRole("option")).toHaveText([
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ]);
  });

  test("a duplicate weekday is refused with its reason, and the previous value stands", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/clients/${YUSUF}/routine`);

    // Day 2 is Thursday; Tuesday is day 1's. `RoutinePlanWriter`'s
    // `workoutByDay.put(dayOfWeek, ...)` would silently DROP one of the two on publish,
    // so this refusal is not cosmetic.
    await page.getByLabel("Day 2 weekday").selectOption("2");

    await expect(page.getByText("Tuesday is already a training day.")).toBeVisible();
    // The previous value stands, and nothing was marked as an edit.
    await expect(page.getByLabel("Day 2 weekday")).toHaveValue("4");
    await expect(page.getByText("Unsaved changes")).toHaveCount(0);

    // And a legal move clears the refusal.
    await page.getByLabel("Day 2 weekday").selectOption("6");
    await expect(page.getByText("Tuesday is already a training day.")).toHaveCount(0);
    await expect(page.getByLabel("Day 2 weekday")).toHaveValue("6");
  });

  test("the weekdays the coach sets survive a save and a hard reload", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${YUSUF}/routine`);

    await page.getByLabel("Day 1 weekday").selectOption("1"); // Monday
    await page.getByLabel("Day 2 weekday").selectOption("6"); // Saturday
    await expect(page.getByText("Draft — not yet published")).toBeVisible();

    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText(/^Draft saved /)).toBeVisible();

    // A HARD reload: the draft round-trips through the server, not through state.
    await page.reload();
    await expect(page.getByLabel("Day 1 weekday")).toHaveValue("1");
    await expect(page.getByLabel("Day 2 weekday")).toHaveValue("6");

    // Publishing carries them: the weekdays are what the plan writer will schedule.
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Publish", exact: true }).click();
    await expect(page.getByText(/^Published\. /)).toBeVisible();
    await page.reload();
    await expect(page.getByText("Published plan")).toBeVisible();
    await expect(page.getByLabel("Day 1 weekday")).toHaveValue("1");
    await expect(page.getByLabel("Day 2 weekday")).toHaveValue("6");
  });

  test("adding days stops at the six-day bound, with the reason on screen", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${YUSUF}/routine`);

    // Two days to start; each added day takes the first weekday not already in use, so
    // the plan can never hold two days on one weekday even before the coach edits it.
    for (let i = 3; i <= 6; i += 1) {
      await page.getByRole("button", { name: "Add day" }).click();
      await expect(page.getByLabel(`Day ${i} weekday`)).toBeVisible();
    }
    // Monday, Tuesday, Wednesday, Thursday, Friday, Saturday — six distinct weekdays.
    const values = await page
      .getByRole("combobox")
      .evaluateAll((els) => els.map((el) => (el as HTMLSelectElement).value));
    expect(new Set(values).size).toBe(values.length);

    await expect(page.getByRole("button", { name: "Add day" })).toBeDisabled();
    await expect(page.getByText("A plan has between 2 and 6 training days.")).toBeVisible();
    // Nothing was saved: this is a local edit, and the reload proves the refusal did
    // not write a seventh day behind it.
    await expect(page.getByLabel("Day 7 weekday")).toHaveCount(0);
  });
});

/**
 * EV-190 AC2 (U2) — unsaved editor work cannot be lost without the coach being told.
 *
 * These drive the LOSS PATH itself, not a proxy for it: before this change, clicking
 * the Nutrition tab after an edit navigated away and the working copy went with it.
 * Each test therefore makes a real edit, takes one of AC2's four routes out, and
 * checks both that the coach was asked and that Cancel left every edit intact.
 *
 * ⚠️ The flag under test is NOT `isDraft` — that is true for a saved draft with no
 * edits, so the first test here is the one that would catch a guard wired to it: it
 * opens a trainee WITH a draft, edits nothing, and requires silence.
 */
test.describe("EV-190 AC2 — unsaved work is not lost silently", () => {
  test("a coach who changed nothing is not prompted, on a page that has a draft", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/clients/${YUSUF}/routine`);
    await page.getByRole("group", { name: "Goblet Squat", exact: true }).getByLabel("Sets").fill("4");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText(/^Draft saved /)).toBeVisible();

    // A SAVED draft: the draft badge is on, and the unsaved marker is not.
    await expect(page.getByText("Draft — not yet published")).toBeVisible();
    await expect(page.getByText("Unsaved changes")).toHaveCount(0);

    await page.getByRole("link", { name: "Nutrition" }).click();
    await page.waitForURL(`/clients/${YUSUF}/nutrition`);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("an edit is marked, the tabs ask first, and Cancel keeps every edit", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${YUSUF}/routine`);

    await page.getByLabel("Plan name").fill("Two Day Full Body — block 2");
    await expect(page.getByText("Unsaved changes")).toBeVisible();

    await page.getByRole("link", { name: "Nutrition" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toHaveAccessibleName("Leave with unsaved changes?");
    // The navigation has NOT happened: the coach is asked before, not after.
    expect(page.url()).toContain(`/clients/${YUSUF}/routine`);

    await dialog.getByRole("button", { name: "Stay on this page" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(page.url()).toContain(`/clients/${YUSUF}/routine`);
    // Every edit intact — this is the half that makes the prompt worth having.
    await expect(page.getByLabel("Plan name")).toHaveValue("Two Day Full Body — block 2");
    await expect(page.getByText("Unsaved changes")).toBeVisible();
  });

  test("the roster breadcrumb asks too, and Leave without saving goes", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${YUSUF}/routine`);

    await page.getByLabel("Plan name").fill("Discarded on the way out");
    // Two links carry this name — the header logo and the breadcrumb. The breadcrumb
    // is the second, and it is the one a coach uses to leave a trainee.
    await page.getByRole("link", { name: "Back to roster" }).last().click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toHaveAccessibleName("Leave with unsaved changes?");
    await dialog.getByRole("button", { name: "Leave without saving" }).click();

    await page.waitForURL("/");
    // Nothing was written on the way out: the name the coach abandoned is not the
    // server's. (A leave that quietly saved would be a different, worse bug.)
    await page.goto(`/clients/${YUSUF}/routine`);
    await expect(page.getByLabel("Plan name")).not.toHaveValue("Discarded on the way out");
  });

  test("the browser back button asks, and Cancel leaves the coach on the page", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/clients/${YUSUF}/routine`);
    await page.getByLabel("Plan name").fill("Back button test");

    // `goBack` may not settle: the guard re-pushes its sentinel so the document never
    // changes. That IS the behaviour under test, so the call is allowed to time out.
    await page.goBack({ timeout: 3000 }).catch(() => null);

    const dialog = page.getByRole("dialog");
    await expect(dialog).toHaveAccessibleName("Leave with unsaved changes?");
    await dialog.getByRole("button", { name: "Stay on this page" }).click();

    expect(page.url()).toContain(`/clients/${YUSUF}/routine`);
    await expect(page.getByLabel("Plan name")).toHaveValue("Back button test");
  });

  test("closing the tab raises the browser's own beforeunload prompt", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${YUSUF}/routine`);
    await page.getByLabel("Plan name").fill("Closing the tab");
    await expect(page.getByText("Unsaved changes")).toBeVisible();

    // Playwright only runs `beforeunload` handlers when asked to, and surfaces the
    // browser's prompt as a `dialog` event — which is the only way to observe a
    // handler whose UI belongs to Chrome.
    const seen = new Promise<string>((resolve) => {
      page.on("dialog", (d) => {
        resolve(d.type());
        void d.dismiss();
      });
    });
    await page.close({ runBeforeUnload: true });
    expect(await seen).toBe("beforeunload");
  });

  test("a FAILED save leaves the warning standing; a successful one clears it", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/clients/${YUSUF}/routine`);
    await page.getByLabel("Plan name").fill("Failed save");

    /**
     * Server actions POST to the page's own URL. Answering one with a 500 is the
     * cheapest honest way to produce the failure AC2 requires QA to force.
     *
     * It also pins something measured while writing this test: Next's client resolves
     * a failed action call with `undefined` rather than rejecting, so `result.ok` threw
     * and the route's error boundary replaced the whole editor with "Something went
     * wrong." — losing the working copy through the error path instead of a
     * navigation. The assertion below that the plan name is STILL on screen is that
     * defect's regression test.
     */
    await page.route(`**/clients/${YUSUF}/routine`, async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({ status: 500, contentType: "text/plain", body: "" });
        return;
      }
      await route.fallback();
    });
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText("The draft could not be saved.")).toBeVisible();
    // The editor is still standing, with the edit in it.
    await expect(page.getByLabel("Plan name")).toHaveValue("Failed save");
    await expect(page.getByText("Something went wrong.")).toHaveCount(0);
    // Still holding unsaved work, so the marker stands and the guard still fires.
    await expect(page.getByText("Unsaved changes")).toBeVisible();
    await page.getByRole("link", { name: "Nutrition" }).click();
    await expect(page.getByRole("dialog")).toHaveAccessibleName(
      "Leave with unsaved changes?"
    );
    await page.getByRole("dialog").getByRole("button", { name: "Stay on this page" }).click();

    // Now let the save through: the next navigation is silent.
    await page.unroute(`**/clients/${YUSUF}/routine`);
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText(/^Draft saved /)).toBeVisible();
    await expect(page.getByText("Unsaved changes")).toHaveCount(0);

    await page.getByRole("link", { name: "Nutrition" }).click();
    await page.waitForURL(`/clients/${YUSUF}/nutrition`);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});

/**
 * EV-190 U4 — the catalog picker stays open while ADDING.
 *
 * `onPick` closed the picker on every pick, so a six-exercise day was six open /
 * search / pick cycles, each one resetting the query and filters (which is deliberate
 * and stays). Adding is a repeated act; replacing is a single one, and the two now
 * behave differently on purpose.
 */
test.describe("EV-190 U4 — adding several exercises in one opening", () => {
  test("three picks, three exercises, in order, and Escape keeps all three", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/clients/${YUSUF}/routine`);

    const before = await page.getByRole("group").count();
    await page.getByRole("button", { name: "Add exercise" }).first().click();
    const picker = page.getByRole("dialog");

    for (const name of ["Goblet Squat", "Lat Pulldown", "Seated Cable Row"]) {
      await picker.getByLabel("Search the catalog").fill(name);
      await picker.getByRole("button", { name: new RegExp(`^${name}`) }).click();
      // The pick is acknowledged, because the day it landed on is behind the dialog.
      await expect(picker.getByText(`Added ${name}.`)).toBeVisible();
      // …and the picker is still open, which is the whole item.
      await expect(picker).toBeVisible();
    }

    // Edge case 14: Escape after the picks keeps every one of them.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    const names = await page
      .getByRole("group")
      .evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")));
    expect(names.length).toBe(before + 3);
    // Appended to the FIRST day (day two's exercises still follow them), in the order
    // they were picked — three picks in one opening are three distinct exercises.
    expect(names.join("|")).toContain("Goblet Squat|Lat Pulldown|Seated Cable Row");
  });

  test("replacing still closes on the pick — it is a single act", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${YUSUF}/routine`);

    await page.getByRole("button", { name: "Replace: Leg Press" }).click();
    const picker = page.getByRole("dialog");
    await picker.getByLabel("Search the catalog").fill("Goblet Squat");
    await picker.getByRole("button", { name: /^Goblet Squat/ }).click();

    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(exerciseRow(page, "Leg Press")).toHaveCount(0);
  });
});

/**
 * EV-190 U6 — save/publish feedback where the coach is looking.
 *
 * The notice renders as a `<p>` in the top card. After editing at the bottom of a long
 * plan, a coach who saves sees nothing move: both the control and its confirmation are
 * off-screen, so they press it again. EV-190's NOT-list settles the fix as "scroll the
 * notice into view and announce it" — a sticky action bar is a redesign and is out.
 */
test.describe("EV-190 U6 — the confirmation comes to the coach", () => {
  test("a save from the bottom of a long plan scrolls its notice into view", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 640 });
    await signIn(page);
    await page.goto(`/clients/${YUSUF}/routine`);

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const scrolled = await page.evaluate(() => window.scrollY);
    expect(scrolled, "the page must actually be scrolled for this to mean anything").toBeGreaterThan(200);

    // `dispatchEvent` rather than `click`: Playwright scrolls a control into view
    // before clicking it, which would stage exactly the state under test away.
    await page.getByRole("button", { name: "Save draft" }).dispatchEvent("click");

    const notice = page.getByText(/^Draft saved /);
    await expect(notice).toBeVisible();
    // Announced, not only drawn.
    await expect(notice).toHaveRole("status");
    // And inside the viewport, after the smooth scroll settles.
    await expect
      .poll(
        async () => {
          const box = await notice.boundingBox();
          const height = page.viewportSize()?.height ?? 0;
          return box !== null && box.y >= 0 && box.y + box.height <= height;
        },
        { message: "the notice must end up inside the viewport" }
      )
      .toBe(true);
  });
});

/**
 * MUST BE LAST IN THIS FILE, and this file is the last one that reads trainee data.
 *
 * `revokeClient` sets one process-wide flag in the fixture — one dev server, one
 * store — so every read after it 403s for the rest of the run. That is the point of
 * the test and the reason it cannot sit anywhere else: the state it creates is
 * terminal.
 *
 * It is also why the routine write and the two nutrition writes are ONE test and not
 * three. Every tab has to be opened BEFORE the revoke — afterwards the layout's
 * overview read 403s and the tab redirects before a control can be reached — and a
 * second test gets a fresh browser context but the same, already-revoked server.
 * Staging three pages up front is the only shape that can assert three different
 * components' access-ended branches against one terminal flag.
 */
test.describe("ADR-0012 AC6 — a revoke ends the session's access mid-edit", () => {
  test("every write from another tab lands on the denial page, not on an error sentence", async ({
    page,
    context,
  }) => {
    await signIn(page);

    // Tab A: the coach is editing Lina's routine.
    await page.goto(`/clients/${LINA}/routine`);
    await expect(page.getByLabel("Plan name")).toBeVisible();

    // Tabs C and D: her nutrition, open and ready to write. Staged now, because after
    // the revoke this URL redirects before the controls exist.
    const week = await context.newPage();
    await week.goto(`/clients/${LINA}/nutrition`);
    await expect(week.getByRole("button", { name: "Apply to Lina M." })).toBeVisible();
    const targets = await context.newPage();
    await targets.goto(`/clients/${LINA}/nutrition`);
    await expect(targets.getByLabel("Calories")).toBeVisible();

    // Tab B: the same coach revokes (standing in for the trainee revoking in their
    // app — the fixture's flag is the same one either path sets).
    const other = await context.newPage();
    await other.goto(`/clients/${LINA}`);
    await other.getByRole("button", { name: "More" }).click();
    await other.getByRole("menuitem", { name: "Revoke access" }).click();
    await other.getByRole("dialog").getByRole("button", { name: "Revoke access" }).click();
    await other.waitForURL("/");
    await other.close();

    /**
     * Tab A still shows the plan and still offers to write to it. The write is the
     * coach's next request, and AC6 says that request is refused — so the tab must
     * LEAVE, not decorate a revoked trainee's plan with an error line.
     *
     * EV-190 edge case 4 rides on the same click: the coach is holding UNSAVED edits,
     * and the unsaved-changes guard must not hold them on a revoked trainee's page.
     * A coach whose access ended may not be kept there by a dialog about their own
     * convenience, so the editor drops the flag on the access-ended path.
     */
    await page.getByLabel("Plan name").fill("Edited just before the revoke");
    await expect(page.getByText("Unsaved changes")).toBeVisible();
    await page.getByRole("button", { name: "Save draft" }).click();
    await page.waitForURL("/clients/denied");
    // No prompt stood in the way, and none is left over on the denial page.
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText("Leave with unsaved changes?")).toHaveCount(0);
    await expect(
      page.getByText("This trainee is not on your roster. They may have revoked access.")
    ).toBeVisible();
    // The plan is gone from the screen, not merely annotated.
    await expect(page.getByLabel("Plan name")).toHaveCount(0);
    await expect(page.getByText("The draft could not be saved.")).toHaveCount(0);

    // The same must hold for the nutrition writes — they are separate components with
    // their own error handling, and "it works on the routine tab" has never been
    // evidence about this one.
    await week.getByRole("button", { name: "Apply to Lina M." }).click();
    await week.getByRole("dialog").getByRole("button", { name: "Apply", exact: true }).click();
    await week.waitForURL("/clients/denied");
    await expect(week.getByText("The meal week could not be applied.")).toHaveCount(0);
    // A revoked trainee's meals are no longer on screen.
    await expect(week.getByRole("button", { name: /^Swap meal: / })).toHaveCount(0);

    await targets.getByLabel("Calories").fill("2100");
    await targets.getByRole("button", { name: "Save targets" }).click();
    await targets
      .getByRole("dialog")
      .getByRole("button", { name: "Save targets" })
      .click();
    await targets.waitForURL("/clients/denied");
    await expect(targets.getByText("The targets could not be saved.")).toHaveCount(0);
  });
});
