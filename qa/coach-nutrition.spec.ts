import { expect, test, type Page } from "@playwright/test";

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
/** ACTIVE link, no NUTRITION scope → 403 COACH_SCOPE_MISSING. */
const SARA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0003";
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
    await page.goto(`/clients/${SARA}/nutrition`);

    await expect(
      page.getByText("This trainee has not shared their nutrition with you.")
    ).toBeVisible();
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
