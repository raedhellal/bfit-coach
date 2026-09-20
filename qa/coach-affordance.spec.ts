import { expect, test, type Page } from "@playwright/test";

/**
 * EV-201 — the five things the portal already did and never said, in **fixture mode**.
 *
 * Every sentence below is EV-201's own, verbatim: these are final strings a coach
 * reads, so a reworded one is a failed criterion and not a cosmetic diff.
 *
 * **What this file does NOT prove, and where that proof lives.** EV-201's DoD requires
 * each sentence to be verified against the BEHAVIOUR it describes. Four of the five are
 * verifiable here, because the behaviour is in this browser:
 *   · AC1 — typing, dirty flag, save, reload;
 *   · AC2 — Replace carries 4 / "6-8" / "120s"; Remove-then-Add lands on 3 / "8-12" /
 *     "90s". Both halves are driven, because the contrast is the point of the hint;
 *   · AC3 — the picker stays open AND the exercise really landed (the picker is closed
 *     again and the day is read behind it, because "it stayed open" and "the pick
 *     silently failed" look identical from the front);
 *   · AC4 — Publish opens the preview and publishes nothing; Cancel leaves the draft.
 * AC4's *"the trainee's app still shows the old plan"* and AC5's *regeneration counter
 * before and after a swap* are claims about the TRAINEE's stored data, which no fixture
 * can witness — a fixture that answered them would be agreeing with the sentence rather
 * than testing it. They are driven against a real b-fit-api and a real Postgres in
 * `qa/coach-affordance.live.spec.ts` (`playwright.live.config.ts`).
 *
 * This file runs FIRST (Playwright orders files by name, `workers: 1`) and the fixture
 * is one mutable in-memory store, so every test here ends by discarding the draft it
 * created — coach-nutrition.spec.ts and coach-routine.spec.ts open these same trainees
 * expecting a published plan and no draft.
 */

const EMAIL = "coach@evoli.fit";
const PASSWORD = "Password123!";

/** Populated plan, no injuries → publish previews zero repairs. */
const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
/** No active plan and no draft — EV-201 edge case 3. */
const NILS = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0002";
/** PROGRESS + WEIGH_INS: neither WORKOUTS nor NUTRITION — edge case 5. */
const SARA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0003";
/** A shoulder injury: publish previews two repairs, so Cancel has something to cancel. */
const DANA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0004";

/** EV-201's five sentences, exactly as the story writes them. */
const DAY_FOCUS_LABEL = "Day focus";
const REPLACE_HINT = "Replace keeps the sets, reps and rest.";
const PICKER_HINT = "Pick as many as you need — this stays open. Close it when you're done.";
const PUBLISH_HINT =
  "Publish shows you the safety changes first. Nothing reaches the trainee until you confirm.";
const SWAP_FREE = "Swapping a meal is instant and doesn't use Lina M.'s daily regenerations.";
/** `91b670c`'s wording, which AC5 requires to be unchanged, word for word. */
const REGENERATE_LIMIT = "Day regenerations share Lina M.'s daily limit.";

test.describe.configure({ mode: "serial" });

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/");
}

/**
 * EV-190 U2 added a `beforeunload` guard, and Playwright DISMISSES a dialog it is not
 * told about — dismissing a `beforeunload` means "stay", so a `page.reload()` on a
 * dirty editor silently does not reload and the next assertion reads the page it was
 * already on. Any test here that reloads while holding unsaved edits accepts it.
 */
function acceptLeaving(page: Page) {
  page.on("dialog", (dialog) => void dialog.accept());
}

function exerciseRow(page: Page, name: string) {
  return page.getByRole("group", { name, exact: true });
}

/**
 * Put the fixture back where the next spec file expects it.
 *
 * The reload is not belt-and-braces: the editor flips its badge from LOCAL state after
 * the discard action resolves, so "Published plan" proves the client believes it and
 * not that the store agrees. The next file reads the store.
 */
