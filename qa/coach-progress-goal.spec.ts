import { expect, test, type Page } from "@playwright/test";
import { atEachWidth, expectNoSidewaysScroll, expectUnoccluded } from "./layout";
import { buildProgressGoalRequest, toGoValue } from "../src/lib/progressGoal";

/**
 * EV-202b — the progress block on the trainee's page: AC1 (the two values persist),
 * AC2 (start and current are derived, and only two fields exist), AC3 (the baseline
 * moves with the start date and an out-of-reach start date leaves an EMPTY delta, not
 * a zero), AC4 ("Not recorded" ≠ `0 %`), AC5 (no readings at all), AC6 (the scope gates
 * the block, from `scopes`), edge cases 2, 4, 5, 6 and 7, and G-GOAL.
 *
 * Fixture mode, default config. The fixture DERIVES the block from each trainee's
 * reading list on every read, so moving the start date really moves the baseline —
 * which is what makes AC3 assertable in a browser without a database.
 *
 * 🔴 **The property this suite exists for, above all the others: the edit form always
 * sends BOTH fields.** `PUT …/progress-goal` is a whole representation, so a request
 * carrying only the value the coach just edited CLEARS the other one, answers `200`,
 * and leaves no audit trail. For the start date the damage is invisible — a cleared
 * `startedOn` falls back to the link date, so the block renders a PLAUSIBLE WRONG DATE
 * rather than a blank. Two tests pin it: one on the pure builder's key set, and one
 * that edits a single field in the browser, reloads, and asserts the other survived.
 *
 * What each trainee proves:
 *   Lina   — a full block: both values set, a cut, deltas on both metrics, and every
 *            write case. She is read-only in this file until the writes begin.
 *   Tobias — body-fat readings on DIFFERENT days from the weights (edge case 2), and a
 *            milestone ABOVE his current weight (edge case 4, a bulk).
 *   Omar   — a milestone EQUAL to his current weight (edge case 5).
 *   Nils   — one weigh-in and no body fat: a REAL `0.0 kg` delta next to "Not
 *            recorded" (AC4, both halves of it on one screen).
 *   Sara   — no readings at all, plus a milestone whose author has left.
 *   Kaia   — no readings and no milestone: AC5, with the form still saving.
 *   Yusuf  — WORKOUTS only, so the block is the scope sentence and has NO controls.
 */

test.describe.configure({ mode: "serial" });

const EMAIL = "coach@evoli.fit";
const PASSWORD = "Password123!";

const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
const NILS = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0002";
const SARA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0003";
const OMAR = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0005";
const YUSUF = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0007";
const TOBIAS = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0009";
const KAIA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0010";

const BLOCK = "Progress and milestone";

/**
 * ⚠ Matched with `{ exact: true }` at every call site, which is not a style choice.
 * Playwright's default `getByText` is a CASE-INSENSITIVE SUBSTRING match, and the
 * out-of-range sentence ends "…Nothing was saved." — so a plain `getByText("Saved.")`
 * finds the error message and the assertion "the save did not succeed" passes while
 * the save is failing, or fails while it is succeeding. It cost one red test here.
 */
const SAVED = "Saved.";

/** The fixture's own `isoDate`, copied so the spec and the fixture cannot disagree. */
function isoDate(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/");
}

/**
 * The block by its LANDMARK, never a `div` filtered by its title. A div filtered by
 * text resolves to the innermost element containing that string — the title itself —
 * so every assertion about the body would be checking the heading, and every negative
 * assertion would be green by construction.
 */
function block(page: Page) {
  return page.getByRole("region", { name: BLOCK });
}

function row(page: Page, metric: "weight" | "bodyFat") {
  return block(page).locator(`[data-metric="${metric}"]`);
}

function cell(page: Page, metric: "weight" | "bodyFat", key: string) {
  return row(page, metric).locator(`[data-cell="${key}"]`);
}

function startDateField(page: Page) {
  return block(page).getByLabel("Coaching start date");
}

