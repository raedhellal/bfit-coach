import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EV-210b — **P-ADH made checkable in the render.**
 *
 * Story: `b-fit-mobile/docs/product/stories/EV-210-adherence-never-overstates.md`
 * (AC3 and AC4; AC1/AC2 are EV-210a, in `b-fit-api`).
 *
 * > **P-ADH.** *Displayed adherence is a faithful report of the plan and the sessions.
 * > It never credits work the plan did not ask for, never counts a week nobody was
 * > asked to train as trained, and never states an absence of **plan** as an absence of
 * > **effort**. Where the data cannot answer, the surface says so — it does not pick
 * > the flattering reading or the alarming one.*
 *
 * This file is the two consequences of P-ADH that live in the DOM:
 *
 *   · **C2 — the picture equals the numbers.** Any graphical representation of a ratio
 *     is drawn from the **same two numbers printed beside it**, never from a third.
 *   · **C3 — an absence renders as the absence it is.** A block with no plan says *no
 *     plan*; a block with no sessions says *no sessions*; neither is substituted for
 *     the other.
 *
 * **Why the property and not three regression tests.** Three independent mechanisms in
 * one sprint made the adherence figure overstate, and each fix restored the property
 * locally and left the next mechanism free to appear: EV-187a (a no-plan week read
 * 100 % adherent), EV-209 / BUG-198 (a rest-day session inflated both halves —
 * measured live as `3 / 6` under a headline of `3 / 27` for a week that prescribed
 * nothing), EV-208 / BUG-205 ("No sessions in the last 8 weeks" printed above a list of
 * five sessions). All three passed full suites and were caught by a human reading a
 * page. If you are here because this file is red, you have not broken a test: you have
 * broken P-ADH, and the fix belongs in the renderer.
 *
 * 🔴 **THE HAZARD C2 IS PERMANENT PROTECTION AGAINST.** `done` counts completions dated
 * today *or later*; `plannedSoFar` counts scheduled days *strictly before* today. So
 * training on a scheduled Monday gives **`done = 1, plannedSoFar = 0` — a literal one
 * over zero.** `done <= planned` holds by construction; **`done <= plannedSoFar` is NOT
 * an invariant.** A renderer drawing a bar from `done / plannedSoFar` renders over
 * 100 %, or divides by zero, on an ordinary Monday — and `AdherenceSeries` drew exactly
 * that once already (a FULL bar beside "2 / 4 sessions", found in staff review, not by
 * the 209 green tests).
 *
 * Today's renderer is safe: it divides by `week.planned` with a zero guard and draws no
 * bar at all for the in-progress week. **So this file protects the NEXT renderer**, and
 * it does it in the DOM rather than in a javadoc, because a javadoc is enforced by
 * whoever reads it.
 *
 * **How it binds, and what it cannot see** — stated rather than assumed:
 *   ✓ a bar whose geometry disagrees with the figures printed in its own row, in
 *     either direction, at 1 percentage point;
 *   ✓ a bar drawn with a `NaN` / `Infinity` / negative / over-100 % width;
 *   ✓ a bar drawn on a row that prints no figures, and a `planned = 0` row that draws
 *     a bar at all (edge case 1: the division-by-zero row);
 *   ✓ a renderer that switched the denominator to `plannedSoFar` while going on
 *     printing `planned` — Ines's current week is seeded `done 1 / planned 3 /
 *     plannedSoFar 0`, so such a renderer produces a number the printed pair cannot
 *     match, every day of the week;
 *   ✗ `plannedSoFar` itself. It is never printed and the current week draws nothing, so
 *     it has no DOM representation to assert. What is asserted is that whatever IS
 *     drawn agrees with what IS printed — which is C2, and which is what makes the
 *     substitution detectable, and the last test of AC3 keeps Ines's world stating it.
 *   ✗ a picture drawn by a mechanism that paints nothing measurable — a background
 *     gradient, a canvas, an image. `renderedWeeks` finds text-free painted leaves and
 *     compares boxes, so `scaleX`, `flex-basis`, `border-*-width` and inline `width`
 *     are all caught; a `background: linear-gradient(...)` is not, and would need this
 *     file extended with it.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const EMAIL = "coach@evoli.fit";
const PASSWORD = "Password123!";
const ADHERENCE = "Adherence, last 8 weeks";

/** EV-210b's own world: the current week is `done 1 / planned 3 / plannedSoFar 0`. */
const INES = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0014";
/** 100 %, 0 %, partials, a no-plan week and the current incomplete one. */
const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
/** A 7 / 7 week and no no-plan week — the all-weeks-have-a-plan shape. */
const TOBIAS = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0009";
/** EV-208 edge case 2 — eight real 0 % weeks. The zero-width bar is still a bar. */
const NOOR = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0013";
/** BUG-205 — no plan in the window, five real sessions. */
const RUBEN = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0011";
/** A plan that scheduled nothing. */
const ELIF = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0012";
/** No data at all. */
const KAIA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0010";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/");
}

/**
 * The block by its LANDMARK, never by a div filtered on its text — that resolves to the
 * innermost element holding the string, which is the title, and makes every negative
 * assertion about the body vacuously true.
 */
function block(page: Page, title: string) {
  return page.getByRole("region", { name: title });
}

/** One rendered week: what it PRINTS and what it DRAWS, read in one pass. */
interface RenderedWeek {
  /** The row's whole text, for failure messages only — never parsed. */
  rowText: string;
  /** The text of the row's last element with text: "3 / 4 sessions", "No plan". */
  label: string;
  pictures: Picture[];
}

/** A text-free painted leaf inside a row — i.e. something drawn rather than written. */
interface Picture {
  tag: string;
  /** `data-fill`, if the element carries it. Not required, and not trusted alone. */
  dataFill: string | null;
  /** The raw inline `style` attribute, so a `NaN%` / `Infinity%` width is visible. */
  inlineStyle: string;
  /** Painted width as a percentage of the parent's painted width. THE picture. */
  drawnPercent: number;
  widthPx: number;
  parentWidthPx: number;
}

/**
 * Every week row of the adherence block, with its label and its pictures.
 *
 * ⚠️ The label is the row's last TEXT-BEARING element, not the row's `textContent`: the
 * date column renders "10 Aug 2026" immediately before the figures, so reading the whole
 * row gives "10 Aug 20263 / 4 sessions" and a digit-greedy match pulls "20263 / 4" out
 * of it. That is not hypothetical — it is what EV-187b's first run did.
 *
 * A "picture" is a leaf element that paints and carries no text. That definition is
 * deliberately geometric rather than structural: it does not care whether the bar is an
 * inline `width`, a `transform: scaleX`, a `flex-basis` or a `border-bottom-width`, all
 * of which have been used to slip past a structural assertion in this repo. An element
 * with `data-fill` is included even when it paints nothing, so a genuine 0 % week is
 * checked rather than skipped.
 */
async function renderedWeeks(region: Locator): Promise<RenderedWeek[]> {
  return region.locator("li").evaluateAll((rows) =>
    rows.map((row) => {
      const texts = Array.from(row.querySelectorAll<HTMLElement>("*")).filter(
        (el) => el.children.length === 0 && (el.textContent ?? "").trim() !== ""
      );
      const pictures = Array.from(row.querySelectorAll<HTMLElement>("*"))
        .filter((el) => el.children.length === 0 && (el.textContent ?? "").trim() === "")
        .map((el) => {
          const box = el.getBoundingClientRect();
          const parentBox = (el.parentElement ?? row).getBoundingClientRect();
          return {
            tag: el.tagName.toLowerCase(),
            dataFill: el.getAttribute("data-fill"),
            inlineStyle: el.getAttribute("style") ?? "",
            widthPx: box.width,
            parentWidthPx: parentBox.width,
            drawnPercent: parentBox.width > 0 ? (box.width / parentBox.width) * 100 : 0,
            paints: box.width > 0.5 && box.height > 0.5,
          };
        })
        // Not a picture: an empty grid cell holding a column open. It has a width but no
        // height, so it paints nothing — and it has no `data-fill` either.
        .filter((p) => p.paints || p.dataFill !== null)
        .map(({ paints: _paints, ...picture }) => picture);
      return {
        rowText: (row.textContent ?? "").trim(),
        label: (texts[texts.length - 1]?.textContent ?? "").trim(),
        pictures,
      };
    })
  );
}

/** The figures printed in the row, or `null` if the row prints none ("No plan"). */
function figuresOf(label: string): { done: number; planned: number } | null {
  const match = label.match(/^(\d+)\s*\/\s*(\d+)\s+sessions$/);
  return match ? { done: Number(match[1]), planned: Number(match[2]) } : null;
}

/**
 * 🔴 **C2, asserted over whatever rows the page renders.**
 *
 * `minimumBars` is the anti-vacuity counter, and it is the whole reason this helper is
 * not simply a loop: an iteration over "the rows it finds" that finds no bar passes
 * every assertion inside it, which is how eight guards shipped this sprint that read as
 * protection and bound to nothing. A world's minimum is a fact about the FIXTURE, so a
 * renderer that stopped drawing cannot satisfy it, and a ninth week added to the fixture
 * is still checked automatically by the loop.
 */
async function expectPictureEqualsFigures(page: Page, minimumBars: number) {
  const weeks = await renderedWeeks(block(page, ADHERENCE));
  expect(weeks.length, "the adherence block rendered no week rows at all").toBeGreaterThan(0);

  let bars = 0;
  for (const [i, week] of weeks.entries()) {
    const where = `week ${i + 1} of ${weeks.length} ("${week.rowText}")`;
    const figures = figuresOf(week.label);

    if (week.pictures.length === 0) continue; // a row is allowed to draw nothing.

    expect(
      figures,
      `${where} DRAWS a bar and prints no "<done> / <planned> sessions" beside it`
    ).not.toBeNull();
    // Edge case 1: `planned = 0` has no ratio. A bar here is a division by zero.
    expect(
      figures!.planned,
      `${where} draws a bar on a week that prescribed nothing — there is no ratio to draw`
    ).toBeGreaterThan(0);

    const expected = (figures!.done / figures!.planned) * 100;
    for (const picture of week.pictures) {
      bars += 1;
      const drawn = `<${picture.tag} data-fill="${picture.dataFill}" style="${picture.inlineStyle}"> ` +
        `= ${picture.widthPx.toFixed(2)}px of ${picture.parentWidthPx.toFixed(2)}px`;

      // A width that is NaN, Infinity or negative cannot even be measured as a ratio.
      expect(Number.isFinite(picture.drawnPercent), `${where} draws a non-finite bar: ${drawn}`).toBe(
        true
      );
      expect(
        picture.inlineStyle,
        `${where} sets a non-numeric width — a 1/0 week reaching the renderer: ${drawn}`
      ).not.toMatch(/NaN|Infinity/i);
      expect(picture.drawnPercent, `${where} draws a NEGATIVE bar: ${drawn}`).toBeGreaterThanOrEqual(
        -1
      );
      // Over 100 % is the `done / plannedSoFar` signature, and it is the direction that
      // makes a struggling client look fine.
      expect(
        picture.drawnPercent,
        `${where} draws a bar WIDER than its track: ${drawn}`
      ).toBeLessThanOrEqual(101);

      // THE assertion: the picture is the two numbers beside it, within AC3's 1 pp of
      // rounding — compared as NUMBERS, never as a formatted string (edge case 2).
      expect(
        Math.abs(picture.drawnPercent - expected),
        `${where} prints ${figures!.done} / ${figures!.planned} (${expected.toFixed(
          1
        )} %) and draws ${picture.drawnPercent.toFixed(1)} %: ${drawn}`
      ).toBeLessThanOrEqual(1);

      // …and `data-fill`, which the rest of the suite reads, is held to the geometry it
      // claims to describe — otherwise a renderer could move the bar and leave the
      // attribute telling every spec what it wants to hear.
      if (picture.dataFill !== null) {
        expect(
          Math.abs(Number(picture.dataFill) - picture.drawnPercent),
          `${where} has data-fill="${picture.dataFill}" and draws ${picture.drawnPercent.toFixed(
            1
          )} %`
        ).toBeLessThanOrEqual(1);
      }
    }
  }

  expect(
    bars,
    `no bar was drawn on this page, so C2 was never tested here (expected at least ${minimumBars})`
  ).toBeGreaterThanOrEqual(minimumBars);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * AC3 — C2 holds in the DOM, for every rendered week.
 * ═══════════════════════════════════════════════════════════════════════════ */

test.describe("EV-210b AC3 / P-ADH C2 — the bar and the numbers beside it are one fact", () => {
  /**
   * The fixture set AC3 enumerates, plus the worlds that make the loop non-vacuous.
   * `minimumBars` is what the FIXTURE guarantees, not what the renderer chooses.
   */
  const WORLDS: { name: string; id: string; minimumBars: number }[] = [
    // 100 %, 0 %, a 2 / 3 rounding week, a no-plan week, the current incomplete week.
    { name: "Ines — every AC3 week shape, and the done > plannedSoFar current week", id: INES, minimumBars: 6 },
    { name: "Lina — a no-plan week mid-window and a partial current week", id: LINA, minimumBars: 6 },
    { name: "Tobias — eight weeks that all had a plan, including a 7 / 7", id: TOBIAS, minimumBars: 7 },
    { name: "Noor — eight REAL 0 % weeks (a zero-width bar is still a bar)", id: NOOR, minimumBars: 7 },
  ];

  for (const world of WORLDS) {
    test(`every drawn bar equals the figures printed beside it — ${world.name}`, async ({
      page,
    }) => {
      await signIn(page);
      await page.goto(`/clients/${world.id}`);
      await expect(block(page, ADHERENCE)).toBeVisible();
      await expectPictureEqualsFigures(page, world.minimumBars);
    });
  }

  /**
   * 🔴 **The 1 / 0 week, rendered.**
   *
   * Ines's current week is `done = 1, planned = 3, plannedSoFar = 0`. A renderer that
   * divided by `plannedSoFar` would emit `width: Infinity%` or `NaN%` here; one that
   * divided by `plannedSoFar` on a *fuller* week would emit over 100 %. Both are
   * asserted above on every row; this test pins the row where the hazard actually lives,
   * so a failure names the Monday rather than "some week".
   */
  test("the 1 / 0 week: the current row draws nothing, or draws its printed ratio", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/clients/${INES}`);

    const weeks = await renderedWeeks(block(page, ADHERENCE));
    expect(weeks.length, "eight ISO weeks").toBe(8);
    const current = weeks[weeks.length - 1];

    expect(figuresOf(current.label), `the current week prints "${current.label}"`).toEqual({
      done: 1,
      planned: 3,
    });
    for (const picture of current.pictures) {
      expect(
        picture.inlineStyle,
        `the 1 / 0 week reached a divider: ${picture.inlineStyle}`
      ).not.toMatch(/NaN|Infinity/i);
      expect(
        Math.abs(picture.drawnPercent - (1 / 3) * 100),
        `the 1 / 0 week prints "1 / 3 sessions" and draws ${picture.drawnPercent.toFixed(1)} %`
      ).toBeLessThanOrEqual(1);
    }
  });

  /**
   * The fixture's half of the previous test, and the reason it is not decoration.
   *
   * `plannedSoFar` has NO rendering — the current week draws no bar and the number is
   * never printed — so the only thing that makes a `plannedSoFar` renderer detectable is
   * a world where `done > plannedSoFar`. The derived value in `adherenceSeries` is
   * `min(planned, elapsedThisWeek)`, which gives `done > plannedSoFar` on a Monday and
   * NOT on a Friday: a world relying on it would stop discriminating for three days in
   * seven, which is precisely the shape of a guard that reads as protection and binds to
   * nothing. So Ines states it, and this asserts she still does.
   */
  test("the hazard world still HAS the hazard — done > plannedSoFar, stated not derived", () => {
    const fixture = readFileSync(join(__dirname, "..", "src", "lib", "coachApi.fixture.ts"), "utf8");
    const world = fixture.slice(fixture.indexOf("[INES_ID]: () => ({"));
    expect(world, "Ines's progress entry was not found in the fixture").not.toBe("");
    const current = world.match(/\[\s*1,\s*3,\s*0,?\s*\]/);
    expect(
      current,
      "Ines's current week no longer states `[1, 3, 0]` (done 1 / planned 3 / plannedSoFar 0). " +
        "Without done > plannedSoFar on EVERY weekday, nothing on this surface can tell a " +
        "`plannedSoFar` renderer from a `planned` one."
    ).not.toBeNull();
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * AC4 — C3 holds: an absence is rendered as the absence it is.
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * 🔴 The deleted sentence, assembled rather than written.
 *
 * This file scans `src/` and `qa/` for it (AC4's last limb), and a scanner that contains
 * its own needle either has to exempt itself — which is the loophole every future
 * occurrence would use — or go red on itself. Assembling it keeps the rule exceptionless.
 * The sentence is "No sessions in the last 8 weeks"; it was replaced by EV-208 because it
 * derived a claim about a PERSON from the absence of a `user_plan` row, and printed it
 * above five workouts that had happened (BUG-205).
 */
const BANNED = ["No sessions in the", "last 8 weeks"].join(" ");

test.describe("EV-210b AC4 / P-ADH C3 — an absence is rendered as the absence it is", () => {
  test("no plan in the window: the adherence block makes NO claim about sessions", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/clients/${RUBEN}`);

    const series = block(page, ADHERENCE);
    // EV-208's string, whole and exact — not a regex with the load-bearing words
    // wildcarded to `(.+)`, which is how BUG-210 stayed green through 242 tests.
    await expect(
      series.getByText("No plan on record for these 8 weeks", { exact: true })
    ).toBeVisible();

    /**
     * C3's first half, as a property rather than as a list of forbidden sentences: the
     * block that measured a missing PLAN may not use the word "session" at all. Ruben
     * did five of them, listed on the same screen, and the block above them has no
     * standing to say otherwise in either direction.
     */
    const text = (await series.textContent()) ?? "";
    expect(text, "the no-plan block must not mention sessions in any wording").not.toMatch(
      /session/i
    );
    expect(text).not.toContain(BANNED);

    // The truthful half is untouched: the sessions are still listed, by the block whose
    // job that is.
    await expect(block(page, "Recent sessions").getByRole("listitem")).toHaveCount(5);
  });

  test("a plan that scheduled nothing: the block makes NO claim that a plan is absent", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/clients/${ELIF}`);

    const series = block(page, ADHERENCE);
    await expect(
      series.getByText("No sessions scheduled in the last 8 weeks", { exact: true })
    ).toBeVisible();

    const text = (await series.textContent()) ?? "";
    expect(text, "a plan EXISTED — the block may not report it as missing").not.toContain(
      "No plan"
    );
    expect(text).not.toContain(BANNED);
  });

  /**
   * The other "a plan and no sessions" world, and the one the empty state must not
   * swallow: 24 sessions prescribed, none done. A real 0 %, not an absence.
   */
  test("a plan and no sessions done: a real 0 % still reads as a real 0 %", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${NOOR}`);

    const series = block(page, ADHERENCE);
    await expect(
      series.getByText("0 of 24 planned sessions in the last 8 weeks", { exact: true })
    ).toBeVisible();
    const text = (await series.textContent()) ?? "";
    expect(text, "a plan EXISTED — the block may not report it as missing").not.toContain("No plan");
    expect(text).not.toContain(BANNED);
    expect(text, "and no invented percentage or division by zero").not.toMatch(/NaN|Infinity/);
  });

  test("no plan and no sessions: the one wording true in both worlds, and no NaN", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/clients/${KAIA}`);

    const series = block(page, ADHERENCE);
    await expect(
      series.getByText("No plan on record for these 8 weeks", { exact: true })
    ).toBeVisible();
    const text = (await series.textContent()) ?? "";
    expect(text, "nothing is known about her sessions either way").not.toMatch(/session/i);
    expect(text).not.toMatch(/NaN|Infinity|0 \/ 0/);
  });

  /**
   * AC4's last limb — the banned sentence cannot come back.
   *
   * ⚠️ **AC4 asks for it to be "absent from `src/` and `qa/`", and that is red against
   * merged code for two reasons that are not defects**, so it is implemented as the
   * property the AC is reaching for rather than as its letter, and the deviation is
   * reported rather than hidden:
   *
   *   1. `src/components/client/AdherenceSeries.tsx` and `src/lib/copy.ts` QUOTE the
   *      sentence in javadoc, to record what was removed and why. A comment renders
   *      nothing, and deleting those paragraphs would delete the reason the sentence is
   *      forbidden — which is how it would come back.
   *   2. `qa/coach-monitoring.spec.ts` names it three times, in the EV-208 assertions
   *      that FORBID it. The letter of the AC would require deleting the regression that
   *      enforces it.
   *
   * So: **zero occurrences in `src/` outside comments** (it cannot be rendered if no
   * expression contains it), and in `qa/`, occurrences only on lines that assert its
   * absence — with a counter proving at least one such assertion still exists, so this
   * cannot pass by the regression having been deleted.
   */
  test("the banned sentence is absent from every expression in src/ and unforbidden in qa/", () => {
    const root = join(__dirname, "..");

    const sourceFiles = (dir: string): string[] =>
      readdirSync(dir).flatMap((entry) => {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) return sourceFiles(path);
        return /\.(ts|tsx|css|json)$/.test(entry) ? [path] : [];
      });

    /** Block and line comments removed; string literals left alone. */
    const stripComments = (source: string) =>
      source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

    const offences: string[] = [];
    let forbiddenBy = 0;

    for (const file of [...sourceFiles(join(root, "src")), ...sourceFiles(join(root, "qa"))]) {
      const code = stripComments(readFileSync(file, "utf8"));
      code.split("\n").forEach((line, i) => {
        if (!line.includes(BANNED)) return;
        const asserted = /toHaveCount\(0\)|not\.to|\.not\b/.test(line);
        if (asserted && file.includes(`${join(root, "qa")}`)) forbiddenBy += 1;
        else offences.push(`${file.slice(root.length + 1)}:${i + 1}: ${line.trim()}`);
      });
    }

    expect(
      offences,
      `"${BANNED}" is back in an expression. It derives a claim about a PERSON from the ` +
        `absence of a plan row (BUG-205) and EV-208 replaced it with two sentences that ` +
        `name what was actually measured.`
    ).toEqual([]);
    expect(
      forbiddenBy,
      "no spec forbids the sentence any more — this scan would now pass on an empty repo"
    ).toBeGreaterThan(0);
  });
});