async function discardDraft(page: Page) {
  await page.getByRole("button", { name: "Discard draft" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Discard draft" }).click();
  await expect(page.getByText("Published plan")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Published plan")).toBeVisible();
  await expect(page.getByText("Draft — not yet published")).toHaveCount(0);
}

test.describe("AC1 — the day focus looks like the field it is", () => {
  test("a visible label in the Sets/Reps/Rest style, and the field still behaves", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/clients/${LINA}/routine`);

    // One label per day card, and Lina's plan has three days.
    await expect(page.getByText(DAY_FOCUS_LABEL, { exact: true })).toHaveCount(3);

    /**
     * "Styled like the existing Sets / Reps / Rest labels (same size, weight and
     * colour)" is asserted by COMPARING the two computed styles, not by hard-coding
     * 12px/600 here — a spec that repeats the literal passes when both drift.
     */
    const focusLabel = page.getByText(DAY_FOCUS_LABEL, { exact: true }).first();
    const setsLabel = page.getByText("Sets", { exact: true }).first();
    const styleOf = (el: Element) => {
      const s = getComputedStyle(el);
      return { fontSize: s.fontSize, fontWeight: s.fontWeight, color: s.color };
    };
    expect(await focusLabel.evaluate(styleOf)).toEqual(await setsLabel.evaluate(styleOf));

    // The `aria-label` is unchanged: the per-day accessible name still addresses the
    // field, which is what keeps three identical inputs distinguishable.
    const focus = page.getByLabel("Day 1 focus");
    await expect(focus).toHaveValue("Upper Body A");

    // …and so is the behaviour: typing edits it and marks the editor dirty.
    await focus.fill("Upper Body A — pull emphasis");
    await expect(page.getByText("Unsaved changes")).toBeVisible();

    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText(/^Draft saved /)).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Day 1 focus")).toHaveValue("Upper Body A — pull emphasis");
    await expect(page.getByText(DAY_FOCUS_LABEL, { exact: true })).toHaveCount(3);

    await discardDraft(page);
  });

  test("edge case 2 — the day card still fits at 390 px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page);
    await page.goto(`/clients/${LINA}/routine`);

    await expect(page.getByLabel("Day 1 weekday")).toBeVisible();
    await expect(page.getByText(DAY_FOCUS_LABEL, { exact: true }).first()).toBeVisible();
    await expect(page.getByLabel("Day 1 focus")).toBeVisible();
    await expect(page.getByText("4 exercises").first()).toBeVisible();
    // Every EV-201 line renders at this width too.
    await expect(page.getByText(REPLACE_HINT).first()).toBeVisible();
    await expect(page.getByText(PUBLISH_HINT)).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow, "no horizontal scrolling at 390 px").toBeLessThanOrEqual(0);
  });
});

test.describe("AC2 — Replace says it keeps the prescription, and it does", () => {
  test("Replace carries 4 / 6-8 / 120s; Remove-then-Add does not", async ({ page }) => {
    acceptLeaving(page);
    await signIn(page);
    await page.goto(`/clients/${LINA}/routine`);

    // The hint is rendered once per DAY CARD (three days, three hints) — the placement
    // EV-201 AC2 leaves to the implementer and asks to be stated.
    await expect(page.getByText(REPLACE_HINT)).toHaveCount(3);

    // AC2's given: sets 4, reps "6-8", rest "120s".
    const bench = exerciseRow(page, "Barbell Bench Press");
    await expect(bench.getByLabel("Sets")).toHaveValue("4");
    await expect(bench.getByLabel("Reps")).toHaveValue("6-8");
    await expect(bench.getByLabel("Rest")).toHaveValue("120s");

    // ── the sentence's claim ────────────────────────────────────────────────────
    await page.getByRole("button", { name: "Replace: Barbell Bench Press" }).click();
    const picker = page.getByRole("dialog");
    await picker.getByLabel("Search the catalog").fill("Machine Chest Press");
    await picker.getByRole("button", { name: /^Machine Chest Press/ }).click();

    const replaced = exerciseRow(page, "Machine Chest Press");
    await expect(replaced.getByLabel("Sets")).toHaveValue("4");
    await expect(replaced.getByLabel("Reps")).toHaveValue("6-8");
    await expect(replaced.getByLabel("Rest")).toHaveValue("120s");

    // ── the contrast that makes the hint worth rendering ────────────────────────
    await page.getByRole("button", { name: "Remove: Machine Chest Press" }).click();
    await expect(exerciseRow(page, "Machine Chest Press")).toHaveCount(0);
    await page.getByRole("button", { name: "Add exercise" }).first().click();
    await picker.getByLabel("Search the catalog").fill("Machine Chest Press");
    await picker.getByRole("button", { name: /^Machine Chest Press/ }).click();
    await picker.getByRole("button", { name: "Done" }).click();

    const readded = exerciseRow(page, "Machine Chest Press");
    await expect(readded.getByLabel("Sets")).toHaveValue("3");
    await expect(readded.getByLabel("Reps")).toHaveValue("8-12");
    await expect(readded.getByLabel("Rest")).toHaveValue("90s");

    // Nothing was saved: a reload drops the working copy and the plan is published again.
    await page.reload();
    await expect(page.getByText("Published plan")).toBeVisible();
    await expect(exerciseRow(page, "Barbell Bench Press")).toBeVisible();
  });

  test("edge case 1 — a day with no exercises renders no orphaned hint", async ({ page }) => {
    acceptLeaving(page);
    await signIn(page);
    await page.goto(`/clients/${LINA}/routine`);

    await expect(page.getByText(REPLACE_HINT)).toHaveCount(3);
    // A fourth day, with nothing in it: still three hints, and no Replace control on it.
    await page.getByRole("button", { name: "Add day" }).click();
    await expect(page.getByText("0 exercises")).toBeVisible();
    await expect(page.getByText(REPLACE_HINT)).toHaveCount(3);

    await page.reload();
    await expect(page.getByText("Published plan")).toBeVisible();
  });
});

test.describe("AC3 — the picker says it is staying open", () => {
  test("the add picker says it, stays open, and the exercise really landed", async ({ page }) => {
    acceptLeaving(page);
    await signIn(page);
    await page.goto(`/clients/${LINA}/routine`);

    await page.getByRole("button", { name: "Add exercise" }).first().click();
    const picker = page.getByRole("dialog");
    await expect(picker.getByText(PICKER_HINT)).toBeVisible();

    await picker.getByLabel("Search the catalog").fill("Hanging Knee Raise");
    await picker.getByRole("button", { name: /^Hanging Knee Raise/ }).click();

    // It stayed open, and said so.
    await expect(picker).toBeVisible();
    await expect(picker.getByText(PICKER_HINT)).toBeVisible();
    await expect(picker.getByText("Added Hanging Knee Raise.")).toBeVisible();

    // A second pick, because "as many as you need" is the claim.
    await picker.getByLabel("Search the catalog").fill("Plank");
    await picker.getByRole("button", { name: /^Plank/ }).click();
    await expect(picker).toBeVisible();

    /**
     * CLOSE it and read the day behind it. "The picker stayed open" and "the pick did
     * nothing" are the same picture from the front, so the sentence is only verified
     * once both exercises are visible on the day.
     */
    await picker.getByRole("button", { name: "Done" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(exerciseRow(page, "Hanging Knee Raise")).toBeVisible();
    await expect(exerciseRow(page, "Plank")).toBeVisible();
    await expect(page.getByText("6 exercises")).toBeVisible();

    await page.reload();
    await expect(page.getByText("Published plan")).toBeVisible();
  });

  test("the replace picker does not say it, and closes on the pick", async ({ page }) => {
    acceptLeaving(page);
    await signIn(page);
    await page.goto(`/clients/${LINA}/routine`);

    await page.getByRole("button", { name: "Replace: Lat Pulldown" }).click();
    const picker = page.getByRole("dialog");
    await expect(picker.getByText("Pick from the catalog. Typed names are not accepted.")).toBeVisible();
    // The line is false of this dialog, so it is not on it.
    await expect(picker.getByText(PICKER_HINT)).toHaveCount(0);

    await picker.getByLabel("Search the catalog").fill("Pull-Up");
    await picker.getByRole("button", { name: /^Pull-Up/ }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(exerciseRow(page, "Pull-Up")).toBeVisible();

    await page.reload();
    await expect(page.getByText("Published plan")).toBeVisible();
  });
});

test.describe("AC4 — Publish says what pressing it does, before it is pressed", () => {
  test("the line is always there, and pressing Publish publishes nothing", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${LINA}/routine`);

    // "Always": on a published plan with no draft and no edit, before anything is pressed.
    await expect(page.getByText("Published plan")).toBeVisible();
    await expect(page.getByText(PUBLISH_HINT)).toBeVisible();

    await page.getByRole("button", { name: "Publish", exact: true }).first().click();
    // EV-184 AC3's no-repairs modal, unchanged.
    await expect(page.getByRole("dialog").getByText("No changes were needed")).toBeVisible();
    await expect(
      page.getByText("The trainee sees this plan next time they open the app.")
    ).toBeVisible();
    // Nothing has been published: the confirm has not been pressed, so no "Published."
    await expect(page.getByText(/^Published\./)).toHaveCount(0);

    // Dismiss without confirming. The draft the preview saved is still a DRAFT.
    await page.keyboard.press("Escape");
    await page.reload();
    await expect(page.getByText("Draft — not yet published")).toBeVisible();
    await expect(page.getByText(PUBLISH_HINT)).toBeVisible();

    await discardDraft(page);
  });

  test("Cancel on the repair modal publishes nothing and leaves the draft", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${DANA}/routine`);
    await expect(page.getByText(PUBLISH_HINT)).toBeVisible();

    await page.getByRole("group", { name: "Pull-Up", exact: true }).getByLabel("Sets").fill("5");
    await page.getByRole("button", { name: "Publish", exact: true }).first().click();

    const modal = page.getByRole("dialog");
    await expect(modal.getByText(/^We changed \d+ things? to keep this safe$/)).toBeVisible();
    await modal.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText(/^Published\./)).toHaveCount(0);

    // Byte-identical: the draft the coach was holding, not the repaired plan.
    await page.reload();
    await expect(page.getByText("Draft — not yet published")).toBeVisible();
    await expect(
      page.getByRole("group", { name: "Pull-Up", exact: true }).getByLabel("Sets")
    ).toHaveValue("5");
    // The repair the modal offered was NOT applied — the overhead press is still there.
    await expect(exerciseRow(page, "Barbell Overhead Press")).toBeVisible();

    await discardDraft(page);
  });
});

test.describe("AC5 — swap says what it costs, next to the regeneration limit", () => {
  test("both lines render, and the regeneration line is unchanged", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${LINA}/nutrition`);

    // AC5: "in the same region as the existing regeneration-limit line, and not
    // replacing it" — so both, and the older one word for word as `91b670c` had it.
    await expect(page.getByText(REGENERATE_LIMIT, { exact: true })).toBeVisible();
    await expect(page.getByText(SWAP_FREE, { exact: true })).toBeVisible();
    // EV-185 AC3's standing line is untouched by this row.
    await expect(
      page.getByText(
        "Meal plans are generated in English. Ingredient checks run on the English names."
      )
    ).toBeVisible();
  });

  test("edge case 4 — a trainee with no meal week gets neither line", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${NILS}/nutrition`);

    await expect(page.getByText("No nutrition set up yet")).toBeVisible();
    await expect(page.getByText(/daily regenerations\.$/)).toHaveCount(0);
    await expect(page.getByText(/daily limit\.$/)).toHaveCount(0);
  });
});

test.describe("edge cases 3 and 5 — the states EV-201 must leave alone", () => {
  test("the routine empty state keeps its two sentences and its one control", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${NILS}/routine`);

    // EV-184 AC1, unchanged.
    await expect(page.getByText("No active plan", { exact: true })).toBeVisible();
    await expect(page.getByText("Nothing is scheduled for this trainee yet.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Build a plan" })).toBeVisible();
    // None of EV-201's routine lines belongs on a page with no plan.
    await expect(page.getByText(PUBLISH_HINT)).toHaveCount(0);
    await expect(page.getByText(REPLACE_HINT)).toHaveCount(0);
    await expect(page.getByText(DAY_FOCUS_LABEL, { exact: true })).toHaveCount(0);
  });

  test("a link without the scope shows the scope sentence and nothing of this row", async ({
    page,
  }) => {
    await signIn(page);

    await page.goto(`/clients/${SARA}/routine`);
    await expect(
      page.getByText("This trainee has not shared their workouts with you.")
    ).toBeVisible();
    await expect(page.getByText(PUBLISH_HINT)).toHaveCount(0);
    await expect(page.getByText(REPLACE_HINT)).toHaveCount(0);
    await expect(page.getByText(DAY_FOCUS_LABEL, { exact: true })).toHaveCount(0);

    await page.goto(`/clients/${SARA}/nutrition`);
    await expect(
      page.getByText("This trainee has not shared their nutrition with you.")
    ).toBeVisible();
    await expect(page.getByText(/daily regenerations\.$/)).toHaveCount(0);
  });
});
