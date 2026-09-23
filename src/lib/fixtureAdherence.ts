import type { AdherenceSeries, WeekAdherence } from "./coachApi";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EV-249 — the fixture's adherence-series builder, as a pure function.
 *
 * Moved out of `coachApi.fixture.ts` so a spec can call it. That module imports
 * `"server-only"`, which throws when a Playwright spec imports it, so the only way a
 * spec could see the override before this move was to read the fixture's source text.
 *
 * What moved: `WeekSpec`, `adherenceSeries` and the `mondayOfWeeksAgo` helper it calls.
 * What did not: every world's tuples. They stay in `coachApi.fixture.ts`, behind
 * `server-only`. This module does not import `server-only`. Whether any fixture value
 * reaches a client chunk is found out by a production build and a grep of
 * `.next/static`, as EV-249 AC1 records; this header is not that check.
 *
 * `import type` from `coachApi` is erased at compile time.
 *
 * The one behavioural change is where the date comes from: `adherenceSeries` takes it
 * as `now`, defaulting to the real clock, instead of calling `new Date()` inside.
 * `qa/coach-fixture-adherence.spec.ts` calls it with each weekday.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** The Monday (UTC) of the ISO week `weeksAgo` weeks before the one containing `now`. */
function mondayOfWeeksAgo(weeksAgo: number, now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const mondayIndex = (d.getUTCDay() + 6) % 7; // 0 = Monday … 6 = Sunday
  d.setUTCDate(d.getUTCDate() - mondayIndex - weeksAgo * 7);
  return d.toISOString().slice(0, 10);
}

/**
 * `[done, planned]`, or `null` for a week in which no plan existed ("No plan").
 *
 * The optional third element **overrides `plannedSoFar`** on the current (partial)
 * week. It exists for EV-210b: the hazard C2 protects against is `done > plannedSoFar`,
 * and the derived value below, `min(planned, elapsedThisWeek)`, only produces it while
 * `done` exceeds the days elapsed — so a world relying on it stops discriminating part-way
 * through the week, on a day set by its own tuple: `[1, 3]` from Tuesday, `[3, 4]` from
 * Thursday. A world that states `plannedSoFar` has that value on every day of the week;
 * `qa/coach-fixture-adherence.spec.ts` calls this function on each of the seven.
 *
 * 🔴 **It is honoured ONLY on the last tuple** (`partial && plannedSoFarOverride !==
 * undefined` below). A third element on any earlier week is silently ignored: that week
 * gets `plannedSoFar = planned`, so a hazard tuple placed mid-series has no hazard in it.
 * Two worlds use it: Ines `[1, 3, 0]` (EV-210b) and Lina `[3, 4, 2]` (EV-218).
 */
export type WeekSpec =
  | [done: number, planned: number]
  | [done: number, planned: number, plannedSoFar: number]
  | null;

/**
 * Eight `WeekSpec`s, oldest first, → the wire's `AdherenceSeries`.
 *
 * `plannedSoFar` is `planned` for a completed week. For the current one it is the stated
 * third element if there is one, and otherwise `min(planned, days elapsed since Monday)`:
 * calendar days, counted on the UTC day of `now`, 0 on a Monday and 6 on a Sunday. It
 * does not count scheduled days, because a `WeekSpec` has no schedule. A Monday
 * therefore derives `plannedSoFar = 0`, which is ADR-0012 D6 as it applies to the
 * series: a Monday must not read as a 0 % week.
 *
 * `now` defaults to the real clock. Pass a date to build the series as it would be on
 * that day; `weekCommencing` follows the same date.
 */
export function adherenceSeries(specs: WeekSpec[], now: Date = new Date()): AdherenceSeries {
  const elapsedThisWeek = (now.getUTCDay() + 6) % 7; // Mon = 0 days elapsed
  const weeks: WeekAdherence[] = specs.map((spec, i) => {
    const weeksAgo = specs.length - 1 - i;
    const partial = weeksAgo === 0;
    const [done, planned, plannedSoFarOverride] = spec ?? [0, 0];
    const derivedSoFar = partial ? Math.min(planned, elapsedThisWeek) : planned;
    return {
      weekCommencing: mondayOfWeeksAgo(weeksAgo, now),
      done,
      planned,
      plannedSoFar: partial && plannedSoFarOverride !== undefined ? plannedSoFarOverride : derivedSoFar,
      hasPlan: spec !== null,
      partial,
    };
  });
  // Summed from `weeks`, as the api sums them: the totals are the sum of the rows above.
  return {
    done: weeks.reduce((sum, w) => sum + w.done, 0),
    planned: weeks.reduce((sum, w) => sum + w.planned, 0),
    weeks,
  };
}
