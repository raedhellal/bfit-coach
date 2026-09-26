import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, type Locator, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { copy } from "../src/lib/copy";
import { adherenceSeries, type WeekSpec } from "../src/lib/fixtureAdherence";
import { formatDate } from "../src/lib/format";
import { WIDTHS } from "./layout";

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
 *     all caught here, geometrically, as before. ⚠️ **Since EV-218 the red is on Lina's
 *     row, not Ines's**: Lina's current week is now `3 / 4` with `plannedSoFar = 2`,
 *     and B3 re-run there is 3 failed with Ines GREEN — see the EV-218 block below
 *     before reading that green as a lost witness.
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

/**
 * A text-free painted leaf inside a row: what the geometry limb measures. Written text
 * can draw too (BUG-227); that is read by the EV-251 section, not here.
 */
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
 *
 * A leaf WITH text is not a picture to this read. That is a choice about what it
 * measures, not a claim that text cannot draw a ratio: BUG-227's bar of `█` characters
 * painted 0.706 of Lina's current row beside "3 / 4 sessions" and this read skipped it.
 * The card's text is read by the EV-251 / EV-253 / EV-259 section at the bottom of this file.
 *
 * **EV-253 — the ROOT is the adherence LIST, not each row.** Until EV-253 this read was
 * `region.locator("li")` plus each row's descendants, so a leaf that was a child of the
 * `<ul>` and inside no `li` was read by nothing (`BUG-231`'s family). It now reads the
 * list element and every element under it, the `li`s included, and attributes each
 * picture to the row it sits in or to `outsideRows`. A picture in `outsideRows` has no
 * figures beside it, and `expectPictureEqualsFigures` fails it for that, the same rule a
 * bar on a row that prints no figures has always met. See `expectOneListHoldingEveryRow` for
 * what is asserted about the list before it is trusted.
 *
 * **EV-259 left this read at the list, deliberately.** Rooted at the card, it fails on the
 * shipped card, on the title icon's `<path>` (a text-free painted leaf, 15.83 of 19 px,
 * with no figures beside it). Making it pass there changes what counts as a picture, not
 * where the scan starts, so it is `EV-220`'s (AC3d, with `BUG-236`). **This read does not
 * read the card outside the list:** the title row, the headline and any sibling of the
 * `<ul>` are not asked.
 */
interface RenderedList {
  /** How many `ul` elements the block holds. The read is only defined for one (or none). */
  lists: number;
  /** Every `li` in the BLOCK, so a row rendered outside the list is not silently unread. */
  rowsInBlock: number;
  weeks: RenderedWeek[];
  /** Pictures under the list that are inside no `li`, the list element itself included. */
  outsideRows: Picture[];
}

async function renderedWeeks(region: Locator): Promise<RenderedList> {
  return region.evaluate((blockEl) => {
    const lists = Array.from(blockEl.querySelectorAll<HTMLElement>("ul"));
    const list = lists[0];
    const rows = list ? Array.from(list.querySelectorAll<HTMLElement>("li")) : [];
    const rowOf = (el: Element) => {
      const row = el.closest("li");
      return row && list.contains(row) ? rows.indexOf(row as HTMLElement) : -1;
    };
    const pictures = (list ? [list, ...Array.from(list.querySelectorAll<HTMLElement>("*"))] : [])
      .filter((el) => el.children.length === 0 && (el.textContent ?? "").trim() === "")
      .map((el) => {
        const box = el.getBoundingClientRect();
        const parentBox = (el.parentElement ?? list).getBoundingClientRect();
        return {
          row: rowOf(el),
          tag: el.tagName.toLowerCase(),
          dataFill: el.getAttribute("data-fill"),
          inlineStyle: el.getAttribute("style") ?? "",
          widthPx: box.width,
          parentWidthPx: parentBox.width,
          drawnPercent: parentBox.width > 0 ? (box.width / parentBox.width) * 100 : 0,
          paints: box.width > 0.5 && box.height > 0.5,
        };
      })
      // Not counted as a picture: an empty grid cell holding a column open, with a width,
      // no height and no `data-fill`. That is a choice about what this read measures, NOT
      // a claim that such a box cannot paint — an `outline` around a zero-height box does
      // paint, and nothing here catches it (BUG-228, carded, not fixed in EV-218).
      .filter((p) => p.paints || p.dataFill !== null);
    const strip = ({ row: _row, paints: _paints, ...picture }: (typeof pictures)[number]) => picture;
    return {
      lists: lists.length,
      rowsInBlock: blockEl.querySelectorAll("li").length,
      weeks: rows.map((row, i) => {
        const texts = Array.from(row.querySelectorAll<HTMLElement>("*")).filter(
          (el) => el.children.length === 0 && (el.textContent ?? "").trim() !== ""
        );
        return {
          rowText: (row.textContent ?? "").trim(),
          label: (texts[texts.length - 1]?.textContent ?? "").trim(),
          pictures: pictures.filter((p) => p.row === i).map(strip),
        };
      }),
      outsideRows: pictures.filter((p) => p.row === -1).map(strip),
    };
  });
}

/**
 * EV-253 — the two facts every list-rooted read asserts before it trusts itself: the block
 * holds exactly the one list it reads (none, in a world that renders no rows), and every
 * `li` in the block is inside that list. Without the second, moving a row out of the
 * list would take it out of every read that used to see it, which is the opposite of what
 * re-rooting is for.
 */
function expectOneListHoldingEveryRow(
  where: string,
  read: { lists: number; rowsInBlock: number },
  rowsInList: number,
  expectedLists: 0 | 1
) {
  expect(
    read.lists,
    `${where}: the adherence block holds ${read.lists} lists and this world renders ${expectedLists}. ` +
      "The P-ADH C2 reads are rooted at ONE list, the one holding the week rows (none where the " +
      "world renders EV-208's sentence instead). Another list is a stop-and-ask for senior-po " +
      "(EV-253 edge case 4), not a second root to add quietly."
  ).toBe(expectedLists);
  expect(
    read.rowsInBlock,
    `${where}: ${read.rowsInBlock} rows in the block and ${rowsInList} inside the list — a row ` +
      "outside the list is read by nothing here"
  ).toBe(rowsInList);
}

/** The fixture's `PROGRESS` keys whose entry carries an `adherenceSeries([...])` call. */
type FixtureSeriesKey =
  | "INES_ID"
  | "LINA_ID"
  | "TOBIAS_ID"
  | "NOOR_ID"
  | "NILS_ID"
  | "DANA_ID"
  | "OMAR_ID"
  | "KAIA_ID"
  | "RUBEN_ID"
  | "ELIF_ID";

/**
 * A trainee's `adherenceSeries([...])` tuples, read from the fixture SOURCE, whitespace
 * removed, oldest first. This reads the tuple's TEXT. It does not call the function, so
 * it says nothing about what `adherenceSeries` does with the tuple. A source read,
 * because a world's `plannedSoFar` is never printed, and `coachApi.fixture.ts` is
 * `import "server-only"` with `PROGRESS` unexported. What the function returns for a
 * stated tuple on each weekday is tested in `qa/coach-fixture-adherence.spec.ts` (EV-249).
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
 * substring `adherenceSeries(`, which matched the function's own declaration while it
 * lived in the fixture (it moved to `src/lib/fixtureAdherence.ts` in EV-249).
 */
