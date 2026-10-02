import { expect } from "@playwright/test";
import { test } from "./fixture-test";
import type {
  ChallengeDay,
  ChallengeProgress,
  CoachChallengeDetail,
  CoachChallengeParticipant,
  CoachChallengeSummary,
} from "../src/lib/coachApi";
import * as view from "../src/lib/challengeView";

/**
 * EV-337h, staff blocker on 55d2126 — the "today" stat cards counted every accepted
 * participant while the challenge's UTC phase was ACTIVE, even when a trainee's OWN today
 * (their zone, as the api computes it) was outside the window and `todayValue` was null for
 * that reason. At 22:30 UTC on `endsOn` (00:30 in Paris) three Paris trainees who met all
 * seven days read « Objectif atteint aujourd'hui 0 / 3 · 3 sans donnée aujourd'hui ».
 *
 * The fixture seeds its challenges mid-window, so no page spec reaches the last evening or
 * the first morning: the boundary is pinned here, on constructed api shapes.
 *
 * Pure: it never calls the dev server. It imports `./fixture-test` only so the fixture
 * isolation guard needs no exemption. `view.*` (not named imports) so a missing export
 * fails its own test rather than the whole file.
 */

const START = "2026-09-29";
const END = "2026-10-05";
const WINDOW = ["2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05"];

function challenge(): CoachChallengeSummary {
  return {
    id: "c0000000-0000-4000-8000-000000000001",
    title: "Sept jours",
    metric: "STEPS",
    dailyTarget: 10_000,
    totalTarget: null,
    startsOn: START,
    endsOn: END,
    days: 7,
    phase: "ACTIVE",
    participantCount: 3,
    acceptedCount: 3,
    createdAt: "2026-09-20T10:00:00Z",
  };
}

/** A trainee whose own today is `today`, as the api's calculator would serve it. */
function progress(today: string, todayValue: number | null, metEveryDay: boolean): ChallengeProgress {
  const days: ChallengeDay[] = WINDOW.map((day) => {
    if (day > today) return { day, value: null, source: null, status: "FUTURE" };
    if (!metEveryDay) return { day, value: null, source: null, status: "NO_DATA" };
    const value = day === today && todayValue !== null ? todayValue : 11_000;
    return { day, value, source: "HEALTH_CONNECT", status: "MET" };
  });
  const elapsed = days.filter((d) => d.status !== "FUTURE").length;
  return {
    today,
    // Outside the window the api nulls today's value whatever the trainee sent.
    todayValue: today < START || today > END ? null : todayValue,
    todaySource: today < START || today > END || todayValue === null ? null : "HEALTH_CONNECT",
    daysElapsed: elapsed,
    daysMet: metEveryDay ? elapsed : 0,
    total: metEveryDay ? elapsed * 11_000 : 0,
    target: 10_000,
    syncedAt: metEveryDay ? "2026-10-05T20:00:00Z" : null,
    days,
  };
}

function accepted(id: string, p: ChallengeProgress): CoachChallengeParticipant {
  return {
    clientId: id,
    displayName: id,
    status: "ACCEPTED",
    invitedAt: "2026-09-20T10:00:00Z",
    acceptedAt: "2026-09-21T10:00:00Z",
    rank: 1,
    progress: p,
  };
}

const detail = (participants: CoachChallengeParticipant[]): CoachChallengeDetail => ({
  challenge: challenge(),
  participants,
});

test("the last evening: 22:30 UTC on endsOn, three Paris trainees already on the day after — no today to count", () => {
  const now = Date.parse(`${END}T22:30:00Z`);
  // The api's phase and the window position still say the last day…
  expect(view.windowPosition(challenge(), now)).toMatchObject({ phase: "ACTIVE", day: 7 });
  // …but each trainee's own today (Paris, 00:30) is past the end.
  const paris = ["a", "b", "c"].map((id) => accepted(id, progress("2026-10-06", null, true)));
  expect(view.todayStats(detail(paris))).toEqual({
    accepted: 0,
    metToday: 0,
    withData: 0,
    withoutData: 0,
    average: null,
  });
});

test("the last evening, mixed zones: only the trainee still on the last day is counted", () => {
  const london = accepted("utc", progress(END, 10_400, true));
  const paris = ["a", "b"].map((id) => accepted(id, progress("2026-10-06", null, true)));
  expect(view.todayStats(detail([london, ...paris]))).toEqual({
    accepted: 1,
    metToday: 1,
    withData: 1,
    withoutData: 0,
    average: 10_400,
  });
});

test("the first morning: a trainee west of UTC is still the day before the start — not « no data today »", () => {
  const now = Date.parse(`${START}T03:00:00Z`);
  expect(view.windowPosition(challenge(), now)).toMatchObject({ phase: "ACTIVE", day: 1 });
  const newYork = accepted("ny", progress("2026-09-28", null, false));
  const utcNoData = accepted("utc", progress(START, null, false));
  // New York has no challenge day yet; the UTC trainee does, and sent nothing: that one IS
  // « 1 sans donnée aujourd'hui ».
  expect(view.todayStats(detail([newYork, utcNoData]))).toEqual({
    accepted: 1,
    metToday: 0,
    withData: 0,
    withoutData: 1,
    average: null,
  });
  // Only New York: nothing to count, so the page draws no today card at all.
  expect(view.todayStats(detail([newYork])).accepted).toBe(0);
});

test("todayInWindow is the one question the row and the stat cards both ask", () => {
  expect(typeof view.todayInWindow).toBe("function");
  const c = challenge();
  expect(view.todayInWindow(progress(START, null, false), c)).toBe(true);
  expect(view.todayInWindow(progress(END, 1, true), c)).toBe(true);
  expect(view.todayInWindow(progress("2026-09-28", null, false), c)).toBe(false);
  expect(view.todayInWindow(progress("2026-10-06", null, true), c)).toBe(false);
});
