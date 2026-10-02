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
import { en } from "../src/lib/copy";
import { fr } from "../src/lib/copy.fr";

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
    pastEnd: 3,
    beforeStart: 0,
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
    pastEnd: 2,
    beforeStart: 0,
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
    pastEnd: 0,
    beforeStart: 1,
  });
  // Only New York: nothing to count, so the page draws no today card at all.
  expect(view.todayStats(detail([newYork])).accepted).toBe(0);
  expect(view.showTodayCards(detail([newYork]))).toBe(false);
  expect(view.showTodayCards(detail([newYork, utcNoData]))).toBe(true);
});

test("todayInWindow is the one question the row and the stat cards both ask", () => {
  expect(typeof view.todayInWindow).toBe("function");
  const c = challenge();
  expect(view.todayInWindow(progress(START, null, false), c)).toBe(true);
  expect(view.todayInWindow(progress(END, 1, true), c)).toBe(true);
  expect(view.todayInWindow(progress("2026-09-28", null, false), c)).toBe(false);
  expect(view.todayInWindow(progress("2026-10-06", null, true), c)).toBe(false);
});

test("the today cards are drawn only when someone's own today is in the window", () => {
  expect(typeof view.showTodayCards).toBe("function");
  const paris = ["a", "b", "c"].map((id) => accepted(id, progress("2026-10-06", null, true)));
  // The last evening: every trainee is past the end — no « 0 / 0 » card.
  expect(view.showTodayCards(detail(paris))).toBe(false);
  // Mixed zones: one trainee is still on the last day.
  expect(view.showTodayCards(detail([accepted("utc", progress(END, 10_400, true)), ...paris]))).toBe(true);
  // Not ACTIVE, or not STEPS: never, whoever is in the window.
  const mid = [accepted("utc", progress("2026-10-02", 9_000, true))];
  expect(view.showTodayCards({ challenge: { ...challenge(), phase: "ENDED" }, participants: mid })).toBe(false);
  expect(view.showTodayCards({ challenge: { ...challenge(), metric: "WORKOUTS" }, participants: mid })).toBe(false);
  expect(view.showTodayCards(detail(mid))).toBe(true);
});

/**
 * QA PB-1 on 6269343 — the row's today cell followed only the trainee's own today, while
 * the page head follows the api's UTC phase. Witnessed live: under « Commence demain » a
 * Tokyo trainee already on his day 1 read « Aujourd'hui 5 000 / 10 000 pas », « Jours réussis
 * 0 sur 1 » and « 1er »; under « Terminé » a Los Angeles trainee still on the last day read
 * « 6 000 / 5 000 pas » and a no-zone trainee « Aucune donnée aujourd'hui ». One predicate
 * now decides for the row and the cards, and it asks the phase too.
 */
test("PB-1: on an UPCOMING or ENDED challenge nobody has a today, whatever their own calendar says", () => {
  expect(typeof view.participantRowView).toBe("function");
  const upcoming = { ...challenge(), phase: "UPCOMING" as const };
  const ended = { ...challenge(), phase: "ENDED" as const };
  // Tokyo, already on day 1 of a challenge the head says starts tomorrow.
  const tokyo = progress(START, 5_000, true);
  expect(tokyo.daysElapsed).toBe(1);
  expect(view.todayInWindow(tokyo, upcoming)).toBe(false);
  expect(view.participantRowView(tokyo, upcoming)).toMatchObject({ today: false, rank: false, counts: false });
  // Los Angeles, still on the last day of a challenge the head says has ended: no today,
  // but the final standings stand (days met, total, rank).
  const la = progress(END, 6_000, true);
  expect(view.todayInWindow(la, ended)).toBe(false);
  expect(view.participantRowView(la, ended)).toMatchObject({ today: false, rank: true, counts: true });
  // No stored zone (UTC−12), still on the last day with nothing for it: not « no data today ».
  const noZone = progress(END, null, false);
  expect(view.participantRowView(noZone, ended)).toMatchObject({ today: false });
  // ACTIVE and in the window: everything, as before.
  expect(view.participantRowView(progress("2026-10-02", 9_000, true), challenge())).toMatchObject({
    today: true,
    rank: true,
    counts: true,
  });
  // ACTIVE, but a trainee west of UTC still before the start: no today, nothing counted —
  // and, since ruling 13 (N6), no rank either (see the N6 test below).
  expect(view.participantRowView(progress("2026-09-28", null, false), challenge())).toMatchObject({
    today: false,
    rank: false,
    counts: false,
  });
});

