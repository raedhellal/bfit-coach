import { expect, type Page } from "@playwright/test";
import { test } from "./fixture-test";

/**
 * EV-185b — the coach's Nutrition tab, in **fixture mode** (see playwright.config.ts).
 *
 * Same rules as coach-routine.spec.ts: every asserted sentence is the story's own,
 * verbatim, and the file is serial because it mutates one in-memory fixture. The
 * read-only assertions for a trainee come before anything writes to that trainee.
 *
 * Note what is NOT asserted here, because it does not exist: there is no "Publish" on
 * this tab and no draft. EV-185 rules slice 1 writes the trainee's live week, so the
 * control is "Apply to {trainee}" behind a confirm that says the trainee sees it
 * straight away — and these specs assert that sentence rather than a preview flow.
 */

const EMAIL = "coach@evoli.fit";
const PASSWORD = "Password123!";

/** Targets + a current week; source AUTO. */
const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
/** No targets and no week — AC1's "No nutrition set up yet". */
const NILS = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0002";
/**
 * ACTIVE link whose `scopes` are PROGRESS + WEIGH_INS: no NUTRITION.
 *
 * ADR-0015 D5: there is no scope error code — the 403 body is undifferentiated — so
 * the sentence below is derived from the overview's `scopes` and the nutrition
 * endpoint is never called.
 */
const SARA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0003";
/** NUTRITION only: this tab works, and it is the only one that does. */
const PETRA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0006";
/** WORKOUTS only: the mirror — this tab reads the scope sentence. */
const YUSUF = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0007";
/** An ACTIVE link that shares nothing at all. */
const MARA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0008";
/** Nobody: a foreign id and one that never existed answer the same 403 body. */
const FOREIGN = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e9999";
const NONEXISTENT = "00000000-0000-0000-0000-000000000000";
/** Source COACH, and no nutrition_preferences row at all (edge case 1). */
const DANA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0004";
/** Source MANUAL. */
const OMAR = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0005";

/** A 46-character meal name, elided at 40 (EV-185 edge case 7's family). */
const LONG_MEAL_SHOWN = "Grilled chicken, quinoa and roasted veg…";

const ENGLISH_ONLY =
  "Meal plans are generated in English. Ingredient checks run on the English names.";
const FLOOR_STANDING =
  "Evoli checks calories against a safe minimum. It does not yet check protein or fat.";

test.describe.configure({ mode: "serial" });

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/");
}