function milestoneField(page: Page) {
  return block(page).getByLabel("Milestone weight (kg)");
}

async function save(page: Page) {
  await block(page).getByRole("button", { name: "Save" }).click();
}

/** Put Lina back to a known state before a write test, so the file order is not a trap. */
async function setLina(page: Page, startedOn: string, milestone: string) {
  await page.goto(`/clients/${LINA}`);
  await startDateField(page).fill(startedOn);
  await milestoneField(page).fill(milestone);
  await save(page);
  await expect(block(page).getByText(SAVED, { exact: true })).toBeVisible();
}

/* ════════════════════════════════════════════════════════════════════════════
 * READ-ONLY FIRST. Nothing below writes to the fixture.
 * ════════════════════════════════════════════════════════════════════════════ */

test.describe("AC2 — start and current are derived, and the arithmetic is reproducible", () => {
  test("the weight row prints start, current, the delta, the milestone and the figure to go", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/clients/${LINA}`);

    /**
     * AC2's line, on the fixture's own numbers: Lina's eight weekly weigh-ins run
     * 71.2 → 70.4, her start date is the day of the first of them, and her milestone
     * is 68.0. 70.4 − 71.2 = −0.8, and 68.0 − 70.4 = −2.4 — which is the figure the
     * api sends SIGNED and this row must not print with its minus sign.
     *
     * The two dates are matched loosely because they are relative to today; the
     * numbers, the separators, the order and the words are exact.
     */
    await expect(row(page, "weight")).toHaveText(
      /^Weight — Start 71\.2 kg \(.+\) · Current 70\.4 kg \(.+\) · −0\.8 kg · Milestone 68\.0 kg · 2\.4 kg to go$/
    );
  });

  test("the body fat row has no milestone cell, and no date when it agrees with the weight's", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/clients/${LINA}`);

    // AC2 prints the body-fat row with NO dates — Lina's body fats were recorded on
    // the same days as the weights beside them, so a date here would be the same date
    // twice on one line. Tobias, below, is the trainee for whom they differ.
    await expect(row(page, "bodyFat")).toHaveText(
      "Body fat — Start 24.0 % · Current 22.5 % · −1.5 pts"
    );
    // AC2: "with **no** milestone cell". EV-202 rules a milestone for body fat, waist
    // or anything but weight out of scope by name.
    await expect(cell(page, "bodyFat", "milestone")).toHaveCount(0);
    await expect(cell(page, "bodyFat", "toGo")).toHaveCount(0);
  });

  test("the block contains exactly two form fields, and neither holds a derived number", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/clients/${LINA}`);

    /**
     * AC2's absence assertion, done by COUNTING rather than by looking for the fields
     * we know about: a third input is a defect whatever it is called. The coach types
     * a start date and a milestone; start weight, current weight, start body fat and
     * current body fat are the trainee's own readings and have no write path.
     */
    await expect(block(page).locator("input")).toHaveCount(2);

    const values = await block(page).locator("input").evaluateAll((els) =>
      els.map((el) => (el as HTMLInputElement).value)
    );
    for (const derived of ["71.2", "70.4", "24", "22.5", "-0.8"]) {
      expect(values, `a derived number is sitting in an editable field: ${derived}`).not.toContain(
        derived
      );
    }
  });

  test("the figure to go is never printed with a minus sign — and the delta still is", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/clients/${LINA}`);

    /**
     * 🔴 `weightToGoKg` is SIGNED (`milestone − current`), so Lina's is −2.4. Printed
     * raw under the words "to go" it reads "−2.4 kg to go", where AC2's prose reads
     * "6.0 kg to go" for the same shape. "To go" is a DISTANCE and a distance is not
     * signed.
     */
    await expect(cell(page, "weight", "toGo")).toHaveText("2.4 kg to go");
    const toGo = (await cell(page, "weight", "toGo").textContent()) ?? "";
    expect(toGo).not.toContain("−");
    expect(toGo).not.toContain("-");

    /**
     * The counter-assertion, without which the one above would also pass against a
     * component that had stripped every sign on the row. The DELTA is a change, a
     * change has a direction, and it keeps its real minus sign.
     */
    await expect(cell(page, "weight", "delta")).toHaveText("−0.8 kg");
  });
});