function fixtureSeriesTuples(key: FixtureSeriesKey): string[] {
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
function lastFixtureTuple(key: FixtureSeriesKey): string | undefined {
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
  const read = await renderedWeeks(block(page, ADHERENCE));
  const weeks = read.weeks;
  expect(weeks.length, "the adherence block rendered no week rows at all").toBeGreaterThan(0);
  expectOneListHoldingEveryRow("the geometry limb", read, weeks.length, 1);

  /**
   * EV-253 — a picture under the list and inside no row. It sits beside no printed
   * figures, so there is nothing it could equal: the rule a bar on a row that prints no
   * figures meets below, applied where there is no row at all.
   */
  expect(
    read.outsideRows.map(
      (picture) =>
        `<${picture.tag} data-fill="${picture.dataFill}" style="${picture.inlineStyle}"> = ` +
        `${picture.widthPx.toFixed(2)}px of ${picture.parentWidthPx.toFixed(2)}px ` +
        `(${picture.drawnPercent.toFixed(1)} %)`
    ),
    "The adherence LIST draws a picture OUTSIDE every week row — a painted, text-free leaf " +
      "under the <ul> that is in no <li>. It has no \"<done> / <planned> sessions\" beside it, " +
      "so P-ADH C2 has no two numbers for it to equal (EV-253). Draw a week's bar inside its " +
      "own row, or draw nothing."
  ).toEqual([]);

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

    const { weeks } = await renderedWeeks(block(page, ADHERENCE));
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
   * `min(planned, elapsedThisWeek)`, which for Ines's `[1, 3]` gives `done > plannedSoFar`
   * on a Monday ONLY: a world relying on it would stop discriminating six days in seven,
   * which is precisely the shape of a guard that reads as protection and binds to
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
 * EV-214 / EV-215 / EV-216 / EV-218 / EV-253 — **P-ADH C2: no element of the adherence
 * list (the `<ul>`, its week rows, and everything under either) has a non-initial
 * computed value on any of the paint channels enumerated in `PAINT_CHANNELS`.**
 * (Until EV-253 the predicate said "no element in a week row", and the scan started at
 * each `li`.)
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
 * So this limb is **structural, not geometric**: for every element of the adherence list
 * (EV-253; until then, every element inside a week row), it
 * **READS**, at the three samples the EV-217 banner lists (on load, settled, and at
 * 320 px; until EV-217, once, on load, at the default viewport), **one kind of thing — the computed channels
 * enumerated in `PAINT_CHANNELS`** (EV-216): a CSS property on one of an element's boxes,
 * asserted equal to that property's initial value, with a red build naming the entry
 * that fired. **That table is the ONLY list of covered channels in this file, and it is
 * the one to read: this sentence deliberately does not repeat it.** It used to, naming
 * three `backgroundImage` reads, and it went on saying "four channels" for a whole review
 * after the limb had grown to twelve — the seventh falsifiable capability sentence in
 * this file, and the first one ABOVE the banner rather than in it. See the EV-216
 * disclosure above `PaintChannel` for what the table reads, when, and what it does not
 * read.
 *
 * 🔴 **It does NOT read the inline `style` attribute (EV-218, ADR-0024).** Until EV-218
 * a second read ran two text patterns over that attribute (`INLINE_BACKGROUND_IMAGE`,
 * `INLINE_CUSTOM_PROPERTY_IMAGE`) to see a declaration the CSS parser had discarded. It
 * matched spellings, and four were walked past it — a `var()` hop, `--é-paint`,
 * `linear-gradi\65 nt(`, and a `;` inside a comment. EV-218 deleted both patterns and
 * added the fixture row that makes the renderer they were standing in for emit a value
 * that parses: see the EV-218 block below. The deleted text is at
 * `969519c:qa/coach-adherence-property.spec.ts`.
 *
 * ⚠️ **That is a statement about what it reads, deliberately, and not about what can be
 * drawn.** Every totality sentence written about this guard has been falsified by the
 * next person to try: "nothing paints a background image at all" died to a `::before`,
 * and "the element's own background-image, on either channel" died TWICE on the computed
 * channel alone — to a gradient applied after an `animation` delay (`none` at t=0, a full
 * bar behind "2 / 4 sessions" at t=11s) and to one behind `@media (max-width: 520px)`,
 * which paints at the 320 px width `qa/layout.ts` sweeps this portal at. Both were one
 * card, EV-217, which added a read at a settled instant and a read at 320 px (see its
 * banner for when the limb reads, and its records for what was run). A reader who needs
 * to know whether a NEW mechanism is caught should build it and run this limb, not
 * reason from a sentence here.
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
 * **What the computed read cannot see, measured rather than reasoned** — and the reason
 * EV-214 and EV-215 once added an inline read beside it, which EV-218 removed:
 *
 *   · **Lina** — `linear-gradient(90deg, var(--blue-500) 100%, transparent 0%)` computes
 *     to `linear-gradient(90deg, rgb(79, 124, 255) 100%, rgba(0, 0, 0, 0) 0%)`. Read.
 *   · **Ines** — the SAME expression with `done / plannedSoFar = 1 / 0` emits
 *     `…var(--blue-500) Infinity%…`. `Infinity%` is not a valid `<length-percentage>`,
 *     so Chrome discards the whole declaration at parse time and
 *     `getComputedStyle(el).backgroundImage` is **`none`**. Witnessed, not assumed.
 *
 * A declaration the parser discards leaves nothing on the computed side for this limb to
 * read, on any channel. EV-214 answered that with a text pattern over the declaration;
 * EV-218 answers it with a fixture row where the same expression yields a value that
 * parses. The EV-218 block below says which world carries which witness now.
 *
 * **What this limb does NOT cover, stated rather than assumed:**
 *   ✗ `<canvas>` and `<img>` as adherence pictures. Nobody has constructed either, and
 *     a canvas HAS a layout box, so it is a different mechanism with a different answer.
 *     EV-214 rejects them deliberately: banning a thing with no witness is the same
 *     defect as permitting one. If someone constructs one, that is its own row.
 *   ✗ anything outside the adherence LIST (EV-253 moved this boundary out from the week
 *     row to the list, and EV-259 left it there): **this section does not read the card
 *     outside the list**, so the card's frame, its title row, its headline, any sibling of
 *     the `<ul>` and the rest of the client page are not asked. Why it stayed at the list:
 *     rooted at the card, it fails on the shipped `Card` frame's own `box-shadow`
 *     (`--e-card`), which is a non-initial value on `box-shadow on its own box`. Making
 *     it pass there changes what counts as a picture, not where the scan starts. That is
 *     a statement about what this reads, not about what that region can or cannot draw.
 *   ✓ 🔴 **`box-shadow: inset <pct>vw 0 0 0 rgba(…)`, `border-image` and `mask-image`**
 *     — a second paint channel nobody had named, which drew a full bar beside
 *     "2 / 4 sessions" with the suite at 260 green. It was `✗` here until **EV-216**,
 *     which did not widen a regex: it added the three computed properties to the read,
 *     and they are now three of the entries in `PAINT_CHANNELS`. The three mutants and
 *     their independence witnesses are recorded in the EV-216 banner below.
 *   ✓ **`url(` IS witnessed**, by `senior-qa`'s M-Q3: `background: url("data:image/svg+
 *     xml,…") no-repeat 0 0 / <pct>% 100%`. Until EV-218 it went red in both directions
 *     at once — Ines by the inline clause alone, Lina by the computed one. Re-run by
 *     EV-218 with the declaration built by React (no HTML string; the page's `<svg>` count
 *     equal to the control's, so nothing was injected):
 *     Lina's current row paints **0.92–1.00 of its width beside "3 / 4 sessions"**
 *     (control 0.000), computed `url("data:image/svg+xml,…")` — **3 failed, Ines GREEN**,
 *     because the `Infinity%` size discards the shorthand there and nothing paints.
 *     (`image-set(` and `element(` were listed in the deleted inline pattern with no
 *     witness either way; nothing in this file names them any more.)
 *   ⛔ **COULD NOT CONSTRUCT: the image function split across a `var()` boundary.**
 *     `--adh-fn: linear-gradient; background-image: var(--adh-fn)(90deg, …)` was built
 *     against the inline patterns EV-218 deleted, and it does not paint: Chrome does not
 *     re-tokenise a substituted ident into a function token. The reviewer ran it — 15
 *     passed, and **zero `PAINTS` offences anywhere, including the rows that draw
 *     honestly**. A green suite there is CORRECT rather than a miss, and the way to tell
 *     those two apart is to run the harmless variant and check it paints nothing.
 *
 *   🔴 And the two the gate found, on the COMPUTED channel of an element's OWN
 *     background-image — i.e. inside what this limb reads, not in any channel disclosed
 *     above. Both were carded as **EV-217**, which is a change to WHEN this limb reads,
 *     not to what it reads (see the EV-217 banner and records):
 *   · **a time-shifted paint.** `@keyframes` + `animation: … 1ms 8s forwards`, the ratio
 *     in an inline custom property. Every computed `background-image` is `none` at t=0,
 *     so the EV-214 section was 4 passed; at t=11s Lina's figures span computes
 *     `linear-gradient(90deg, rgb(79, 124, 255) 100%, …)`. At the time the limb sampled
 *     one instant. What was tried: this is the element's OWN `background-image`
 *     on a channel the limb does read, so neither the pseudo argument nor another entry
 *     in `PAINT_CHANNELS` moves it — only reading again at another instant does, which is
 *     EV-217's settled sample.
 *   · **a custom property declared on an ANCESTOR of the week rows and spent inside
 *     one** — `--adh-paint` on the `<ul>`, `background-image: var(--adh-paint)` inside a
 *     row. At EV-215: 3 failed, **Ines green** — the ancestor's attribute was never one
 *     the inline patterns read. EV-218 reads no declaration on any element, the row's or
 *     an ancestor's; the computed value is read where it is SPENT. Re-run by EV-218 with
 *     the declaration on the `<ul>` and the `var()` spent on the current week's `li`:
 *     Lina's row paints **0.92–1.00 beside "3 / 4 sessions"**, computed
 *     `linear-gradient(… 150% …)` — **3 failed, Ines GREEN**, because on her row the
 *     spent value holds `Infinity%` and computes to `none`.
 *   · **a viewport-gated paint.** `@media (max-width: 520px)`. Green at the default
 *     viewport; at 320 px a full blue bar sits behind "2 / 4 sessions". At the time the
 *     limb sampled one viewport, and 320 px is the width this portal is swept at by name.
 *     Carded as **EV-217** with the one above: the same channel and the same reason, a
 *     SAMPLING gap rather than a channel gap, so widening the property list closes
 *     neither. EV-217's 320 px sample is the read added for it.
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
 * **WHAT IT READS.** For **every element in the LIGHT DOM of the adherence LIST: the
 * `<ul>` itself, every week row, and every element under either, including those in no
 * row** (EV-253; the root was each `li` until then) — the scan is
 * `[list, ...list.querySelectorAll("*")]`, which does not cross a shadow root, and this
 * app opens none — one kind of read:
 *
 *   1. **The computed channels enumerated in `PAINT_CHANNELS`** — one CSS property on
 *      one of the element's three boxes, asserted equal to that property's initial
 *      value. `PAINT_CHANNELS` is the ONLY place in this file the covered channels are
 *      listed: the read iterates it, the failure message names the entry that fired,
 *      and a ratcheted count (`PAINT_CHANNELS_EXPECTED`) means removing one is a
 *      deliberate two-line edit rather than a silent one. Adding a channel is one line.
 *
 *      🔴 **EV-218 (ADR-0024) — read this as an instruction.** Each channel is read
 *      **after** the CSS parser and asserted only `!== initial`. No clause of this limb
 *      matches a value against any text, so there is no VALUE spelling for a
 *      construction to vary — and none may be added (the property NAME is still a
 *      spelling, which is what `PAINT_CHANNELS` enumerates and EV-216's prefixed-spelling
 *      rule governs): ADR-0024 M3 measured `-webkit-gradient(linear, …)`
 *      computing with its author's spelling verbatim, so a computed `/gradient\(/` would
 *      be walked past. Test that a property is present; never match its value.
 *      It reads **no declaration**: not the inline `style` attribute (EV-218 deleted
 *      that read), not a custom property on the row or on an ancestor. So it is blind to
 *      a declaration the parser **discarded** (`Infinity%`, `NaN%`), which contributes
 *      no computed value to any box. The renderer that emits `Infinity%` on Ines's
 *      `1 / 0` row is exercised on **Lina's `3 / 4` row** instead, where the same
 *      expression yields `150 %`, which parses — see the EV-218 block for which world
 *      carries which witness. What it does not read is the list below. **If you need
 *      to know whether a NEW mechanism is caught, build it, confirm it paints, and run
 *      this limb. Do not reason from this paragraph.**
 *
 *      ⚠️ **This FILE still contains TWO text matchers, both in the geometry limb.**
 *      `not.toMatch(/NaN|Infinity/i)` over `inlineStyle` (EV-210b) appears in two tests:
 *      the per-bar loop of `expectPictureEqualsFigures` and "the 1 / 0 week". ADR-0024 S2
 *      records the pattern as redundant on the mutant it was written for and defeated
 *      by `calc(1 / 0 * 100%)`, and rules its removal a separate row.
 *
 * **WHEN, AND AT WHAT CONFIGURATION.** Three times per world, in `next dev` fixture mode,
 * all at rest (pointer off the list, nothing focused in it, asserted): on load at the
 * config's default viewport; at a settled instant derived from the page's own animations,
 * same viewport; and on a fresh load at 320 px. One extra sample per condition, not a
 * cross product. **The EV-217 banner is where the samples are defined, with what each
 * does not cover; this paragraph does not repeat it.** (Until EV-217: once, on load, at
 * the default viewport.)
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
 *   · **A paint at an instant, a width or an interaction state this section does not
 *     sample.** Not a channel: a SAMPLING condition. What is sampled, and each condition
 *     it leaves unread with what was tried there (a paint only while an animation runs,
 *     constructed; a script-timed change, other widths and media conditions, not
 *     constructed; `:hover` / `:focus`, `BUG-222`), is in the EV-217 banner. → **EV-217**
 *     (AC3b owns hover and focus).
 *   · **A declaration the CSS parser discarded** — `Infinity%` / `NaN%` in any spelling,
 *     inline, in a custom property, on the row or on an ancestor. Not read: no
 *     declaration is, only computed values. What was tried: ADR-0024 M1 found no CSSOM
 *     channel that reports such a declaration except `getAttribute("style")`, the text
 *     read EV-218 deleted. The renderer that emits one is exercised on Lina's
 *     `done > plannedSoFar >= 1` row instead, where its value parses. → **EV-218 /
 *     ADR-0024**, decided; the reversal triggers are in the ADR.
 *   · **`getComputedStyle(el).getPropertyValue("--…")`** — a custom property's computed
 *     token stream. Deliberately unused (ADR-0024 M2): ident escapes survive in it
 *     unresolved, so reading it is text matching again, and `:root` properties inherit
 *     into every element. A clause with its own witness if anyone wants it, not a quiet
 *     addition.
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
 *   · ~~**An overlay painted from an element that is neither an `li` nor inside one**~~ —
 *     a `ul::after` over the rows, **`BUG-218`: closed by EV-253**, which re-rooted this
 *     scan at the list. The `<ul>` is now one of the elements read, on each box
 *     `PAINT_CHANNELS` names. What was tried, and its reading: the EV-253 records block
 *     at the bottom of this file. Anything outside the list is still unread by this section
 *     (EV-259 moved only the text limb to the card; see its banner).
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
 *     it already has to say which instant and which width; its banner does (this section
 *     reads computed values per element, so it has no clip region; the probes do).
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

/* ═══════════════════════════════════════════════════════════════════════════
 * EV-218 — **The guard stops matching spellings.** ADR-0024, option (d).
 *
 * Story: `b-fit-mobile/docs/product/stories/EV-218-the-guard-stops-matching-spellings.md`.
 * ADR: `b-fit-mobile/docs/architecture/adr/0024-the-adherence-paint-guard-reads-after-the-parser.md`.
 *
 * **What changed.** The two inline text patterns and the inline read were deleted. Lina's
 * current week went from `[2, 4]` to `[3, 4, 2]` and her *Adherence this week* tile from
 * `2 / 4` to `3 / 4`. Her row is the fixture's only week with `done > plannedSoFar` AND
 * `plannedSoFar >= 1`. On it, a renderer drawing `done / plannedSoFar` emits `150 %`,
 * which parses, so this section reads it. On Ines's `1 / 0` row the same renderer emits
 * `Infinity%`, which the parser drops.
 *
 * **Why one row is enough.** The renderer is ONE expression. On any row with
 * `plannedSoFar >= 1` and `done > plannedSoFar` it yields a finite percentage over 100,
 * and a finite percentage parses. Only `plannedSoFar = 0` yields a value the parser drops.
 * So one row of the first kind puts that expression's output where a post-parse read
 * sees it. The argument uses no bound on the ratio, and there is none to use: the api
 * does not hold `done − plannedSoFar ≤ 1`. `LogWorkoutCompletionUseCase.complete` takes
 * the client's `date` with no future-date check, and the adherence read queries Monday to
 * SUNDAY of the current week, so a completion dated later this week counts in `done` and
 * not in `plannedSoFar` (EV-248, reproduced as BUG-225). ADR-0024 stated such a bound in
 * an earlier draft and has withdrawn it.
 *
 * 📌 **Earlier records in this file that say "Lina … 2 / 4 sessions" are HISTORY.** They
 * describe what was measured at the time and are left as written. Her current week now
 * prints `3 / 4`. The `DECLARES` offences named in the EV-216 records below came from
 * the deleted inline clauses.
 *
 * ── **WHICH WORLD CARRIES WHICH WITNESS, after this row** (EV-218 AC1) ──────────────
 *
 *   · **Lina `[3, 4, 2]` — now carries the `done / plannedSoFar` renderer, on every
 *     weekday.** Paint limb: that renderer's value parses and paints on her current row.
 *     Geometry limb: a bar drawn from it is 150 % against a printed 75 %. Held by three
 *     assertions: `currentWeek` in the loop below, the EV-218 test after the loop (her
 *     table entry and her last tuple in source), and `coach-monitoring.spec.ts`'s tile
 *     test (tile equals last row).
 *     🔴 **Those pins hold the tuple's TEXT, not `adherenceSeries` honouring it.** Break
 *     the code that applies the override (`plannedSoFar: derivedSoFar`) and leave the
 *     tuple alone: every pin stays green, and `plannedSoFar` falls back to the weekday.
 *     Reviewer-constructed: on a simulated Monday with construction 3 planted, the
 *     WHOLE GATE passed (262 tests, exit 0); on a real Wednesday the same breakage gave
 *     4 failed, and a simulated Tuesday and Sunday each gave 4 failed (`senior-qa`). So
 *     under that regression the paint limb is blind only on a **UTC** Monday (the
 *     fixture reads `getUTCDay`), and only to a renderer whose value the parser DISCARDS
 *     — there every current week derives `plannedSoFar = 0`. Nothing
 *     notices the override being ignored either — on a Wednesday Ines's stated `1 / 0`
 *     silently becomes a derived `1 / 2`. Ines has had the same exposure since EV-210b;
 *     what is new is that the paint limb now depends on it, because the inline read
 *     that covered the plain spellings on a Monday is gone. Carded separately (move
 *     `adherenceSeries` / `WeekSpec` out of the `server-only` module and unit-test that a
 *     stated last tuple's `plannedSoFar` survives any clock); not built here.
 *     ➕ Built as EV-249: `qa/coach-fixture-adherence.spec.ts`.
 *   · **Ines `[1, 3, 0]` — LOSES her C2 paint witness for a `done / plannedSoFar`
 *     renderer, and only for that.** Her rows are still read by the paint limb on every
 *     channel like every other world's; it is that renderer which emits `Infinity%` on
 *     her current row, where nothing paints, every channel computes initial, and her
 *     world is green BY DESIGN. She KEEPS everything else she had: the EV-210b AC3 geometry
 *     loop, "the 1 / 0 week" test and her source pin. All three assert **C2**, not C3.
 *     ⚠️ ADR-0024 and EV-218's amended AC1 say "Ines keeps C3". She has no C3 test, before
 *     or after this row: the C3 describe (EV-210b AC4) uses Ruben, Elif, Noor and Kaia.
 *     What she keeps is EV-210b **AC3**, which asserts C2.
 *   · **Tobias `[0, 3]` and Noor `[0, 3]` — weekday-dependent.** Their `plannedSoFar` is
 *     derived, `min(3, days elapsed)`. On any day except Monday the renderer emits a
 *     finite `0 %`: it computes non-`none` and paints nothing visible (ADR-0024 M4), so
 *     they go red. On a Monday it emits `NaN%` and they are green. Lina's red does not
 *     depend on the weekday; theirs does.
 *
 * ── **The runs behind that, 2026-09-23 (a Wednesday), on this branch** ────────────────
 *
 * Every paint mutant sits on the CURRENT week's `li` only, with
 * `R = (week.done / week.plannedSoFar) * 100`, and was built through React's style object
 * rather than an HTML string (the page's `<svg>` count matched the control's). PROBE: the
 * viewport was screenshotted with a clip grown 24 px past the row, never a full-page
 * capture, and the blue fraction of the row's width was read on scanlines y = 3, 7, 11
 * and 14 of the 15 px row. Five were requested; two landed on y = 14.
 * Control on clean code: **0.000 on every scanline of every world's current row**, and
 * ≈ 0.83 for an honest full bar (the track is ≈ 0.83 of the row).
 *
 *   · **All seven painting constructions**, recorded under their spelling:
 *     `--adh-paint` + `var()`; `--é-paint` + `var()`; `linear-gradi\65 nt(`;
 *     `--adh-paint:/*;*\/linear-gradient(…)`; plain `background: linear-gradient(…)` (B3
 *     / M9-family); `url("data:image/svg+xml,…") … / R% 100%` (M-Q3); and
 *     `-webkit-gradient(linear, …) … / R% 100%`. For each one, PROBE: Lina's current
 *     row reads **0.962 / 0.943 / 0.923 / 1.000** at y = 3 / 7 / 11 / 14 beside
 *     "3 / 4 sessions" (the gaps are glyphs), and
 *     Ines's current row reads 0.000 on every scanline with computed `none`. RESULT for each:
 *     **3 failed — Lina, Tobias, Noor — Ines green**, and every offence names
 *     `[background-image on its own box]`. In the computed values the escape, the
 *     comment and both `var()` hops are resolved: all four compute as
 *     `linear-gradient(90deg, rgb(79, 124, 255) 150%, …)`. `-webkit-gradient` does not
 *     normalise. It computes as
 *     `-webkit-gradient(linear, 0% 0%, 100% 0%, from(rgb(79, 124, 255)), …)` in its
 *     author's spelling (ADR-0024 M3). That is why the clause tests presence.
 *   · **EV-215's ancestor declaration** (`--adh-paint` on the `<ul>`, spent on the
 *     current `li`): the same probe numbers and the same RESULT.
 *   · **Clause 4, run on the WHOLE GATE.** Construction 3 was planted and painting, and
 *     the single `background-image on its own box` entry was removed with the pin
 *     lowered to 18: **262 passed, exit 0**. Nothing else in the gate kills it.
 *   · **Clause 8 — does the row do the work?** Monday was simulated by STATING
 *     `plannedSoFar = 0` on every world's current week, with construction 3 planted.
 *     With Lina's `[3, 4, 2]` kept: **1 failed, Lina alone**. With Lina also at
 *     `[3, 4, 0]`: **the paint limb is entirely green**, and the only red is the
 *     EV-218 source pin. PROBE of that run: every current row reads 0.000, computes
 *     `none`, and declares `Infinity%` or `NaN%`. The renderer is present and nothing
 *     here reads it.
 *   · **Geometry limb** — the current week draws a bar `R %` wide. Lina: **"draws a bar
 *     WIDER than its track"** (150 %), with 0.83 of the row painted beside "3 / 4
 *     sessions". Ines is caught first by the `NaN|Infinity` text matcher. With both
 *     text matchers disabled she is still red by measurement: **"prints 1 / 3 (33.3 %)
 *     and draws 100.0 %"** (ADR-0024 M6).
 *   · **The ratchets.** Lina removed from `WORLDS`: 1 failed, the EV-218 test. Third
 *     element dropped (`[3, 4]`): 1 failed, the EV-218 test. The rendered check stays
 *     green because the row still prints "3 / 4", and on a Wednesday the derived
 *     `plannedSoFar` is also 2. Tuple swapped with the week before it: 1 failed, the
 *     EV-218 test. Tile reverted to `2 / 4`: `coach-monitoring.spec.ts` "the current
 *     week agrees…" red. Series reverted with the tile kept: 3 failed (the loop's
 *     `currentWeek`, the EV-218 test, the monitoring tile test).
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
 *     against EV-216's branch with all twelve other channels, both denylists it then had,
 *     the geometry limbs and `minimumBars` green. See its entry below for its two initial values.
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
 *     BORDER property, so the paint is a flat COLOUR and no image function existed for
 *     either denylist EV-216 still had. PROBE: the current row, printing "21 Sept 2026 — 2 / 4 sessions"
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
 *     was **16 passed** against EV-216's branch with all twelve other channels, both
 *     denylists it then had, the geometry limbs and `minimumBars` green on it — EV-210's mechanism 2
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
 * not `minimumBars`, not the two inline denylists (deleted since, by EV-218), not the
 * other eighteen channels. Two clauses killing one mutant would show neither to be needed, and
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
   * revealed only as far as the ratio, so no image function existed for either inline
   * denylist (both deleted since, by EV-218) and all five other properties read initial on every element and every box.
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

/**
 * One element of the adherence list, as the reads that can reveal a painted picture:
 * an element of a week row (`RowPaint.elements`), or the `<ul>` itself or an element under
 * it in no row (`ListPaint.outsideRows`, EV-253).
 */
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

interface ListPaint {
  /** How many `ul` elements the block holds; see `expectOneListHoldingEveryRow`. */
  lists: number;
  /** Every `li` in the BLOCK, so a row rendered outside the list is not silently unread. */
  rowsInBlock: number;
  rows: RowPaint[];
  /**
   * EV-253 — every element under the list that is inside no row, **the list element
   * itself first**. Until EV-253 nothing in this section read these: the scan started at
   * each `li`, so a `ul::after` over the rows (`BUG-218`) was on a box nobody asked about.
   */
  outsideRows: RowElement[];
  /**
   * EV-217 — the interaction state the read was taken in: whether the pointer is over the
   * list (`ul:hover`) and whether focus is inside it (`ul:focus-within`). The paint section
   * asserts both false, so "read at rest" is a checked fact about each sample and not an
   * assumption about where the last click left the mouse.
   */
  interaction: { hovered: boolean; focusWithin: boolean };
}

/**
 * Every element of the adherence LIST — the `ul` itself, every row, and everything under
 * either — with every `PAINT_CHANNELS` read. Computed values only: the inline `style`
 * attribute is not read (EV-218, ADR-0024).
 *
 * EV-253 re-rooted this from `region.locator("li")` (it was `paintedElementsInWeekRows`).
 * The reads per element are unchanged; what changed is which elements are asked.
 */
async function paintedElementsInList(region: Locator): Promise<ListPaint> {
  return region.evaluate(
    (blockEl, channels: PaintChannel[]) => {
      const lists = Array.from(blockEl.querySelectorAll<HTMLElement>("ul"));
      const list = lists[0];
      const rows = list ? Array.from(list.querySelectorAll<HTMLElement>("li")) : [];
      const read = (el: Element) => ({
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
      });
      const all = list ? [list, ...Array.from(list.querySelectorAll<HTMLElement>("*"))] : [];
      return {
        lists: lists.length,
        rowsInBlock: blockEl.querySelectorAll("li").length,
        interaction: {
          hovered: list ? list.matches(":hover") : false,
          focusWithin: list ? list.matches(":focus-within") : false,
        },
        rows: rows.map((row) => ({
          // The date column is the row's first child. Read from its own element: the row's
          // textContent runs "21 Sept 2026" straight into "1 / 3 sessions".
          date: (row.firstElementChild?.textContent ?? "").trim(),
          rowText: (row.textContent ?? "").trim(),
          // The row itself is included — AC1 says "every element inside it INCLUDING the
          // row itself", because a gradient on the `li` paints behind all three columns at
          // once, and EV-216's `box-shadow: inset …` bypass was constructed ON the row.
          elements: [row, ...Array.from(row.querySelectorAll<HTMLElement>("*"))].map(read),
        })),
        outsideRows: all
          .filter((el) => {
            const row = el.closest("li");
            return !(row && list.contains(row));
          })
          .map(read),
      };
    },
    PAINT_CHANNELS
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * EV-217 — **WHEN, AT WHAT WIDTH, AND IN WHAT STATE the P-ADH C2 limbs read the page.**
 *
 * Story: `b-fit-mobile/docs/product/stories/EV-217-the-guard-samples-more-than-one-instant.md`
 * (parent: `EV-210-adherence-never-overstates.md`, property **P-ADH**, consequence **C2**).
 *
 * Every assertion over a rendered page reads it at some instant, some width and some
 * interaction state. A sentence that does not say which reads as "all", and means "the one
 * the test happened to see". So this block says which, per limb. It changes WHEN the paint
 * limb reads, not WHAT it reads: `PAINT_CHANNELS` and the list root are untouched.
 *
 * ── **THE PAINT LIMB** (the section below: `expectNoPaintInList`) ──────────────────────
 *
 * The whole predicate, per world, at **three samples**, each named in any red it produces:
 *
 *   1. **On load, at the config's default width** (1280 px, Desktop Chrome): right after
 *      the adherence block is visible. The sample this limb always took.
 *   2. **Settled, at the default width**, on the same page. `waitUntilSettled` derives the
 *      wait from the page: `document.getAnimations()`, kept to animations and transitions
 *      whose target is the list, an element under it, or an ANCESTOR of it; the longest
 *      remaining `endTime − currentTime`, plus `SETTLE_MARGIN_MS`. Then it asserts every one
 *      of them has finished. With nothing animating, the wait is the margin alone and the
 *      read still happens. It asserts the runner does not emulate
 *      `prefers-reduced-motion: reduce`, and it fails, rather than skips, an animation that
 *      never ends or ends past `SETTLE_BUDGET_MS`.
 *      📌 The story's AC1 names "the longest `animation-*` / `transition-*` duration + delay
 *      among the elements read". This reads the same quantity from the animation objects
 *      the engine built from those declarations, over a wider scope: an ancestor's
 *      animation reaches the list through an inherited custom property, and a read of the
 *      list's own declarations would not see it (records).
 *   3. **On load, at 320 px**: a fresh navigation with the viewport at 320 px wide and the
 *      default height, read right after the block is visible. 320 px is `qa/layout.ts`'s
 *      `WIDTHS[0]`, imported, because it is the width this portal is already swept at by
 *      name.
 *
 * **One extra sample per condition, not a cross product (AC5).** There is no "settled at
 * 320 px" read. A construction that needs two conditions at once is a new row with a
 * witness.
 *
 * **Interaction state: AT REST, one sample, on purpose.** The pointer is parked at (0, 0)
 * before the first sample, and each sample asserts `ul:hover` and `ul:focus-within` are
 * both false. No row is hovered and nothing is focused in any sample, so a paint that
 * exists only under `:hover` or `:focus` is not read here (`BUG-222`, `senior-qa`'s
 * witness; the hovered and focused samples are EV-217 AC3b, not built on this branch).
 *
 * **Clip region: none, because nothing here reads pixels.** Each read is
 * `getComputedStyle` on each element of the list and on its three boxes, so a paint on a
 * read channel is read wherever it lands on screen, inside the element's box or outside
 * it. What is NOT read is a channel outside `PAINT_CHANNELS` (the EV-216 disclosure above,
 * where `-webkit-box-reflect` is listed). The pixel probes in the records have a clip, and
 * each one states it.
 *
 * **Other media conditions: the runner's defaults, one sample each.** Colour scheme,
 * reduced motion (asserted `no-preference` in sample 2), pointer and hover capability,
 * print, and every width other than the two above are read at whatever the config gives.
 * Nothing was constructed against them. That is what this reads, not a claim about them.
 *
 * **What the settled sample does not wait for.** A change made by SCRIPT later (a timer, a
 * fetch, a state update) declares no animation, so nothing here can derive its instant;
 * none was constructed. And a paint that exists only WHILE an animation runs and is gone
 * when it ends (`animation-fill-mode: none`) is visible to neither sample: constructed,
 * painting, and green (records).
 *
 * **The weekday: NOT sampled, and on purpose (AC3c).** The suite reads the page on
 * whatever day it runs. The weekday changes only the fixture's derived `plannedSoFar`, and
 * nothing rendered reads `plannedSoFar` (the bar is drawn from `done / planned`,
 * `AdherenceSeries.tsx`). Weekday coverage comes from Lina's STATED `[3, 4, 2]` (the EV-218
 * block) and from `qa/coach-fixture-adherence.spec.ts`'s seven-weekday test (EV-249), not
 * from sampling the page. **Revisit if anything rendered starts reading `plannedSoFar` or
 * the clock's weekday.**
 *
 * ── **THE OTHER LIMBS IN THIS FILE: ONE SAMPLE EACH, stated** ───────────────────────────
 *
 * The geometry limb (EV-210b AC3), the C3 section (EV-210b AC4) and the text limb (EV-251 /
 * EV-253 / EV-259) each read **once: on load, at the default width, with the pointer
 * wherever the sign-in click left it**, which none of them asserts. That is one sample,
 * not a claim about the others. EV-217 moved the paint limb only, because both of its
 * witnesses were on that limb's own channel; nobody has constructed a time- or width-gated
 * escape from the other three.
 *
 * **HOW TO FIND OUT WHETHER A CONSTRUCTION IS CAUGHT.** Build it in an uncommitted copy of
 * `AdherenceSeries.tsx`. Confirm it paints AT THE INSTANT AND WIDTH IT IS MEANT TO: a
 * viewport screenshot of the row with the clip grown past it, several scanlines, against
 * a control, at each of the three samples. Then run this file and read which sample
 * named it. Do not reason from this block: it says when the limb reads, not what can be
 * drawn at another time.
 * ═══════════════════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════════════════
 * EV-217 — **RECORDS.** Runs of 2026-09-26 (a Saturday, UTC) on branch
 * `test/ev217-settled-instant-and-320`, base `25d939d`, at `8a2d3f3` (the sampling and
 * the banner, before this block was written), in `next dev` fixture mode: this file on
 * :3641, the default suite on :3642. These are what was measured then. They are history,
 * not part of the banner above. Counts are per section: geometry is EV-210b AC3 (6 tests),
 * C3 is EV-210b AC4 (5), paint is EV-214..EV-217 (7: four worlds, the table test, the
 * EV-217 AC4 test, the EV-218 test), text is EV-251 / EV-253 / EV-259 (10). The file has 28
 * tests. "At `25d939d`" is the same construction under that commit's spec.
 *
 * PROBE: an uncommitted Playwright harness. Each world loaded afresh per sample: 1280 px
 * read on load, 1280 px read 9.5 s after the block was visible, 320 px read on load. Each
 * week row scrolled into view, a VIEWPORT screenshot (never full-page) clipped to the row
 * grown 24 px on every side, decoded in a canvas on a separate blank page, and the
 * fraction of the row's width within L1 < 90 of `rgb(79, 124, 255)` read on every css-px
 * scanline from 6 px above the row to 6 px below it. "Inside" is the row's own scanlines
 * 1 .. h − 2. `document.getAnimations()` and `prefers-reduced-motion` read at each sample.
 *
 *   · **Control, clean code, Ines / Lina / Tobias / Noor.** The current row reads 0.000 at
 *     all three samples, and computes `background-image: none`. An honest full bar reads
 *     0.833 at 1280 px and 0.284 at 320 px (the track is narrower there). No animation in
 *     the document at any sample. Reduced motion not emulated.
 *   · **Clean code, this change:** file **28 passed**; paint **7 passed**. Default suite
 *     **360 passed, exit 0** (3.9 m). `25d939d` lists 359; the one added is the AC4 test.
 *
 * Renderer constructions, each in an uncommitted `AdherenceSeries.tsx`, on the CURRENT
 * week's `li` only, with `--adh-r` set inline to `done / plannedSoFar × 100 %` (Lina 150 %,
 * Ines `Infinity%`, Tobias and Noor 0 % on a Saturday). The CSS is a `<style>` rendered
 * through `dangerouslySetInnerHTML` as a SIBLING of the card, so its text is outside every
 * limb's root. `G` below is `linear-gradient(90deg, var(--blue-500) var(--adh-r),
 * transparent 0)`.
 *
 *   · **M-Q1, the time witness:** `@keyframes qaMq1 { to { background-image: G } }` and
 *     `animation: qaMq1 1ms 8s forwards`. PROBE: Lina's current row, beside "3 / 4
 *     sessions", **0.000 on load, 0.926 → 1.000 inside at +9.5 s** (computed
 *     `linear-gradient(90deg, rgb(79, 124, 255) 150%, …)`), **0.000 at 320 px on load**.
 *     Ines computes `none` at all three. Tobias and Noor compute a 0 % gradient at +9.5 s
 *     and paint nothing visible. **At `25d939d`: file 27 passed.** Here: **paint 3 failed**
 *     (Lina, Tobias, Noor), three offences, each `<li> … [background-image on its own
 *     box]`, and every red names **only** the sample `settled (7935..8018 ms after the
 *     on-load read; … @keyframes qaMq1 on <li>), at 1280 px`. Geometry, C3 and text all
 *     passed. **Default suite: 3 failed / 357 passed**, those three.
 *   · **M-Q5, the width witness:** `@media (max-width: 520px) { background-image: G }`.
 *     PROBE: Lina's current row **0.000 at 1280 px on load and at +9.5 s, 0.684 → 1.000
 *     inside at 320 px** beside "3 / 4 sessions". **At `25d939d`: file 27 passed.** Here:
 *     **paint 3 failed** (Lina, Tobias, Noor), each naming **only** `on load, at 320 px`.
 *     Geometry, C3 and text all passed. **Default suite: 3 failed / 357 passed**, those
 *     three.
 *   · **M-Q1 driven from an ANCESTOR.** `*:has(> ul.qa-anc) { animation: qaAnc 1ms 8s forwards }`
 *     with `@keyframes qaAnc { to { --adh-on: 1 } }` (unregistered), and the row spending
 *     `linear-gradient(90deg, var(--blue-500) calc(var(--adh-on) * var(--adh-r)),
 *     transparent 0)`. Until the ancestor sets it, `--adh-on` is unset, so the row's
 *     declaration is invalid at computed-value time and computes `none`. Nothing on the
 *     list or under it animates. PROBE: Lina 0.000 on load, **0.926 → 1.000 at +9.5 s**,
 *     0.000 at 320 px; the animation's target is a `<div>`, the list's parent. Here:
 *     **paint 3 failed**, named `settled (…; @keyframes qaAnc on <div>), at 1280 px`.
 *   · **A paint only WHILE an animation runs:** `@keyframes qaMq1n { from, to {
 *     background-image: G } }`, `animation: qaMq1n 2s 8s` (no fill). PROBE: Lina 0.000 on
 *     load, **0.926 → 1.000 at ≈ +10.0 s**, 0.000 and computed `none` at ≈ +12 s. Here:
 *     **file 28 passed.** Visible to neither sample: the settled read is taken after it
 *     ends. Disclosed in the banner; no row.
 *   · **An animation that never ends:** `animation: qaInf 1s infinite`, painting `G` in
 *     its second half. Here: **paint 5 failed.** All four worlds on "does not end within
 *     20000 ms", Ines on that alone; Lina, Tobias and Noor also on the on-load sample,
 *     whose read fell in a painting half, and the AC4 test for the same reason. This shows
 *     the unsettleable branch fires. It is not an attribution witness.
 *
 * CHECK mutants: one EV-217 design choice reverted in the spec, with the construction it
 * exists for planted. This file only.
 *
 *   · **Settled sample removed** + M-Q1: **file 28 passed.** **320 px sample removed** +
 *     M-Q5: **file 28 passed.** So each witness gets through without its own sample.
 *   · **320 px sample removed** + M-Q1: paint 3 failed, settled only. **Settled sample
 *     removed** + M-Q5: paint 3 failed, 320 px only. So neither witness is caught by the
 *     other's sample.
 *   · **The derived wait replaced by the margin alone** (250 ms), the finished-check kept,
 *     + M-Q1: paint **4 failed**, each on "has still not finished" (Ines included). The
 *     same with the finished-check also removed: **file 28 passed.** So a fixed short wait
 *     lets M-Q1 through, and the finished-check is what turns a wait that is too short into
 *     a red build rather than an early read.
 *   · **Ancestors dropped from the animation scope** (the list and under it only) + the
 *     ancestor construction: **file 28 passed.** So the ancestor half of the scope is what
 *     sees it.
 *   · **`reducedMotion: "reduce"` emulated**, clean code: paint 4 failed, each on the
 *     reduced-motion assertion.
 *   · **The pointer park removed**, clean code: file 28 passed. The sign-in click does not
 *     leave the pointer over the list today, so the park has no witness of its own. It is
 *     kept so the at-rest assertion does not depend on where the login button is.
 *     **The current row hovered before the first read**, clean code: paint 4 failed, each
 *     on the at-rest assertion.
 *   · **`background-color` added to `PAINT_CHANNELS`** (ratchet raised to 20), clean code:
 *     paint **5 failed**, the AC4 test among them, and the four worlds at all three samples.
 *
 * **Runtime.** Two runs each on clean code, same server, this file: the paint section's
 * tests summed **2.5 / 2.6 s** under `25d939d`'s spec (6 tests) and **5.5 / 5.9 s** here (7;
 * the AC4 test is ≈ 0.7 s of it); the file **15.7 / 17.6 s** against **18.0 / 19.1 s**. So
 * ≈ 0.6 s per world: the 250 ms margin and a second navigation at 320 px. A page with a
 * declared animation pays its remaining time as well (M-Q1: ≈ 8 s per world).
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Every non-initial `PAINT_CHANNELS` value in one read of the list, as a message line, and
 * how many elements were read. The two ratchets that make a read a read (every channel
 * asked, no empty value) are asserted here, per element.
 */
function paintOffences(read: ListPaint, at: string): { offences: string[]; inspected: number } {
  const offences: string[] = [];
  let inspected = 0;
  const groups = [
    { place: "the adherence list, OUTSIDE every week row", elements: read.outsideRows },
    ...read.rows.map((row) => ({ place: `week row "${row.date}" ("${row.rowText}")`, elements: row.elements })),
  ];
  for (const group of groups) {
    for (const element of group.elements) {
      inspected += 1;
      const where = `${at} — ${group.place}, <${element.tag}>`;
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
        offences.push(`${where} PAINTS on channel [${channel.channel}]: ${channel.value} (initial: ${channel.initial})`);
      }
    }
  }
  return { offences, inspected };
}

/**
 * EV-217 AC2 — the second width. 320 px because `qa/layout.ts` already sweeps this portal
 * at 320 px by name (`WIDTHS[0]`), so it is a width this repo has decided it cares about,
 * not a number picked to catch one construction. Imported rather than restated, so the two
 * cannot drift apart.
 */
const NARROW_WIDTH = WIDTHS[0];

/**
 * EV-217 AC1 — the margin added to the derived settle instant, and the budget past which
 * the page is declared unsettleable rather than waited for.
 *
 * The margin absorbs timer skew between the test's clock and the page's animation
 * timeline. It is not what makes the sample safe: the assertion after the wait (every
 * animation in scope has FINISHED) is, so a margin that turns out too short is a red
 * build naming the animation, not a read taken too early.
 *
 * The budget exists because a derived wait is only bounded by the page. Past it, the
 * sample fails and says why (EV-217 edge case 3: report the cost, never drop the sample).
 */
const SETTLE_MARGIN_MS = 250;
const SETTLE_BUDGET_MS = 20_000;

/**
 * 🔴 **EV-217 AC1 — wait until the page has SETTLED, for as long as the page says.**
 *
 * The instant is DERIVED FROM THE PAGE, never a fixed sleep: `document.getAnimations()` is
 * read, and every CSS animation or transition whose target is the adherence list, an
 * element under it, or an ANCESTOR of it is kept (an ancestor's animated custom property
 * reaches the list by inheritance, so an ancestor is in scope). Each one's remaining time
 * is `getComputedTiming().endTime − currentTime`, which is its `delay + duration ×
 * iterations + end-delay` as the engine computed it from the declared
 * `animation-*` / `transition-*` values, less what has already elapsed. The wait is the
 * longest of those plus `SETTLE_MARGIN_MS`. With nothing running it is the margin alone,
 * and the second read still happens (edge case 1).
 *
 * It then ASSERTS the result, rather than trusting the arithmetic:
 *   · the runner is not emulating `prefers-reduced-motion: reduce` (edge case 2 — a
 *     runner that suppressed motion would make this sample read the same page as the
 *     first, which is a finding and not a pass);
 *   · no animation in scope has an infinite end or ends past `SETTLE_BUDGET_MS`
 *     (unsettleable: the sample cannot be taken, so it fails and says so);
 *   · after the wait, every animation in scope has `playState === "finished"` (a paused
 *     animation, or one started after the first read, fails here by name).
 *
 * What it does NOT wait for: a change made by SCRIPT at some later time (a timer, a
 * fetch). Nothing declares one, so nothing here can derive it. Stated in the banner.
 */
async function waitUntilSettled(page: Page, region: Locator): Promise<{ waitedMs: number; describe: string }> {
  const inScope = () =>
    region.evaluate((blockEl) => {
      const root = blockEl.querySelector("ul") ?? blockEl;
      return document
        .getAnimations()
        .filter((animation) => {
          const target = (animation.effect as KeyframeEffect | null)?.target ?? null;
          return target !== null && (target === root || root.contains(target) || target.contains(root));
        })
        .map((animation) => {
          const effect = animation.effect as KeyframeEffect;
          const end = Number(effect.getComputedTiming().endTime);
          const now = Number(animation.currentTime ?? 0);
          const name =
            "animationName" in animation
              ? `@keyframes ${(animation as CSSAnimation).animationName}`
              : "transitionProperty" in animation
                ? `transition of ${(animation as CSSTransition).transitionProperty}`
                : animation.constructor.name;
          return {
            name: `${name} on <${effect.target!.tagName.toLowerCase()}>${effect.pseudoElement ?? ""}`,
            remainingMs: end - now,
            playState: animation.playState,
          };
        });
    });

  expect(
    await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches),
    "The runner emulates prefers-reduced-motion: reduce. An animation the page suppresses under it would " +
      "never run here, so the settled sample would read the on-load page again. That is a finding (EV-217 " +
      "edge case 2), not a pass: stop and ask senior-po."
  ).toBe(false);

  const before = await inScope();
  const unsettleable = before.filter((a) => !Number.isFinite(a.remainingMs) || a.remainingMs > SETTLE_BUDGET_MS);
  expect(
    unsettleable.map((a) => `${a.name}: ends in ${a.remainingMs} ms`),
    `An animation on the adherence list, under it or on an ancestor of it does not end within ` +
      `${SETTLE_BUDGET_MS} ms, so the settled sample cannot be taken (EV-217 AC1). The sample is not ` +
      "dropped: this is red. If the design needs such an animation, stop and ask senior-po."
  ).toEqual([]);

  const waitedMs = Math.ceil(Math.max(0, ...before.map((a) => a.remainingMs))) + SETTLE_MARGIN_MS;
  await page.waitForTimeout(waitedMs);

  const after = await inScope();
  expect(
    after.filter((a) => a.playState !== "finished").map((a) => `${a.name}: ${a.playState}, ${a.remainingMs} ms left`),
    `${waitedMs} ms after the on-load read, an animation in scope has still not finished, so the ` +
      "page has not settled and the second sample would not be a settled read (EV-217 AC1)."
  ).toEqual([]);

  const describe =
    before.length === 0
      ? "no animation or transition in scope, so the margin alone"
      : `the longest of ${before.length} animation(s) in scope plus the margin: ${before.map((a) => a.name).join(", ")}`;
  return { waitedMs, describe };
}

test.describe("EV-214 / EV-215 / EV-216 / EV-218 / EV-253 / EV-217 / P-ADH C2 — no element of the adherence list has a non-initial value on an enumerated paint channel, at any of three samples", () => {
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

  /**
   * One SAMPLE of the paint limb: the whole predicate, read once, at the page state the
   * caller has put the page in. Every message carries `sample`, so a red build says WHEN
   * and AT WHAT WIDTH it read the page (EV-217 AC3), not only what it found.
   *
   * The offences are asserted SOFT, so a red sample does not stop the later samples from
   * being read: that is what lets a failure show which sample caught a construction and
   * which did not, and it is how EV-217's independence runs were read (records).
   */
  async function expectNoPaintInList(page: Page, world: (typeof WORLDS)[number], sample: string) {
    const read = await paintedElementsInList(block(page, ADHERENCE));
    const rows = read.rows;
    const at = `${world.name} [sample: ${sample}]`;
    expect(
      read.interaction,
      `${at}: the list was read with the pointer over it or focus inside it. Every sample in this ` +
        "section is read AT REST (EV-217 banner); a hovered or focused read is a different sample."
    ).toEqual({ hovered: false, focusWithin: false });
    expectOneListHoldingEveryRow(`${at}, the paint limb`, read, rows.length, 1);
    // EV-253 — the list element itself is read, not only what hangs under it. It is the
    // first element outside every row by construction; this is what says so.
    expect(
      read.outsideRows[0]?.tag,
      `${at}: the paint limb did not read the <ul> itself — it is rooted at the list (EV-253)`
    ).toBe("ul");
    // "…not the ${world.weeks} this world renders", never "no week rows at all": the
    // assertion is an equality, so SEVEN rows — a week silently dropped, which is the
    // interesting failure — would otherwise be reported as zero.
    expect(rows.length, `${at}: the adherence block did not render the ${world.weeks} week rows this world has`).toBe(
      world.weeks
    );
    // EV-218 / ADR-0024 decision 3 — the rendered ratchet. For Lina this binds the
    // fixture's `done` and `planned`, her render path, and this test reading her rows
    // in ONE assertion; `plannedSoFar` is not printed, so it is held separately below.
    expect(
      rows[rows.length - 1].rowText,
      `${at}: the current (last) week no longer prints "${world.currentWeek}". For Lina ` +
        "that row is the fixture's only done > plannedSoFar >= 1 week, the one this section " +
        "relies on to see a done / plannedSoFar renderer after the parser (ADR-0024)."
    ).toContain(world.currentWeek);

    const { offences, inspected } = paintOffences(read, at);

    expect
      .soft(
        offences,
        `SAMPLE: ${sample}. ` +
          "An element of the adherence list — a week row, or the list itself or anything under it " +
          "outside every row (EV-253) — has a non-initial value on one of the channels this " +
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
          "⚠️ This is an ENUMERATED ban over `PAINT_CHANNELS`, read after the CSS parser, at the " +
          "samples listed in the EV-217 banner; it is not a proof that nothing else can paint, " +
          "or that nothing paints at another instant or width. What is read, and when, is " +
          "disclosed above `PaintChannel` and in the EV-217 banner. The fix belongs in the " +
          "renderer: draw the ratio as a measurable box, or draw nothing."
      )
      .toEqual([]);

    expect(
      inspected,
      `${at}: only ${inspected} elements were read in the adherence list, so this ` +
        `check was very nearly vacuous (the fixture guarantees at least ${world.minimumElements})`
    ).toBeGreaterThanOrEqual(world.minimumElements);
  }

  for (const world of WORLDS) {
    test(`P-ADH C2 (EV-216 AC1, EV-253, EV-217): no element of the adherence list paints through one of the ${PAINT_CHANNELS.length} enumerated channels, on load, settled and at ${NARROW_WIDTH} px — ${world.name}`, async ({
      page,
    }) => {
      await signIn(page);
      // At rest: the pointer is parked at the viewport's top-left corner, off the list, so
      // no sample is taken with a row hovered by wherever the sign-in click left it.
      await page.mouse.move(0, 0);
      const defaultViewport = page.viewportSize();
      expect(defaultViewport, "the config sets no viewport, so the default-width sample has no width").not.toBeNull();
      const defaultWidth = `${defaultViewport!.width} px`;

      // ── Sample 1: on load, at the config's default width. ─────────────────────────
      await page.goto(`/clients/${world.id}`);
      await expect(block(page, ADHERENCE)).toBeVisible();
      await expectNoPaintInList(page, world, `on load, at ${defaultWidth}`);

      // ── Sample 2 (EV-217 AC1): the same page, SETTLED, at the same width. ─────────
      const settled = await waitUntilSettled(page, block(page, ADHERENCE));
      await expectNoPaintInList(
        page,
        world,
        `settled (${settled.waitedMs} ms after the on-load read; ${settled.describe}), at ${defaultWidth}`
      );

      // ── Sample 3 (EV-217 AC2): a fresh load at 320 px, read on load. ──────────────
      // Only the width changes; the height is the default's, so this is one condition
      // moved, not two (AC5).
      await page.setViewportSize({ width: NARROW_WIDTH, height: defaultViewport!.height });
      await page.goto(`/clients/${world.id}`);
      await expect(block(page, ADHERENCE)).toBeVisible();
      expect(
        await page.evaluate(() => window.innerWidth),
        `the ${NARROW_WIDTH} px sample did not render at ${NARROW_WIDTH} px`
      ).toBe(NARROW_WIDTH);
      await expectNoPaintInList(page, world, `on load, at ${NARROW_WIDTH} px`);
    });
  }

  /**
   * 📌 **EV-217 AC4 — the non-false-positive property, as a test you can point at.**
   *
   * Until EV-217, "a flat `background-color` inside a week row is not reported" was true
   * only because the suite was green on the shipped bars, which paint with exactly that.
   * A real check, but nobody could name the assertion. This is the assertion.
   *
   * It reads Lina's shipped page: at least six elements in her week rows carry a
   * non-transparent `background-color` (one fill per drawn bar, EV-210b's `minimumBars`
   * for her world, plus the tracks), the paint limb reports nothing on that page, and
   * `background-color` is not a `PAINT_CHANNELS` property. The last clause is the SCOPE
   * DECISION the EV-214 banner records (a colour is untouched by choice, not because a
   * colour cannot draw a ratio). Adding it to the table is a `senior-po` call, and this
   * test goes red to make it one.
   */
  test("P-ADH C2 (EV-217 AC4): a flat background-color on a week row is PERMITTED — the shipped bars paint with one and the paint limb reports nothing", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/clients/${LINA}`);
    await expect(block(page, ADHERENCE)).toBeVisible();

    const coloured = await block(page, ADHERENCE).evaluate((blockEl) => {
      const list = blockEl.querySelector("ul");
      if (!list) return [];
      return Array.from(list.querySelectorAll<HTMLElement>("li, li *"))
        .map((el) => getComputedStyle(el).backgroundColor)
        .filter((colour) => colour !== "rgba(0, 0, 0, 0)" && colour !== "transparent");
    });
    expect(
      coloured.length,
      "Lina's week rows no longer carry a flat background-color on at least six elements (one per drawn bar), " +
        "so this test no longer shows a colour being permitted — it would pass on a page with none"
    ).toBeGreaterThanOrEqual(6);

    const { offences } = paintOffences(await paintedElementsInList(block(page, ADHERENCE)), "Lina");
    expect(
      offences,
      "The paint limb reported the shipped page, whose rows paint with a flat background-color and " +
        "nothing else. A colour is PERMITTED (EV-214 scope decision, EV-217 AC4)."
    ).toEqual([]);
    expect(
      PAINT_CHANNELS.filter((channel) => channel.property === "background-color").map((channel) => channel.name),
      "PAINT_CHANNELS reads background-color. That bans the colour every shipped bar is drawn with; " +
        "it is a senior-po scope decision (EV-214, EV-220), not a line to add here."
    ).toEqual([]);
  });

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
   * last tuple in the fixture SOURCE still states `plannedSoFar = 2`. The second is a
   * read of the tuple's TEXT, not of its effect: it stays green if `adherenceSeries`
   * ignores the third element. The effect, the function returning the stated value on
   * each weekday, is tested in `qa/coach-fixture-adherence.spec.ts` (EV-249).
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

