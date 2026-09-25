import { expect, test, type Page } from "@playwright/test";
import { atEachWidth, expectNoSidewaysScroll, expectUnoccluded } from "./layout";

/**
 * EV-188b — the coach's routine library, in **fixture mode** (playwright.config.ts).
 *
 * Every sentence asserted here is a LITERAL, never an import from `src/lib/copy.ts`.
 * Importing the constant would make the assertion agree with the shipped string by
 * construction, so a reworded AC sentence would keep the test green — a fixture derived
 * from its subject cannot witness the subject. `coach-affordance.spec.ts` made the same
 * choice for the same reason.
 *
 * ⚠ FILE ORDER IS LOAD-BEARING. Playwright runs files in NAME order with `workers: 1`,
 * and `coach-routine.spec.ts`'s last test revokes the link — which, in the fixture, sets
 * one process-wide flag that 403s every trainee read for the rest of the run. This file
 * sorts before it ("l" < "r") and must keep doing so.
 *
 * ⚠ THE APPLY PATH IS NOT HERE. `COACH_FIXTURE_SCENARIO=empty` serves a zero-trainee
 * roster, and AC3's picker is built from the roster — so the apply half, its 409 retry
 * and AC5's marks live in `coach-library-apply.spec.ts` under
 * `playwright.roster.config.ts`. What IS here is the branch the empty roster makes
 * reachable and nothing else does: the picker with nobody in it.
 *
 * ⚠ THE LAST DESCRIBE IS TERMINAL. It deletes both seeded templates to reach AC1's
 * empty state, so anything that needs a populated library goes above it.
 */

const EMAIL = "coach@evoli.fit";
const PASSWORD = "Password123!";

/** Lina: a published three-day plan, no draft. The save-as-template source. */
const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
/** Nils: an ACTIVE WORKOUTS link with no plan and no draft — edge case 12's shape. */
const NILS = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0002";

const SEEDED_A = "Upper / Lower split";
const SEEDED_B = "Legacy strength";
/** BUG-243 — a realistic long name (66 characters), the kind senior-qa measured with. */
const LONG_NAME = "Five-day upper/lower hypertrophy block for returning intermediates";

/* ── AC sentences, verbatim, as literals ──────────────────────────────────── */
const PRIVATE = "Templates are yours. No trainee ever sees them.";
const EMPTY_TITLE = "No templates yet";
const NEW_TEMPLATE = "New template";
const NAME_TAKEN = "You already have a template called that.";
const DAY_FULL = "12 exercises is the most in one day.";
const NO_TRAINEES = "You have no trainees who have shared their workouts with you.";
const SAVE_AS_TEMPLATE = "Save as template";

test.describe.configure({ mode: "serial" });

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/");
}

/** A library row, addressed by the template it is for. */
function row(page: Page, name: string) {
  return page.getByRole("group", { name, exact: true });
}

/** One day card in the template editor. Days are named "Day 1", "Day 2", … */
function dayCard(page: Page, dayIndex: number) {
  return page.getByRole("group", { name: `Day ${dayIndex + 1}`, exact: true });
}

test.describe("AC1 — Templates is in the portal's main navigation", () => {
  test("the roster carries a Templates link that opens the library", async ({ page }) => {
    await signIn(page);
    const nav = page.getByRole("navigation", { name: "Portal" });
    await expect(nav.getByRole("link", { name: "Templates" })).toBeVisible();

    await nav.getByRole("link", { name: "Templates" }).click();
    await page.waitForURL("/templates");
    await expect(page.getByRole("heading", { name: "Templates" })).toBeVisible();
    // The nav says where you are, and says it to a screen reader too.
    await expect(
      page.getByRole("navigation", { name: "Portal" }).getByRole("link", { name: "Templates" })
    ).toHaveAttribute("aria-current", "page");
  });

  /**
   * EV-201's lesson, applied to the new chrome: the nav is two more things competing
   * for a 320 px header that already holds a logo, a name and a sign-out control.
   */
  test("the nav does not collide with the coach's name at 320 / 360 / 390 / 414", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/templates");
    const templates = page.getByRole("navigation", { name: "Portal" }).getByRole("link", {
      name: "Templates",
    });
    const signOut = page.getByRole("button", { name: "Sign out" });

    await atEachWidth(page, async () => {
      await expectUnoccluded(page, templates, { over: signOut, label: "Templates nav link" });
      await expectNoSidewaysScroll(page, "the library page");
    });
  });
});