test.describe("AC1 — the coach opens Nutrition and sees the live targets and week", () => {
  test("calories, protein, carbs, fat, the source line and the activity level", async ({
    page,
  }) => {
    await signIn(page);
    const res = await page.goto(`/clients/${LINA}/nutrition`);
    expect(res?.status()).toBe(200);

    await expect(page.getByLabel("Calories")).toHaveValue("2150");
    await expect(page.getByLabel("Protein")).toHaveValue("150");
    await expect(page.getByLabel("Carbs")).toHaveValue("215");
    await expect(page.getByLabel("Fat")).toHaveValue("68");

    // AC1's source sentence for an AUTO target.
    await expect(page.getByText("Calculated automatically")).toBeVisible();
    await expect(page.getByText("Activity level: Moderately active")).toBeVisible();

    // AC2's standing limitation renders whether or not a floor ever fired.
    await expect(page.getByText(FLOOR_STANDING)).toBeVisible();
    // Nothing renders null or NaN.
    await expect(page.locator("body")).not.toContainText("NaN");
    await expect(page.locator("body")).not.toContainText("null");
  });

  test("the current week is seven days, each meal with its calories and macros", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/clients/${LINA}/nutrition`);

    for (const day of [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ]) {
      await expect(page.getByText(day, { exact: true })).toHaveCount(1);
    }

    // Per-meal kcal and macros, not a day total.
    await expect(page.getByText("Greek yogurt with berries and oats").first()).toBeVisible();
    await expect(
      page.getByText("420 kcal · 32 g protein · 52 g carbs · 9 g fat").first()
    ).toBeVisible();
    await expect(page.getByText("Breakfast").first()).toBeVisible();
    await expect(page.getByText("Snack").first()).toBeVisible();

    // A 46-character meal name is elided rather than breaking the row.
    await expect(page.getByText(LONG_MEAL_SHOWN).first()).toBeVisible();
    await expect(page.locator("body")).not.toContainText(
      "Grilled chicken, quinoa and roasted vegetables"
    );

    // AC3's standing limitation line, once.
    await expect(page.getByText(ENGLISH_ONLY)).toHaveCount(1);
  });

  test("allergies, dietary rules and dislikes are read-only profile facts", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/clients/${LINA}/nutrition`);

    await expect(page.getByText("Allergies", { exact: true })).toBeVisible();
    await expect(page.getByText("Dietary rules", { exact: true })).toBeVisible();
    await expect(page.getByText("Dislikes", { exact: true })).toBeVisible();
    await expect(page.getByText("Peanuts")).toBeVisible();
    await expect(page.getByText("HALAL")).toBeVisible();
    await expect(
      page.getByText("From the trainee's profile — you cannot change these here.")
    ).toBeVisible();

    /**
     * EV-185's non-negotiable: "there is no control anywhere that would let them"
     * override an allergy or a rule. The restrictions block is text and badges only —
     * no input, no button, no link inside it.
     */
    const facts = page.getByText("Allergies", { exact: true }).locator("xpath=ancestor::*[3]");
    await expect(facts.getByRole("button")).toHaveCount(0);
    await expect(facts.getByRole("textbox")).toHaveCount(0);
  });

  test("a trainee with no targets and no week gets the empty state AND both controls", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/clients/${NILS}/nutrition`);

    await expect(page.getByText("No nutrition set up yet")).toBeVisible();
    // AC1: "plus the two controls from AC2 and AC3" — not instead of them. Edge case 9
    // (the first ever write) is unreachable if the form hides behind the empty state.
    await expect(page.getByRole("button", { name: "Save targets" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Apply to Nils K." })).toBeVisible();
    await expect(page.locator("body")).not.toContainText("NaN");
    await expect(page.getByLabel("Calories")).toHaveValue("");
  });

  test("a link without the NUTRITION scope reads the scope sentence", async ({ page }) => {
    await signIn(page);
    const res = await page.goto(`/clients/${SARA}/nutrition`);
    // 200: nothing was refused — the portal read `scopes` and did not call.
    expect(res?.status()).toBe(200);

    await expect(
      page.getByText("This trainee has not shared their nutrition with you.")
    ).toBeVisible();
    // The tab stays: a withheld scope must not read as a missing product feature.
    await expect(page.getByRole("link", { name: "Nutrition" })).toBeVisible();
    await expect(page.locator("body")).not.toContainText(
      "This trainee is not on your roster"
    );
    // No form, so no control that could write to a trainee who withheld the scope.
    await expect(page.getByRole("button", { name: "Save targets" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Apply to / })).toHaveCount(0);
  });

  test("the other two source sentences, and edge case 1's missing preferences row", async ({
    page,
  }) => {
    await signIn(page);

    await page.goto(`/clients/${DANA}/nutrition`);
    await expect(page.getByText(/^Set by you on /)).toBeVisible();
    // Edge case 1: no `nutrition_preferences` row says so, rather than rendering
    // three empty lists as if they had been checked and found empty.
    await expect(page.getByText("No dietary restrictions recorded.")).toBeVisible();
    await expect(page.getByText("Allergies", { exact: true })).toHaveCount(0);

    await page.goto(`/clients/${OMAR}/nutrition`);
    await expect(page.getByText("Set manually by the trainee")).toBeVisible();
  });
});

test.describe("AC2 — the coach sets macro targets, and the safety floor holds", () => {
  test("a non-numeric value is rejected client-side and sends no request", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/clients/${OMAR}/nutrition`);

    const posts: string[] = [];
    page.on("request", (req) => {
      if (req.method() === "POST") posts.push(req.url());
    });

    await page.getByLabel("Calories").fill("abc");
    await page.getByRole("button", { name: "Save targets" }).click();

    await expect(page.getByText("Enter a number above 0.")).toBeVisible();
    // AC2: "and sends no request". A server action is a POST to the current URL.
    expect(posts, "no request may leave the browser for an invalid target").toEqual([]);
    // It never even reached the confirm step.
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("a negative value is rejected the same way", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${OMAR}/nutrition`);

    const posts: string[] = [];
    page.on("request", (req) => {
      if (req.method() === "POST") posts.push(req.url());
    });

    await page.getByLabel("Protein").fill("-5");
    await page.getByRole("button", { name: "Save targets" }).click();

    await expect(page.getByText("Enter a number above 0.")).toBeVisible();
    expect(posts).toEqual([]);
  });

  test("800 kcal is raised to the engine's floor, with the engine's own flag", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/clients/${LINA}/nutrition`);

    await page.getByLabel("Calories").fill("800");
    await page.getByRole("button", { name: "Save targets" }).click();

    // The write is immediate and visible to the trainee, so it is confirmed first.
    const confirm = page.getByRole("dialog");
    await expect(confirm).toHaveAccessibleName("Save targets?");
    await expect(confirm.getByText("Lina M. will see this straight away.")).toBeVisible();
    await confirm.getByRole("button", { name: "Save targets" }).click();

    await expect(page.getByText("Calories raised to a safe minimum of 1200 kcal.")).toBeVisible();
    await expect(page.getByText("Targets saved.")).toBeVisible();
    // What is shown is what was STORED, not what was typed.
    await expect(page.getByLabel("Calories")).toHaveValue("1200");

    await page.reload();
    await expect(page.getByLabel("Calories")).toHaveValue("1200");
    // The write is attributed to the coach from now on.
    await expect(page.getByText(/^Set by you on /)).toBeVisible();
  });

  test("a value above the floor is stored exactly as entered, with no flag", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/clients/${LINA}/nutrition`);

    await page.getByLabel("Calories").fill("2300");
    await page.getByRole("button", { name: "Save targets" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Save targets" }).click();

    await expect(page.getByText("Targets saved.")).toBeVisible();
    await expect(page.getByLabel("Calories")).toHaveValue("2300");
    await expect(page.getByText(/^Calories raised to a safe minimum/)).toHaveCount(0);
    // The standing sentence stands whether or not a floor fired.
    await expect(page.getByText(FLOOR_STANDING)).toBeVisible();
  });
});

/**
 * EV-223: Nils has NO meal week in the fixture's seed. The three tests after the first
 * Apply below used to find the week the Apply test had left behind, and were red on
 * their own. Each now applies its own first week through the same control a coach uses.
 */
async function applyFirstWeek(page: Page) {
  await page.getByRole("button", { name: "Apply to Nils K." }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Regenerate day: / })).toHaveCount(7);
}

test.describe("AC3 — the coach shapes the meal week through the existing engine", () => {
  test("Apply names the trainee and the week start, and says the trainee sees it now", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/clients/${NILS}/nutrition`);

    await page.getByRole("button", { name: "Apply to Nils K." }).click();

    const confirm = page.getByRole("dialog");
    await expect(confirm).toHaveAccessibleName("Apply this meal week?");
    // AC3: the dialog names the trainee AND the week start date.
    await expect(
      // en-GB short months are 3 or 4 letters ("Sep" but "Sept"), hence \w{3,4}.
      confirm.getByText(/^This replaces Nils K\.'s meal week starting \d{1,2} \w{3,4} \d{4}\.$/)
    ).toBeVisible();
    await expect(confirm.getByText("Nils K. will see this straight away.")).toBeVisible();

    await confirm.getByRole("button", { name: "Apply", exact: true }).click();

    // A week now exists: seven days, each with meals.
    await expect(page.getByText("Monday", { exact: true })).toHaveCount(1);
    await expect(page.getByText("Sunday", { exact: true })).toHaveCount(1);
    await expect(page.getByRole("button", { name: /^Regenerate day: / })).toHaveCount(7);
    await expect(page.getByText("No nutrition set up yet")).toHaveCount(0);
  });

  test("applying a second time replaces the week rather than duplicating it", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/clients/${NILS}/nutrition`);
    await applyFirstWeek(page);

    const meals = () =>
      page
        .getByRole("button", { name: /^Swap meal: / })
        .evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")));

    const before = await meals();

    await page.getByRole("button", { name: "Apply to Nils K." }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Apply", exact: true }).click();

    // Poll: the week is replaced in place, so there is no appearing element to await —
    // the only observable change is the meals themselves.
    await expect.poll(meals).not.toEqual(before);

    const after = await meals();
    // Exactly one week exists afterwards: 7 days × 4 slots, not 56 meals.
    expect(before).toHaveLength(28);
    expect(after).toHaveLength(28);
  });

  test("Regenerate day changes that day and leaves the others alone", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${NILS}/nutrition`);
    await applyFirstWeek(page);

    const meals = () =>
      page
        .getByRole("button", { name: /^Swap meal: / })
        .evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")));

    const before = await meals();
    await page.getByRole("button", { name: /^Regenerate day: Monday$/ }).click();
    await expect.poll(async () => (await meals()).slice(0, 4)).not.toEqual(before.slice(0, 4));

    const after = await meals();
    expect(after).toHaveLength(28);
    // Tuesday onwards is untouched.
    expect(after.slice(4)).toEqual(before.slice(4));
  });

  test("Swap meal offers options and replaces the one meal", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${NILS}/nutrition`);
    await applyFirstWeek(page);

    const firstSwap = page.getByRole("button", { name: /^Swap meal: / }).first();
    const swappedName = (await firstSwap.getAttribute("aria-label"))!.replace(
      "Swap meal: ",
      ""
    );
    await firstSwap.click();

    const modal = page.getByRole("dialog");
    await expect(modal).toHaveAccessibleName("Swap meal");
    // Each candidate carries its own macros, which is what distinguishes a candidate
    // row from the dialog's Close and from its subtitle (the subtitle names the meal
    // being swapped, so it is NOT evidence that the meal is offered to itself).
    const candidates = modal.getByRole("button").filter({ hasText: /kcal · / });
    await expect(candidates.first()).toBeVisible();

    const offered = await candidates.evaluateAll((els) =>
      els.map((el) => (el.textContent || "").trim())
    );
    // The meal being swapped is never offered as its own replacement.
    expect(offered.some((name) => name.startsWith(swappedName))).toBe(false);

    await candidates.first().click();

    await expect(page.getByRole("dialog")).toHaveCount(0);
    const names = await page
      .getByRole("button", { name: /^Swap meal: / })
      .evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")));
    expect(names).toHaveLength(28);
    expect(names[0]).not.toBe(`Swap meal: ${swappedName}`);
  });
});

test.describe("ADR-0015 D5/D6 — scope-derived states, and what the dialog promises", () => {
  test("a WORKOUTS-only and a no-scope link read the scope sentence", async ({ page }) => {
    await signIn(page);

    for (const id of [YUSUF, MARA]) {
      const res = await page.goto(`/clients/${id}/nutrition`);
      expect(res?.status()).toBe(200);
      await expect(
        page.getByText("This trainee has not shared their nutrition with you.")
      ).toBeVisible();
      await expect(page.locator("body")).not.toContainText(
        "This trainee is not on your roster"
      );
      await expect(page.getByRole("button", { name: "Save targets" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /^Apply to / })).toHaveCount(0);
    }
  });

  test("a NUTRITION-only link gets the whole tab", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${PETRA}/nutrition`);

    await expect(page.getByLabel("Calories")).toHaveValue("1850");
    await expect(page.getByRole("button", { name: "Apply to Petra L." })).toBeVisible();
    await expect(page.locator("body")).not.toContainText(
      "This trainee has not shared their nutrition with you."
    );
  });

  test("the confirm dialog says locked meals are kept, and the page discloses the cap", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/clients/${PETRA}/nutrition`);

    // ADR-0015 D6: `regenerateDay` spends the TRAINEE's daily allowance, so the coach
    // is told beside the control rather than after the fact.
    await expect(
      page.getByText("Day regenerations share Petra L.'s daily limit.")
    ).toBeVisible();

    await page.getByRole("button", { name: "Apply to Petra L." }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Petra L. will see this straight away.")).toBeVisible();
    // D6.7: the apply reuses the plan row and carries locked meals forward, so the
    // dialog may not promise a clean replacement.
    await expect(dialog.getByText("Meals the trainee has locked are kept.")).toBeVisible();
  });
});

test.describe("ADR-0015 — the contract additions the review asked for", () => {
  test("D6.6's 429 names the daily limit instead of inviting a retry", async ({ page }) => {
    await signIn(page);
    // Omar's link is the fixture's rate-limited one (the cap is per link per day on
    // the server; keying it to one trainee is a fixture affordance, like the 503).
    await page.goto(`/clients/${OMAR}/nutrition`);

    await page.getByRole("button", { name: "Apply to Omar T." }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Apply", exact: true }).click();

    await expect(
      page.getByText(
        "A meal week can be applied once a day for each trainee. Try again tomorrow."
      )
    ).toBeVisible();
    // The generic failure invited a second click that could not succeed until tomorrow.
    await expect(page.getByText("The meal week could not be applied.")).toHaveCount(0);
  });

  test("a locked meal is marked, and an apply keeps it", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${LINA}/nutrition`);

    // Lina locked Monday's lunch in her own app: index 1 of the week's meals
    // (BREAKFAST, LUNCH, DINNER, SNACK, then Tuesday…). Meal names repeat across days,
    // so the assertion is positional — the same slot on the same day, before and after.
    const meals = () =>
      page
        .getByRole("button", { name: /^Swap meal: / })
        .evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")));

    await expect(page.getByText("Kept", { exact: true })).toHaveCount(1);
    const before = await meals();

    await page.getByRole("button", { name: "Apply to Lina M." }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Meals the trainee has locked are kept.")).toBeVisible();
    await dialog.getByRole("button", { name: "Apply", exact: true }).click();

    await expect.poll(meals).not.toEqual(before);
    const after = await meals();

    // D6.7: the week is replaced AROUND the lock. Monday's breakfast is a new meal;
    // Monday's lunch is the one the trainee locked, and it is still there and still
    // marked — which is what makes the dialog's promise checkable on the screen after it.
    expect(after[0]).not.toEqual(before[0]);
    expect(after[1]).toEqual(before[1]);
    await expect(page.getByText("Kept", { exact: true })).toHaveCount(1);
  });

  test("a COACH target written by someone else is not attributed to you", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${PETRA}/nutrition`);

    // ADR-0015's amendment, ruling (b): `source === "COACH"` is not "you". Petra's
    // target was written before she re-linked, so "Set by you on …" would put this
    // coach's name on another professional's decision — and the fourth label is the
    // only one that can be rendered from a boolean, since the portal is served no id
    // and no name for whoever did write it.
    await expect(page.getByText(/^Set by another coach on /)).toBeVisible();
    await expect(page.getByText(/^Set by you on /)).toHaveCount(0);
    // The page must not name, or carry, the other coach in any form.
    await expect(page.locator("body")).not.toContainText("beef");
  });

  test("saving targets here DOES read as yours afterwards", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${PETRA}/nutrition`);

    await page.getByLabel("Calories").fill("2000");
    await page.getByRole("button", { name: "Save targets" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Save targets" }).click();

    await expect(page.getByText("Targets saved.")).toBeVisible();
    await page.reload();
    // The api recomputes `setByYou` for the caller; the write flips the label.
    await expect(page.getByText(/^Set by you on /)).toBeVisible();
    await expect(page.getByText(/^Set by another coach on /)).toHaveCount(0);
  });

  test("a foreign and a never-existing client id are both 403 on this tab", async ({ page }) => {
    await signIn(page);

    for (const id of [FOREIGN, NONEXISTENT]) {
      const res = await page.goto(`/clients/${id}/nutrition`);
      // ADR-0012 D4: identical answers, so the portal is not an existence oracle.
      expect(res?.status(), `${id} must be 403`).toBe(403);
      await expect(
        page.getByText("This trainee is not on your roster. They may have revoked access.")
      ).toBeVisible();
      // And no scope sentence: nothing here says anything about what was shared.
      await expect(page.locator("body")).not.toContainText("has not shared their");
    }
  });
});