/* ═══════════════════════════════════════════════════════════════════════════
 * EV-251 / EV-259 — **P-ADH C2: the adherence card's text is exactly the text the copy
 * module and the fixture's numbers produce for it.** Fixes `BUG-227` (EV-251), `BUG-231`
 * (EV-253) and `BUG-235` (EV-259).
 *
 * Story: `b-fit-mobile/docs/product/stories/EV-251-a-bar-made-of-text.md`.
 *
 * **WHAT IT READS.** **Every DOM `Text` node in the adherence CARD (the region element the
 * guard locates the block by, and everything under it), in document order, UNFILTERED**,
 * each tagged with its place: a week row, "list, no row", or "card, outside the list"
 * (EV-259; from EV-253 the walk started at the `<ul>`, and a node in the card outside the
 * list, `BUG-235`, was read by nothing; before EV-253 it started at each `li`, `BUG-231`). No trim, no whitespace node dropped, no node skipped for
 * being inside `aria-hidden`. The walk is a `TreeWalker` with `SHOW_TEXT`, so it stays in
 * the light DOM (this app opens no shadow root). It reads no style, no box and no pixel.
 *
 * **WHAT IT COMPARES THEM TO.** The whole card, as an EQUALITY, against what the card is
 * expected to say (`expectedCardTexts`): its title `copy.client.adherenceSeries`, then its
 * headline `copy.client.adherenceSeriesHeadline(done, planned)` of the whole series, both
 * tagged "card, outside the list", then two strings per
 * row: `formatDate(weekCommencing)`, then `copy.client.weekSessions(done, planned)` for a
 * week with a plan or `copy.client.weekNoPlan` for one without. Those inputs come from the
 * FIXTURE, not from the page: the world's tuples are read from `coachApi.fixture.ts`'s
 * source (`fixtureSeriesTuples`) and run through `fixtureAdherence.adherenceSeries`, the
 * function the fixture itself calls. The figures are not parsed back out of the printed
 * label. A label is compared as a whole string to the one the copy module builds from
 * the fixture's `done` and `planned`. In the three EV-208 worlds the card is expected to say
 * its title and one sentence, `nothingScheduledIn8Weeks` if a week of the fixture's series
 * had a plan and `noPlanInWindow` otherwise.
 *
 * So this is an allowlist of whole strings, one per cell, and it names no character
 * (EV-251 out of scope; EV-218's lesson): nothing in it matches a pattern against the
 * text. Since EV-259 it is ONE equality over the card: title, headline, then the expected
 * rows flattened, each string tagged with its place. A text node that is not one of the
 * strings, a third node in a row, a node under the list in no row, or any other node in
 * the card fails it.
 *
 * **Whitespace (EV-253 edge case 2, EV-259 edge case 4), decided once.** A whitespace-only
 * text node counts wherever it is in the card, in a row, between rows or between the
 * card's children, the same way: it is a node, and the expected content contains no
 * whitespace-only string, so it fails. The shipped card renders none (see the EV-259
 * records: its text nodes are exactly the expected ones).
 *
 * **WHAT IT DOES NOT READ.** Anything that is not a `Text` node in the DOM: generated
 * `content` (the paint limb's `content` entries read that inside the <ul> only; generated
 * content in the card outside the list is read by no limb, see the EV-259 banner), a form
 * control's value, an attribute, `<canvas>` / `<img>` (EV-251 out of scope), and how any text is styled. It
 * reads the adherence card only (EV-259), not the rest of the client page. That is what it
 * reads, not a claim about what the rest of the page can or cannot draw.
 *
 * **WHEN.** Once per world, after the block is visible, at the default viewport, in
 * `next dev` fixture mode.
 *
 * **Every fixture world with a series is read**: the ten `PROGRESS` entries that call
 * `adherenceSeries`. Seven render eight week rows. Kaia, Ruben and Elif render EV-208's
 * whole-series sentence and **no week rows**. Since EV-259 this check reads the card in
 * those three worlds too (title and sentence). It also asserts that there are zero rows,
 * so a row appearing there is a failure rather than an unread row.
 *
 * ⚠️ **Edge cases 1 and 2 of EV-251.** A legitimate character-based element added to a
 * week row later (an icon glyph, a separator) makes this red. **That is a stop-and-ask for
 * `senior-po`, not a carve-out here.** A copy change moves both sides together, because
 * the expected strings are built by the copy module. A copy change that fails here is
 * doing its job.
 *
 * **HOW TO FIND OUT WHETHER A CONSTRUCTION IS CAUGHT.** Build it in an uncommitted copy of
 * `AdherenceSeries.tsx`, confirm on a screenshot that it paints (the row, a clip grown
 * past it, several scanlines, against a control), and run this file. Do not reason from
 * this paragraph: it says what the check reads, not what text can or cannot draw.
 * ═══════════════════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════════════════
 * EV-251 — **RECORDS.** Runs of 2026-09-24 (a Thursday, UTC) at `58024f8`. These are
 * what was measured then. They are history, not part of the banner above, and counts
 * are this section's own ten tests. "Nothing else red" means no test outside this
 * section failed in the default suite on that run.
 *
 * Every renderer mutant sits in the current week's empty middle cell only
 * (`week.partial && week.hasPlan`), in an uncommitted `AdherenceSeries.tsx`. PROBE: each
 * row scrolled into view, a VIEWPORT screenshot clipped to the row grown 24 px on every
 * side, decoded in a canvas, and the blue fraction of the row's width read on scanlines
 * y = -6, -2, 1, 3, 5, 7, 9, 11, 14 and 18 of the 15 px row. Control on clean code:
 * 0.000 on every scanline of every probed world's current row, and 0.83 for an honest
 * full bar on y = 3..11, which is how the probe is known to see blue at all.
 *
 *   · **The BUG-227 witness, verbatim from its repro** (`"█".repeat(...)` from
 *     `done / plannedSoFar`, blue text). PROBE: Lina 0.706 beside "3 / 4 sessions" and
 *     Ines 0.706 beside "1 / 3 sessions" on y = 3..11; Dana 0.706, Nils and Omar 0.233
 *     (1 / 3 against a Thursday's derived `plannedSoFar = 3`); Tobias and Noor 0.000
 *     (zero characters, and no text node). This section: **5 failed** (Ines, Lina, Nils,
 *     Dana, Omar). Nothing else red in the default suite, so nothing else kills it
 *     (clause 4).
 *   · **The same bar in ASCII `|`.** PROBE: 0.326 at a clamped full ratio, 0.111 at
 *     1 / 3. This section: the same 5 failed. Nothing else red.
 *   · **A bar of `U+00A0` no-break spaces, drawn by an underline.** PROBE: 0.262 on
 *     y = 9, 11 at full, 0.087 at 1 / 3. This section: 5 failed, AND three EV-210b geometry
 *     tests red beside it: that limb counts a leaf whose TRIMMED text is
 *     empty as a picture and measures it. Killed by two clauses, so it shows neither is
 *     needed and is recorded rather than cited.
 *   · **The same no-break-space bar with an empty `<i />` inside it**, so the span is no
 *     longer a leaf. PROBE: identical readings. This section: **5 failed**. Nothing else
 *     red.
 *   · **This check with whitespace-only text nodes dropped** (a `trim()` filter in
 *     `weekRowTextNodes`). With the previous mutant planted: this section **10 passed**,
 *     and since nothing outside this section was red on that mutant, the default suite is
 *     green on it. With the BUG-227
 *     witness planted: 5 failed. So the witness alone cannot tell the filtered read from
 *     the unfiltered one, and the no-break-space bar is what does. The read is unfiltered
 *     for that reason.
 *   · **This check's oracle broken on clean code** (`copy.client.weekNoPlan` replaced by
 *     `"No plan."` on the expected side). **3 failed**: Ines, Lina and Nils, the three
 *     worlds with a no-plan week. So those rows are compared, not skipped.
 * ═══════════════════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════════════════
 * EV-253 — **The guard reads the whole list, not just the rows.** Fixes `BUG-231`;
 * closes `BUG-218`.
 *
 * Story: `b-fit-mobile/docs/product/stories/EV-253-the-guard-reads-the-whole-list.md`.
 *
 * **WHAT CHANGED: the ROOT of every P-ADH C2 limb that looks for a picture.** What each
 * limb reads of an element is unchanged. What changed is which elements it asks.
 *
 *   | limb | function | root at `7bddb7a` | root after EV-253 |
 *   |---|---|---|---|
 *   | text | `listTextNodes` (was `weekRowTextNodes`) | each `li`, via `region.locator("li")`: Text nodes under it | the `<ul>`: every Text node under it, tagged with its row or "no row" |
 *   | paint | `paintedElementsInList` (was `paintedElementsInWeekRows`) | each `li` and its descendants | the `<ul>` itself, then every element under it, attributed to a row or to `outsideRows` |
 *   | geometry | `renderedWeeks`, asserted by `expectPictureEqualsFigures` | each `li`'s descendants (not the `li` itself) | the `<ul>` and every element under it, the `li`s included; a picture in no row is in `outsideRows` and fails for having no figures beside it |
 *
 * **Left at row scope, deliberately:** "the 1 / 0 week" (EV-210b AC3) reads through the
 * re-rooted `renderedWeeks` and asserts on the current row only, because it pins the row
 * where the Monday hazard lives. Ines's pictures outside every row are asserted by
 * `expectPictureEqualsFigures` in the loop above it. **Not in this file and not a P-ADH C2
 * limb:** `coach-monitoring.spec.ts`'s EV-187 tests read each row's `[data-fill]` and
 * compare it to the row's label. They test the shipped bar's attribute, not whether a
 * picture exists, and EV-253 does not touch them.
 *
 * **The precondition all three share, `expectOneListHoldingEveryRow`.** The block holds
 * exactly the one list these limbs read (none in the three worlds that render EV-208's
 * sentence), and every `li` in the block is inside it. The second half is there because
 * re-rooting at the list, alone, NARROWS the read in one place. A row-shaped `li`
 * rendered in the block after the `</ul>` was read by `region.locator("li")` and is not
 * under the list. Without the assertion, a bar in such an `li` is read by nothing (see
 * the records).
 *
 * **WHAT IS NOT READ.** Anything outside the adherence list: the block's title and
 * headline, EV-208's sentences, any element of the card that is not the list, such as a
 * sibling of the `<ul>` directly under the last row, and the rest of the client page.
 * This says what the limbs read. It is not a statement about what that region can or
 * cannot draw. ⚠️ **Superseded for the TEXT limb by EV-259**, which reads the whole card
 * (see the EV-259 banner below). Paint and geometry are still as this paragraph says.
 *
 * **Edge cases 1 and 4.** If a limb goes red on honest styling of the list (a divider, a
 * border, a gap drawn by an element) or on a legitimate non-row child (a header, an
 * empty-state line inside the list), **stop and ask `senior-po`**. That is not a carve-out
 * here, and there is no allowance for "the list's own border". The shipped list has
 * none of these (records).
 *
 * **HOW TO FIND OUT WHETHER A CONSTRUCTION IS CAUGHT.** Build it in an uncommitted copy of
 * `AdherenceSeries.tsx`. Confirm it paints: a viewport screenshot clipped to the LIST
 * grown 24 px on every side, every scanline, each attributed to its row or to "outside
 * every row", against a control. Check the browser console too: a hydration error puts
 * Next's dev overlay on the page, and the overlay can fail tests that have nothing to do
 * with the construction. Then run the default suite. Do not reason from this block. It
 * says where the limbs start, not what can be drawn.
 * ═══════════════════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════════════════
 * EV-253 — **RECORDS.** Runs of 2026-09-24 (a Thursday, UTC) at `35acdcd` (the re-root,
 * before this comment was written), `next dev` fixture mode on :3341. These are what was
 * measured then. They are history, not part of the banner above. Counts are per
 * section: the geometry section is EV-210b AC3 (6 tests), the paint section is
 * EV-214..EV-253 (6), the text section is EV-251 / EV-253 (10). "Nothing else red" means
 * no other test in the default suite failed on that run. "At `7bddb7a`" is the same
 * construction under the merged guard, in a detached worktree.
 *
 * PROBE: the list scrolled into view, a viewport screenshot clipped to the `<ul>` grown
 * 24 px on every side, decoded in a canvas; per css-px scanline, the fraction of the
 * list's width within L1 < 90 of computed `--blue-500`, attributed to the `li` it falls
 * in or to "outside every li". Browser console errors counted. Control on clean code, in
 * all seven probed worlds: **outside every li 0.000**, the current row 0.000, an honest
 * full bar 0.833. Under the list and outside every row there is **the `<ul>` itself and
 * nothing else**: no other element and no Text node. 0 console errors.
 *
 * Renderer constructions, each in an uncommitted `AdherenceSeries.tsx`, the ratio being
 * the current week's `min(1, done / plannedSoFar)`:
 *
 *   · **`BUG-231`, verbatim** (BUG-227's `█` span as a child of the `<ul>` after the
 *     rows, `marginLeft: 86`). PROBE: outside every li 0.706 (Lina, Ines, Dana), 0.233
 *     (Nils, Omar) on list y = 200..209, directly under the current row; Tobias, Noor
 *     0.000 (zero characters). Text node outside every row `"█"` x 100 (Lina). 0 console
 *     errors. **Text section: 5 failed** (Ines, Lina, Nils, Dana, Omar), each naming the
 *     node "OUTSIDE every week row". Geometry and paint sections: all passed. Nothing else
 *     red. **At `7bddb7a`: nothing red.**
 *   · **AC4: an EMPTY `<span>`, flat `background: var(--blue-500)`, `height: 10`,
 *     `width: calc((100% - 96px) * <ratio%> / 100)`, a child of the `<ul>` after the
 *     rows.** PROBE: outside every li 0.911 (Lina, Ines, Dana), 0.301 (Nils, Omar), 0.000
 *     (Tobias, Noor: the span is 0 px wide). 0 console errors. **Geometry section: 2
 *     failed** (Ines, Lina), "draws a picture OUTSIDE every week row … 978.00px of
 *     1074.00px". Paint and text sections: all passed. Nothing else red. **At `7bddb7a`:
 *     nothing red.** Caught by the geometry limb only because the span is an empty LEAF.
 *     `staff-engineer` at `ef94393`: the same span with one empty `<i />` inside it
 *     paints a full-width bar in the `<ul>` outside every row, and the gate is 290 green.
 *     That escape is routed to **EV-220** per AC4 and not built here.
 *   · **AC5: `BUG-218`'s construction** (`ul.qa-mut::after { content: ""; position:
 *     absolute; left: 86px; bottom: 2px; height: 10px; width: calc((100% - 96px) *
 *     <ratio%> / 100); border-radius: 999px; background: var(--blue-500) }`, with
 *     `position: relative` on the list and the `<style>` rendered in the block before
 *     the headline, outside the list). The ratio is clamped at 100 to keep the box inside
 *     the track, as BUG-218's repro intends. PROBE: over the current row 0.911 (Lina,
 *     Ines, Dana) and 0.301 (Nils, Omar) on row y = 3..12, beside "3 / 4 sessions" for
 *     Lina (control 0.000); Tobias and Noor 0.000 (0 px wide). 0 console errors. **Paint
 *     section: 4 failed** (all four worlds), each offence
 *     `the adherence list, OUTSIDE every week row, <ul> PAINTS on channel [content on
 *     ::after]: "" (initial: none)`. Geometry and text sections: all passed. Nothing else
 *     red. **At `7bddb7a`: nothing red.** (This is the reading the EV-216 disclosure's
 *     BUG-218 entry points to.) What fired is the `content` that GENERATES the
 *     box, read on the `<ul>`. Its colour and its width are not read. It fires on Tobias
 *     and Noor too, where the box is 0 px wide.
 *     ⚠️ **A first delivery of this construction was a dud and is not counted.**
 *     `<style>{css}</style>` has SSR escape `""` to `&quot;&quot;`, so hydration fails (21
 *     console errors over the seven worlds). Next's dev overlay then sat over Save at
 *     320 px and failed `coach-progress-goal.spec.ts`'s layout test (plus 17 that did not
 *     run) for a reason that was not the bar. Rebuilt with `dangerouslySetInnerHTML`:
 *     same CSS, same paint, 0 console errors. The run above is the rebuilt one.
 *   · **A row-shaped `<li>` holding BUG-227's `█` bar, rendered in the block after the
 *     `</ul>`** (outside the list). PROBE: 0.706 / 0.233 just below the list (y =
 *     190..199), 0 console errors. **15 failed: geometry 4, paint 4, text 7**, all on
 *     `expectOneListHoldingEveryRow`'s "rows in the block and … inside the list". **At
 *     `7bddb7a`: 12 failed** (the `li`-rooted reads counted it as a ninth row).
 *   · **Edge case 2: one whitespace-only text node (`{" "}`) under the list, after the
 *     rows.** It paints nothing. It is the witness that the whitespace rule applies
 *     between rows. **Text section: 7 failed** (the seven worlds with rows), naming `[" "]`
 *     outside every row. This file only.
 *
 * CHECK mutants: one design choice of EV-253 reverted in the spec, with the construction
 * it exists for planted. This file only; nothing outside it was red on any of these
 * constructions at `7bddb7a`.
 *
 *   · **Text limb reads rows only** (nodes in no row dropped) + `BUG-231`: **text section
 *     10 passed**, file 27 passed.
 *   · **Geometry limb reads rows only** (`outsideRows` emptied) + AC4's span: **geometry
 *     section 6 passed**, file 27 passed.
 *   · **Paint limb reads rows only** (`outsideRows` emptied, its `<ul>` assertion
 *     neutralised) + `BUG-218`: **paint section 6 passed**, file 27 passed.
 *   · **Paint limb reads what is under the list outside rows, but NOT the `<ul>` itself**
 *     + `BUG-218`: **paint section 6 passed**, file 27 passed. So reading the list element
 *     itself, not only its descendants, is what closes BUG-218.
 *   · **The same, with the "`<ul>` itself was read" assertion kept, on clean code: paint
 *     section 4 failed**, each on that assertion. So it binds.
 *   · **"Every `li` in the block is in the list" dropped** + the `<li>` after the
 *     `</ul>`: **file 27 passed**. Re-rooting alone would have lost that row. The
 *     assertion is what keeps it read.
 *
 * **Clause 8, as a cross-matrix.** Each of the three constructions turned exactly one
 * section red on the whole gate: `BUG-231` only the text section, AC4's span only the
 * geometry section, `BUG-218` only the paint section. So none of the three re-roots is
 * riding on another's witness, and the same three at `7bddb7a` are green.
 * ═══════════════════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════════════════
 * EV-259 — **The text limb reads the whole adherence card, not just the list.** Closes
 * `BUG-235`.
 *
 * Story: `b-fit-mobile/docs/product/stories/EV-259-the-guard-reads-the-whole-card.md`
 * (ruled 2026-09-25: option (1), the text limb alone).
 *
 * **EACH LIMB'S ROOT.** What each limb reads of an element is unchanged.
 *
 *   | limb | function | root at `f92b63c` | root after EV-259 |
 *   |---|---|---|---|
 *   | text | `cardTextNodes` (was `listTextNodes`) | the `<ul>`: every Text node under it | **the card**: the region element and every Text node under it, tagged with its row, "list, no row" or "card, outside the list" |
 *   | paint | `paintedElementsInList` | the `<ul>` and every element under it | **the `<ul>`, unchanged, deliberately** |
 *   | geometry | `renderedWeeks` / `expectPictureEqualsFigures` | the `<ul>` and every element under it | **the `<ul>`, unchanged, deliberately** |
 *
 * **Why paint and geometry stay at the list.** Rooted at the card, each fails on the
 * shipped card, on something honest that the card draws and that is not a picture of
 * adherence: paint on the kit `Card` frame's own `box-shadow` (`--e-card`, non-initial on
 * `box-shadow on its own box`), and geometry on the title icon's `<path>` (a text-free
 * painted leaf, 15.83 of 19 px, with no figures beside it). Making either pass there
 * changes what the limb counts as a picture, not where the scan starts, and this row is
 * about the root. Geometry at the card is `EV-220`'s AC3d. Paint at the card has no row.
 *
 * **WHAT IS READ, AND WHAT IS NOT.**
 *   · The TEXT limb reads the adherence card: its region element and everything under it.
 *   · 🔴 **The PAINT and GEOMETRY limbs do not read the card outside the list.** The card's
 *     frame, its title row, its headline and any sibling of the `<ul>` are not asked by
 *     either of them.
 *   · The rest of the client page is read by no limb in this file.
 * This says what the limbs read. It is not a statement about what any unread region can or
 * cannot draw.
 *
 * **What this closes and what it does not.** `BUG-235` (BUG-231's `█` glyphs as a `<div>`
 * sibling of the `<ul>`) is closed by the text limb. `BUG-236` (an empty flat-colour `<div>`
 * sibling, sized by the ratio) is read by neither limb that stays at the list, and passes
 * this file. It is **routed to `EV-220` AC3d**. That green is expected, recorded below, and
 * not a defect of this row.
 *
 * **Whitespace (edge case 4)** is decided the way EV-253 decided it for the list; see the
 * EV-251 banner. A whitespace-only text node between the card's children fails.
 *
 * **Edge cases 1 and 2.** If the text limb goes red on the shipped card, or the card gains a
 * legitimate new text child (a legend, a tooltip, a footnote), **stop and ask
 * `senior-po`**. No carve-out here.
 *
 * **HOW TO FIND OUT WHETHER A CONSTRUCTION IS CAUGHT.** Build it in an uncommitted copy of
 * `AdherenceSeries.tsx`. Confirm it paints: a viewport screenshot clipped to the CARD grown
 * 24 px on every side, every scanline attributed to a row, to the list outside every row, or
 * to the card outside the list, against a control, with console errors counted. Then run the
 * default suite. Do not reason from this block.
 * ═══════════════════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════════════════
 * EV-259 — **RECORDS.** Runs of 2026-09-25 (a Friday, UTC) on branch
 * `test/ev259-whole-card`, base `f92b63c`, with this change uncommitted, in `next dev`
 * fixture mode on :3391. These are what was measured then. They are history, not part of
 * the banner above. Counts are per section: geometry is EV-210b AC3 (6 tests), paint is
 * EV-214..EV-253 (6), text is EV-251 / EV-253 / EV-259 (10). The file has 27 tests.
 *
 * PROBE: the card scrolled into view, a viewport screenshot clipped to the CARD grown 24 px
 * on every side, decoded in a canvas. For each css-px scanline, the fraction of the `<ul>`'s
 * width within L1 < 90 of computed `--blue-500`, attributed to an `li`, to the `<ul>` outside
 * every `li`, or to the card outside the `<ul>`. Browser console errors counted.
 *
 *   · **Control, clean code, seven worlds.** The `<ul>` outside every `li` is 0.000. The card
 *     outside the `<ul>` is **0.016**: the title icon's blue stroke. The current row is
 *     0.000, and an honest full bar is 0.833. 0 console errors. Outside the `<ul>`, the card
 *     renders the `section`, the `Card` div (white, 1 px border, `--e-card` shadow), the
 *     title row (a div > div > 36 px icon box filled `--blue-50` > `svg` > `path`, and the
 *     title div "Adherence, last 8 weeks"), and the headline `<p>` (Lina: "18 of 27 planned
 *     sessions in the last 8 weeks"). There are no other elements, and no text node other
 *     than the title and headline. The three EV-208 worlds render the title and one
 *     sentence instead of the headline and the list.
 *   · **The stop, measured before the ruling:** with all three limbs at the card, the file on
 *     clean code was **8 failed / 19 passed**: geometry 4 (the icon `<path>`, one offence per
 *     world), paint 4 (the `Card` div's `box-shadow`, one offence per world), and text 0.
 *   · **Shipped code, this change:** file **27 passed**; default suite **290 passed, exit 0**.
 *
 * Renderer constructions, each in an uncommitted `AdherenceSeries.tsx`, with the ratio
 * being the current week's `min(1, done / plannedSoFar)`:
 *
 *   · **`BUG-235`, verbatim** (BUG-231's `█` glyphs in a `<div>` after `</ul>`,
 *     `marginTop: -4`). PROBE: card outside the `<ul>` **0.706** (Lina, Ines, Dana) and
 *     0.233 (Nils, Omar) on scanlines 1..5 px below the `<ul>`, and the same on the current
 *     row's own bottom scanlines. Tobias and Noor 0.016 (zero characters, icon only).
 *     0 console errors. **Text 5 failed** (Ines, Lina, Nils, Dana, Omar), each naming the
 *     node `card, outside the list: "███…"`. Geometry and paint all passed. File 5 failed /
 *     22 passed. **Default suite 5 failed / 285 passed**: those five and nothing else.
 *   · **`BUG-236`, verbatim** (an empty `<div>` after `</ul>`, flat `--blue-500`, width
 *     sized by the ratio, `marginTop: 4`). PROBE: card outside the `<ul>` **0.911** (Lina,
 *     Ines, Dana) and 0.301 (Nils, Omar) on scanlines 4..13 px below it. 0 console errors.
 *     **File 27 passed.** This is the expected green: `BUG-236` is `EV-220`'s AC3d. With every
 *     limb at the card (before the ruling), geometry listed this `<div>` (978 of 1116 px,
 *     87.6 %, Ines and Lina) beside the icon `<path>`. That catch could not be attributed.
 *   · **Nothing the list root read is lost: `BUG-231`, verbatim** (the glyph `<span>` as a
 *     child of the `<ul>` after the rows). **Text 5 failed** (the same five), each naming
 *     `list, no row: "███…"`. File 5 failed / 22 passed. The pin that every `li` of the block
 *     is inside the list (EV-253) is unchanged and still asserted by this limb.
 *   · **Edge case 4: one whitespace-only text node (`{" "}`) after `</ul>`,** between the
 *     card's children. It paints nothing. **Text 7 failed** (the seven worlds with rows),
 *     naming `card, outside the list: " "`. File 7 failed / 20 passed.
 *
 * CHECK mutant: **the text limb put back at the list** (walk root = the `<ul>`; expected
 * content = rows only, as at `f92b63c`). On clean code the file is 27 passed, so the mutant
 * runs. With `BUG-235` planted the file is **27 passed**, so the card root is what catches
 * `BUG-235`. (The text section of `f92b63c`'s own spec on the same construction: 10 passed.)
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * One DOM `Text` node in the adherence card, and where it sits: `"row N"` (the week row at
 * index N of the list), `"list, no row"` (under the `<ul>` and in no `li`), or
 * `"card, outside the list"` (anywhere else in the card, the title and headline included).
 */
