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

/**
 * A trainee's `adherenceSeries([...])` tuples, read from the fixture SOURCE, whitespace
 * removed, oldest first. A source read because nothing else can see `plannedSoFar`: it
 * is never printed, and `coachApi.fixture.ts` is `import "server-only"` with `PROGRESS`
 * unexported, so a spec cannot import the derived value.
 *
 * ⚠️ Comments are stripped FIRST. The first cut of this guard matched the paragraph in
 * the fixture that EXPLAINS the tuple, so deleting the tuple left it green — a guard
 * reading its own documentation back and reporting it as protection. It was caught by
 * mutating the fixture, which is the only way any of these are caught.
 *
 * The PROGRESS entry, not the overview one: both are keyed `[<NAME>_ID]` and only one of
 * them holds the series. "the part that contains `adherenceSeries(`" is NOT enough — the
 * part that starts at the OVERVIEW entry runs on to the end of the file and contains
 * everybody else's series, so it matched, and the guard read LINA's week and went red on
 * correct code. The entry is the part whose `adherenceSeries([` comes before the NEXT
 * trainee key — and it is the CALL that is looked for, with its bracket, not the
 * substring `adherenceSeries(`, which also matches the function's own declaration
 * several hundred lines earlier.
 */
function fixtureSeriesTuples(key: "INES_ID" | "LINA_ID"): string[] {
  const fixture = readFileSync(join(__dirname, "..", "src", "lib", "coachApi.fixture.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const CALL = "adherenceSeries([";
  const NEXT_ENTRY = /_ID\]: \(\) => \(\{/;
  const entry = fixture
    .split(`[${key}]: () => ({`)
    .slice(1)
    .find((part) => {
      const call = part.indexOf(CALL);
      const next = part.search(NEXT_ENTRY);
      return call !== -1 && (next === -1 || call < next);
    });
  expect(entry, `${key}'s progress entry was not found in the fixture`).toBeTruthy();
  const body = entry!.slice(entry!.indexOf(CALL) + CALL.length);
  return (body.slice(0, body.indexOf("])")).match(/\[[^\]]*\]|null/g) ?? []).map((t) =>
    t.replace(/\s/g, "")
  );
}

/** The LAST tuple of a trainee's fixture series — the only one whose third element counts. */
function lastFixtureTuple(key: "INES_ID" | "LINA_ID"): string | undefined {
  const tuples = fixtureSeriesTuples(key);
  return tuples[tuples.length - 1];
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
    const tuples = fixtureSeriesTuples("INES_ID");
    expect(tuples.length, "Ines's series is no longer eight weeks").toBe(8);
    expect(
      tuples[tuples.length - 1],
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
 * **READS**, once, at the default viewport, two kinds of thing:
 *
 *   1. 🔴 **the computed channels enumerated in `PAINT_CHANNELS`** (EV-216) — a CSS
 *      property on one of an element's three boxes, its own and both generated ones,
 *      asserted equal to that property's initial value, with a red build naming the
 *      entry that fired. **That table is the ONLY list of covered channels in this
 *      file, and it is the one to read: this sentence deliberately does not repeat it.**
 *      It used to, naming three `backgroundImage` reads, and it went on saying "four
 *      channels" for a whole review after the limb had grown to twelve — the seventh
 *      falsifiable capability sentence in this file, and the first one ABOVE the banner
 *      rather than in it. See the EV-216 disclosure above `PaintChannel` for what the
 *      table reads, when, and what it does not read;
 *   2. the inline `style` attribute, where **one of four literal spellings** —
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
 * 🔴 **A flat `background-color` is untouched as a SCOPE DECISION inherited from
 * EV-214 — NOT because a colour cannot draw a proportion.** It can, when the **box**
 * carries the ratio instead of the paint:
 * `::first-letter { padding-right: <ratio>vw; background-color: rgba(79,124,255,.85) }`
 * paints a proportional bar past every channel here — **witnessed** (`staff-engineer`,
 * EV-216 review; reproduced on this branch: **1.000 of the row width on every scanline
 * beside "21 Sept 2026 — 2 / 4 sessions"** against a control of 0.074, 0.899 on a 3/4,
 * 0.602 on a 2/4, 0.074 on a 0/4, with **every channel in `PAINT_CHANNELS` initial on
 * that box** and no image function anywhere; the guard is 16 passed on it). It is
 * **carded, not closed**: a fifth family is a `senior-po` scope call, and folding one
 * into this row is the unbounded scope EV-216 refused by name.
 *
 * 📌 The sentence this replaces said *"a colour cannot encode a ratio positionally; only
 * an image can"*. The BOUNDARY was fine; the REASON was false, and a false reason is
 * worse than no reason — a reader who trusts it never tries the construction. That is
 * what AC3 owes, and it is the eighth capability sentence falsified in this file.
 *
 * The geometry limb, `minimumBars`
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
 * **WHAT IT READS.** For **every element in the LIGHT DOM inside every week row of the
 * adherence block, the `li` itself included** — the scan is `querySelectorAll("*")`,
 * which does not cross a shadow root, and this app opens none — two kinds of read:
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
 * or family this section does not read; **each entry states whether it was constructed
 * and run, and who owns it**. (The header used to say every entry had been constructed
 * and run, which was false of two of its own five — nobody has built a `<canvas>` bar,
 * and a channel-independent detector is not a mechanism anyone built.) It is not a
 * claim that anything absent from this list is caught — seven totality sentences
 * written about this guard have now been falsified by the next person to try one.
 * Later rows append here; the entry shape is *mechanism — what was tried — owning row*.
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
 *   · 🔴 **A proportional bar painted with NO image function at all — the ratio in the
 *     BOX, the paint a flat colour**: `::first-letter { padding-right: <ratio>vw;
 *     background-color: rgba(79,124,255,.85) }`. CONSTRUCTED and PAINTING — 1.000 of the
 *     row width beside "2 / 4 sessions" (control 0.074), proportional across the series
 *     — and the guard is green on it. What was tried: **nothing in this table can reach
 *     it**, because every channel here reads a property whose value is a PICTURE, and
 *     this one's picture is the element's geometry. It is not a fifth property to add;
 *     it is a fifth FAMILY (a paint channel that is not an image), and `senior-po` owns
 *     that scope call. → a card, deliberately not closed here.
 *   · **`mask-image` on `::first-letter`** — the ONE empty cell left in that box's row,
 *     and 🔴 **it is the last of three: `box-shadow` was listed here until it was
 *     re-measured with a wide BOX, and `border-image-source` until it was re-measured
 *     with a wide CLIP (`BUG-217`).** What was tried for the one that remains: declared
 *     on a row drawing no honest bar, at a 100 vw padding box, sampled past the row's
 *     own box — computed `mask-image` and `-webkit-mask-image` both initial, and a flat
 *     `background-color` on the same box paints 1.000, so the box is real and the mask
 *     is absent. Unread deliberately: an entry would ban a declaration that cannot paint
 *     there. **Both the box and the clip have to be stated for an emptiness here to mean
 *     anything** — see the entry's comment.
 *   · **`content` on `::first-letter`** — the third absent cell of that box's row, named
 *     here because AC3 asks for it rather than because anything was constructed: the
 *     declaration is DISCARDED (`content` does not apply to `::first-letter`), so there
 *     is nothing to read. Carded as **`BUG-220`** so the claim is checked rather than
 *     taken from this sentence.
 *   · **An overlay painted from an element that is neither an `li` nor inside one** — a
 *     `ul::after` over the rows. What was tried: nothing here reaches it, because the
 *     scan is `region.locator("li")` plus descendants, which is the same shape of gap as
 *     EV-215's ancestor declaration. Carded as **`BUG-218`**.
 *   · **A table entry RENAMED and REPOINTED together** — not a paint channel but a way
 *     past this section's own integrity assertions: rename `"box-shadow on its own box"`
 *     to `"outline-style on its own box"` *and* repoint the property, and the length,
 *     the name uniqueness, the name-equals-read equality and the pair uniqueness are all
 *     satisfied by a table that no longer reads `box-shadow` (16 passed with M1
 *     painting). Carded as **`BUG-219`**; the honest statement is that the four
 *     assertions bind an entry to ITSELF, not the table to a required set of channels.
 *   · ⛔ **`::marker { background-image: … }` — COULD NOT CONSTRUCT ONE**, which is the
 *     honest third answer and not a negative result. What was tried, three ways in this
 *     app's own DOM: `background-image` on `::marker`; `list-style: inside disc` to give
 *     the marker a box; and replacing the glyph with a coloured `\2588` block to test
 *     whether the box exists at all. Nothing painted, because a week row is
 *     `display: grid` and generates no marker box. **A change to `display: list-item`
 *     would need this re-probed** — the finding is about this renderer, not about CSS.
 *   · **`-webkit-box-reflect` — it PAINTS, and no overstatement is reachable with it.**
 *     Measured at `y=17..26` when the row's box ends at `y=12` — i.e. OUTSIDE the
 *     element, which is why an element-clipped screenshot missed it first. But it only
 *     MIRRORS existing content, and the current week draws no bar to mirror, so there is
 *     nothing for it to overstate. 🔴 **Its value is methodological and it belongs to
 *     EV-217**: it is a THIRD implicit quantifier beside time and viewport — **the CLIP
 *     REGION a probe samples**. EV-217's AC has to say which region is sampled, the way
 *     it already has to say which instant and which width.
 *   · **`::selection` and `::backdrop`** were probed and do **not** paint — duds,
 *     recorded so that nobody spends a second afternoon on them.
 *
 * 🔴 **And the check that now precedes all of this, because it killed a row:** *a
 * witness taken in a synthetic `page.setContent` harness is not a witness on the real
 * surface.* Two of four reported bypasses did not survive the move into this app's own
 * DOM — `::marker` needs a box this renderer never generates, and `-webkit-box-reflect`
 * has nothing here to mirror. Every entry and every line above was re-run against the
 * running portal. `senior-po` runs this check before allocating an ID to a reported
 * bypass; run it before believing one.
 *   · ✓ **A `-webkit-mask-image`-only bypass — TRIED, PAINTS, and CAUGHT.** Written with
 *     no unprefixed `mask-image` at all: blue 1.000 across all five scanlines, and red
 *     on the `mask-image` entry, because Blink aliases the prefixed form onto the
 *     computed unprefixed property. Recorded here because it is a RUN answer to the
 *     standing worry that a computed enumeration is evadable by re-spelling the way a
 *     text denylist is — for this alias, on this engine, it is not.
 *   · **`<canvas>` and `<img>`.** No witness in either direction: nobody has built one,
 *     and nobody has shown one cannot be built. `senior-po` has declined four times to
 *     fold them in on the strength of neighbouring mechanisms being real. Not a row.
 *   · **A channel-independent paint detector**, which would replace this enumeration
 *     rather than extend it, is a NAMED OPEN QUESTION for `architect`. It is not
 *     scheduled, this section does not wait on it, and nothing here approves building
 *     one.
 *
 * 🔴 **THE PREFIXED-SPELLING RULE — read both, enumerate the one that returns a
 * value.** When a property has a prefixed and an unprefixed name, the entry is chosen by
 * MEASUREMENT: read both with `getPropertyValue` and take the one the engine reports.
 * Worked example, and the reason the rule exists (`BUG-221`):
 * `mask-border-source` returns **`""`** here — not reported, so an entry naming it would
 * be listed and never read — while `-webkit-mask-box-image-source` returns the value and
 * is what the table carries. The loop's empty-value assertion is what makes a wrong
 * choice go red rather than pass vacuously; this rule is what stops it being made.
 *
 * ⚠️ **This is NOT EV-218's question, and the distinction is `senior-po`'s** (its third
 * scope call on this axis, so it is worth stating rather than re-deriving):
 *
 *   | | EV-218's spellings | a vendor prefix |
 *   |---|---|---|
 *   | who picks it | an **adversary**, to evade a text match | the **platform** — two names, one implemented |
 *   | bounded? | **no** | **yes** — read both and see which answers |
 *   | failure | **evasion** | **incomplete enumeration** |
 *
 * Incomplete enumeration is this row's own failure mode, so a prefixed spelling belongs
 * in this table. ADR-0024's *"test property presence, never match the value text"* is
 * untouched: this is about WHICH SPELLING NAMES THE PROPERTY, on the computed side —
 * which had been assumed to be an inline-only concern until it was not.
 *
 * 🔴 **Why the single-source list matters more than any entry in it, in `senior-po`'s
 * words:** *every enumeration in this guard has been short. Channels, spellings,
 * pseudo-elements, properties — **four lists, four times too short.*** That is the
 * argument for `PAINT_CHANNELS` being one line per channel even when a ruling adds work
 * to it, and it is the reason AC3 asks for the narrowness to be VISIBLE rather than
 * for the narrowness to be denied.
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
 * One computed read: **one cell of a (box × property) matrix** — a CSS property, on one
 * of the boxes an element owns, with the value of that property which means *this box
 * paints nothing through this channel*.
 *
 * 🔴 **The matrix is the model, and it is `senior-po`'s correction to its own split of
 * this work.** EV-215 extended the **box** axis (`::before`, `::after`); EV-216 extended
 * the **property** axis (`box-shadow`, `border-image-source`, `mask-image`, `content`).
 * They were carded as different families and they are not: *a short property list and a
 * short pseudo-element list fail the SAME way — incomplete enumeration.* In its words,
 * **one enumeration, short on both axes**; the taxonomy was mine and the failure mode is
 * what matters. So `::first-letter` is an entry here rather than a row of its own, and a
 * future escape on either axis is one line in the same table.
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
  pseudo: "::before" | "::after" | "::first-letter" | null;
  /** The property's initial value — what "paints nothing here" computes to. */
  initial: string;
}

/**
 * 🔴 **THE one place the covered channels are listed — EV-216 AC3.**
 *
 * Adding a channel is one line here. Removing one is visible twice: the entry is gone
 * from a list a reader reads top to bottom, and `PAINT_CHANNELS_EXPECTED` goes red.
 *
 * **It is a SPARSE matrix, and the empty cells are the point.** A cell is present when
 * the property can paint on that box **and somebody has shown it** — not on symmetry.
 * Filling a row of the matrix because the other cells in it are filled would ban things
 * with no witness, which this file treats as the same defect as permitting one; the
 * empty cells are named in the disclosure with what was tried. The five properties, and
 * why each is a channel a proportional bar can be painted through without a layout box
 * of its own:
 *
 *   · `background-image` — EV-214's witnessed bypass (a gradient behind the figures).
 *   · `box-shadow` — EV-216's. `inset ${(done / plannedSoFar) * 100}vw 0 0 0 rgba(79,
 *     124, 255, .35)` on a week row paints Lina's row end to end beside "2 / 4
 *     sessions" with the suite at 260 green, and `inset` means it needs no box of its
 *     own beyond the one the row already has.
 *   · `border-image-source` and `mask-image` — named by `staff-engineer` as the same
 *     family, and each carries a mutant of its own (AC2), because a family named in
 *     prose is not a family until somebody builds the other two.
 *   · `content` — an image function in a generated box's `content`, constructed twice
 *     independently during review and painting a full-width bar beside "2 / 4 sessions"
 *     against this branch with all twelve other channels, both denylists, the geometry
 *     limbs and `minimumBars` green. See its entry below for its two initial values.
 *
 * And the fourth BOX, `::first-letter` — `background-image`, `box-shadow` and
 * `border-image-source`, with ONE cell beside them empty, measured at a stated box AND a
 * stated clip. Two of those three were shipped as "measured empty" and were not; the
 * qualification is the entry's whole point, so read it there.
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
 *
 * ── **EV-216 AC2 — the eight mutants, each with the probe that it PAINTED.** ─────────
 *
 * Each was planted in an uncommitted `AdherenceSeries.tsx`, rendered on **Lina**, and
 * photographed before the suite was believed: a screenshot of each week row, PNG-decoded,
 * five scanlines per row, reporting the fraction of the row's width painted blue. The
 * control run (clean code) is the number each is read against. **A green — or a red —
 * under a mutant nobody has watched paint is worth nothing** (clause 7); three of these
 * eight proved it, below — once as a mutant that looked dead and was not, and twice as a
 * cell that looked empty and was not. **Each time the probe's geometry was the answer:
 * the scanline, then the box, then the clip.**
 *
 *   · **M1 `box-shadow`** — `inset ${(week.done / week.plannedSoFar) * 100}vw 0 0 0
 *     rgba(79, 124, 255, .35)` on the `li`, exactly as `staff-engineer` constructed it.
 *     PROBE: Lina's current row, *"21 Sept 2026 | 2 / 4 sessions"*, went from **blue
 *     0.068 → 1.000 of the row width**, computed `rgba(79, 124, 255, 0.35) 1280px 0px
 *     0px 0px inset` — **the row painted end to end beside "2 / 4 sessions"**, which is
 *     mechanism 2 of EV-210's table. Proportional, not constant: 960 px on a 3 / 4 week,
 *     640 px on a finished 2 / 4. RESULT: **4 failed**, every offence naming
 *     `[box-shadow on its own box]`.
 *   · **M2 `border-image`** — `border-top: 10px solid transparent` +
 *     `border-image-source: linear-gradient(90deg, rgba(79,124,255,.85) <ratio>%,
 *     transparent <ratio>%)` + `border-image-slice: 1`. PROBE, and 🔴 **the dud this
 *     file warns about, met head on**: the first probe sampled the row's vertical MIDDLE
 *     and reported **blue 0.04** — indistinguishable from "the mutant never fired". A
 *     border-image paints in a 10 px strip at the TOP of the row. Re-probed across five
 *     scanlines, the same row reads **blue 1.000 at y=1 and y=7 of 26** — a full bar
 *     beside "2 / 4 sessions" — and 0.75 / 0.50 on the 3 / 4 and 2 / 4 finished weeks.
 *     RESULT: **4 failed**, every offence naming `[border-image-source on its own box]`.
 *   · **M8 `-webkit-mask-box-image-source` on the element's own box — `BUG-221`.**
 *     `li { background: rgba(79,124,255,.85); -webkit-mask-box-image-source:
 *     linear-gradient(90deg, #000 <ratio>%, transparent <ratio>%);
 *     -webkit-mask-box-image-slice: 0 fill }` — M3's mechanism through the masking
 *     BORDER property, so the paint is a flat COLOUR and no image function exists for
 *     either denylist. PROBE: the current row, printing "21 Sept 2026 — 2 / 4 sessions"
 *     and drawing no honest bar, is **0.957 of its width in blue on every scanline**
 *     (control 0.031), proportional at 0.475 on a finished 2/4 and 0.675 on a 3/4, with
 *     `background-image`, `box-shadow`, `border-image-source`, `mask-image` and
 *     `content` **initial on every element and every box**. Reproduced at the tip before
 *     the entry: **whole suite 261 passed, exit 0**. RESULT after it: **4 failed**, 30
 *     offences, all naming `[-webkit-mask-box-image-source on its own box]`, zero
 *     `DECLARES`. 📌 Independence was run **on the WHOLE GATE** rather than this file:
 *     with that one cell removed and the mutant still painting, **261 passed** — nothing
 *     anywhere in the suite kills it, which is a stronger statement than 16 passed here.
 *   · **M7 `border-image-source` on `::first-letter` — `BUG-217`, the second empty cell
 *     that was not empty, and the one that was silent across the WHOLE GATE.**
 *     `::first-letter { padding-right: <ratio*0.5>vw; border-top: 10px solid transparent;
 *     border-image-source: linear-gradient(90deg, rgba(79,124,255,.95) <ratio>%,
 *     transparent <ratio>%); border-image-slice: 1 }`. PROBE, clip grown 24 px on every
 *     side: the current row, printing "21 Sept 2026 — 2 / 4 sessions" and drawing no
 *     honest bar, reads **0.053 inside its own box and 0.578 → 0.635 above it** — the
 *     band is in the 10 px strip ABOVE the row, which is why an element-clipped sample
 *     read it as empty. `senior-qa` measured the same form at 0.586 against a 0.031
 *     control, the same band length as the 3/3 and 4/4 weeks. Reproduced at the tip
 *     before the entry existed: **the whole suite, 261 passed, exit 0** — the only
 *     mutant in this list that nothing in the gate saw. RESULT after the entry:
 *     **4 failed**, 30 offences, all naming `[border-image-source on ::first-letter]`,
 *     zero `DECLARES`; independence run **16 passed**.
 *   · **M6 `box-shadow` on `::first-letter`, and the empty cell that was not empty.**
 *     `li > span:first-child::first-letter { padding-right: 100vw; box-shadow: inset
 *     <ratio>vw 0 0 0 rgba(79,124,255,.85) }`. This cell was SHIPPED AS EMPTY on the
 *     strength of a 0.040 reading, and the reading was taken against a `::first-letter`
 *     with no padding — a box one glyph wide, which an `inset` shadow paints inside of.
 *     PROBE with the padding box: Lina's current row (control 0.074, no honest bar)
 *     reads **1.000 on every scanline** beside "2 / 4 sessions", computed
 *     `rgba(79,124,255,0.85) 1280px 0px 0px 0px inset`, and the series is proportional —
 *     1.000 on 3/3 and 4/4, **0.894 on a 3/4, 0.596 on a 2/4**, 0.000 on the 0/4 and
 *     no-plan weeks. Reproduced against the tip BEFORE the entry existed: **16 passed**,
 *     a live escape. RESULT after the entry: **4 failed**, 12 offences, every one naming
 *     `[box-shadow on ::first-letter]`, zero `DECLARES`, geometry and `minimumBars`
 *     green; independence run (that cell alone removed, pin lowered) **16 passed**.
 *     📌 The lesson is not about `box-shadow`: **an emptiness measured with the wrong box
 *     is not a measurement**, and this is the third time in this file that a probe's
 *     geometry rather than the channel produced the answer.
 *   · **M5 `background-image` on `::first-letter`** — a band on the first letter of a
 *     week row's span, stretched to the ratio with `padding-right: <ratio>vw`.
 *     🔴 **Its first version was killed by TWO clauses and therefore witnessed
 *     neither.** Put on the FIGURES span, the padding widened the `auto` grid track,
 *     squeezed the bar track, and the geometric limbs went red beside this one: 7
 *     failed, and a mutant two clauses kill shows neither to be needed. Moved onto the
 *     DATE span — whose grid track is a fixed `76px`, so the band overflows without
 *     resizing anything — the geometry is untouched and only this cell fires. PROBE:
 *     Lina's current row, which draws NO honest bar (control 0.068), reads **0.663 at
 *     y=1 and 0.729 at mid-height** — two thirds of the row in blue beside "2 / 4
 *     sessions" — and the band tracks the ratio across the finished weeks (0.334 on a
 *     2 / 4, 0.496 on a 3 / 4, 0.663 on a 4 / 4). RESULT: **4 failed**, 58 offences,
 *     every one naming `[background-image on ::first-letter]`, zero `DECLARES`, the
 *     geometry limbs and `minimumBars` green.
 *   · **M4 `content`** — `li::before { content: linear-gradient(90deg,
 *     rgba(79,124,255,.85) 100%, transparent 0%); display: block; position: absolute;
 *     width: <ratio>%; height: 12px }`, delivered from a `<style>` because React cannot
 *     style a pseudo-element — which is how it would arrive in production too. PROBE:
 *     Lina's current row **blue 1.000 at y=1, y=4 and y=8 of 16**, page background under
 *     the figures `rgb(102,141,252)` — a full-width bar beside "2 / 4 sessions" — and
 *     **0.750 / 0.500 on the finished 3 / 4 and 2 / 4 weeks**, so proportional rather
 *     than constant. RESULT: **4 failed**, 32 offences, every one naming
 *     `[content on ::before]`, zero `DECLARES`. Before the channel existed this mutant
 *     was **16 passed** against this branch with all twelve other channels, both
 *     denylists, the geometry limbs and `minimumBars` green on it — EV-210's mechanism 2
 *     restored, which is why `senior-po` ruled it an entry rather than a disclosure.
 *   · **M3 `mask-image`** — `background: rgba(79,124,255,.35)` (a background COLOUR, so
 *     no `background-image` exists for either EV-214 clause to find) revealed only as far
 *     as the ratio by `mask-image: linear-gradient(90deg, #000 <ratio>%, transparent
 *     <ratio>%)`. PROBE: the same row **blue 1.000 on every scanline**, page background
 *     `rgb(181,195,239)` under the figures. RESULT: **4 failed**, every offence naming
 *     `[mask-image on its own box]`.
 *
 * ⚠️ **What M5 and M6 do and do NOT prove, corrected by `senior-qa`.** Both were built
 * with a `100vw` padding box, and the `100vw` forms ARE caught by the gate — by
 * `qa/layout.ts`'s 320 px sideways-scroll sweep, which names a **layout overflow**, not
 * by P-ADH C2 and not by anything in this file. The NARROWED forms (a `<ratio>vw`
 * padding, no overflow) are caught by nothing but the entries added here. So those two
 * escape claims are **file-scoped, not gate-scoped**: they show this section was blind,
 * not that the suite was silent. `BUG-217`'s narrowed form is the one that was silent
 * everywhere — **whole suite 261 passed**, reproduced at the tip.
 *
 * **Independence (clause 4), run per mutant rather than argued.** With the mutant still
 * planted and still painting, its ONE channel entry was deleted from `PAINT_CHANNELS`
 * (and `PAINT_CHANNELS_EXPECTED` lowered by one, so the ratchet was not what went red):
 * **16 passed** every time, for all eight — and for M8 the same run was done across the
 * WHOLE GATE, at 261 passed. Nothing else kills any of them — not the geometry limbs,
 * not `minimumBars`, not the two inline denylists, not the other eighteen channels. Two clauses killing one mutant would show neither to be needed, and
 * M5's first version was exactly that and was rebuilt rather than reported.
 *
 * **Clause 8 — would it still have gone red if the bug had been the other one?** The
 * cross-matrix says no, and that is the point: M1 fired 29 offences and *only* on
 * `box-shadow`, M2 only on `border-image-source`, M3 only on `mask-image`, M4 32 and
 * only on `content on ::before`, M5 58 and only on `background-image on ::first-letter`,
 * M6 12 and only on `box-shadow on ::first-letter`, M7 30 and only on
 * `border-image-source on ::first-letter`, M8 30 and only on
 * `-webkit-mask-box-image-source on its own box` — with zero `DECLARES` offences and no
 * other test in this file red under any of them. So each
 * channel is carrying its own weight and none is riding on another's witness. What the
 * three mutants share is the SHAPE the guard was written for — a bar whose painted
 * length is `done / plannedSoFar`, reading FULL beside a row that prints "2 / 4
 * sessions" — and the probe measured that length rather than assuming it.
 *
 * ⚠️ The honest counterpart, stated because it is the enumeration's real cost: this limb
 * would also go red on a CONSTANT decorative value on any of these properties inside a
 * row, because a computed read cannot tell a ratio from a constant. That is EV-216 edge
 * case 2 and it is a `senior-po` decision if it ever happens, not a silent exception.
 */
const PAINT_CHANNELS: PaintChannel[] = [
  // ── box: the element's own ───────────────────────────────────────────────────────
  { name: "background-image on its own box", property: "background-image", pseudo: null, initial: "none" },
  { name: "box-shadow on its own box", property: "box-shadow", pseudo: null, initial: "none" },
  { name: "border-image-source on its own box", property: "border-image-source", pseudo: null, initial: "none" },
  { name: "mask-image on its own box", property: "mask-image", pseudo: null, initial: "none" },
  /**
   * 🔴 **`BUG-221`, and its SPELLING is a measurement, not a preference.** The masking
   * BORDER image is M3's mechanism through a second property: a flat background COLOUR
   * revealed only as far as the ratio, so no image function exists for either inline
   * denylist and all five other properties read initial on every element and every box.
   * Witnessed painting the current row **end to end — 0.957 of its width on every
   * scanline beside "2 / 4 sessions"** (control 0.031), proportional at 0.475 on a
   * finished 2/4 and 0.675 on a 3/4, with **the whole suite 261 passed, exit 0**.
   *
   * The STANDARD spelling cannot be the entry: `getPropertyValue("mask-border-source")`
   * returns **`""`** in this Chromium — the property is not reported at all — and the
   * empty-value assertion in the loop would correctly reject it as *listed but not
   * read*. `-webkit-mask-box-image-source` returns
   * `linear-gradient(90deg, rgb(0,0,0) 100%, …)`. Both were read side by side before
   * this line was written; see the banner's prefixed-spelling rule.
   */
  { name: "-webkit-mask-box-image-source on its own box", property: "-webkit-mask-box-image-source", pseudo: null, initial: "none" },
  // ── box: ::before ────────────────────────────────────────────────────────────────
  { name: "background-image on ::before", property: "background-image", pseudo: "::before", initial: "none" },
  { name: "box-shadow on ::before", property: "box-shadow", pseudo: "::before", initial: "none" },
  { name: "border-image-source on ::before", property: "border-image-source", pseudo: "::before", initial: "none" },
  { name: "mask-image on ::before", property: "mask-image", pseudo: "::before", initial: "none" },
  // ── box: ::after ─────────────────────────────────────────────────────────────────
  { name: "background-image on ::after", property: "background-image", pseudo: "::after", initial: "none" },
  { name: "box-shadow on ::after", property: "box-shadow", pseudo: "::after", initial: "none" },
  { name: "border-image-source on ::after", property: "border-image-source", pseudo: "::after", initial: "none" },
  { name: "mask-image on ::after", property: "mask-image", pseudo: "::after", initial: "none" },
  /**
   * ── box: ::first-letter ──────────────────────────────────────────────────────────
   *
   * TWO cells, and 🔴 **the method by which the other two were found empty is part of
   * the finding — read it before adding or removing anything here.**
   *
   * **An emptiness measured with the WRONG BOX is not a measurement.** This entry list
   * shipped `box-shadow` as an empty cell on the strength of a probe that read
   * `0.040 of row width` against a control of `0.049` — while the computed value was
   * `rgba(79,124,255,0.85) 1280px 0px 0px 0px inset`, i.e. a 1280 px shadow. Both
   * numbers were real and the inference was wrong: **an `inset` shadow paints inside the
   * PADDING BOX, and a `::first-letter` with no padding is ONE GLYPH WIDE.** The reviewer
   * added `padding-right: 100vw` and the same declaration painted **1.000 of the row
   * width on every scanline beside "2 / 4 sessions"** (control 0.074 on that row, which
   * draws no honest bar), proportional across the series — 1.000 on 3/3 and 4/4, 0.894
   * on a 3/4, 0.596 on a 2/4, 0.000 on the 0/4 and no-plan weeks. Reproduced here before
   * the entry was added: the guard was **16 passed** on it. That is EV-210's mechanism 2,
   * restored, and it is the THIRD time in this file that a probe's geometry, not the
   * channel, produced the answer.
   *
   * 🔴 **AND THE SAME MISTAKE WAS THEN MADE A SECOND TIME, ONE AXIS OVER — `BUG-217`.**
   * `border-image-source` shipped here as an empty cell too, on a re-measurement that
   * fixed the BOX (100 vw padding) and kept the CLIP: `locator.screenshot()` samples the
   * element's own box, and a `border-top` band on `::first-letter` paints in the 10 px
   * strip **ABOVE the row box**. Re-probed with the clip grown 24 px on every side, the
   * current row — printing "21 Sept 2026 — 2 / 4 sessions" and drawing no honest bar —
   * reads **0.053 INSIDE the row box and 0.578 → 0.635 ABOVE it**, computed
   * `linear-gradient(90deg, rgba(79,124,255,0.95) 100%, …)`, the same band length as the
   * 3/3 and 4/4 weeks. `senior-qa` measured the narrowed form at **0.586 against a 0.031
   * control, with the WHOLE SUITE 261 passed** — reproduced here at the tip before the
   * entry was added. It ran its isolation controls first: the same wide box with a
   * transparent 10 px border and NO `border-image-source` paints no band, and a solid
   * blue `border-top` on that box paints the same one.
   *
   * 📌 **The rule this cell now carries: an emptiness is only as good as the BOX and the
   * CLIP it was measured with — say both, or the next re-measurement fixes one and
   * inherits the other.** That is the fourth time in this file that a probe's geometry
   * rather than the channel produced the answer, and the first where a correct fix for
   * one geometry error was administered through an uncorrected second one.
   *
   * ⚠️ **So the ONE remaining empty cell carries its box, its clip and its
   * beside-check**, and is empty because the channel is absent, not because the sample
   * was:
   *   · `mask-image` — **dropped on this box entirely**: computed `mask-image` AND
   *     `-webkit-mask-image` are initial even when declared, so there is nothing to read
   *     and nothing to clip. Beside-check (`senior-qa` reproduced it): a flat
   *     `background-color` on the SAME wide box paints **1.000** of the row width
   *     unclipped — so the box is real and the mask is what is missing, rather than the
   *     paint. Measured at a 100 vw padding box with the clip grown past the row.
   * An entry for it would go red on a declaration that cannot paint there — a ban with
   * no witness of harm, the defect EV-214 refused for `<canvas>`. If a future engine
   * paints it, it is one line — and **re-measure with the wide box AND the wide clip**.
   */
  { name: "background-image on ::first-letter", property: "background-image", pseudo: "::first-letter", initial: "none" },
  { name: "box-shadow on ::first-letter", property: "box-shadow", pseudo: "::first-letter", initial: "none" },
  { name: "border-image-source on ::first-letter", property: "border-image-source", pseudo: "::first-letter", initial: "none" },
  /**
   * 🔴 `content` — added on `senior-po`'s ruling, not as a disclosure. An image in
   * `content` (`::before { content: linear-gradient(90deg, …); display: block; width:
   * …; height: … }`) is a computed property, read post-parse, on the element: **this
   * table's own family**, and shipping the table while knowingly omitting a member of
   * its own family would be a narrow guard wearing a broad banner — the defect this row
   * exists to fix, committed by the row itself.
   *
   * ⚠️ **Its `initial` is not `none` on all three boxes, and that is measured, not
   * assumed:** `content` computes to `normal` on an element's own box and to `none` on
   * `::before` / `::after` (all 38 elements of Lina's eight rows, on clean code). A
   * single shared `initial` would have made the own-box entry fire on every element in
   * the block. This is what a per-entry `initial` is for.
   *
   * ⚠️ **It sharpens edge case 2.** A DECORATIVE STRING in a `::before` inside a week
   * row — a bullet, a separator, an icon glyph — now goes red, because a computed read
   * cannot tell a string from a picture. There is none today (`::before content` is
   * `none` on every element of every row, measured). If design wants one, that is a
   * **stop and ask `senior-po`**, not a silent carve-out here.
   */
  { name: "content on its own box", property: "content", pseudo: null, initial: "normal" },
  { name: "content on ::before", property: "content", pseudo: "::before", initial: "none" },
  { name: "content on ::after", property: "content", pseudo: "::after", initial: "none" },
];

/**
 * Pinned, for the reason `SCHEMAS_EXPECTED` is pinned in `qa/contract-drift.spec.ts`:
 * a guard whose coverage is a list can be emptied one entry at a time and still pass
 * every assertion it makes. Deleting the `::after` read used to leave this suite 260
 * green. Raise it in the same commit that adds a channel; lowering it is a decision
 * somebody has to write down.
 */
const PAINT_CHANNELS_EXPECTED = 19;

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
}

interface RowPaint {
  /** The row's printed week-commencing date, for the failure message. */
  date: string;
  /** The row's whole text, so a row whose date column moved is still identifiable. */
  rowText: string;
  elements: RowElement[];
}


/**
 * Every element inside every week row — the row itself included — with every
 * `PAINT_CHANNELS` read. Computed values only: the inline `style` attribute is not read
 * (EV-218, ADR-0024).
 */
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
        })),
      })),
    PAINT_CHANNELS
  );
}

