import { expect, type Page } from "@playwright/test";
import { test } from "./fixture-test";

/**
 * EV-188b AC3 and AC5 — putting a template on a trainee, and what the trainee's editor
 * then says.
 *
 * Runs against the POPULATED fixture scenario, which needs its own dev server
 * (`playwright.roster.config.ts`): `npm run test:e2e:roster`. The main suite serves an
 * EMPTY roster, and AC3's picker is built from the roster, so this half is unreachable
 * there — `coach-library.spec.ts` covers the branch the empty roster DOES reach, which
 * is the picker with nobody in it.
 *
 * Every AC sentence is a literal, never an import from `src/lib/copy.ts`: a test that
 * imports the string it is checking agrees with a reworded one by construction.
 *
 * 🔴 THE TWO PROPERTIES THIS FILE EXISTS FOR, because they are the ones that are
 * expensive to get wrong:
 *
 *   · **Apply does not publish.** It writes the coach's draft and touches no plan row.
 *     The editor must say so and must not imply otherwise — this is EV-201's finding
 *     one story later, and EV-201 exists because "Publish" did not publish and the
 *     screen never said so.
 *   · **The overwrite confirm is a 409 RETRY, not a pre-read** (ADR-0016 D9.1). The
 *     sentence "this replaces your unpublished draft" is only true if the server has
 *     just said a draft exists, and the retry asserts the exact one the coach was told
 *     about.
 */

const EMAIL = "coach@evoli.fit";
const PASSWORD = "Password123!";

/** WORKOUTS only — an ACTIVE, writable link with a published plan and no draft. */
const YUSUF = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0007";

const SEEDED_A = "Upper / Lower split";
/** Two exercise names the fixture catalogue has never held — AC5's scenario. */
const SEEDED_B = "Legacy strength";

const DRAFT_BADGE = "Draft — not yet published";
const APPLY_NOT_PUBLISHED =
  "This fills your draft for that trainee. Nothing changes for them until you publish.";
const NOT_IN_CATALOGUE = "Not found in the catalogue";
const UNBINDABLE_TWO =
  "2 exercises may not be in the exercise catalogue. Check them before you publish.";

test.describe.configure({ mode: "serial" });

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/");
}

function row(page: Page, name: string) {
  return page.getByRole("group", { name, exact: true });
}

async function openUseDialog(page: Page, template: string) {
  await page.goto("/templates");
  await row(page, template).getByRole("button", { name: "Use on a trainee" }).click();
  return page.getByRole("dialog");
}