interface CardText {
  place: string;
  text: string;
}

const OUTSIDE_LIST = "card, outside the list";
const IN_LIST_NO_ROW = "list, no row";
const rowPlace = (row: number) => `row ${row}`;

/**
 * Every `Text` node in the adherence CARD, in document order, exactly as the DOM holds it,
 * each tagged with its place. The walk starts at the card's region element (the
 * `<section aria-label>` the guard locates the block by), so the card's title, its
 * headline, the list and anything else in the card are one walk.
 *
 * EV-259 re-rooted this from the `<ul>` (it was `listTextNodes`, EV-253), which had
 * re-rooted it from each `li` (`weekRowTextNodes`). The new root contains the old one: the
 * `<ul>` is located INSIDE the region, so every node the list walk read is still read, with
 * the same row tag, and `expectOneListHoldingEveryRow` still pins every `li` of the block
 * to the list (the EV-253 narrowing).
 */
async function cardTextNodes(
  region: Locator
): Promise<{ lists: number; rowsInBlock: number; rows: number; nodes: CardText[] }> {
  return region.evaluate(
    (blockEl, labels) => {
      const lists = Array.from(blockEl.querySelectorAll<HTMLElement>("ul"));
      const list = lists[0];
      const rows = list ? Array.from(list.querySelectorAll("li")) : [];
      const nodes: { place: string; text: string }[] = [];
      const walker = document.createTreeWalker(blockEl, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const row = node.parentElement?.closest("li") ?? null;
        const place =
          list && row && list.contains(row)
            ? `row ${rows.indexOf(row)}`
            : list && list.contains(node)
              ? labels.inListNoRow
              : labels.outsideList;
        nodes.push({ place, text: node.nodeValue ?? "" });
      }
      return { lists: lists.length, rowsInBlock: blockEl.querySelectorAll("li").length, rows: rows.length, nodes };
    },
    { inListNoRow: IN_LIST_NO_ROW, outsideList: OUTSIDE_LIST }
  );
}

