import { expect } from "@playwright/test";
import { test } from "./fixture-test";
import type { RosterClient } from "../src/lib/coachApi";
import { fr } from "../src/lib/copy.fr";
import {
  classifyRosterRow,
  dayFromParts,
  dayIn,
  dayMinus,
  daysBetween,
  matchesSearch,
  passesFilter,
  searchKey,
} from "../src/lib/rosterView";

/**
 * EV-337d — the roster's classifier, with "today" STATED (`src/lib/rosterView.ts`).
 *
 * A page test runs on the real day and the browser clock never reaches the server, so the
 * day boundary is pinned here, where the day is an argument. The rendered half of the same
 * boundary (the fixture's 6/7/8-day rows) is `qa/pro-roster.spec.ts`.
 *
 * Pure: it never calls the dev server. It imports `./fixture-test` only so the fixture
 * isolation guard needs no exemption.
 */

const ALL = ["WORKOUTS", "PROGRESS", "NUTRITION", "WEIGH_INS"] as RosterClient["scopes"];

function row(over: Partial<RosterClient>): RosterClient {
  return {
    id: "r",
    traineeDisplayName: "Test C.",
    scopes: ALL,
    currentPlanName: "Plan",
    lastCompletedWorkoutDate: null,
    currentStreakDays: 0,
    redFlagCount: 0,
    status: "ACTIVE",
    since: "2026-09-01T00:00:00Z",
    ...over,
  };
}

const TODAY = "2026-10-02";

test("R6: 6 and 7 days are not inactive, 8 is (D1's boundary, both sides)", () => {
  const at = (days: number) => classifyRosterRow(row({ lastCompletedWorkoutDate: dayMinus(TODAY, days) }), TODAY);
  expect(at(6)).toMatchObject({ group: "onTrack", inactive: false, status: { kind: "upToDate" }, daysSinceLastWorkout: 6 });
  expect(at(7)).toMatchObject({ group: "onTrack", inactive: false, status: { kind: "upToDate" }, daysSinceLastWorkout: 7 });
  expect(at(8)).toMatchObject({ group: "inactive", inactive: true, status: { kind: "inactive", days: 8 } });
  expect(at(31)).toMatchObject({ group: "inactive", status: { kind: "inactive", days: 31 } });
  expect(at(0)).toMatchObject({ group: "onTrack", daysSinceLastWorkout: 0 });
});

test("a client who does not share PROGRESS is never inactive, whatever the date says", () => {
  // An api that predates ADR-0015 F1 can still send a date without `scopes`.
  const legacy = classifyRosterRow(
    row({ scopes: undefined as unknown as RosterClient["scopes"], lastCompletedWorkoutDate: dayMinus(TODAY, 30), redFlagCount: undefined as unknown as null }),
    TODAY
  );
  expect(legacy).toMatchObject({ group: "other", inactive: false, status: { kind: "activityNotShared" } });
  const workoutsOnly = classifyRosterRow(row({ scopes: ["WORKOUTS"], lastCompletedWorkoutDate: null }), TODAY);
  expect(workoutsOnly).toMatchObject({ group: "other", inactive: false, status: { kind: "activityNotShared" } });
});

test("flags: a count above zero is « to review », 0 is evaluated, null is never good news", () => {
  expect(classifyRosterRow(row({ redFlagCount: 2, lastCompletedWorkoutDate: dayMinus(TODAY, 1) }), TODAY)).toMatchObject({
    group: "attention",
    flagged: true,
    status: { kind: "flags", count: 2 },
  });
  // Flagged AND inactive: one row, in « to review », still carrying R6's fact.
  expect(classifyRosterRow(row({ redFlagCount: 1, lastCompletedWorkoutDate: dayMinus(TODAY, 9) }), TODAY)).toMatchObject({
    group: "attention",
    inactive: true,
    daysSinceLastWorkout: 9,
  });
  // PROGRESS shared, a recent session, but no rule could run: not "on track".
  expect(
    classifyRosterRow(row({ scopes: ["PROGRESS"], redFlagCount: null, lastCompletedWorkoutDate: dayMinus(TODAY, 2) }), TODAY)
  ).toMatchObject({ group: "other", status: { kind: "flagsNotShared" } });
  // PROGRESS shared, never trained: a fact, and not "on track" either.
  expect(classifyRosterRow(row({ lastCompletedWorkoutDate: null }), TODAY)).toMatchObject({
    group: "other",
    status: { kind: "noWorkout" },
  });
});

test("a date after today (a clock disagreement) reads 0 days, never negative", () => {
  expect(classifyRosterRow(row({ lastCompletedWorkoutDate: "2026-10-03" }), TODAY).daysSinceLastWorkout).toBe(0);
});