test.describe("AC2 — the library list", () => {
  test("newest-updated first, with name, day count, exercise count and a date", async ({
    page,
  }) => {
    await signIn(page);
    const res = await page.goto("/templates");
    expect(res?.status()).toBe(200);

    // AC4, verbatim, stated once on the library page.
    await expect(page.getByText(PRIVATE, { exact: true })).toBeVisible();

    // Newest-updated FIRST: the seeded rows are 2 and 11 days old, in that order.
    const order = await page
      .getByRole("group")
      .evaluateAll((groups) => groups.map((g) => g.getAttribute("aria-label") ?? ""));
    expect(order).toEqual([SEEDED_A, SEEDED_B]);

    // The seeded rows: A was updated 2 days ago, B 11 days ago.
    await expect(page.getByText(SEEDED_A, { exact: true })).toBeVisible();
    await expect(page.getByText(SEEDED_B, { exact: true })).toBeVisible();
    // AC2 — day count and exercise count, on the row.
    await expect(page.getByText("2 days · 6 exercises").first()).toBeVisible();
    await expect(page.getByText("2 days · 5 exercises").first()).toBeVisible();

    // AC2 — exactly these five controls, on the row for SEEDED_A.
    const card = row(page, SEEDED_A);
    await expect(card.getByRole("link", { name: "Edit" })).toBeVisible();
    for (const control of ["Duplicate", "Rename", "Delete", "Use on a trainee"]) {
      await expect(card.getByRole("button", { name: control })).toBeVisible();
    }
  });

  test("a row does not overflow or occlude its controls at 320 / 360 / 390 / 414", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/templates");
    const name = page.getByText(SEEDED_A, { exact: true });
    const edit = row(page, SEEDED_A).getByRole("link", { name: "Edit" });

    await atEachWidth(page, async () => {
      await expectUnoccluded(page, name, { label: "template name" });
      await expectUnoccluded(page, edit, { over: name, label: "Edit control" });
      await expectNoSidewaysScroll(page, "the library list");
    });
  });

  test("renaming to a name the coach already uses is refused, and nothing changes", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/templates");
    await row(page, SEEDED_B).getByRole("button", { name: "Rename" }).click();

    const field = page.getByLabel("Template name");
    await field.fill(SEEDED_A);
    await page.getByRole("dialog").getByRole("button", { name: "Rename" }).click();

    // AC2, verbatim.
    await expect(page.getByText(NAME_TAKEN, { exact: true })).toBeVisible();

    // Both templates are unchanged: the dialog is still open on B, and the list behind
    // it still holds both names.
    await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
    await page.reload();
    await expect(page.getByText(SEEDED_A, { exact: true })).toBeVisible();
    await expect(page.getByText(SEEDED_B, { exact: true })).toBeVisible();
  });

  test("an empty name and an over-80-character name are refused client-side", async ({ page }) => {
    await signIn(page);
    await page.goto("/templates");
    await row(page, SEEDED_B).getByRole("button", { name: "Rename" }).click();

    const dialog = page.getByRole("dialog");
    const confirm = dialog.getByRole("button", { name: "Rename" });

    await page.getByLabel("Template name").fill("   ");
    await expect(page.getByText("Give the template a name.")).toBeVisible();
    await expect(confirm).toBeDisabled();

    await page.getByLabel("Template name").fill("x".repeat(81));
    await expect(page.getByText("A template name is at most 80 characters.")).toBeVisible();
    await expect(confirm).toBeDisabled();

    // 80 exactly is the bound, not one short of it.
    await page.getByLabel("Template name").fill("y".repeat(80));
    await expect(confirm).toBeEnabled();
  });

  test("Duplicate names the copy, twice without colliding, and the copy is the same routine", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/templates");
    await row(page, SEEDED_A).getByRole("button", { name: "Duplicate" }).click();
    await expect(page.getByText(`${SEEDED_A} (copy)`, { exact: true })).toBeVisible();

    // Edge case 7: the second duplicate does not collide with the first.
    await row(page, SEEDED_A).getByRole("button", { name: "Duplicate" }).click();
    await expect(page.getByText(`${SEEDED_A} (copy 2)`, { exact: true })).toBeVisible();

    /**
     * Ruling 6a — **semantically** identical, not byte-identical. The comparison is on
     * the rendered document (days, weekdays, focuses, exercises, prescriptions), which
     * is what a coach means by "the same template", and is the only comparison the
     * api's own re-serialisation through the write boundary can honour.
     */
    const original = await openAndRead(page, SEEDED_A);
    // The comparison is only worth anything if there is something to compare: two days,
    // three exercises each, each with a prescription. Asserted before `toEqual`, because
    // `toEqual` on two empty shapes is green and proves nothing.
    expect(original.days.length).toBe(2);
    expect(original.days[0].exercises.length).toBe(3);
    expect(original.days[0].exercises[0].sets).not.toBe("");
    const copy = await openAndRead(page, `${SEEDED_A} (copy)`);
    expect(copy).toEqual(original);
  });

  test("Delete names the template and states that nothing made from it changes", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/templates");
    await row(page, `${SEEDED_A} (copy 2)`).getByRole("button", { name: "Delete" }).click();

    await expect(
      page.getByText(
        `“${SEEDED_A} (copy 2)” is deleted from your library. Every plan and every draft you made from it is unchanged.`,
        { exact: true }
      )
    ).toBeVisible();

    await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText(`${SEEDED_A} (copy 2)`, { exact: true })).toHaveCount(0);

    // And it is gone from the SERVER, not only from this client's state.
    await page.reload();
    await expect(page.getByText(`${SEEDED_A} (copy 2)`, { exact: true })).toHaveCount(0);
  });
});