/** Expected rows flattened into the shape `cardTextNodes` returns: row `i`'s strings, tagged `row i`. */
function flattenRows(rows: string[][]): CardText[] {
  return rows.flatMap((texts, row) => texts.map((text) => ({ place: rowPlace(row), text })));
}

/**
 * EV-259 — what the adherence CARD must say, in document order, built from the fixture's
 * tuples and the copy module, never from the page:
 *
 *   · a world that renders rows: the card's title, its headline
 *     (`copy.client.adherenceSeriesHeadline(done, planned)` of the whole series), then every
 *     row's `[date, label]` (`expectedRowTexts`);
 *   · a world that renders EV-208's whole-series sentence: the title, then that sentence,
 *     `nothingScheduledIn8Weeks` if any week of the series had a plan, else
 *     `noPlanInWindow`.
 *
 * The EV-208 choice restates the renderer's branch on the fixture's own series. That is a
 * derivation of the expectation, the way `expectedRowTexts` derives the rows. It is not
 * read back from the page.
 */
function expectedCardTexts(key: FixtureSeriesKey, now: Date): CardText[] {
  const specs = fixtureSeriesTuples(key).map((tuple) => JSON.parse(tuple) as WeekSpec);
  const series = adherenceSeries(specs, now);
  const title = { place: OUTSIDE_LIST, text: copy.client.adherenceSeries };
  if (series.planned === 0 && series.done === 0) {
    const sentence = series.weeks.some((week) => week.hasPlan)
      ? copy.client.nothingScheduledIn8Weeks
      : copy.client.noPlanInWindow;
    return [title, { place: OUTSIDE_LIST, text: sentence }];
  }
  return [
    title,
    { place: OUTSIDE_LIST, text: copy.client.adherenceSeriesHeadline(series.done, series.planned) },
    ...flattenRows(expectedRowTexts(key, now)),
  ];
}

