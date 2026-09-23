import { expect, test } from "@playwright/test";
import { adherenceSeries, type WeekSpec } from "../src/lib/fixtureAdherence";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EV-249 — the fixture's `plannedSoFar` override has a test of its own.
 *
 * Story: `b-fit-mobile/docs/product/stories/EV-249-the-fixture-override-has-a-test-of-its-own.md`.
 *
 * **What this does.** It imports `adherenceSeries` from `src/lib/fixtureAdherence.ts` and
 * calls it with chosen dates, with no page and no server. It checks the current
 * week's `plannedSoFar` that the function returns: for a last tuple that states it,
 * and for one that does not.
 *
 * **What it reads and what it does not.** It reads the FUNCTION, with the tuples written
 * out in this file: `[3, 4, 2]` and `[1, 3, 0]` are copies of Lina's and Ines's current
 * weeks, not reads of them. The fixture's worlds are behind `server-only` and unexported.
 * That the fixture still STATES those tuples is held by the source pins in
 * `qa/coach-adherence-property.spec.ts` ("P-ADH C2 (EV-218)" and "the hazard world still
 * HAS the hazard"). For whether some other defect is caught here, plant it and run this
 * file.
 *
 * **Why two stated tuples.** The derived value is `min(planned, calendar days elapsed
 * since Monday, UTC)`. Each stated tuple equals its derived value on one weekday, so on
 * that day a function that ignores the stated value returns the right number for it.
 * Measured for EV-249 AC3, on the function before and after the move (identical): Lina
 * `[3, 4, 2]` coincides on **Wednesday** only, Ines `[1, 3, 0]` on **Monday** only. The
 * AC3 test below holds that measurement for the tuples written here: edit them so the
 * two days overlap and it goes red.
 *
 * **The day is the UTC day.** Each weekday is called at its first and last UTC
 * millisecond and at noon, whatever the machine's time zone.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** One ISO week, Monday first: 2026-09-21 is a Monday. */
const WEEK = [
  { name: "Monday", date: "2026-09-21" },
  { name: "Tuesday", date: "2026-09-22" },
  { name: "Wednesday", date: "2026-09-23" },
  { name: "Thursday", date: "2026-09-24" },
  { name: "Friday", date: "2026-09-25" },
  { name: "Saturday", date: "2026-09-26" },
  { name: "Sunday", date: "2026-09-27" },
] as const;

/** The first millisecond, noon, and the last millisecond of a UTC day. */
function instantsOf(date: string): Date[] {
  return ["T00:00:00.000Z", "T12:00:00.000Z", "T23:59:59.999Z"].map((time) => new Date(date + time));
}

/** Seven earlier weeks, then `current`: the shape every world's series has. */
function currentWeekOf(current: WeekSpec, now: Date) {
  const series = adherenceSeries([[2, 3], [2, 3], [2, 3], [2, 3], [2, 3], [2, 3], [2, 3], current], now);
  return series.weeks[series.weeks.length - 1];
}

const STATED = [
  { who: "Lina", tuple: [3, 4, 2] as [number, number, number], stated: 2 },
  { who: "Ines", tuple: [1, 3, 0] as [number, number, number], stated: 0 },
] as const;

test.describe("EV-249 — the fixture's plannedSoFar override, called with a date", () => {
  /**
   * AC2: a stated `plannedSoFar` is returned on every weekday. One test per tuple per
   * day, so a failure names the day.
   */
  for (const { who, tuple, stated } of STATED) {
    for (const { name, date } of WEEK) {
      test(`AC2: ${who} ${JSON.stringify(tuple)} returns plannedSoFar ${stated} on a ${name} (UTC)`, () => {
        for (const now of instantsOf(date)) {
          const week = currentWeekOf(tuple, now);
          expect(week.partial, `the last week is not the current week at ${now.toISOString()}`).toBe(true);
          expect(
            week.plannedSoFar,
            `${who}'s current week states plannedSoFar = ${stated}, and at ${now.toISOString()} ` +
              `(a ${name}) adherenceSeries returned ${week.plannedSoFar}. The stated third element ` +
              "is not being honoured, so the fixture's hazard row follows the weekday instead."
          ).toBe(stated);
        }
      });
    }
  }

  /**
   * AC2's last clause: without a stated value, the current week is derived from the date.
   * The expected values are written out, not recomputed from the formula.
   */
  test("AC2: a last tuple with no stated value derives plannedSoFar from the date, every weekday", () => {
    const derived = (tuple: WeekSpec) =>
      WEEK.map(({ date }) => {
        const values = instantsOf(date).map((now) => currentWeekOf(tuple, now).plannedSoFar);
        expect(new Set(values).size, `plannedSoFar changed within the UTC day ${date}: ${values}`).toBe(1);
        return values[0];
      });
    //                         Mon Tue Wed Thu Fri Sat Sun
    expect(derived([3, 4])).toEqual([0, 1, 2, 3, 4, 4, 4]);
    expect(derived([1, 3])).toEqual([0, 1, 2, 3, 3, 3, 3]);
  });

  /**
   * AC3's measurement, held: the weekday on which each stated tuple equals what the same
   * tuple without its third element derives. The two lists must not overlap.
   */
  test("AC3: Lina's and Ines's stated values coincide with the derived one on different weekdays", () => {
    const coinciding = ({ tuple, stated }: (typeof STATED)[number]) =>
      WEEK.filter(({ date }) =>
        instantsOf(date).every((now) => currentWeekOf([tuple[0], tuple[1]], now).plannedSoFar === stated)
      ).map(({ name }) => name);
    const lina = coinciding(STATED[0]);
    const ines = coinciding(STATED[1]);
    expect(lina, "Lina [3, 4, 2]: the weekday her stated 2 equals the derived value").toEqual(["Wednesday"]);
    expect(ines, "Ines [1, 3, 0]: the weekday her stated 0 equals the derived value").toEqual(["Monday"]);
    expect(
      lina.filter((day) => ines.includes(day)),
      "the two stated tuples coincide with the derived value on the same weekday, so on that " +
        "day a function ignoring the override returns the right number for both"
    ).toEqual([]);
  });

  /** The third element is honoured only on the last tuple (the `WeekSpec` comment says so). */
  test("a stated third element on an earlier week is ignored: that week's plannedSoFar is planned", () => {
    const series = adherenceSeries(
      [[1, 3, 0], [2, 3], [2, 3], [2, 3], [2, 3], [2, 3], [2, 3], [2, 3]],
      new Date("2026-09-23T12:00:00.000Z")
    );
    expect(series.weeks[0].partial).toBe(false);
    expect(series.weeks[0].plannedSoFar).toBe(3);
  });

  /** `weekCommencing` follows the date passed, so a caller setting the day gets that week. */
  test("weekCommencing follows the date passed, not the real clock", () => {
    for (const { date } of [WEEK[0], WEEK[6]]) {
      for (const now of instantsOf(date)) {
        const weeks = adherenceSeries([null, null, null, null, null, null, null, [1, 3]], now).weeks;
        expect(weeks.map((w) => w.weekCommencing)).toEqual([
          "2026-08-03",
          "2026-08-10",
          "2026-08-17",
          "2026-08-24",
          "2026-08-31",
          "2026-09-07",
          "2026-09-14",
          "2026-09-21",
        ]);
      }
    }
  });
});