test.describe("EV-214 / EV-215 / EV-216 / EV-218 / P-ADH C2 — no element in a week row has a non-initial value on an enumerated paint channel", () => {
  /**
   * EV-210b's own four worlds. `minimumElements` is a fact about the FIXTURE and the
   * row's structure (eight rows, each at least the `li` plus a date span and a figures
   * span), not about what the renderer chooses to draw: without it an iteration that
   * found no rows, or rows with no children, would satisfy every assertion inside the
   * loop. That is the failure mode nine C3 guards shipped with.
   *
   * `currentWeek` is the figures the LAST rendered row must print. For Lina it is the
   * EV-218 ratchet (ADR-0024 decision 3): her current week is the fixture's one
   * `done > plannedSoFar >= 1` row, and the assertion that it still renders lives in
   * the same test that reads its paint. The rendered figures cannot show
   * `plannedSoFar` — nothing prints it — so the tuple's third element, and Lina's
   * presence in this table, are held by the EV-218 test after the loop.
   */
  const WORLDS: { name: string; id: string; weeks: number; minimumElements: number; currentWeek: string }[] = [
    { name: "Ines — the done > plannedSoFar current week (1 / 3, plannedSoFar 0)", id: INES, weeks: 8, minimumElements: 24, currentWeek: "1 / 3 sessions" },
    { name: "Lina — a no-plan week mid-window and the done > plannedSoFar >= 1 current week (3 / 4, plannedSoFar 2)", id: LINA, weeks: 8, minimumElements: 24, currentWeek: "3 / 4 sessions" },
    { name: "Tobias — eight weeks that all had a plan", id: TOBIAS, weeks: 8, minimumElements: 24, currentWeek: "0 / 3 sessions" },
    { name: "Noor — eight REAL 0 % weeks", id: NOOR, weeks: 8, minimumElements: 24, currentWeek: "0 / 3 sessions" },
  ];

  /**
   * EV-216 AC3's other half. The disclosure above says the covered channels are listed
   * in ONE place; that is only true while the list cannot shrink — or LIE — unnoticed,
   * and the four tests below iterate the table, so they stay green on an emptier or a
   * dishonest one. This is the assertion that makes either a decision.
   *
   * 🔴 **The length and the labels are not enough, and the reviewer walked past them
   * with one token.** Keep the entry, keep its name `"box-shadow on its own box"`, and
   * repoint its `property` to `"background-image"`: the count is 12, the labels are
   * unique, no value is empty, and `box-shadow` is not read at all. With M1 planted and
   * probed painting — Lina's row blue 1.000 on every scanline — that table gave **17
   * passed**. A DELETED entry leaves a hole a reader can see; a REPOINTED one leaves
   * the list looking complete to exactly the reader AC3 is written for.
   *
   * So the two assertions below bind the entries to what they read. Both are already
   * true of the table as merged and neither required a rename:
   *
   *   · every entry's `name` is EXACTLY `` `${property} on ${pseudo ?? "its own box"}` ``,
   *     so the label a red build prints cannot name a channel the entry does not read —
   *     on either axis;
   *   · every `(property, pseudo)` pair is unique, so an entry cannot be repointed onto
   *     a pair another entry already covers and disappear behind it.
   *
   * 🔴 **`startsWith` was the first cut and it bound only the PROPERTY axis.** It admits
   * `{ name: "background-image on ::first-letter", property: "background-image",
   * pseudo: "::marker" }` — honest-looking name, unique pair, `::first-letter` no longer
   * read. Exact equality is one line, strictly stronger, and all entries already
   * satisfied it. 📌 Worth recording why this was only a should-fix: the same repoint
   * **could not** be exploited on `::before` / `::after`. Repointing `box-shadow on
   * ::after`'s pseudo, with a painting `li::after` mutant, is still 4 failed — on
   * `[content on ::after]`, because **any `::after` paint needs `content` to generate
   * the box at all**, so B1's three `content` entries make the generated-box axis
   * self-guarding. `::first-letter` needs no `content`, which is exactly where the hole
   * was.
   *
   * **Witnessed rather than argued**, and the mutant is the shape a future row would
   * actually arrive in — `::marker` added to the `pseudo` union and one entry repointed
   * onto it, its name untouched: **1 failed / 15 passed**, reading
   * `"background-image on ::first-letter" reads background-image on ::marker`. The
   * uniqueness limb cannot cover that one, because the new pair is genuinely new; and
   * note that with the matrix as full as it now is, every repoint WITHIN the current
   * union duplicates an existing pair, so the two limbs cover different halves.
   *
   * **Both were then witnessed, separately, because an assertion nobody has seen fire is
   * decoration** (this file's own standard):
   *   · the reviewer's exact walk-past — name kept, `property` repointed to
   *     `background-image`, M1 planted and painting — went from its 16 green to
   *     **1 failed / 15 passed**, the red naming `"box-shadow on its own box reads
   *     background-image"`;
   *   · and because the first limb throws before the second is reached, the uniqueness
   *     limb got its own mutant: an entry NAMED `background-image on its own box, again`
   *     reading `background-image` on the same box — name and property in agreement, so
   *     only uniqueness can fire. **1 failed / 15 passed.**
   *
   * The other direction is run too, and the table fails CLOSED: corrupting an entry's
   * `initial` on clean code gives 4 failed rather than a quiet pass.
   */
  test("P-ADH C2 (EV-216 AC3): the enumerated channel list has not silently shrunk", () => {
    expect(
      PAINT_CHANNELS.map((channel) => channel.name),
      `PAINT_CHANNELS holds ${PAINT_CHANNELS.length} channels, which does not match ` +
        `PAINT_CHANNELS_EXPECTED (${PAINT_CHANNELS_EXPECTED}). Adding a channel is one line here and one to ` +
        "PAINT_CHANNELS_EXPECTED; removing one needs the same two edits, on purpose, and a note " +
        "in the disclosure block above `PaintChannel` saying what is no longer read."
    ).toHaveLength(PAINT_CHANNELS_EXPECTED);
    expect(
      new Set(PAINT_CHANNELS.map((channel) => channel.name)).size,
      "Two channels share a name, so a red build cannot say which read fired — EV-216 AC1 " +
        "requires the failure to name the channel."
    ).toBe(PAINT_CHANNELS.length);
    expect(
      PAINT_CHANNELS.filter(
        (channel) => channel.name !== `${channel.property} on ${channel.pseudo ?? "its own box"}`
      ).map((channel) => `"${channel.name}" reads ${channel.property} on ${channel.pseudo ?? "its own box"}`),
      "A channel's NAME is not exactly what it READS. The list would then be complete and " +
        "honest to a reader and wrong in what it does — on either axis: an entry called " +
        '"box-shadow on its own box" that reads `background-image` leaves box-shadow unread, ' +
        'and an entry called "background-image on ::first-letter" whose pseudo is `::marker` ' +
        "leaves ::first-letter unread, both with nothing missing from the table. Rename the " +
        "entry or repoint it, but not apart."
    ).toEqual([]);
    expect(
      new Set(PAINT_CHANNELS.map((channel) => `${channel.property}|${channel.pseudo}`)).size,
      "Two entries read the same property on the same box, so one of them is a duplicate — and " +
        "an entry repointed onto a pair another entry already covers hides behind it, leaving " +
        "the table the right length with a channel nobody reads."
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
      // EV-218 / ADR-0024 decision 3 — the rendered ratchet. For Lina this binds the
      // fixture's `done` and `planned`, her render path, and this test reading her rows
      // in ONE assertion; `plannedSoFar` is not printed, so it is held separately below.
      expect(
        rows[rows.length - 1].rowText,
        `${world.name}: the current (last) week no longer prints "${world.currentWeek}". For Lina ` +
          "that row is the fixture's only done > plannedSoFar >= 1 week, the one this section " +
          "relies on to see a done / plannedSoFar renderer after the parser (ADR-0024)."
      ).toContain(world.currentWeek);

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
          // Presence only: the value is compared to the channel's initial and never
          // matched against any pattern (ADR-0024 — no value text for a spelling to vary).
          for (const channel of element.computed.filter((c) => c.value !== c.initial)) {
            offences.push(
              `${where} PAINTS on channel [${channel.channel}]: ${channel.value} (initial: ${channel.initial})`
            );
          }
        }
      }

      expect(
        offences,
        "An element inside a week row has a non-initial value on one of the channels this " +
          "section enumerates. P-ADH C2 says the picture IS the two numbers printed beside it; " +
          "a value on one of these channels paints with no layout box of its own, so the " +
          "geometric limb above cannot check it against them — that is the EV-214 / EV-216 " +
          "bypass (an unmeasurable picture ALONGSIDE bars that already satisfy `minimumBars`). " +
          (world.id === LINA
            ? "🔴 If ONLY this world is red, read this first: Lina's current week is the " +
              "fixture's `done > plannedSoFar >= 1` row (`[3, 4, 2]`, EV-218 / ADR-0024). A " +
              "renderer dividing by `plannedSoFar` emits a valid 150 % there, which paints and " +
              "is read here; on Ines's `1 / 0` row the same renderer emits `Infinity%`, which " +
              "the parser drops, so Ines stays green BY DESIGN — this is where that renderer " +
              "is caught, not a lost witness. "
            : "") +
          "⚠️ This is an ENUMERATED ban over `PAINT_CHANNELS`, read after the CSS parser; it " +
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

  /**
   * 🔴 **EV-218 — what the rendered ratchet in the loop cannot hold.**
   *
   * The loop's `currentWeek` assertion lives INSIDE an iteration over `WORLDS`, so deleting
   * Lina's entry deletes the assertion with it — the way EV-216's predecessor ratchet
   * stopped catching a deletion once its read iterated a table. And it reads printed
   * figures, while the hazard is in `plannedSoFar`, which nothing prints: dropping the
   * tuple's third element, or swapping it with the `[3, 4]` week before it, leaves
   * "3 / 4 sessions" on screen and takes the hazard away. `plannedSoFar` then comes from
   * the weekday (`min(planned, elapsed)`), which is `0` every Monday — the day the
   * renderer's output is dropped by the parser and nothing here reads it.
   *
   * So this holds the other two: Lina is in `WORLDS` with that current week, and her
   * last tuple in the fixture SOURCE still states `plannedSoFar = 2`. A derived-value
   * check is not available: `coachApi.fixture.ts` is `import "server-only"` and
   * `PROGRESS` is not exported.
   */
  test("P-ADH C2 (EV-218): the done > plannedSoFar >= 1 world is still read, and still states the hazard", () => {
    expect(
      WORLDS.filter((world) => world.id === LINA).map((world) => world.currentWeek),
      "Lina is no longer read by this section with her `3 / 4` current week. She is the only " +
        "world whose current week makes a done / plannedSoFar renderer emit a value that " +
        "parses (150 %); without her, that renderer is caught here on no weekday that " +
        "derives plannedSoFar = 0 (ADR-0024)."
    ).toEqual(["3 / 4 sessions"]);
    expect(
      lastFixtureTuple("LINA_ID"),
      "Lina's current week no longer states `[3, 4, 2]` (done 3 / planned 4 / plannedSoFar 2) " +
        "as its LAST tuple. The third element is honoured only there; anywhere else, or " +
        "absent, plannedSoFar follows the weekday and the hazard is gone on a Monday."
    ).toBe("[3,4,2]");
  });
});
