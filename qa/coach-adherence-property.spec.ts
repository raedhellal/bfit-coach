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
 *   ✓ a renderer that switched the denominator to `plannedSoFar` **and draws a bar on
 *     the current week** — Ines's current week is seeded `1 / 3 / 0`, so such a renderer
 *     produces `Infinity%` there (witnessed);
 *   ✗ the same swap with the current week still drawing nothing. For a FINISHED week
 *     `plannedSoFar === planned`, so nothing differs and the suite stays green — the
 *     staff review ran that exact shape: 11 passed. This file's reach coincides with
 *     the HARMFUL subset of the substitution, which is the outcome worth having and not
 *     a sentence to round up to "every day of the week".
 *   ✗ `plannedSoFar` itself. It is never printed and the current week draws nothing, so
 *     it has no DOM representation to assert. What is asserted is that whatever IS
 *     drawn agrees with what IS printed — which is C2, and which is what makes the
 *     harmful half of the substitution detectable, and the last test of AC3 keeps
 *     Ines's world stating it.
 *   ✗ **a picture painted with no layout box of its own, in a row whose measurable bars
 *     already satisfy `minimumBars`** — the GEOMETRIC limbs in this section cannot see
 *     one, and that was this file's whole blind spot. It was narrower than "anything
 *     drawn with a gradient": the staff review ran both straightforward gradient
 *     refactors — a gradient-painted leaf replacing the track, and the bar moved onto
 *     the text-bearing label — and BOTH go red (re-run on the EV-214 branch: the leaf is
 *     caught by the geometry limb at 83.3 % drawn against 100 % printed, the label move
 *     by `minimumBars` at "no bar was drawn on this page"). What stayed green was its
 *     **B3**: one line adding a `background: linear-gradient(...)` BEHIND the current
 *     week's figures, which gives Ines `Infinity%` and Lina a fully-painted 100 %
 *     gradient beside "2 / 4 sessions", with the whole suite at 256 passed.
 *     🔴 **B3 is now CLOSED, by the EV-214 section at the bottom of this file** — a
 *     structural limb, because a thing with no box cannot be measured by a limb that
 *     measures boxes. `scaleX`, `flex-basis`, `border-*-width` and inline `width` are
 *     all caught here, geometrically, as before.
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

      /**
       * ⚠️ **Unreachable today, and kept deliberately.** `drawnPercent` comes from
       * `getBoundingClientRect().width`, which is always finite — so no renderer can
       * make this one red, and it is NOT what caught M1. It guards a future
       * `drawnPercent` read from a non-box source (an attribute, a CSS variable, an SVG
       * length), where `NaN` becomes reachable and every comparison below it would then
       * pass silently. The LIVE check for the 1/0 week is the `inlineStyle` one
       * immediately after: M1 failed on `width:Infinity%`, not here.
       */
      expect(Number.isFinite(picture.drawnPercent), `${where} draws a non-finite bar: ${drawn}`).toBe(
        true
      );
      expect(
        picture.inlineStyle,
        `${where} sets a non-numeric width — a 1/0 week reaching the renderer: ${drawn}`
      ).not.toMatch(/NaN|Infinity/i);
      /**
       * ⚠️ **Also unreachable today, and also kept deliberately** — the same family as
       * the `Number.isFinite` limb above, and recorded here (EV-214 fact 3) because the
       * file did not say so. `getBoundingClientRect().width` is never negative, and
       * `senior-qa` tried to kill this one: a `scaleX(-2)` mutant reports **+200 %**,
       * not −200 %, so it is the over-100 % limb below that catches it. *"I could not
       * construct one"* is the answer behind it. Do not report it as an unkilled mutant,
       * and do not delete it as dead weight: it guards a future `drawnPercent` read from
       * a source that CAN be negative (an attribute, a CSS variable, an SVG length).
       */
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
    /**
     * ⚠️ Comments are stripped FIRST. The first cut of this guard matched the paragraph
     * in the fixture that EXPLAINS the tuple, so deleting the tuple left it green — a
     * guard reading its own documentation back and reporting it as protection. It was
     * caught by mutating the fixture, which is the only way any of these are caught.
     */
    const fixture = readFileSync(join(__dirname, "..", "src", "lib", "coachApi.fixture.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

    /**
     * The PROGRESS entry, not the overview one: both are keyed `[INES_ID]` and only one
     * of them holds the series. "the part that contains `adherenceSeries(`" is NOT
     * enough — the part that starts at her OVERVIEW entry runs on to the end of the file
     * and contains everybody else's series, so it matched, and the guard read LINA's
     * week and went red on correct code. The entry is the part whose `adherenceSeries([`
     * comes before the NEXT trainee key — and it is the CALL that is looked for, with
     * its bracket, not the substring `adherenceSeries(`, which also matches the
     * function's own declaration several hundred lines earlier.
     */
    const CALL = "adherenceSeries([";
    const NEXT_ENTRY = /_ID\]: \(\) => \(\{/;
    const entry = fixture
      .split("[INES_ID]: () => ({")
      .slice(1)
      .find((part) => {
        const call = part.indexOf(CALL);
        const next = part.search(NEXT_ENTRY);
        return call !== -1 && (next === -1 || call < next);
      });
    expect(entry, "Ines's progress entry was not found in the fixture").toBeTruthy();

    const body = entry!.slice(entry!.indexOf(CALL) + CALL.length);
    const tuples = body.slice(0, body.indexOf("])")).match(/\[[^\]]*\]|null/g) ?? [];
    expect(tuples.length, "Ines's series is no longer eight weeks").toBe(8);
    expect(
      tuples[tuples.length - 1].replace(/\s/g, ""),
      "Ines's current week no longer states `[1, 3, 0]` (done 1 / planned 3 / plannedSoFar 0). " +
        "Without done > plannedSoFar on EVERY weekday, nothing on this surface can tell a " +
        "`plannedSoFar` renderer from a `planned` one."
    ).toBe("[1,3,0]");
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
   *
   * 🔴 **This limb is a line grep, and a line grep is not the rule.** An assembled
   * needle — `["No sessions in the", "last 8 weeks"].join(" ")`, the same trick the
   * `BANNED` constant above uses — passes it. The staff review ran exactly that, and it
   * was caught anyway, by the `/session/i` limbs of the DOM tests above. So the PROPERTY
   * holds and this test alone does not enforce it: it makes the cheap way back
   * impossible and leaves the expensive ones to the DOM. Do not cite this limb as the
   * whole of AC4.
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

/* ═══════════════════════════════════════════════════════════════════════════
 * EV-214 / EV-215 / EV-216 — **P-ADH C2: no element in a week row has a non-initial
 * value on any of the paint channels enumerated in `PAINT_CHANNELS`, and none declares
 * an image function in its inline `style` attribute.**
 *
 * 🔴 **That sentence is the PREDICATE, and it replaced a banner that named the
 * MECHANISM CLASS** ("a picture nothing can measure is not allowed to exist"). The
 * property this section serves — *nothing inside a week row paints a proportional
 * picture through any channel* — is stated once, in **P-ADH C2**, and is NOT restated
 * here: this is an enumerated guard, an enumerated guard is an acceptable guard, and
 * what it owes is not to imply it has achieved the property. **EV-216 AC3.**
 *
 * Story: `b-fit-mobile/docs/product/stories/EV-214-adherence-picture-has-a-measurable-box.md`
 * (parent: `EV-210-adherence-never-overstates.md`, property **P-ADH**, consequence
 * **C2 — the picture equals the numbers**).
 *
 * 🔴 **The mechanism this forbids: an UNMEASURABLE picture alongside measured ones.**
 * Everything above this line measures a drawn box against the two figures printed in
 * its row, and counts the boxes it measured so it cannot pass by finding none. Both
 * halves are defeated by the same one-line change, which `staff-engineer` constructed
 * against merged code with the whole suite green (256 passed, 11 EV-210b tests
 * included): **keep every honest bar, and ADDITIONALLY paint the current week's
 * progress as a `linear-gradient` behind its own figures.** `minimumBars` is satisfied
 * by the six honest bars, and the gradient has **no layout box of its own**, so the
 * geometric limb never sees it. Rendered, that gave Lina a **fully painted** bar beside
 * "2 / 4 sessions" — mechanism 2 of EV-210's own table, restored.
 *
 * So this limb is **structural, not geometric**: for every element inside a week row, it
 * **READS**, once, at the default viewport, four channels:
 *
 *   1. `getComputedStyle(el).backgroundImage` — the element's own painted image;
 *   2. `getComputedStyle(el, "::before").backgroundImage`;
 *   3. `getComputedStyle(el, "::after").backgroundImage` — the two generated boxes
 *      (**EV-215 AC1**), and a red build names which of the three computed channels
 *      fired;
 *   4. the inline `style` attribute, where **one of four literal spellings** —
 *      `gradient(`, `url(`, `image-set(`, `element(` — appears either in a `background`
 *      / `background-image` value or in a `--…:` declaration in the same attribute
 *      (**EV-215 AC3** — `--adh-paint: linear-gradient(…);
 *      background-image: var(--adh-paint)` puts no such spelling in the property the
 *      first pattern reads).
 *
 *      🔴 **Four spellings, NOT "an image function" — that sentence was falsified.** It
 *      said "an image function" until `senior-qa` wrote
 *      `background-image: linear-gradi\65 nt(90deg, …)`: a CSS ident escape inside the
 *      function name, which Chrome tokenises as `linear-gradient(` and PAINTS. With a
 *      valid ratio the computed channel catches it (4 failed); on Ines's `1 / 0` row the
 *      `Infinity%` value makes the computed read `none` and it is a **total escape — 3
 *      failed, Ines green**. That is the reach of the DENYLIST, unchanged from EV-214
 *      (`INLINE_BACKGROUND_IMAGE` is byte-identical on `dbf3589`, verified with
 *      `git show`), and EV-215 deliberately does not widen it: replacing the denylist
 *      with a resolver is ruled out by name in the card and handed to `EV-216`. It is
 *      carded with QA's two runs as its witnesses.
 *
 * ⚠️ **That is a statement about what it reads, deliberately, and not about what can be
 * drawn.** Every totality sentence written about this guard has been falsified by the
 * next person to try: "nothing paints a background image at all" died to a `::before`,
 * and "the element's own background-image, on either channel" died TWICE on the computed
 * channel alone — to a gradient applied after an `animation` delay (`none` at t=0, a full
 * bar behind "2 / 4 sessions" at t=11s) and to one behind `@media (max-width: 520px)`,
 * which paints at the 320 px width `qa/layout.ts` sweeps this portal at. Both are
 * `senior-po` cards. A reader who needs to know whether a NEW mechanism is caught should
 * build it and run this limb, not reason from a sentence here.
 *
 * A flat `background-color` is untouched (a colour cannot
 * encode a ratio positionally; only an image can), and the geometry limb, `minimumBars`
 * and the `overflow:hidden` behaviour are deliberately not touched here — EV-214 is a
 * different mechanism, not a stronger version of that one.
 *
 * **Why the INLINE read as well as the computed ones.** EV-214 AC1 asks for the
 * computed value, because a gradient can arrive from a stylesheet or a custom property
 * where no inline attribute exists. But the computed read alone is **green on half of
 * the bypass**, and this was measured rather than reasoned:
 *
 *   · **Lina** — `linear-gradient(90deg, var(--blue-500) 100%, transparent 0%)` computes
 *     to `linear-gradient(90deg, rgb(79, 124, 255) 100%, rgba(0, 0, 0, 0) 0%)`. Caught.
 *   · **Ines** — the SAME expression with `done / plannedSoFar = 1 / 0` emits
 *     `…var(--blue-500) Infinity%…`. `Infinity%` is not a valid `<length-percentage>`,
 *     so Chrome discards the whole declaration at parse time and
 *     `getComputedStyle(el).backgroundImage` is **`none`**. Witnessed, not assumed.
 *
 * A ban that reads only what painted is therefore weakest exactly where the renderer is
 * most broken — and the 1/0 row is not benign, because the same expression paints a
 * flattering 100 % the moment `plannedSoFar` is 1 rather than 0. So the DECLARATION is
 * banned as well as the paint, and **neither read subsumes the other — witnessed in BOTH
 * directions**, which is not what the mutants above show on their own: under B3, Lina is
 * caught by the computed clause but would also be caught by the inline one, so two
 * clauses killing the same mutant shows neither to be necessary. The reviewer supplied
 * the missing half by delivering the same gradient from `globals.css` with the ratio in
 * a custom property and **no inline `background` at all** → 4 red, from the computed
 * clause alone.
 *
 * **EV-215 AC3 — and why the custom-property pattern is its own clause with its own
 * witness.** The inline read is a denylist over attribute TEXT, so one hop of `var()`
 * moves the image function out of the declaration it reads. On its own that hop is
 * partial — the computed clause still catches the half that paints — so killing it
 * would show nothing about either clause. Combined with the `Infinity%` shape it is
 * total: `--adh-paint: linear-gradient(90deg, var(--blue-500) <done/plannedSoFar> …);
 * background-image: var(--adh-paint)` on Ines's `1 / 0` row computes to `none` AND
 * declares no image function in a `background` value. That COMBINATION is the mutant
 * carried out for this clause, and it is killed by this clause alone: 4 red, with the
 * three computed channels and `INLINE_BACKGROUND_IMAGE` all green on it. Independence was
 * shown by disabling THIS clause alone against that mutant: Ines goes back to green while
 * the other three worlds stay red, so no other clause kills the combination.
 *
 * 🔴 **And the same mutant with one accent — `--é-paint` — is the witness that killed the
 * FIRST version of this clause.** A pattern pinned to the ASCII spelling of the ident, or
 * to an anchor admitting only whitespace before it, is walked past by a rename or by a
 * `/*comment*\/`, with everything else identical. The pattern now reads `--` to the
 * declaration's colon and neither. Both escapes are recorded at the constant itself,
 * because a sentence describing a regex belongs beside the regex.
 *
 * **What this limb does NOT cover, stated rather than assumed:**
 *   ✗ `<canvas>` and `<img>` as adherence pictures. Nobody has constructed either, and
 *     a canvas HAS a layout box, so it is a different mechanism with a different answer.
 *     EV-214 rejects them deliberately: banning a thing with no witness is the same
 *     defect as permitting one. If someone constructs one, that is its own row.
 *   ✗ anything outside a week row. A decorative background elsewhere on the page is a
 *     design decision, not an adherence picture.
 *   ✓ 🔴 **`box-shadow: inset <pct>vw 0 0 0 rgba(…)`, `border-image` and `mask-image`**
 *     — a second paint channel nobody had named, which drew a full bar beside
 *     "2 / 4 sessions" with the suite at 260 green. It was `✗` here until **EV-216**,
 *     which did not widen a regex: it added the three computed properties to the read,
 *     and they are now three of the entries in `PAINT_CHANNELS`. The three mutants and
 *     their independence witnesses are recorded in the EV-216 banner below.
 *   ✓ **`url(` IS witnessed**, by `senior-qa`'s M-Q3: `background: url("data:image/svg+
 *     xml,…") no-repeat 0 0 / <pct>% 100%` goes red in BOTH directions at once — Ines by
 *     the INLINE clause alone (the `Infinity%` size discards the shorthand, so the
 *     computed value is `none`) and Lina by the COMPUTED clause. It is the best witness
 *     this limb has for the two clauses being independently load-bearing.
 *   ✗ `image-set(` and `element(` are in the inline pattern with **no witness in either
 *     direction** — nobody has constructed one and nobody has shown one cannot be built.
 *     They are listed for completeness of the mechanism, not as tested reach.
 *   ⛔ **COULD NOT CONSTRUCT: the image function split across a `var()` boundary.**
 *     `--adh-fn: linear-gradient; background-image: var(--adh-fn)(90deg, …)` would put no
 *     image function in either inline pattern, and it does not paint: Chrome does not
 *     re-tokenise a substituted ident into a function token. The reviewer ran it — 15
 *     passed, and **zero `PAINTS` offences anywhere, including the rows that draw
 *     honestly**. A green suite there is CORRECT rather than a miss, and the way to tell
 *     those two apart is to run the harmless variant and check it paints nothing.
 *
 *   🔴 And the two the gate found, on the COMPUTED channel of an element's OWN
 *     background-image — i.e. inside what this limb reads, not in any channel disclosed
 *     above. Both are `senior-po` cards:
 *   ✗ **a time-shifted paint.** `@keyframes` + `animation: … 1ms 8s forwards`, the ratio
 *     in an inline custom property. Every computed `background-image` is `none` at t=0,
 *     so the EV-214 section is 4 passed; at t=11s Lina's figures span computes
 *     `linear-gradient(90deg, rgb(79, 124, 255) 100%, …)`. The limb samples one instant;
 *     carded as **EV-217**. What was tried: this is the element's OWN `background-image`
 *     on a channel the limb does read, so neither the pseudo argument nor a wider inline
 *     pattern moves it — only reading again at another instant does.
 *   ✗ 🔴 **a custom property declared on an ANCESTOR of the week rows and spent inside
 *     one.** `--adh-paint` on the `<ul>` (`AdherenceSeries.tsx`, one element above the
 *     rows) with `background-image: var(--adh-paint)` on a row's figures span: 3 failed,
 *     **Ines green** — the same total escape as the `1 / 0` combination, one element
 *     higher. Reviewer-constructed. What was tried: nothing here reads it, because the
 *     scan is `region.locator("li")` plus descendants, so the attribute holding the
 *     declaration is never one of the attributes read, and the three computed channels
 *     are `none` for the `Infinity%` value as before. Widening THIS pattern cannot reach
 *     it — closing it means scanning the ancestor chain or resolving the `var()`, which
 *     is the general CSS resolver EV-215 rules out by name. A `senior-po` card, not a
 *     silent widening.
 *   ✗ **a viewport-gated paint.** `@media (max-width: 520px)`. Green at the default
 *     viewport; at 320 px a full blue bar sits behind "2 / 4 sessions". The limb samples
 *     one viewport — and 320 px is the width this portal is swept at by name. Carded as
 *     **EV-217** with the one above: the same channel and the same reason, a SAMPLING
 *     gap rather than a channel gap, so widening the property list closes neither.
 * ═══════════════════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════════════════
 * EV-216 AC3 — **THE DISCLOSURE. What this section reads, when, at what configuration,
 * and how to find out about anything it does not read.**
 *
 * Story: `b-fit-mobile/docs/product/stories/EV-216-a-proportional-picture-in-a-channel-nobody-reads.md`
 * (parent: `EV-210-adherence-never-overstates.md`, property **P-ADH**, consequence
 * **C2**). AC1 is the three new channels in `PAINT_CHANNELS`; this block is AC3, and
 * `senior-po` calls it the part of the row worth more than the three assertions.
 *
 * **WHAT IT READS.** For **every element inside every week row of the adherence block,
 * the `li` itself included**, two kinds of read:
 *
 *   1. **The computed channels enumerated in `PAINT_CHANNELS`** — one CSS property on
 *      one of the element's three boxes, asserted equal to that property's initial
 *      value. `PAINT_CHANNELS` is the ONLY place in this file the covered channels are
 *      listed: the read iterates it, the failure message names the entry that fired,
 *      and a ratcheted count (`PAINT_CHANNELS_EXPECTED`) means removing one is a
 *      deliberate two-line edit rather than a silent one. Adding a channel is one line.
 *   2. **The inline `style` attribute**, through `INLINE_BACKGROUND_IMAGE` and
 *      `INLINE_CUSTOM_PROPERTY_IMAGE` — a denylist over attribute TEXT, documented at
 *      the two constants, with its reach (and three witnessed escapes) recorded there.
 *
 * **WHEN, AND AT WHAT CONFIGURATION.** Once per world, immediately after the adherence
 * block becomes visible, at the config's default viewport, in `next dev` fixture mode.
 * One instant, one viewport, one page state.
 *
 * **CHANNELS AND MECHANISMS NOT READ, WITH WHAT WAS TRIED.** Each entry is a mechanism
 * somebody **constructed and ran against this section**, with the row that owns it. It
 * is a list of what has been built, **not** a list of what exists, and it is not a
 * claim that anything absent from it is caught — six totality sentences written about
 * this guard have been falsified by the next person to try one. Later rows append to
 * this list; the entry shape is *mechanism — what was tried — owning row*.
 *
 *   · **A time-delayed paint** (`animation … 1ms 8s forwards`) and **a viewport-gated
 *     paint** (`@media (max-width: 520px)`, and 320 px is a width this portal is swept
 *     at by name). What was tried: both arrive on channels this section DOES read — the
 *     element's own `background-image` — so neither a further property nor a wider
 *     inline pattern reaches them. Only reading again, at another instant or another
 *     width, does. A **sampling** gap rather than a channel gap. → **EV-217**.
 *   · **A re-spelling of an image function inside the inline denylist's reach** — an
 *     ident escape (`linear-gradi\65 nt(`), a non-ASCII ident (`--é-paint`), a `;`
 *     inside a comment. What was tried: all three are resolved by the CSS parser BEFORE
 *     a computed read can see them, and the computed clauses are green on the ones that
 *     do not paint (`Infinity%`), so no computed channel added here can close a spelling
 *     gap and no wider regex has survived a reviewer yet. → **EV-218**.
 *   · **A custom property declared on an ANCESTOR of the week rows** (`--adh-paint` on
 *     the `<ul>`) and spent inside one. What was tried: the scan is `li` plus its
 *     descendants, so the attribute carrying the declaration is never one of the
 *     attributes read, and the computed channels are `none` for the `Infinity%` value.
 *     Closing it means scanning the ancestor chain or resolving the `var()` — the
 *     general CSS resolver EV-215 rules out by name. Disclosed in EV-215's `✗` block.
 *   · **`<canvas>` and `<img>`.** No witness in either direction: nobody has built one,
 *     and nobody has shown one cannot be built. `senior-po` has declined four times to
 *     fold them in on the strength of neighbouring mechanisms being real. Not a row.
 *   · **A channel-independent paint detector**, which would replace this enumeration
 *     rather than extend it, is a NAMED OPEN QUESTION for `architect`. It is not
 *     scheduled, this section does not wait on it, and nothing here approves building
 *     one.
 *
 * **HOW TO FIND OUT WHETHER A MECHANISM NOT LISTED ABOVE IS CAUGHT.** Build it in an
 * uncommitted copy of `AdherenceSeries.tsx`, run this file, and — before believing a
 * green — **probe that it actually painted**, because a mutant that never fired proves
 * nothing in either direction. `senior-qa` lost a run to exactly that (a `var()` whose
 * varying stop sat in an ancestor's value, which Chrome resolves at the DECLARING
 * element, so nothing painted and the suite was green: a dud that looked like a wider
 * escape). Do not reason from a sentence in this file; every sentence here is about
 * what the reads DO, and none of them is a statement about what can be drawn.
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * One computed read: a CSS property, on one of an element's three boxes, and the value
 * of that property which means *this box paints nothing through this channel*.
 *
 * `property` is the KEBAB spelling and is read with `getPropertyValue`, not through the
 * camelCase accessor: an accessor a browser does not implement is `undefined` and reads
 * as a silently absent channel, whereas `getPropertyValue` returns `""` for a property
 * name the browser does not report — and `""` is asserted against below, so a channel
 * that is not a real read in this browser goes red instead of passing vacuously.
 */
interface PaintChannel {
  /** How the channel is named in a red build. EV-216 AC1 asks which channel fired. */
  name: string;
  property: string;
  /** `null` for the element's own box. */
  pseudo: "::before" | "::after" | null;
  /** The property's initial value — what "paints nothing here" computes to. */
  initial: string;
}

/**
 * 🔴 **THE one place the covered channels are listed — EV-216 AC3.**
 *
 * Adding a channel is one line here. Removing one is visible twice: the entry is gone
 * from a list a reader reads top to bottom, and `PAINT_CHANNELS_EXPECTED` goes red.
 *
 * The four properties, and why each is a channel a proportional bar can be painted
 * through without a layout box of its own:
 *
 *   · `background-image` — EV-214's witnessed bypass (a gradient behind the figures).
 *   · `box-shadow` — EV-216's. `inset ${(done / plannedSoFar) * 100}vw 0 0 0 rgba(79,
 *     124, 255, .35)` on a week row paints Lina's row end to end beside "2 / 4
 *     sessions" with the suite at 260 green, and `inset` means it needs no box of its
 *     own beyond the one the row already has.
 *   · `border-image-source` and `mask-image` — named by `staff-engineer` as the same
 *     family, and each carries a mutant of its own (AC2), because a family named in
 *     prose is not a family until somebody builds the other two.
 *
 * All four are read on the element's own box **and on both generated boxes**. The
 * pseudo-element reads exist because EV-215 was the row that found a `::before`
 * carrying the gradient while the element's own computed style said `none`; shipping
 * three new properties without them would re-open that hole on the day it was closed.
 *
 * ⚠️ The ban is on the channel, not on a ratio: this limb cannot tell a proportional
 * value from a constant one, so a DECORATIVE shadow inside a week row would be a false
 * positive. The honest direction is RUN (the four worlds below pass against unmodified
 * code) and it is also argued BY CAUSE, which is the stronger half:
 *
 *   · `src/app/globals.css` is the surface's only stylesheet and declares **none** of
 *     the three properties anywhere — `grep -rn 'box-shadow\|border-image\|mask' ` on
 *     it exits 1. `--e-1`/`--e-2`/`--e-3`/`--e-card`/`--ring` are shadow VALUES parked
 *     in custom properties, and a custom property paints nothing until it is spent.
 *   · `AdherenceSeries.tsx` and `MonitoringBlock.tsx` — the only components that render
 *     anything inside this region — set none of the three either (same grep, exit 1).
 *     Inside a row there is `background`, `width`, `height`, `border-radius` and text.
 *   · 🔴 The near-miss, named because a reader will find it: the block's own card DOES
 *     carry `box-shadow: var(--e-card)` (`Card` in `ui/kit.tsx`). It is the element the
 *     `<ul>` sits inside — an ANCESTOR of every row — and `box-shadow` does not inherit,
 *     so the scan (`li` plus descendants) cannot reach it. A real elevation shadow one
 *     element above the rows is therefore not a false positive by construction, not by
 *     luck, and moving a row's content up into the card would be a different guard.
 *
 * If the design ever needs a decorative shadow INSIDE a row, that is a `senior-po`
 * decision (EV-216 edge cases 1 and 2), not an exception carved here.
 */
const PAINT_CHANNELS: PaintChannel[] = [
  { name: "background-image on its own box", property: "background-image", pseudo: null, initial: "none" },
  { name: "background-image on ::before", property: "background-image", pseudo: "::before", initial: "none" },
  { name: "background-image on ::after", property: "background-image", pseudo: "::after", initial: "none" },
  { name: "box-shadow on its own box", property: "box-shadow", pseudo: null, initial: "none" },
  { name: "box-shadow on ::before", property: "box-shadow", pseudo: "::before", initial: "none" },
  { name: "box-shadow on ::after", property: "box-shadow", pseudo: "::after", initial: "none" },
  { name: "border-image-source on its own box", property: "border-image-source", pseudo: null, initial: "none" },
  { name: "border-image-source on ::before", property: "border-image-source", pseudo: "::before", initial: "none" },
  { name: "border-image-source on ::after", property: "border-image-source", pseudo: "::after", initial: "none" },
  { name: "mask-image on its own box", property: "mask-image", pseudo: null, initial: "none" },
  { name: "mask-image on ::before", property: "mask-image", pseudo: "::before", initial: "none" },
  { name: "mask-image on ::after", property: "mask-image", pseudo: "::after", initial: "none" },
];

/**
 * Pinned, for the reason `SCHEMAS_EXPECTED` is pinned in `qa/contract-drift.spec.ts`:
 * a guard whose coverage is a list can be emptied one entry at a time and still pass
 * every assertion it makes. Deleting the `::after` read used to leave this suite 260
 * green. Raise it in the same commit that adds a channel; lowering it is a decision
 * somebody has to write down.
 */
const PAINT_CHANNELS_EXPECTED = 12;

/** One element inside a week row, as the reads that can reveal a painted picture. */
interface RowElement {
  tag: string;
  /**
   * One entry per `PAINT_CHANNELS` entry, in that order — what actually computes, on
   * each property, on each of the three boxes an element can have. Carried as a list of
   * NAMED channels rather than as fields so the failure message can say which read
   * fired (EV-215 AC1, kept by EV-216 AC1): a red build that says only "paints" sends
   * the reader to an element whose own computed style is `none`.
   *
   * `initial` travels with the value because it is the channel's definition of "paints
   * nothing", and comparing against it here is what lets a channel be added in one
   * line without touching the loop that judges it.
   */
  computed: { channel: string; value: string; initial: string }[];
  /** The raw inline `style` attribute — what was asked for, valid or not. */
  inline: string;
}

interface RowPaint {
  /** The row's printed week-commencing date, for the failure message. */
  date: string;
  /** The row's whole text, so a row whose date column moved is still identifiable. */
  rowText: string;
  elements: RowElement[];
}

/**
 * A background-image value in an inline `style` attribute.
 *
 * It matches the VALUE of a `background` / `background-image` declaration, so the honest
 * bars — `background:var(--blue-500)` and `background:var(--surface-3)` — do not match,
 * and a `background-color` never can. `url(`, `image-set(` and `element(` are listed
 * beside the gradients because they are the other ways a CSS box paints an image.
 * `url(` has been constructed on this surface and caught (a `data:image/svg+xml` bar
 * sized `<pct>% 100%` — `senior-qa`'s M-Q3); `image-set(` and `element(` have not.
 */
const INLINE_BACKGROUND_IMAGE = /background(-image)?\s*:[^;]*(gradient\(|url\(|image-set\(|element\()/i;

/**
 * **Any `--…:` declaration in the attribute whose value names an image function** —
 * EV-215 AC3.
 *
 * `background-image: var(--adh-paint)` names no image function, so the pattern above
 * cannot see one: the gradient is in the `--adh-paint` declaration beside it. This reads
 * that declaration rather than resolving the `var()`, which is deliberate — resolving it
 * would be the general CSS resolver EV-215 rules out, and a gradient declared in a week
 * row's own inline style is the mechanism whether or not this attribute is where it is
 * finally spent.
 *
 * 🔴 **It reads `--` to the declaration's colon, with no anchor and no name charset, and
 * both of those are the fix rather than sloppiness.** The first cut of this pattern was
 * `/(^|;)\s*--[A-Za-z0-9_-]+\s*:…/`, and the reviewer walked past it with the AC3 mutant
 * unchanged apart from cosmetics, twice:
 *   · **`--é-paint`** in place of `--adh-paint` — a plain React style object, no special
 *     rendering. CSS idents allow non-ASCII and `[A-Za-z0-9_-]+` does not: 3 failed with
 *     **Ines green**, a total escape on the `1 / 0` row AC3 exists for, while Lina's row
 *     went red with `PAINTS … on its own box` — so Chrome accepts and PAINTS `--é-paint`
 *     and it is not a parser quirk.
 *   · **a CSS comment before the declaration** — `background-image:var(--adh-paint);/*x*\/
 *     --adh-paint:linear-gradient(… Infinity% …)` (it needs `dangerouslySetInnerHTML`,
 *     since React's style object always serialises `;`-separated), which defeats the
 *     `(^|;)\s*` anchor. The anchor bought nothing and cost that.
 * `[^:;]*` is what keeps it inside one declaration **for the false-positive direction**:
 * a `--` appearing inside some other property's value cannot reach a later colon, so the
 * pattern cannot fire on a declaration it is not reading.
 *
 * 🔴 **It does NOT carry in the false-negative direction, and `senior-qa` falsified the
 * sentence that implied it did.** `--adh-paint:/*;*\/linear-gradient(…)` escapes: a `;`
 * inside a comment or a string does not end a declaration, so the CSS parser sees no `;`
 * there and this pattern sees one. Same family as the ident escape above — the reach of a
 * text denylist, `EV-216`'s question, not widened here.
 *
 * It does not fire on the honest bars: `background:var(--blue-500)` has no colon after
 * its `--`, and the palette and `--r-pill` are declared on `:root` in `globals.css`, not
 * in a row's `style` attribute. That direction was checked BY CAUSE and not inferred from
 * a green suite: `grep -rn '\["--' src/` returns nothing — no element in `src/` carries an
 * inline custom property at all.
 */
const INLINE_CUSTOM_PROPERTY_IMAGE = /--[^:;]*:[^;]*(gradient\(|url\(|image-set\(|element\()/i;

/** Every element inside every week row — the row itself included — with all four reads. */
async function paintedElementsInWeekRows(region: Locator): Promise<RowPaint[]> {
  return region.locator("li").evaluateAll(
    (rows, channels: PaintChannel[]) =>
      rows.map((row) => ({
        // The date column is the row's first child. Read from its own element: the row's
        // textContent runs "21 Sept 2026" straight into "1 / 3 sessions".
        date: (row.firstElementChild?.textContent ?? "").trim(),
        rowText: (row.textContent ?? "").trim(),
        // The row itself is included — AC1 says "every element inside it INCLUDING the
        // row itself", because a gradient on the `li` paints behind all three columns at
        // once, and EV-216's `box-shadow: inset …` bypass was constructed ON the row.
        elements: [row, ...Array.from(row.querySelectorAll<HTMLElement>("*"))].map((el) => ({
          tag: el.tagName.toLowerCase(),
          // EV-215 AC1 — the SECOND argument of `getComputedStyle` is half the fix: a
          // `::before` carrying the picture is a box this element also owns, and the
          // same call reports it when it is asked to. EV-216 AC1 is the other half: the
          // PROPERTY is a parameter too, so the set of channels is data rather than
          // three hand-written reads, and it lives in exactly one place.
          computed: channels.map((channel) => ({
            channel: channel.name,
            value: getComputedStyle(el, channel.pseudo).getPropertyValue(channel.property),
            initial: channel.initial,
          })),
          inline: el.getAttribute("style") ?? "",
        })),
      })),
    PAINT_CHANNELS
  );
}

test.describe("EV-214 / EV-215 / EV-216 AC1 / P-ADH C2 — no element in a week row has a non-initial value on an enumerated paint channel", () => {
  /**
   * EV-210b's own four worlds — AC1 adds no fixture. `minimumElements` is a fact about
   * the FIXTURE and the row's structure (eight rows, each at least the `li` plus a date
   * span and a figures span), not about what the renderer chooses to draw: without it an
   * iteration that found no rows, or rows with no children, would satisfy every
   * assertion inside the loop. That is the failure mode nine C3 guards shipped with.
   */
  const WORLDS: { name: string; id: string; weeks: number; minimumElements: number }[] = [
    { name: "Ines — the done > plannedSoFar current week (1 / 3, plannedSoFar 0)", id: INES, weeks: 8, minimumElements: 24 },
    { name: "Lina — a no-plan week mid-window and a partial current week (2 / 4)", id: LINA, weeks: 8, minimumElements: 24 },
    { name: "Tobias — eight weeks that all had a plan", id: TOBIAS, weeks: 8, minimumElements: 24 },
    { name: "Noor — eight REAL 0 % weeks", id: NOOR, weeks: 8, minimumElements: 24 },
  ];

  /**
   * EV-216 AC3's other half. The disclosure above says the covered channels are listed
   * in ONE place; that is only true while the list cannot shrink unnoticed, and the
   * four tests below iterate the table, so they stay green on an emptier one. This is
   * the assertion that makes a removal a decision: it is two lines to make, and it
   * fails by naming the channels that are actually in the table.
   */
  test("P-ADH C2 (EV-216 AC3): the enumerated channel list has not silently shrunk", () => {
    expect(
      PAINT_CHANNELS.map((channel) => channel.name),
      `PAINT_CHANNELS holds ${PAINT_CHANNELS.length} channels, not the ${PAINT_CHANNELS_EXPECTED} ` +
        "this file was merged with. Adding a channel is one line here and one to " +
        "PAINT_CHANNELS_EXPECTED; removing one needs the same two edits, on purpose, and a note " +
        "in the disclosure block above `PaintChannel` saying what is no longer read."
    ).toHaveLength(PAINT_CHANNELS_EXPECTED);
    expect(
      new Set(PAINT_CHANNELS.map((channel) => channel.name)).size,
      "Two channels share a name, so a red build cannot say which read fired — EV-216 AC1 " +
        "requires the failure to name the channel."
    ).toBe(PAINT_CHANNELS.length);
  });

  for (const world of WORLDS) {
    test(`P-ADH C2 (EV-216 AC1): no element in a week row paints through one of the ${PAINT_CHANNELS.length} enumerated channels — ${world.name}`, async ({
      page,
    }) => {
      await signIn(page);
      await page.goto(`/clients/${world.id}`);
      await expect(block(page, ADHERENCE)).toBeVisible();

      const rows = await paintedElementsInWeekRows(block(page, ADHERENCE));
      // "…not the ${world.weeks} this world renders", never "no week rows at all": the
      // assertion is an equality, so SEVEN rows — a week silently dropped, which is the
      // interesting failure — would otherwise be reported as zero.
      expect(
        rows.length,
        `${world.name}: the adherence block did not render the ${world.weeks} week rows this world has`
      ).toBe(world.weeks);

      const offences: string[] = [];
      let inspected = 0;
      for (const row of rows) {
        for (const element of row.elements) {
          inspected += 1;
          const where = `${world.name} — week row "${row.date}" ("${row.rowText}"), <${element.tag}>`;
          /**
           * The channel list is RATCHETED against `PAINT_CHANNELS`, because `inspected`
           * counts ELEMENTS and not channels: deleting the `::after` read used to leave
           * this suite 260 green, which is the same shape of hole `minimumBars` exists
           * for one section up. This asserts the browser was actually asked for every
           * channel the table lists; `PAINT_CHANNELS_EXPECTED` is what stops the table
           * itself from shrinking.
           */
          expect(
            element.computed.map((channel) => channel.channel),
            `${where}: the channels read do not match PAINT_CHANNELS — a channel in the table was not read`
          ).toEqual(PAINT_CHANNELS.map((channel) => channel.name));
          /**
           * A computed read of a property this browser does not report returns `""`,
           * which is neither the initial value nor a paint — it is a channel that is not
           * a read at all, and it would pass the loop below in silence. `mask-image` is
           * the live example: it is unprefixed in this Chromium (verified), and a
           * browser where it is not would otherwise be a suite that quietly stopped
           * checking one of EV-216's three channels.
           */
          expect(
            element.computed.filter((channel) => channel.value.trim() === "").map((c) => c.channel),
            `${where}: a channel returned an empty computed value, so this browser does not report that property — the channel is listed but not read`
          ).toEqual([]);
          const painting = element.computed.filter((channel) => channel.value !== channel.initial);
          if (painting.length > 0) {
            for (const channel of painting) {
              offences.push(
                `${where} PAINTS on channel [${channel.channel}]: ${channel.value} (initial: ${channel.initial})`
              );
            }
          } else if (INLINE_BACKGROUND_IMAGE.test(element.inline)) {
            // Declared but not painted: an invalid value (`Infinity%`) that Chrome
            // dropped. Same mechanism, one bad division away from painting.
            offences.push(`${where} DECLARES a background image: style="${element.inline}"`);
          } else if (INLINE_CUSTOM_PROPERTY_IMAGE.test(element.inline)) {
            // EV-215 AC3 — declared in a custom property and spent through `var()`, with
            // nothing painting because the value is invalid. Neither the three computed
            // channels nor the pattern above can see this one.
            offences.push(
              `${where} DECLARES a background image in a custom property: style="${element.inline}"`
            );
          }
        }
      }

      expect(
        offences,
        "An element inside a week row has a non-initial value on one of the channels this " +
          "section enumerates, or declares an image function in its inline style. P-ADH C2 says " +
          "the picture IS the two numbers printed beside it; a value on one of these channels " +
          "paints with no layout box of its own, so the geometric limb above cannot check it " +
          "against them — that is the EV-214 / EV-216 bypass (an unmeasurable picture ALONGSIDE " +
          "bars that already satisfy `minimumBars`). " +
          "⚠️ This is an ENUMERATED ban over `PAINT_CHANNELS` plus two inline text denylists; it " +
          "is not a proof that nothing else can paint. What is read, and what is known not to be, " +
          "is disclosed above `PaintChannel`. The fix belongs in the renderer: draw the ratio as " +
          "a measurable box, or draw nothing."
      ).toEqual([]);

      expect(
        inspected,
        `${world.name}: only ${inspected} elements were read inside the week rows, so this ` +
          `check was very nearly vacuous (the fixture guarantees at least ${world.minimumElements})`
      ).toBeGreaterThanOrEqual(world.minimumElements);
    });
  }
});