test.describe("AC3 — Use on a trainee", () => {
  test("the picker offers only ACTIVE, WORKOUTS-scoped links", async ({ page }) => {
    await signIn(page);
    const dialog = await openUseDialog(page, SEEDED_A);

    const offered = await dialog
      .locator("select option")
      .evaluateAll((options) => options.map((o) => o.textContent?.trim() ?? ""));
    /**
     * Lina and Tobias share everything and Yusuf shares WORKOUTS. Petra (NUTRITION
     * only), Sara (PROGRESS + WEIGH_INS) and Mara (nothing) are NOT offered — AC3: "a
     * trainee the coach may not write to is not offered and then refused". Being
     * refused in front of the coach is the failure this excludes, not a 403 nobody sees.
     *
     * Tobias and Mara arrived with EV-187b, which seeded AC2's six-trainee roster: the
     * picker is built FROM the roster, so a new link is a new option here by
     * construction. That is the property worth having, and this list is where it is
     * checked.
     */
    expect(offered.sort()).toEqual(["Lina M.", "Tobias R.", "Yusuf A."]);
  });

  test("the confirm names the template and the trainee, and says when guardrails apply", async ({
    page,
  }) => {
    await signIn(page);
    const dialog = await openUseDialog(page, SEEDED_A);
    await dialog.locator("select").selectOption({ label: "Yusuf A." });

    await expect(dialog.getByText(`Put “${SEEDED_A}” on Yusuf A.?`, { exact: true })).toBeVisible();
    // AC3, verbatim — apply runs no policy, so the guardrails land at PUBLISH.
    await expect(
      dialog.getByText("Yusuf A.'s injuries and equipment are applied when you publish.", {
        exact: true,
      })
    ).toBeVisible();
    // 🔴 Apply does not publish, and the screen says so BEFORE the coach confirms.
    await expect(dialog.getByText(APPLY_NOT_PUBLISHED, { exact: true })).toBeVisible();
  });

  test("confirming lands on the trainee's editor with a draft and the Started from line", async ({
    page,
  }) => {
    await signIn(page);
    const dialog = await openUseDialog(page, SEEDED_A);
    await dialog.locator("select").selectOption({ label: "Yusuf A." });
    await dialog.getByRole("button", { name: "Use this template" }).click();

    await page.waitForURL(`/clients/${YUSUF}/routine`);
    await expect(page.getByText(DRAFT_BADGE)).toBeVisible();
    // AC3, verbatim.
    await expect(page.getByText(`Started from ${SEEDED_A}`, { exact: true })).toBeVisible();

    // The template's content is in the draft: two days, on the template's weekdays.
    await expect(page.getByLabel("Day 1 weekday")).toHaveValue("1");
    await expect(page.getByLabel("Day 2 weekday")).toHaveValue("4");
    await expect(page.getByLabel("Day 1 focus")).toHaveValue("Upper body");

    /**
     * It is a DRAFT and nothing else. A published plan would show the published badge,
     * and the draft badge and it are mutually exclusive in this editor — so asserting
     * the absence of the published one is asserting that apply wrote no plan.
     */
    await expect(page.getByText("Published plan")).toHaveCount(0);
  });

  test("a second apply is refused, says what it would destroy, and the retry lands", async ({
    page,
  }) => {
    await signIn(page);
    const dialog = await openUseDialog(page, SEEDED_B);
    await dialog.locator("select").selectOption({ label: "Yusuf A." });

    /**
     * The overwrite sentence is NOT on screen yet. This is the assertion that separates
     * D9.1's retry from the pre-read it replaced: a client that read the draft first
     * would have shown this line before pressing anything.
     */
    await expect(
      dialog.getByText("This replaces your unpublished draft for Yusuf A.", { exact: false })
    ).toHaveCount(0);

    await dialog.getByRole("button", { name: "Use this template" }).click();

    // 409 COACH_DRAFT_EXISTS → AC3's sentence, verbatim, and a control that names what
    // it does. The coach is still in the dialog; nothing has been destroyed.
    /**
     * AC3, verbatim, with ONE full stop. The shipped string had two — "Yusuf A.." —
     * because the sentence appended a stop to a display name that already ends in one,
     * and this assertion pinned the typo rather than catching it. Asserting the correct
     * sentence is what turns the test back into a witness.
     */
    await expect(
      dialog.getByText(
        "This replaces your unpublished draft for Yusuf A. That draft cannot be recovered.",
        { exact: true }
      )
    ).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Use this template" })).toHaveCount(0);

    await dialog.getByRole("button", { name: "Replace the draft" }).click();
    await page.waitForURL(`/clients/${YUSUF}/routine`);
    await expect(page.getByText(`Started from ${SEEDED_B}`, { exact: true })).toBeVisible();
  });
});