test.describe("edge cases 2, 4 and 5 — dates that differ, a bulk, and an exact hit", () => {
  test("body fat prints its own dates when they differ from the weights beside them", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/clients/${TOBIAS}`);

    // Edge case 2: the two columns resolve independently and may name different days.
    // Tobias's body fats were recorded on days his weights were not, so each cell
    // prints its own date rather than the screen printing one heading date.
    await expect(cell(page, "bodyFat", "start")).toHaveText(/^Start 26\.0 % \(.+\)$/);
    await expect(cell(page, "bodyFat", "current")).toHaveText(/^Current 25\.2 % \(.+\)$/);
    await expect(cell(page, "bodyFat", "delta")).toHaveText("−0.8 pts");
  });

  test("a milestone above the current weight reads '+2.4 kg to go', with no warning", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/clients/${TOBIAS}`);

    // Edge case 4, verbatim on the figure: a bulk KEEPS its plus. It is the one case
    // where the coach must go up, and dropping the sign would print a bulk and a cut
    // identically. No direction is assumed and nothing fires.
    await expect(cell(page, "weight", "toGo")).toHaveText("+2.4 kg to go");
    await expect(block(page).getByText(/warning|careful|too high/i)).toHaveCount(0);
  });

  test("a milestone equal to the current weight reads '0.0 kg to go', with no celebration", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/clients/${OMAR}`);

    // Edge case 5. No celebration, no event, no 🎉 — the block says the number and
    // stops.
    await expect(cell(page, "weight", "toGo")).toHaveText("0.0 kg to go");
    await expect(block(page).getByText(/reached|congratulations|well done/i)).toHaveCount(0);
  });
});

test.describe("AC4 — the two weight sources disagree about what exists, and the screen says so", () => {
  test("one weigh-in gives a REAL 0.0 kg delta, and body fat reads 'Not recorded'", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/clients/${NILS}`);

    /**
     * Nils has a single `weigh_ins` row and no `body_measurements` at all. Start and
     * current are the same reading, so the delta is `0.0 kg` — a REAL zero, present as
     * a cell — while body fat is a different fact entirely.
     *
     * This test is also the counter-witness for AC3 below: it proves that a delta cell
     * DOES render when there is a delta to render, so AC3's "no delta cell" is the
     * absence of a fact and not the absence of a feature.
     */
    await expect(cell(page, "weight", "delta")).toHaveText("0.0 kg");

    // AC4, verbatim: "Not recorded" — "not `0 %`, not a dash, not an empty row".
    await expect(row(page, "bodyFat")).toHaveText("Body fat — Not recorded");
    /**
     * The VALUE, read from its own cell rather than from the row — the row's label is
     * separated by an em dash, so a "no dash" assertion made against the whole line
     * would fail on the punctuation instead of on the value. AC4 is about what stands
     * where a reading would: not `0 %`, not a dash, not nothing.
     */
    const value = (await cell(page, "bodyFat", "absent").textContent()) ?? "";
    expect(value).toBe("Not recorded");
    expect(value).not.toContain("0 %");
    expect(value).not.toContain("—");
    // …and it is ONE cell: no start, no current, no delta pretending to be zero.
    await expect(row(page, "bodyFat").locator("[data-cell]")).toHaveCount(1);
  });
});