test.describe("AC1 — the coach builds a template from nothing", () => {
  /**
   * ADR-0016 §Amendment V1b on screen: the server accepts only a publishable template,
   * so a blank one cannot be parked on it and the editor says why rather than offering
   * a Save that 400s.
   */
  test("a blank template cannot be saved, and the editor lists exactly why", async ({ page }) => {
    await signIn(page);
    await page.goto("/templates/new");

    await expect(page.getByRole("button", { name: "Save template" })).toBeDisabled();
    await expect(page.getByText("This template is not ready to save yet:")).toBeVisible();
    await expect(page.getByText("Give the template a name.")).toBeVisible();
    await expect(page.getByText("Day 1 has no exercises.")).toBeVisible();
    await expect(page.getByText("Day 2 has no exercises.")).toBeVisible();
    await expect(
      page.getByText("Nothing here is saved until you press Save template.")
    ).toBeVisible();
  });

  test("named, filled, saved — and the same values come back after a hard reload", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/templates/new");

    await page.getByLabel("Template name").fill("Full body A");
    await addExercises(page, 0, 3);
    await addExercises(page, 1, 3);

    const save = page.getByRole("button", { name: "Save template" });
    await expect(save).toBeEnabled();
    await save.click();

    // The create becomes an edit: the URL is replaced with the stored template's.
    await page.waitForURL(/\/templates\/[0-9a-f-]{36}$/);
    await expect(page.getByText("Template saved")).toBeVisible();

    const before = await readEditor(page);
    expect(before.days.length).toBe(2);
    expect(before.days[0].exercises.length).toBe(3);
    // Same reason as the save-as-template comparison: a reload that preserved the day
    // count and lost every prescription would pass on the outer guard alone.
    expect(before.days[0].exercises[0].sets).not.toBe("");
    expect(before.days[0].exercises[0].reps).not.toBe("");
    expect(before.days[0].exercises[0].rest).not.toBe("");
    // AC1 — "editable again with the same values after a hard reload".
    await page.reload();
    await expect(page.getByRole("group", { name: "Day 1", exact: true })).toBeVisible();
    expect(await readEditor(page)).toEqual(before);

    await page.goto("/templates");
    await expect(page.getByText("Full body A", { exact: true })).toBeVisible();
    // AC1, verbatim, for a template saved moments ago.
    await expect(page.getByText("Updated just now").first()).toBeVisible();
  });

  test("the 12th exercise is the last: Add exercise is unavailable and says so", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/templates/new");
    await page.getByLabel("Template name").fill("Twelve");
    await addExercises(page, 0, 12);

    const add = dayCard(page, 0).getByRole("button", { name: "Add exercise" });
    // AC2 — "it is never a control that looks pressable and then fails".
    await expect(add).toBeDisabled();
    await expect(add).toHaveAttribute("title", DAY_FULL);
    await expect(page.getByText(DAY_FULL, { exact: true })).toBeVisible();
  });

  test("the day header does not overlap at 320 / 360 / 390 / 414", async ({ page }) => {
    await signIn(page);
    await page.goto("/templates/new");
    const focus = page.getByLabel("Day 1 focus");
    const weekday = page.getByLabel("Day 1 weekday");

    await atEachWidth(page, async () => {
      await expectUnoccluded(page, focus, { over: weekday, label: "Day 1 focus field" });
      await expectNoSidewaysScroll(page, "the template editor");
    });
  });
});