/**
 * EV-190 AC3 (U3) — the targets card reconciles macros against calories.
 *
 * `NutritionTargetsCard` validated only "above 0", so 2200 kcal saved happily next to
 * macros summing to 2560 and the prompt was handed both numbers with nothing on screen
 * saying so. The line added here is ADVISORY: it states the arithmetic and refuses
 * nothing, which is why the last test in this block deliberately saves a mismatch and
 * reads the stored row back.
 *
 * 4 kcal/g protein, 4 kcal/g carbs, 9 kcal/g fat, ±25 kcal reads as a match. These
 * expectations are COMPUTED from the story's rule, not copied off the screen — and
 * that is exactly why they do not read as EV-190 AC3 writes them.
 *
 * ⚠️ AC3's worked example is arithmetically wrong. It gives 2200 kcal with 180 g
 * protein, 200 g carbs and 80 g fat and then asserts the sentence "…add up to 2,560
 * kcal — 360 above…". By AC3's own factors the sum is 180*4 + 200*4 + 80*9 = **2,240**,
 * and the difference is **40**. The story says the rounding rule is stated "so QA
 * computes the expected string rather than reading it off the screen", so the RULE
 * wins over the example, and these tests assert the computed values. The example needs
 * correcting in the story.
 */
test.describe("EV-190 AC3 — macros are reconciled against calories, advisorily", () => {
  test("the story's own numbers, live, before any save", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${LINA}/nutrition`);

    await page.getByLabel("Calories").fill("2200");
    await page.getByLabel("Protein").fill("180");
    await page.getByLabel("Carbs").fill("200");
    await page.getByLabel("Fat").fill("80");

    // 180*4 + 200*4 + 80*9 = 2,240; 2,240 − 2,200 = 40. (AC3 prints 2,560/360.)
    await expect(
      page.getByText("Your macros add up to 2,240 kcal — 40 above the calorie target.")
    ).toBeVisible();
    // Advisory: nothing is disabled, nothing is corrected, no request was sent.
    await expect(page.getByRole("button", { name: "Save targets" })).toBeEnabled();
    await expect(page.getByLabel("Protein")).toHaveValue("180");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("the below case, and a 1 kcal difference reads as a match", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${LINA}/nutrition`);

    await page.getByLabel("Calories").fill("2200");
    await page.getByLabel("Protein").fill("100");
    await page.getByLabel("Carbs").fill("100");
    await page.getByLabel("Fat").fill("50");
    // 400 + 400 + 450 = 1250; 2200 − 1250 = 950.
    await expect(
      page.getByText("Your macros add up to 1,250 kcal — 950 below the calorie target.")
    ).toBeVisible();

    // Edge case 6: 150*4 + 250*4 + 67*9 = 2203 against 2202 — inside the ±25
    // tolerance, so it reads as matching rather than as a 1 kcal error.
    await page.getByLabel("Calories").fill("2202");
    await page.getByLabel("Protein").fill("150");
    await page.getByLabel("Carbs").fill("250");
    await page.getByLabel("Fat").fill("67");
    await expect(
      page.getByText("Your macros add up to 2,203 kcal — this matches the calorie target.")
    ).toBeVisible();
  });

  /**
   * The tolerance itself, pinned at both sides of the boundary.
   *
   * Review's measurement: ±25 could be mutated to 24 with every other test in this
   * file still green, so the number in the story was not actually asserted anywhere.
   * 100 g protein + 200 g carbs + 75 g fat = 1,875 kcal, which is 25 above 1,850 and
   * 26 above 1,849.
   */
  test("exactly 25 kcal reads as a match, and 26 does not", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${LINA}/nutrition`);

    await page.getByLabel("Protein").fill("100");
    await page.getByLabel("Carbs").fill("200");
    await page.getByLabel("Fat").fill("75");

    await page.getByLabel("Calories").fill("1850");
    await expect(
      page.getByText("Your macros add up to 1,875 kcal — this matches the calorie target.")
    ).toBeVisible();

    await page.getByLabel("Calories").fill("1849");
    await expect(
      page.getByText("Your macros add up to 1,875 kcal — 26 above the calorie target.")
    ).toBeVisible();

    // …and symmetrically on the other side: 1,900 is 25 below, 1,901 is 26 below.
    await page.getByLabel("Calories").fill("1900");
    await expect(
      page.getByText("Your macros add up to 1,875 kcal — this matches the calorie target.")
    ).toBeVisible();
    await page.getByLabel("Calories").fill("1901");
    await expect(
      page.getByText("Your macros add up to 1,875 kcal — 26 below the calorie target.")
    ).toBeVisible();
  });

  test("an empty field produces no line, no NaN and no 0 kcal", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${LINA}/nutrition`);

    await page.getByLabel("Calories").fill("2200");
    await page.getByLabel("Protein").fill("180");
    await page.getByLabel("Carbs").fill("200");
    await page.getByLabel("Fat").fill("");

    // Edge case 5: there is no honest arithmetic over a missing value.
    await expect(page.getByText(/^Your macros add up to/)).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("NaN");
    await expect(page.locator("body")).not.toContainText("0 kcal —");
    // EV-185 AC2 is unchanged: the empty field is still refused at save, client-side.
    await page.getByRole("button", { name: "Save targets" }).click();
    await expect(page.getByText("Enter a number above 0.")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("a deliberate mismatch saves exactly as entered, and the floor recomputes the line", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/clients/${LINA}/nutrition`);

    await page.getByLabel("Calories").fill("2200");
    await page.getByLabel("Protein").fill("180");
    await page.getByLabel("Carbs").fill("200");
    await page.getByLabel("Fat").fill("80");
    await page.getByRole("button", { name: "Save targets" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Save targets" }).click();

    await expect(page.getByText("Targets saved.")).toBeVisible();
    // The persisted row is what the coach entered — the line overruled nothing.
    await page.reload();
    await expect(page.getByLabel("Calories")).toHaveValue("2200");
    await expect(page.getByLabel("Protein")).toHaveValue("180");
    await expect(page.getByLabel("Carbs")).toHaveValue("200");
    await expect(page.getByLabel("Fat")).toHaveValue("80");
    await expect(
      page.getByText("Your macros add up to 2,240 kcal — 40 above the calorie target.")
    ).toBeVisible();

    /**
     * AC3's last clause: when the engine's floor raises the calories, the line
     * recomputes against the STORED number. 800 is raised to 1200, so the arithmetic
     * the coach reads is 2,240 against 1,200 — never against the 800 that was refused.
     */
    await page.getByLabel("Calories").fill("800");
    await expect(
      page.getByText("Your macros add up to 2,240 kcal — 1,440 above the calorie target.")
    ).toBeVisible();
    await page.getByRole("button", { name: "Save targets" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Save targets" }).click();
    await expect(page.getByText("Calories raised to a safe minimum of 1200 kcal.")).toBeVisible();
    await expect(page.getByLabel("Calories")).toHaveValue("1200");
    await expect(
      page.getByText("Your macros add up to 2,240 kcal — 1,040 above the calorie target.")
    ).toBeVisible();
    // The standing sentence is untouched by any of this.
    await expect(page.getByText(FLOOR_STANDING)).toBeVisible();
  });
});