/**
 * What each week row of a world must say, built from the fixture's tuples by the same
 * function, date formatter and copy module the portal uses. `[]` for a world whose
 * series renders EV-208's whole-series sentence instead of rows: the renderer's branch
 * is `planned === 0 && done === 0`, and the world table below states which worlds those
 * are, so the two are cross-checked rather than one trusted.
 */
function expectedRowTexts(key: FixtureSeriesKey, now: Date): string[][] {
  const specs = fixtureSeriesTuples(key).map((tuple) => JSON.parse(tuple) as WeekSpec);
  const series = adherenceSeries(specs, now);
  if (series.planned === 0 && series.done === 0) return [];
  return series.weeks.map((week) => [
    formatDate(week.weekCommencing),
    week.hasPlan ? copy.client.weekSessions(week.done, week.planned) : copy.client.weekNoPlan,
  ]);
}

test.describe("EV-251 / EV-253 / EV-259 / P-ADH C2 — the adherence card's text is exactly what the copy module and the fixture produce", () => {
  /** `rows` is a fact about the fixture, stated here so an empty read cannot pass. */
  const WORLDS: { key: FixtureSeriesKey; id: string; rows: number }[] = [
    { key: "INES_ID", id: INES, rows: 8 },
    { key: "LINA_ID", id: LINA, rows: 8 },
    { key: "TOBIAS_ID", id: TOBIAS, rows: 8 },
    { key: "NOOR_ID", id: NOOR, rows: 8 },
    { key: "NILS_ID", id: "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0002", rows: 8 },
    { key: "DANA_ID", id: "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0004", rows: 8 },
    { key: "OMAR_ID", id: "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0005", rows: 8 },
    // EV-208: no plan in the window (Kaia, Ruben) and a plan that scheduled nothing (Elif).
    { key: "KAIA_ID", id: KAIA, rows: 0 },
    { key: "RUBEN_ID", id: RUBEN, rows: 0 },
    { key: "ELIF_ID", id: ELIF, rows: 0 },
  ];

  for (const world of WORLDS) {
    test(`P-ADH C2 (EV-251, EV-253, EV-259): every text node in the adherence card is its title, its headline or a row's date or label, in place — ${world.key}`, async ({
      page,
    }) => {
      await signIn(page);
      const before = new Date();
      await page.goto(`/clients/${world.id}`);
      await expect(block(page, ADHERENCE)).toBeVisible();
      const actual = await cardTextNodes(block(page, ADHERENCE));
      const after = new Date();

      /**
       * The fixture dates its weeks from the SERVER's UTC day. `before` and `after`
       * bracket the request, so they differ only if it straddled a Monday 00:00 UTC, and
       * then the page matches one of them. On every other request they are the same.
       */
      const candidates = [expectedCardTexts(world.key, after), expectedCardTexts(world.key, before)];
      const expected =
        candidates.find((candidate) => JSON.stringify(candidate) === JSON.stringify(actual.nodes)) ??
        candidates[0];

      expect(
        expected.filter((node) => node.place !== OUTSIDE_LIST).length / 2,
        `${world.key}: the fixture's series and this table disagree on whether week rows render`
      ).toBe(world.rows);
      expect(
        actual.rows,
        `${world.key}: the adherence list rendered ${actual.rows} week rows, and this world has ${world.rows}`
      ).toBe(world.rows);
      expectOneListHoldingEveryRow(world.key, actual, actual.rows, world.rows > 0 ? 1 : 0);

      /**
       * ONE equality over the whole card (EV-259). Each expected string is tagged with its
       * place, so a node in the wrong row, a node added inside a row, a node under the list
       * in no row, and a node anywhere else in the card that is not the title, the
       * headline or EV-208's sentence all fail it.
       */
      const unexpected = actual.nodes
        .filter((node) => !expected.some((e) => e.place === node.place && e.text === node.text))
        .map((node) => `${node.place}: ${JSON.stringify(node.text)}`);
      expect(
        actual.nodes,
        `${world.key}: the adherence card's text nodes are not exactly its title, its headline ` +
          `(or EV-208's sentence) and each week row's [date, label], in order, as the copy ` +
          `module and the fixture produce them. ` +
          (unexpected.length > 0
            ? `${unexpected.length} text node(s) in the card are none of those strings in that ` +
              `place (EV-259 / BUG-235; EV-253 / BUG-231): ${JSON.stringify(unexpected)}. `
            : "") +
          `P-ADH C2 says the card shows its figures and nothing that stands for a third ` +
          `number, and a text node that is not one of those strings is not something this ` +
          `check can tell from a picture. If it is a legitimate addition (an icon glyph, a ` +
          `legend, a footnote), that is a stop-and-ask for senior-po (EV-251 edge case 1, ` +
          `EV-259 edge case 2), not a carve-out here.`
      ).toEqual(expected);
    });
  }
});