test.describe("AC1 — Save as template, from the trainee's Routine page", () => {
  test("pre-named with the plan's name, editable, and the template matches the plan", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/clients/${LINA}/routine`);
    await page.getByRole("button", { name: SAVE_AS_TEMPLATE }).click();

    const dialog = page.getByRole("dialog");
    // AC1 — "pre-named with the plan's name and editable before saving".
    await expect(dialog.getByLabel("Template name")).toHaveValue(
      "Intermediate Muscle Building Routine"
    );
    await dialog.getByLabel("Template name").fill("Lina's plan");
    await dialog.getByRole("button", { name: SAVE_AS_TEMPLATE }).click();
    await expect(page.getByText("“Lina's plan” is in your templates.")).toBeVisible();

    // AC1 — the template's days, exercises, sets, reps and rest are identical to the
    // plan's. Read off the two screens, exercise by exercise.
    const plan = await readTraineeEditor(page);
    /**
     * ⚠ GUARD THE FIELDS, NOT JUST THE OUTER LIST.
     *
     * `expect(plan.days.length).toBe(3)` alone was not enough, and that is measured:
     * blinding BOTH readers' label lookup so `sets` / `reps` / `rest` answered `""` on
     * every row left this test GREEN, while the Duplicate test at :194 — which already
     * carried these three lines — went red under the identical probe. The outer guard
     * witnesses days, weekdays, focuses and exercise names; AC1 asks for sets, reps and
     * rest too ("QA compares exercise by exercise"), and an empty string compared with
     * an empty string is the same vacuous pass as `{days: []}` vs `{days: []}`.
     */
    expect(plan.days.length).toBe(3);
    expect(plan.days[0].exercises.length).toBeGreaterThan(0);
    expect(plan.days[0].exercises[0].sets).not.toBe("");
    expect(plan.days[0].exercises[0].reps).not.toBe("");
    expect(plan.days[0].exercises[0].rest).not.toBe("");
    await page.goto("/templates");
    const template = await openAndRead(page, "Lina's plan");
    expect(template.days).toEqual(plan.days);
  });

  test("a trainee with no plan and no draft is offered no Save as template control", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/clients/${NILS}/routine`);
    // Edge case 12 — "unavailable in the portal", not a control that then refuses.
    await expect(page.getByRole("button", { name: SAVE_AS_TEMPLATE })).toHaveCount(0);
  });
});