test.describe("AC5 — an exercise the catalogue may not recognise", () => {
  test("the sentence, the marks in place, and both actions on each marked row", async ({
    page,
  }) => {
    await signIn(page);
    // The previous describe left "Legacy strength" applied to Yusuf.
    await page.goto(`/clients/${YUSUF}/routine`);

    // AC5, verbatim — "may", because the matcher is fuzzy.
    await expect(page.getByText(UNBINDABLE_TWO, { exact: true })).toBeVisible();

    // AC5 — marked IN PLACE, in the day they belong to, so the coach can see WHICH.
    await expect(page.getByText(NOT_IN_CATALOGUE, { exact: true })).toHaveCount(2);

    const svend = page.getByRole("group", { name: "Svend Press", exact: true });
    await expect(svend.getByText(NOT_IN_CATALOGUE, { exact: true })).toBeVisible();
    // Exactly two actions, and both do something. Replace opens the picker; Remove
    // deletes the row — and Remove is the ONLY thing in this story that removes.
    await expect(svend.getByRole("button", { name: "Replace: Svend Press" })).toBeVisible();
    await expect(svend.getByRole("button", { name: "Remove: Svend Press" })).toBeVisible();

    // The exercise that IS in the catalogue is not marked.
    await expect(
      page.getByRole("group", { name: "Dumbbell Bench Press", exact: true }).getByText(
        NOT_IN_CATALOGUE,
        { exact: true }
      )
    ).toHaveCount(0);
  });

  /**
   * 🔴 AC5 calls this a release blocker: it is what separates the re-derived flag from
   * the stored one it replaced. A cached opinion would survive an edit; this one is
   * recomputed by the api on every open.
   */
  test("the marks survive a hard reload, having been stored nowhere", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${YUSUF}/routine`);
    await page.reload();
    await expect(page.getByText(UNBINDABLE_TWO, { exact: true })).toBeVisible();
    await expect(page.getByText(NOT_IN_CATALOGUE, { exact: true })).toHaveCount(2);
  });

  test("removing one marked row takes it out of the sentence as well as off the day", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/clients/${YUSUF}/routine`);
    await page
      .getByRole("group", { name: "Svend Press", exact: true })
      .getByRole("button", { name: "Remove: Svend Press" })
      .click();

    // The count is the flagged rows STILL PRESENT, so the sentence and the marks can
    // never disagree with each other.
    await expect(
      page.getByText(
        "1 exercise may not be in the exercise catalogue. Check it before you publish.",
        { exact: true }
      )
    ).toBeVisible();
    await expect(page.getByText(NOT_IN_CATALOGUE, { exact: true })).toHaveCount(1);
  });
});

/**
 * ⚠ TERMINAL for the template store: this deletes the template the draft came from.
 */
test.describe("AC2 — deleting a template changes nothing about what was made from it", () => {
  test("the Started from line goes, and the draft's content does not", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${YUSUF}/routine`);
    // Read the draft as it stands, exercise by exercise, BEFORE the delete.
    const before = await readDays(page);
    /**
     * Same family as `coach-library.spec.ts`'s readers, and unproven until now: the
     * outer guard witnesses the day list, so a delete that emptied every day would
     * still compare `[]` with `[]` per day and pass. AC2 says the draft is "completely
     * unchanged" and QA "compares exercise by exercise", so the fields are guarded too.
     */
    expect(before.length).toBeGreaterThan(0);
    expect(before[0].exercises.length).toBeGreaterThan(0);
    expect(before[0].exercises[0].name).not.toBe("");
    expect(before[0].exercises[0].sets).not.toBe("");

    await page.goto("/templates");
    await row(page, SEEDED_B).getByRole("button", { name: "Delete" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
    await expect(row(page, SEEDED_B)).toHaveCount(0);

    await page.goto(`/clients/${YUSUF}/routine`);
    // `source_template_id` is ON DELETE SET NULL: the line disappears…
    await expect(page.getByText(`Started from ${SEEDED_B}`, { exact: true })).toHaveCount(0);
    // …and NOTHING else does. This is Ruling 2's test and the one AC2 says must never
    // be allowed to fail quietly.
    await expect(page.getByText(DRAFT_BADGE)).toBeVisible();
    expect(await readDays(page)).toEqual(before);
  });
});

/** The trainee editor's days and prescriptions, read off the screen. */
async function readDays(page: Page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('select[aria-label$="weekday"]')).map((select) => {
      const card = select.closest("div[style]")?.parentElement?.parentElement as HTMLElement;
      return {
        weekday: (select as HTMLSelectElement).value,
        exercises: Array.from(card?.querySelectorAll('[role="group"]') ?? []).map((group) => ({
          name: group.getAttribute("aria-label") ?? "",
          sets: (group.querySelector('input[type="number"]') as HTMLInputElement)?.value ?? "",
        })),
      };
    })
  );
}