test("today is Paris's day, not UTC's: the hour after Paris midnight", () => {
  // 2026-10-02 22:30 UTC is 2026-10-03 00:30 in Paris (CEST, UTC+2).
  expect(dayIn(new Date("2026-10-02T22:30:00Z"))).toBe("2026-10-03");
  expect(dayIn(new Date("2026-10-02T21:59:00Z"))).toBe("2026-10-02");
  // Winter time (CET, UTC+1).
  expect(dayIn(new Date("2026-12-31T23:30:00Z"))).toBe("2027-01-01");
  // So a session on the UTC day 2026-09-25 is 8 Paris days old at 00:30 on 3 Oct.
  expect(daysBetween("2026-09-25", dayIn(new Date("2026-10-02T22:30:00Z")))).toBe(8);
  expect(daysBetween("2026-09-25", dayIn(new Date("2026-10-02T21:59:00Z")))).toBe(7);
});

test("dayIn is built from parts and refuses a zone it cannot read (staff S4)", () => {
  expect(dayIn(new Date("2026-03-05T12:00:00Z"))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(dayIn(new Date("2026-03-05T12:00:00Z"), "UTC")).toBe("2026-03-05");
  expect(() => dayIn(new Date("2026-03-05T12:00:00Z"), "Not/AZone")).toThrow();
  expect(() => dayIn(new Date(Number.NaN))).toThrow();
  // The refusal itself: parts that do not spell a day (a formatter that drops the year, or
  // writes the month as a word) throw rather than reach `daysBetween` as garbage.
  const p = (type: Intl.DateTimeFormatPartTypes, value: string) => ({ type, value });
  expect(dayFromParts([p("year", "2026"), p("month", "03"), p("day", "05")], "Europe/Paris")).toBe("2026-03-05");
  expect(() => dayFromParts([p("month", "03"), p("day", "05")], "Europe/Paris")).toThrow(/not a day/);
  expect(() => dayFromParts([p("year", "2026"), p("month", "Mar"), p("day", "05")], "Europe/Paris")).toThrow(/not a day/);
});

test("daysBetween / dayMinus agree across a month and a DST change", () => {
  expect(dayMinus("2026-10-02", 8)).toBe("2026-09-24");
  expect(daysBetween("2026-10-20", "2026-10-28")).toBe(8); // CEST → CET on 25 Oct
  expect(daysBetween("not-a-date", "2026-10-02")).toBeNull();
});

test("filters read the row's facts; search is case- and accent-insensitive", () => {
  const flaggedInactive = { flagged: true, inactive: true };
  expect(passesFilter(flaggedInactive, "flagged")).toBe(true);
  expect(passesFilter(flaggedInactive, "inactive")).toBe(true);
  expect(passesFilter({ flagged: false, inactive: false }, "flagged")).toBe(false);
  expect(passesFilter({ flagged: false, inactive: false }, "all")).toBe(true);

  const hay = searchKey("Inès Moreau  Push Pull Legs");
  expect(matchesSearch(hay, "ines")).toBe(true);
  expect(matchesSearch(hay, "  INÈS ")).toBe(true);
  expect(matchesSearch(hay, "pull legs")).toBe(true);
  expect(matchesSearch(hay, "lina")).toBe(false);
  expect(matchesSearch(hay, "")).toBe(true);
});

/**
 * D6 (PO ruling 3, 2026-10-02): a red flag is « alerte » in French. No UI string in
 * `copy.fr.ts` says « signalement » — it reads as something the client reported, which these
 * flags are not. Code comments do not count, so the DICTIONARY is read, not the file: every
 * string, and every template's output (called with a number and with a word, so both kinds
 * of argument are exercised).
 */
test("D6: no French UI string contains « signalement »", () => {
  const seen: string[] = [];
  const walk = (value: unknown, path: string) => {
    if (typeof value === "string") seen.push(`${path}=${value}`);
    else if (typeof value === "function") {
      const fn = value as (...a: unknown[]) => unknown;
      for (const arg of [2, "Qz"]) {
        try {
          const out = fn(...Array.from({ length: Math.max(1, fn.length) }, () => arg));
          if (typeof out === "string") seen.push(`${path}(${arg})=${out}`);
        } catch {
          // a template that needs a richer argument; its words are covered by the other call
        }
      }
    } else if (value !== null && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) walk(v, path ? `${path}.${k}` : k);
    }
  };
  walk(fr, "");
  expect(seen.length, "the walk read the French dictionary").toBeGreaterThan(500);
  expect(seen.some((s) => s.startsWith("roster.flags(2)=2 alertes")), "and reached the roster's flag word").toBe(true);
  expect(seen.filter((s) => /signalement/i.test(s.slice(s.indexOf("=") + 1)))).toEqual([]);
});