test.describe("AC6 — the scope gates the whole block", () => {
  test("a link without WEIGH_INS gets the sentence and NO controls", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${YUSUF}`);

    /**
     * AC6, verbatim, and rendered from `overview.scopes` — never inferred from a 403.
     * The api's denial body is undifferentiated across "no such id", "another coach's
     * client", "revoked" and "scope missing" (ADR-0012 D4), so a status code carries
     * no information about consent and must never be rendered as if it did.
     */
    await expect(block(page).getByText("Yusuf hasn't shared their weigh-ins with you.")).toBeVisible();

    /**
     * The write half of AC6 — "`PUT …/progress-goal` for TRAINEE-C answers 403" — is
     * EV-202a's guard and is asserted against the api, where the guard is. What this
     * surface owes is that it offers NO way to try: no field, no Save, nothing inert.
     */
    await expect(block(page).locator("input")).toHaveCount(0);
    await expect(block(page).getByRole("button", { name: "Save" })).toHaveCount(0);
    // And it must not borrow the neighbouring card's sentence for the same fact.
    await expect(block(page).getByText("This trainee has not shared their weigh-ins with you.")).toHaveCount(0);
  });
});

test.describe("G-GOAL — the milestone is a narrative number and the block says so", () => {
  test("no projection, no bar, no target-shaped vocabulary", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${LINA}`);

    /**
     * Ruling 2 binds this surface: the milestone must not LOOK like an input to
     * anything. The sentence is the positive half, and it is a negative claim about
     * the system — witnessed by EV-202 AC8's two release-blocking api runs (the static
     * grep and the difference-of-zero re-generation), not by an assurance written here.
     */
    await expect(
      block(page).getByText(
        "A number you and your trainee agreed. Plans and nutrition targets are not calculated from it."
      )
    ).toBeVisible();

    // The negative half: nothing that renders the milestone as something the product
    // is working toward, and nothing that projects from it.
    await expect(block(page).locator("progress, [role='progressbar'], meter")).toHaveCount(0);
    await expect(
      block(page).getByText(/projected|on track|at this rate|forecast|will reach|expected by/i)
    ).toHaveCount(0);
  });
});

