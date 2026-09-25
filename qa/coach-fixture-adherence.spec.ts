import { expect } from "@playwright/test";
import { test } from "./fixture-test";
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
 * **The day is the UTC day, and three time zones are run.** Each weekday is called at
 * its first and last UTC millisecond and at noon. Every test runs its body once per zone
 * in `ZONES` (UTC, UTC+14, UTC−11), set on `process.env.TZ` inside the test and restored
 * after it, and each zone's offset is checked before its pass runs. Zones are run because
 * in UTC a local-time call (`getDay` where `getUTCDay` belongs) returns the same as its
 * UTC form. Measured at EV-249's review: `now.getDay()` in the
 * derivation is red in both non-UTC zones; `getDay()` in `mondayOfWeeksAgo` is red only
 * in the negative-offset one.
 *
 * **The process clock does not enter.** Every call passes its own `now`. Seven runs with
 * the process clock faked to each weekday gave the same result, which is one result
 * repeated, not seven measurements.
 *
 * ── Two findings recorded at EV-249 ─────────────────────────────────────────
 *
 *   · **Before this file, the derivation had no test.** With the derivation broken and
 *     the override intact (`Math.min(planned, elapsedThisWeek + 1)`, planted by EV-249),
 *     only this file went red: the rest of the default suite passed on a real Wednesday
 *     and with the server clock moved to a Monday. Outside comments, `plannedSoFar`
 *     appears in `src/` as the wire type's field and in the fixture that produces it; no
 *     component reads it, and the bar is drawn from `done / planned`
 *     (`src/components/client/AdherenceSeries.tsx`). So for a world with no stated value,
 *     a day-to-day change in its current week happens in a field no page prints, and
 *     this file is where that field is read. (EV-217's AC3c, a page-level weekday check,
 *     was withdrawn for exactly this reason: no page shows this field.)
 *
 *   · **A client import of `fixtureAdherence` ships the function, not the worlds.**
 *     `staff-engineer`, reviewing EV-249, planted `import { adherenceSeries }` in a
 *     `"use client"` file: the build passed, `plannedSoFar` appeared in a client chunk,
 *     and 0 of 17 world UUIDs and 0 of 11 trainee names did. Importing `fixtureCoachApi`
 *     into the same file failed the build. The worlds are in `coachApi.fixture.ts`,
 *     behind `server-only`. That is the evidence for keeping no client-chunk grep in
 *     this suite (the story's edge case 2); a new import of the fixture from client code
 *     is a build error, and a new value added to `fixtureAdherence.ts` is not covered by
 *     that and would need the grep rerun.
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

/**
 * The process time zones each test runs in, with the `getTimezoneOffset()` each gives on
 * 2026-09-21 (neither observes daylight saving). The offset is asserted before the pass,
 * so a zone that did not take effect fails instead of rerunning UTC under another name.
 */
const ZONES = [
  { tz: "UTC", offset: 0 },
  { tz: "Pacific/Kiritimati", offset: -840 }, // UTC+14
  { tz: "Pacific/Pago_Pago", offset: 660 }, // UTC−11
] as const;

/** Run `body` once per zone in `ZONES`, then put `process.env.TZ` back as it was. */
function inEachZone(body: (tz: string) => void): void {
  const original = process.env.TZ;
  try {
    for (const { tz, offset } of ZONES) {
      process.env.TZ = tz;
      expect(
        new Date("2026-09-21T00:00:00.000Z").getTimezoneOffset(),
        `process.env.TZ = "${tz}" did not take effect in this process`
      ).toBe(offset);
      body(tz);
    }
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
}

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
        inEachZone((tz) => {
          for (const now of instantsOf(date)) {
            const week = currentWeekOf(tuple, now);
            expect(week.partial, `the last week is not the current week at ${now.toISOString()} (TZ=${tz})`).toBe(
              true
            );
            expect(
              week.plannedSoFar,
              `${who}'s current week states plannedSoFar = ${stated}, and at ${now.toISOString()} ` +
                `(a ${name}, TZ=${tz}) adherenceSeries returned ${week.plannedSoFar}. The stated third ` +
                "element is not being honoured, so the fixture's hazard row follows the weekday instead."
            ).toBe(stated);
          }
        });
      });
    }
  }

  /**
   * AC2's last clause: without a stated value, the current week is derived from the date.
   * The expected values are written out, not recomputed from the formula.
   */
  test("AC2: a last tuple with no stated value derives plannedSoFar from the date, every weekday", () => {
    inEachZone((tz) => {
      const derived = (tuple: WeekSpec) =>
        WEEK.map(({ date }) => {
          const values = instantsOf(date).map((now) => currentWeekOf(tuple, now).plannedSoFar);
          expect(new Set(values).size, `plannedSoFar changed within the UTC day ${date} (TZ=${tz}): ${values}`).toBe(
            1
          );
          return values[0];
        });
      //                                               Mon Tue Wed Thu Fri Sat Sun
      expect(derived([3, 4]), `[3, 4], TZ=${tz}`).toEqual([0, 1, 2, 3, 4, 4, 4]);
      expect(derived([1, 3]), `[1, 3], TZ=${tz}`).toEqual([0, 1, 2, 3, 3, 3, 3]);
    });
  });

  /**
   * AC3's measurement, held: the weekday on which each stated tuple equals what the same
   * tuple without its third element derives. The two lists must not overlap.
   */
  test("AC3: Lina's and Ines's stated values coincide with the derived one on different weekdays", () => {
    inEachZone((tz) => {
      const coinciding = ({ tuple, stated }: (typeof STATED)[number]) =>
        WEEK.filter(({ date }) =>
          instantsOf(date).every((now) => currentWeekOf([tuple[0], tuple[1]], now).plannedSoFar === stated)
        ).map(({ name }) => name);
      const lina = coinciding(STATED[0]);
      const ines = coinciding(STATED[1]);
      expect(lina, `Lina [3, 4, 2]: the weekday her stated 2 equals the derived value (TZ=${tz})`).toEqual([
        "Wednesday",
      ]);
      expect(ines, `Ines [1, 3, 0]: the weekday her stated 0 equals the derived value (TZ=${tz})`).toEqual([
        "Monday",
      ]);
      expect(
        lina.filter((day) => ines.includes(day)),
        "the two stated tuples coincide with the derived value on the same weekday, so on that " +
          `day a function ignoring the override returns the right number for both (TZ=${tz})`
      ).toEqual([]);
    });
  });

  /** The third element is honoured only on the last tuple (the `WeekSpec` comment says so). */
  test("a stated third element on an earlier week is ignored: that week's plannedSoFar is planned", () => {
    inEachZone((tz) => {
      const series = adherenceSeries(
        [[1, 3, 0], [2, 3], [2, 3], [2, 3], [2, 3], [2, 3], [2, 3], [2, 3]],
        new Date("2026-09-23T12:00:00.000Z")
      );
      expect(series.weeks[0].partial, `TZ=${tz}`).toBe(false);
      expect(series.weeks[0].plannedSoFar, `TZ=${tz}`).toBe(3);
    });
  });

  /** `weekCommencing` follows the date passed, so a caller setting the day gets that week. */
  test("weekCommencing follows the date passed, not the real clock", () => {
    inEachZone((tz) => {
      for (const { date } of [WEEK[0], WEEK[6]]) {
        for (const now of instantsOf(date)) {
          const weeks = adherenceSeries([null, null, null, null, null, null, null, [1, 3]], now).weeks;
          expect(
            weeks.map((w) => w.weekCommencing),
            `weekCommencing at ${now.toISOString()} (TZ=${tz})`
          ).toEqual([
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
});