test("PB-1: the today cards count nobody on an UPCOMING or ENDED challenge either", () => {
  const tokyo = accepted("tokyo", progress(START, 12_000, true));
  const la = accepted("la", progress(END, 6_000, true));
  expect(view.todayStats({ challenge: { ...challenge(), phase: "UPCOMING" }, participants: [tokyo] }).accepted).toBe(0);
  expect(view.todayStats({ challenge: { ...challenge(), phase: "ENDED" }, participants: [la] }).accepted).toBe(0);
  expect(view.todayStats(detail([tokyo, la])).accepted).toBe(2);
});

test("ownDay places a trainee's own today against the window's dates", () => {
  expect(typeof view.ownDay).toBe("function");
  const c = challenge();
  expect(view.ownDay(progress("2026-09-28", null, false), c)).toBe("BEFORE_START");
  expect(view.ownDay(progress(START, null, false), c)).toBe("IN_WINDOW");
  expect(view.ownDay(progress(END, null, false), c)).toBe("IN_WINDOW");
  expect(view.ownDay(progress("2026-10-06", null, true), c)).toBe("PAST_END");
});

/**
 * QA PB-2 on 6269343 — an accepted participant who never synced read « Total 0 pas » on day
 * 4, beside « Rien de synchronisé pour l'instant ». The api's `total` is a `long` (never
 * null): the sum of the stored rows up to the trainee's today, 0 when there are none, and
 * `syncedAt` is null exactly then (`ChallengeProgressCalculator.steps`). So that 0 is "nothing
 * synced", not zero steps, and the row shows no total. A synced 0 is a real zero.
 */
test("PB-2: no total while nothing is synced; a synced zero and a WORKOUTS zero are real", () => {
  expect(typeof view.participantRowView).toBe("function");
  const neverSynced = progress("2026-10-02", null, false);
  expect(neverSynced).toMatchObject({ daysElapsed: 4, total: 0, syncedAt: null });
  expect(view.participantRowView(neverSynced, challenge())).toEqual({ today: true, rank: true, counts: true, total: false });
  // Same on an ENDED challenge: final standings, but still no invented total.
  expect(view.participantRowView(neverSynced, { ...challenge(), phase: "ENDED" })).toMatchObject({
    counts: true,
    total: false,
  });
  // A day synced at 0 steps (a manual entry of 0): the 0 is the trainee's, so it is shown.
  const syncedZero = { ...neverSynced, syncedAt: "2026-09-29T20:30:00Z" };
  expect(view.participantRowView(syncedZero, challenge())).toMatchObject({ total: true });
  // Before the first day nothing is counted, synced or not.
  expect(view.participantRowView(progress("2026-09-28", null, false), challenge())).toMatchObject({ total: false });
  // WORKOUTS: `syncedAt` is always null and 0 sessions is a fact, so the total stays.
  const workouts = { ...neverSynced, daysMet: null, days: null, target: 12 };
  expect(view.participantRowView(workouts, { ...challenge(), metric: "WORKOUTS" })).toMatchObject({ total: true });
});

/**
 * Ruling 8 (EV-337n N1) — the met card counts only the trainees whose own today is in the
 * window, so its foot says who is outside that count: « N sans donnée aujourd'hui », then
 * « N déjà après le dernier jour », then « N pas encore au premier jour », joined by « · »,
 * a part whose N is 0 left out.
 */