test.describe("AC3 — a coach with no writable trainees is told so, not shown a 403", () => {
  test("the picker says there is nobody rather than offering a trainee it cannot use", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/templates");
    await row(page, SEEDED_A).getByRole("button", { name: "Use on a trainee" }).click();
    await expect(page.getByText(NO_TRAINEES, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Use this template" })).toBeDisabled();
  });
});

/**
 * BUG-243 — a realistic long template name widened the list's grid track to the
 * UNWRAPPED title (the implicit `auto` track sizes to min-content, and the title is
 * `nowrap`), so the library scrolled sideways at 320/360 and every card was clipped on
 * its right edge. The seeded names are short, which is why the sweep above was green.
 * The name is put there through Rename; the terminal describe below deletes it with
 * everything else.
 */
test.describe("BUG-243 — a long template name", () => {
  test("neither scrolls the library sideways nor clips a card, at 320 / 360 / 390 / 414", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/templates");
    await row(page, SEEDED_B).getByRole("button", { name: "Rename" }).click();
    await page.getByLabel("Template name").fill(LONG_NAME);
    await page.getByRole("dialog").getByRole("button", { name: "Rename" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.reload();
    await expect(row(page, LONG_NAME)).toBeVisible();

    await atEachWidth(page, async (width) => {
      await expectNoSidewaysScroll(page, "library with a long name");
      // No card past the viewport: a clipped card is the same defect even where the
      // document happens not to scroll. The card is the row group's parent.
      const overhang = await page
        .getByRole("group")
        .evaluateAll((groups) =>
          groups.map(
            (g) =>
              (g.parentElement ?? g).getBoundingClientRect().right -
              document.documentElement.clientWidth
          )
        );
      expect(overhang.length).toBeGreaterThan(0);
      expect(Math.max(...overhang), `a card overhangs the viewport at ${width}px`).toBeLessThanOrEqual(0.5);
      const long = row(page, LONG_NAME);
      await expectUnoccluded(page, long.getByRole("button", { name: "Use on a trainee" }), {
        label: "long-name row Use on a trainee",
      });
    });
  });
});

/**
 * ⚠ TERMINAL. Everything below empties the library, so nothing that needs a row may be
 * added after it.
 */
test.describe("AC1 — the empty library", () => {
  test("deleting the last template renders the empty state and one primary control", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/templates");

    /**
     * Delete every row there is, addressing each BY NAME and reloading between.
     *
     * A "click the first Delete" loop is flaky by construction here: the successful
     * delete calls `router.refresh()`, so the list re-renders and the next `.first()`
     * resolves to an element that is detached before it can be clicked. Naming the row
     * and re-reading the page is the same fix `coach-routine.spec.ts` needed for the
     * discard — asserting against a fresh server render is also the only thing that
     * proves the STORE agrees, rather than just this client's optimistic state.
     */
    const names = await page
      .getByRole("group")
      .evaluateAll((groups) => groups.map((g) => g.getAttribute("aria-label") ?? ""));
    for (const name of names) {
      await row(page, name).getByRole("button", { name: "Delete" }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await page.reload();
      await expect(row(page, name)).toHaveCount(0);
    }

    // AC1, verbatim — never a blank page.
    await expect(page.getByText(EMPTY_TITLE, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: NEW_TEMPLATE })).toHaveCount(2);
  });
});

/* ── helpers ──────────────────────────────────────────────────────────────── */

/**
 * Add `count` exercises to day `dayIndex` through the catalogue picker.
 *
 * The picker's result rows are the only buttons in the dialog carrying a `title`;
 * `getByRole("button").first()` is the modal's Close, and clicking it looks exactly
 * like a pick that did nothing.
 */
async function addExercises(page: Page, dayIndex: number, count: number) {
  await page
    .getByRole("group", { name: `Day ${dayIndex + 1}`, exact: true })
    .getByRole("button", { name: "Add exercise" })
    .click();
  const dialog = page.getByRole("dialog");
  for (let i = 0; i < count; i += 1) {
    await dialog.locator("button[title]").nth(i).click();
  }
  await dialog.getByRole("button").first().click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

type EditorState = {
  days: { weekday: string; focus: string; exercises: { name: string; sets: string; reps: string; rest: string }[] }[];
};

/** The template editor's whole document, read off the screen. */
async function readEditor(page: Page): Promise<EditorState> {
  return page.evaluate(() => {
    const cards = Array.from(
      document.querySelectorAll('[role="group"][aria-label^="Day "]')
    );
    return {
      days: cards.map((card) => ({
        weekday: (card.querySelector('select[aria-label$="weekday"]') as HTMLSelectElement).value,
        focus: (card.querySelector('input[aria-label$="focus"]') as HTMLInputElement).value,
        exercises: Array.from(card.querySelectorAll('[role="group"]')).map((group) => {
          const value = (label: string) =>
            (
              Array.from(group.querySelectorAll("label")).find(
                (l) => l.textContent?.trim().startsWith(label)
              )?.querySelector("input") as HTMLInputElement | undefined
            )?.value ?? "";
          return {
            name: group.getAttribute("aria-label") ?? "",
            sets: value("Sets"),
            reps: value("Reps"),
            rest: value("Rest"),
          };
        }),
      })),
    };
  });
}

/**
 * The TRAINEE's routine editor, in the same shape.
 *
 * It is a different component with a different DOM — its day cards are not named
 * groups — so it gets its own reader rather than a selector that silently matches
 * nothing on one of the two screens.
 */
async function readTraineeEditor(page: Page): Promise<EditorState> {
  await expect(page.getByLabel("Day 1 weekday")).toBeVisible();
  return page.evaluate(() => {
    const selects = Array.from(document.querySelectorAll('select[aria-label$="weekday"]'));
    return {
      days: selects.map((select) => {
        const card = select.closest("div[style]")?.parentElement?.parentElement as HTMLElement;
        const focus = card.querySelector('input[aria-label$="focus"]') as HTMLInputElement;
        return {
          weekday: (select as HTMLSelectElement).value,
          focus: focus.value,
          exercises: Array.from(card.querySelectorAll('[role="group"]')).map((group) => {
            const value = (label: string) =>
              (
                Array.from(group.querySelectorAll("label")).find((l) =>
                  l.textContent?.trim().startsWith(label)
                )?.querySelector("input") as HTMLInputElement | undefined
              )?.value ?? "";
            return {
              name: group.getAttribute("aria-label") ?? "",
              sets: value("Sets"),
              reps: value("Reps"),
              rest: value("Rest"),
            };
          }),
        };
      }),
    };
  });
}

/** Open a template from the library and read its document. */
async function openAndRead(page: Page, name: string): Promise<EditorState> {
  await page.goto("/templates");
  await page.getByRole("group", { name, exact: true }).getByRole("link", { name: "Edit" }).click();
  await page.waitForURL(/\/templates\/[0-9a-f-]{36}$/);
  /**
   * ⚠ WAIT FOR THE EDITOR BEFORE READING IT.
   *
   * Without this, `readEditor` ran against a page whose day cards had not rendered and
   * answered `{ days: [] }` — for BOTH sides of the duplicate comparison, so
   * `toEqual` passed on two empty objects. Measured: with the fixture's duplicate
   * deliberately changing a prescription, the assertion stayed green. A comparison of
   * two nothings is the purest form of a test that cannot fail.
   */
  await expect(page.getByRole("group", { name: "Day 1", exact: true })).toBeVisible();
  return readEditor(page);
}