test.describe("the block at 320, 360, 390 and 414", () => {
  test("no sideways scroll, and the two fields and Save are reachable at every width", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/clients/${LINA}`);

    await atEachWidth(page, async () => {
      await expectNoSidewaysScroll(page, "the trainee page with the progress block");
      await expectUnoccluded(page, row(page, "weight"), { label: "the weight row" });
      await expectUnoccluded(page, startDateField(page), {
        over: milestoneField(page),
        label: "the start date field",
      });
      await expectUnoccluded(page, block(page).getByRole("button", { name: "Save" }), {
        label: "the Save button",
      });
      // EV-190c / BUG-146's floor: both fields are controls a coach taps at 390 px.
      for (const field of [startDateField(page), milestoneField(page)]) {
        const box = await field.boundingBox();
        expect(box!.height, "a field under the 44 px touch floor").toBeGreaterThanOrEqual(44);
      }
    });
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * THE PURE PINS. No browser, no fixture — the decisions themselves.
 * ════════════════════════════════════════════════════════════════════════════ */

test.describe("the request is a whole representation", () => {
  test("every branch of the builder carries BOTH keys", () => {
    /**
     * 🔴 Trap 2, pinned at its source. `PUT …/progress-goal` clears what it is not
     * sent, so a body with one key is a silent wipe — and the start date is the worse
     * half, because a cleared `startedOn` comes back as the link date and renders as a
     * plausible wrong date rather than as a blank.
     *
     * All four branches, including the two where a value is null: an empty field is an
     * explicit CLEAR (edge case 7 — "an explicit null is a write, not a no-op"), and a
     * clear must still travel as a key.
     */
    const cases: [string, string][] = [
      ["2026-06-01", "80"],
      ["2026-06-01", ""],
      ["", "80"],
      ["", ""],
    ];
    for (const [date, milestone] of cases) {
      const built = buildProgressGoalRequest(date, milestone);
      expect(built.ok, `${date} / ${milestone} should build`).toBe(true);
      if (!built.ok) continue;
      expect(
        Object.keys(built.body).sort(),
        `a request built from "${date}" / "${milestone}" is missing a key — the api would CLEAR the field it does not receive`
      ).toEqual(["milestoneWeightKg", "startedOn"]);
    }

    // And the witness that the four cases are not all the same case: the VALUES differ.
    const both = buildProgressGoalRequest("2026-06-01", "80");
    const neither = buildProgressGoalRequest("", "");
    expect(both.ok && both.body).toEqual({ startedOn: "2026-06-01", milestoneWeightKg: 80 });
    expect(neither.ok && neither.body).toEqual({ startedOn: null, milestoneWeightKg: null });
  });

  test("a milestone that is not a number is refused before a request is built", () => {
    // No clamp and no silent coercion — and NOT a range check either: 25..300 kg is
    // the api's refusal to make (edge case 6), and pre-empting it here would hide the
    // mistake instead of reporting it.
    expect(buildProgressGoalRequest("", "abc")).toEqual({ ok: false, reason: "MILESTONE" });
    expect(buildProgressGoalRequest("not-a-date", "").ok).toBe(false);
    // 500 kg is out of RANGE, and it still builds: the api answers, not the browser.
    expect(buildProgressGoalRequest("", "500").ok).toBe(true);
  });

  test("the signed 'to go' figure renders in all three directions", () => {
    expect(toGoValue(-6)).toBe("6.0 kg"); // AC2's cut — magnitude, unsigned
    expect(toGoValue(4)).toBe("+4.0 kg"); // edge case 4's bulk — the plus is the direction
    expect(toGoValue(0)).toBe("0.0 kg"); // edge case 5's exact hit
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * THE WRITES. Everything below mutates the fixture.
 * ════════════════════════════════════════════════════════════════════════════ */

test.describe("AC5 — no readings at all, and the milestone is still editable", () => {
  test("Kaia's block says she hasn't recorded a weight, and the form still saves", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/clients/${KAIA}`);

    // AC5, verbatim. No table, no zeroes, no NaN, no empty row pretending to be data.
    await expect(block(page).getByText("Kaia hasn't recorded a weight yet.")).toBeVisible();
    await expect(row(page, "weight")).toHaveCount(0);
    await expect(row(page, "bodyFat")).toHaveCount(0);

    // "…and the milestone field is still editable and still saves." A coach agreeing a
    // milestone with a trainee who has not weighed in yet is the first conversation,
    // not an error state.
    await milestoneField(page).fill("70");
    await save(page);
    await expect(block(page).getByText(SAVED, { exact: true })).toBeVisible();

    await page.reload();
    await expect(milestoneField(page)).toHaveValue("70");
    await expect(block(page).locator("[data-provenance='milestone']")).toHaveText(
      /^Milestone set by Alex R\. on .+$/
    );
    // Still no readings, so still no table and still no invented "to go".
    await expect(block(page).getByText("Kaia hasn't recorded a weight yet.")).toBeVisible();
  });

  test("a milestone whose author has left keeps the number and says so", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${SARA}`);

    // Edge case 10's honesty clause, and the `ON DELETE SET NULL` case: the coach's
    // account is gone and the number is not.
    await expect(block(page).locator("[data-provenance='milestone']")).toHaveText(
      "Milestone set by a coach who has left"
    );
    await expect(milestoneField(page)).toHaveValue("62");
  });
});

test.describe("AC1 and AC3 — the two values persist, and the baseline moves with the date", () => {
  test("both values persist across a reload", async ({ page }) => {
    await signIn(page);
    await setLina(page, isoDate(50), "65");

    await page.reload();
    await expect(startDateField(page)).toHaveValue(isoDate(50));
    await expect(milestoneField(page)).toHaveValue("65");
    await expect(cell(page, "weight", "milestone")).toHaveText("Milestone 65.0 kg");
    // 65.0 − 70.4 = −5.4, printed as a distance.
    await expect(cell(page, "weight", "toGo")).toHaveText("5.4 kg to go");
    await expect(block(page).locator("[data-provenance='startedOn']")).toHaveText(
      /· set by a coach$/
    );
  });

  test("moving the start date forward moves the start baseline", async ({ page }) => {
    await signIn(page);
    await setLina(page, isoDate(50), "65");

    // Lina's weigh-ins are weekly; 22 days ago is the fifth of them, at 70.9 kg. The
    // baseline is the first reading ON OR AFTER the start date, so it must become that
    // reading and not stay at the earliest of all time.
    await startDateField(page).fill(isoDate(22));
    await save(page);
    await expect(block(page).getByText(SAVED, { exact: true })).toBeVisible();

    await expect(cell(page, "weight", "start")).toHaveText(/^Start 70\.9 kg \(.+\)$/);
    // 70.4 − 70.9 = −0.5, recomputed by the api and not by the browser.
    await expect(cell(page, "weight", "delta")).toHaveText("−0.5 kg");
  });

  test("a start date after every reading leaves the delta EMPTY, never 0 and never the earliest reading", async ({
    page,
  }) => {
    await signIn(page);
    await setLina(page, isoDate(50), "65");

    // Edge case 3: a start date in the future is allowed (a programme starting Monday).
    const future = isoDate(-30);
    await startDateField(page).fill(future);
    await save(page);
    await expect(block(page).getByText(SAVED, { exact: true })).toBeVisible();

    // AC3, verbatim.
    await expect(cell(page, "weight", "start")).toHaveText(/^No reading on or after .+$/);

    /**
     * 🔴 The delta cell is ABSENT, not empty and not zero. "We cannot say" and "no
     * change" are two different statements about a person, and AC3 exists because
     * rendering the first as the second is the easy mistake. An absent CELL is what
     * makes the distinction assertable at all — an empty `<span>` has no text to find.
     */
    await expect(cell(page, "weight", "delta")).toHaveCount(0);
    await expect(cell(page, "bodyFat", "delta")).toHaveCount(0);

    const weight = (await row(page, "weight").textContent()) ?? "";
    expect(weight, "a zero delta was rendered where there is no delta").not.toContain("0.0 kg ·");
    expect(weight, "the start column reached backwards past the start date").not.toContain("71.2");

    // The CURRENT column is untouched: the latest reading has no date filter on it.
    await expect(cell(page, "weight", "current")).toHaveText(/^Current 70\.4 kg \(.+\)$/);
  });
});

test.describe("🔴 the edit form always sends BOTH fields", () => {
  test("editing only the milestone leaves the start date exactly as it was", async ({ page }) => {
    await signIn(page);
    await setLina(page, isoDate(50), "65");

    const before = await block(page).locator("[data-provenance='startedOn']").textContent();
    const startBefore = await cell(page, "weight", "start").textContent();

    // ONE field is touched. If the request carried only what changed, the fixture —
    // which clears what it is not sent, exactly as the api does — would drop the start
    // date, and the provenance line would fall back to the link-date clause.
    await milestoneField(page).fill("66");
    await save(page);
    await expect(block(page).getByText(SAVED, { exact: true })).toBeVisible();
    await page.reload();

    await expect(startDateField(page)).toHaveValue(isoDate(50));
    await expect(block(page).locator("[data-provenance='startedOn']")).toHaveText(before!);
    await expect(cell(page, "weight", "start")).toHaveText(startBefore!);
    await expect(block(page).locator("[data-provenance='startedOn']")).not.toHaveText(
      /no start date set/
    );
    await expect(cell(page, "weight", "milestone")).toHaveText("Milestone 66.0 kg");
  });

  test("editing only the start date leaves the milestone exactly as it was", async ({ page }) => {
    await signIn(page);
    await setLina(page, isoDate(50), "65");

    await startDateField(page).fill(isoDate(22));
    await save(page);
    await expect(block(page).getByText(SAVED, { exact: true })).toBeVisible();
    await page.reload();

    await expect(milestoneField(page)).toHaveValue("65");
    await expect(cell(page, "weight", "milestone")).toHaveText("Milestone 65.0 kg");
    await expect(block(page).locator("[data-provenance='milestone']")).toHaveText(
      /^Milestone set by Alex R\. on .+$/
    );
  });
});

test.describe("edge cases 6 and 7 — a refused number, and a deliberate clear", () => {
  test("an out-of-range milestone is refused, and NOTHING is written — including the date", async ({
    page,
  }) => {
    await signIn(page);
    await setLina(page, isoDate(50), "65");

    // Edge case 6: `> 300` kg is a 400 and never a silent clamp.
    await startDateField(page).fill(isoDate(22));
    await milestoneField(page).fill("500");
    await save(page);
    await expect(
      block(page).getByText("A milestone weight must be between 25 and 300 kg. Nothing was saved.")
    ).toBeVisible();
    await expect(block(page).getByText(SAVED, { exact: true })).toHaveCount(0);

    /**
     * "NOTHING is written, including the start date that arrived in the same body."
     * The start date field was edited in the same save, so if the api had applied half
     * the request the reload would show 22 days ago instead of 50.
     */
    await page.reload();
    await expect(startDateField(page)).toHaveValue(isoDate(50));
    await expect(milestoneField(page)).toHaveValue("65");
    // And the value was not clamped to 300 on its way through either.
    await expect(cell(page, "weight", "milestone")).toHaveText("Milestone 65.0 kg");
  });

  test("a milestone that is not a number is refused in the browser, with no request sent", async ({
    page,
  }) => {
    await signIn(page);
    await setLina(page, isoDate(50), "65");

    await milestoneField(page).fill("heavy");
    await save(page);
    await expect(
      block(page).getByText("Enter a milestone weight in kilograms, or leave it empty.")
    ).toBeVisible();
    await expect(block(page).getByText(SAVED, { exact: true })).toHaveCount(0);

    // Nothing left the browser: the stored milestone is untouched.
    await page.reload();
    await expect(milestoneField(page)).toHaveValue("65");
  });

  test("clearing the milestone is a write, and the row stops rendering", async ({ page }) => {
    await signIn(page);
    await setLina(page, isoDate(50), "65");

    // Edge case 7: an explicit null is a write, not a no-op.
    await milestoneField(page).fill("");
    await save(page);
    await expect(block(page).getByText(SAVED, { exact: true })).toBeVisible();
    await page.reload();

    await expect(cell(page, "weight", "milestone")).toHaveCount(0);
    await expect(cell(page, "weight", "toGo")).toHaveCount(0);
    // No empty state, no "not set" placeholder, no call to action.
    await expect(block(page).locator("[data-provenance='milestone']")).toHaveCount(0);
    // The start date is untouched by the milestone's clear — both fields, every time.
    await expect(startDateField(page)).toHaveValue(isoDate(50));
  });

  test("clearing the start date says the date is a fallback, rather than showing it as typed", async ({
    page,
  }) => {
    await signIn(page);
    await setLina(page, isoDate(50), "65");

    /**
     * 🔴 The one rendering that keeps a cleared start date from being invisible. The
     * api falls back to the link date, so the block goes on showing A DATE — and
     * without the provenance clause a coach would read the link date as the date they
     * set. The clause is what turns a silent wipe into a visible one.
     */
    await startDateField(page).fill("");
    await save(page);
    await expect(block(page).getByText(SAVED, { exact: true })).toBeVisible();
    await page.reload();

    await expect(block(page).locator("[data-provenance='startedOn']")).toHaveText(
      /no start date set, so this is the date the link was accepted$/
    );
    await expect(startDateField(page)).toHaveValue("");
    // The milestone rode along untouched, which is the same both-fields property seen
    // from the other side.
    await expect(cell(page, "weight", "milestone")).toHaveText("Milestone 65.0 kg");
  });
});