test("N1: the met card's foot names who is outside its count, in the ruling's order and words", () => {
  expect(typeof view.metCardFoot).toBe("function");
  const words = { en: en.challenges.stats, fr: fr.challenges.stats };
  const foot = (participants: CoachChallengeParticipant[], lang: "en" | "fr") =>
    view.metCardFoot(view.todayStats(detail(participants)), words[lang]);
  const pastEnd = ["a", "b"].map((id) => accepted(id, progress("2026-10-06", null, true)));

  // The last evening: one trainee still on the last day (met), two already past it.
  const met = [accepted("utc", progress(END, 10_400, true)), ...pastEnd];
  expect(view.todayStats(detail(met))).toMatchObject({ accepted: 1, metToday: 1, pastEnd: 2, beforeStart: 0 });
  expect(foot(met, "fr")).toBe("2 déjà après le dernier jour");
  expect(foot(met, "en")).toBe("2 already past the last day");

  // The same, but the one in the window has no number today: the existing part comes first.
  const noData = [accepted("utc", progress(END, null, false)), ...pastEnd];
  expect(foot(noData, "fr")).toBe("1 sans donnée aujourd'hui · 2 déjà après le dernier jour");
  expect(foot(noData, "en")).toBe("1 with no data today · 2 already past the last day");

  // The first morning's mirror: one trainee west of UTC is still the day before the start.
  const morning = [
    accepted("ny", progress("2026-09-28", null, false)),
    ...["c", "d"].map((id) => accepted(id, progress(START, 10_500, true))),
  ];
  expect(view.todayStats(detail(morning))).toMatchObject({ accepted: 2, metToday: 2, beforeStart: 1, pastEnd: 0 });
  expect(foot(morning, "fr")).toBe("1 pas encore au premier jour");
  expect(foot(morning, "en")).toBe("1 not yet at the first day");

  // All three parts, in order.
  expect(
    view.metCardFoot({ withoutData: 1, pastEnd: 2, beforeStart: 3 }, words.fr)
  ).toBe("1 sans donnée aujourd'hui · 2 déjà après le dernier jour · 3 pas encore au premier jour");

  // Everyone in the window and with a number: no foot at all.
  const everyone = ["e", "f"].map((id) => accepted(id, progress("2026-10-02", 10_100, true)));
  expect(foot(everyone, "fr")).toBeUndefined();
  // Not ACTIVE: nobody has a today, so nobody is "outside" it either.
  expect(
    view.todayStats({ challenge: { ...challenge(), phase: "ENDED" }, participants: pastEnd })
  ).toMatchObject({ accepted: 0, pastEnd: 0, beforeStart: 0 });
});

/**
 * Ruling 13 (EV-337n N6) — on an ACTIVE challenge's first morning, a trainee whose own day 1
 * has not begun (west of UTC, or no stored zone before 12:00 UTC) shows no days met and no
 * total: the api's zeros are not a result. The api still ranks him, last, in a tie over those
 * same zeros, so the rank label goes too. The rank follows the counts, nothing else.
 */
test("N6: a row that shows no counts shows no rank; every counted row keeps its rank", () => {
  const c = challenge();
  const firstMorningWest = progress("2026-09-28", null, false);
  expect(firstMorningWest.daysElapsed).toBe(0);
  expect(view.participantRowView(firstMorningWest, c)).toEqual({ today: false, rank: false, counts: false, total: false });
  // On his day 1 (counted, nothing synced yet): ranked, like every counted row.
  expect(view.participantRowView(progress(START, null, false), c)).toMatchObject({ rank: true, counts: true });
  expect(view.participantRowView(progress(START, 10_500, true), c)).toMatchObject({ rank: true, counts: true });
  // ENDED keeps the final standings; UPCOMING shows no rank at all (as built).
  expect(view.participantRowView(progress(END, 6_000, true), { ...c, phase: "ENDED" })).toMatchObject({ rank: true });
  expect(view.participantRowView(progress(START, 5_000, true), { ...c, phase: "UPCOMING" })).toMatchObject({ rank: false });
  // The rule is exactly "rank follows counts", over every shape above.
  for (const [p, phase] of [
    [firstMorningWest, "ACTIVE"],
    [progress(START, null, false), "ACTIVE"],
    [progress(END, 6_000, true), "ENDED"],
    [progress(START, 5_000, true), "UPCOMING"],
    [progress("2026-10-06", null, true), "ACTIVE"],
  ] as const) {
    const v = view.participantRowView(p, { ...c, phase });
    expect(v.rank, `${phase} ${p.today}`).toBe(v.counts);
  }
});
