import type { ChallengeProgress, CoachChallengeDetail, CoachChallengeSummary } from "@/lib/coachApi";
import type { Copy } from "@/lib/copy";
import { formatShortDate } from "@/lib/format";

/**
 * EV-337h — what the redesigned challenge screens derive from the api's numbers, in one
 * pure place (no runtime import of `coachApi`, which is `server-only`).
 *
 * Nothing here invents a value. Each figure is either read from the api or counted from
 * what it returned, and a figure with nothing behind it is `null`, which the screen names
 * (« Aucune donnée aujourd'hui »), never `0`.
 *
 * **Whose calendar.** The window position (« Jour 5 sur 7 ») is counted on the UTC date,
 * because that is the calendar the api's own `phase` is computed on (`ChallengePhase`,
 * "computed on the server's UTC date for coach reads"). Counting it on another clock could
 * print « Jour 8 sur 7 » beside « Actif ». So the result is clamped to what the phase allows.
 * The START is never counted (ruling 14): it is printed as a date, true on every calendar. The per-participant "today" figures use each trainee's OWN today
 * (`ChallengeProgress.today`), as the api computed it.
 */

/** `YYYY-MM-DD` of an instant, in UTC. */
export function utcDay(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

function dayNumber(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  return Math.round(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000);
}

/**
 * Where the window stands today, by phase. `null` when the dates cannot be read.
 *
 * UPCOMING carries the start as a DATE, not a count of days (ruling 14, `BUG-681`): the api's
 * phase is UTC while a coach's day is his own, so from 00:00 to 02:00 CEST a challenge
 * created for « today » read « Commence demain ». The server does not know the coach's zone,
 * and a count made in the browser would disagree with the pill beside it.
 */
export type WindowPosition =
  | { phase: "ACTIVE"; day: number; days: number; endsOn: string }
  | { phase: "UPCOMING"; days: number; startsOn: string; endsOn: string }
  | { phase: "ENDED"; days: number; endsOn: string };

export function windowPosition(c: CoachChallengeSummary, nowMs: number): WindowPosition | null {
  const today = dayNumber(utcDay(nowMs));
  const start = dayNumber(c.startsOn);
  const end = dayNumber(c.endsOn);
  if (today === null || start === null || end === null || c.days < 1) return null;
  switch (c.phase) {
    case "ACTIVE":
      return { phase: "ACTIVE", day: Math.min(c.days, Math.max(1, today - start + 1)), days: c.days, endsOn: c.endsOn };
    case "UPCOMING":
      return { phase: "UPCOMING", days: c.days, startsOn: c.startsOn, endsOn: c.endsOn };
    case "ENDED":
      return { phase: "ENDED", days: c.days, endsOn: c.endsOn };
    default:
      // A phase this portal does not know (a newer api): say nothing about the window.
      return null;
  }
}

/**
 * The list card's window line: « Jour 5 sur 7 · se termine le 4 oct. », « Commence le
 * 3 oct. », « Terminé le 18 sept. » (EN "Day 5 of 7 · ends on 4 Oct", "Starts on 3 Oct",
 * "Ended on 18 Sep"). Dates by `formatShortDate`, no year (the line above carries it).
 * `null` for a phase this portal does not know.
 */
export function phaseLine(c: CoachChallengeSummary, copy: Copy, now: number): string | null {
  const at = windowPosition(c, now);
  if (!at) return null;
  const ch = copy.challenges;
  const short = (iso: string) => formatShortDate(iso, copy.locale);
  switch (at.phase) {
    case "ACTIVE":
      return `${ch.dayOf(at.day, at.days)} · ${ch.endsOn(short(at.endsOn))}`;
    case "UPCOMING":
      return ch.startsOnDate(short(at.startsOn));
    case "ENDED":
      return ch.endedOn(short(at.endsOn));
  }
}

/** Where a participant's OWN today falls against the window's dates. */
export type OwnDay = "BEFORE_START" | "IN_WINDOW" | "PAST_END";

/**
 * Where a participant's OWN today falls against the window, on the dates alone.
 *
 * The api computes `phase` on the UTC date but each trainee's `today` in their own zone,
 * and nulls `todayValue` when that today is outside the window. So on the last evening
 * (22:30 UTC on `endsOn` is 00:30 the next day in Paris) the challenge is still ACTIVE
 * while a Paris trainee's today is already past the end, and on the first morning a
 * trainee west of UTC is still before the start.
 */
export function ownDay(progress: ChallengeProgress, c: Pick<CoachChallengeSummary, "startsOn" | "endsOn">): OwnDay {
  if (progress.today < c.startsOn) return "BEFORE_START";
  return progress.today > c.endsOn ? "PAST_END" : "IN_WINDOW";
}

/**
 * Whether a participant has a challenge "today" to report: the page head says the
 * challenge is running (the api's UTC `phase` is ACTIVE) AND the trainee's own today is
 * inside the window. The row's today cell and the today stat cards both ask this one
 * question, so they cannot disagree with each other or with the head (staff, EV-337h
 * review of 55d2126; QA PB-1 on 6269343).
 *
 * Both terms are needed. Without the phase, a Tokyo trainee already on day 1 of a
 * challenge the head calls « Commence demain » read « Aujourd'hui 5 000 / 10 000 pas »,
 * and a Los Angeles trainee still on the last day of one the head calls « Terminé » read
 * « 6 000 / 5 000 pas ». Without the dates, the last evening's Paris trainees read « Aucune
 * donnée aujourd'hui » about a day they no longer have.
 */
export function todayInWindow(
  progress: ChallengeProgress,
  c: Pick<CoachChallengeSummary, "phase" | "startsOn" | "endsOn">
): boolean {
  return c.phase === "ACTIVE" && ownDay(progress, c) === "IN_WINDOW";
}

/**
 * What an ACCEPTED participant's row may draw, decided once (QA PB-1 and PB-2 on 6269343;
 * ruling 13 / N6 for the rank).
 *
 *   · `today` — the today cell: `todayInWindow`, the cards' own question.
 *   · `rank` — exactly when `counts`: the api ranks by days met, then total, so a rank is
 *     a position over the very numbers `counts` decides the row may show. Under an UPCOMING
 *     head a trainee east of UTC already on day 1 ranked « 1er » for a challenge the head says
 *     has not started; on an ACTIVE first morning a trainee whose own day 1 has not begun
 *     (west of UTC, or no stored zone before 12:00 UTC) ranked last in a tie over the zeros
 *     the row hides (ruling 13). The row stays where the api's order puts it; only the label
 *     goes. On UPCOMING that means every row, in the api's order, with no label (as built).
 *   · `counts` — days met and the total, and the sync line: from the first day the HEAD
 *     says has begun (not UPCOMING) and the trainee's own first day (`daysElapsed > 0`).
 *     Before that the api's numbers are zeros over no day (« 0 sur 0 · 0 pas »), or count a
 *     day the head says is still to come (« Jours réussis 0 sur 1 » under « Commence demain »).
 *   · `total` — STEPS: only once something was synced. The api's `total` is a `long`, never
 *     null: it is the sum of the stored rows in the window up to the trainee's today, so with
 *     no row it is 0 by absence. `syncedAt` is the latest of those same rows, null exactly
 *     when there are none (`ChallengeProgressCalculator.steps`). So `syncedAt: null` means
 *     the 0 is "nothing synced", which the row already says (« Rien de synchronisé pour
 *     l'instant »), and « Total 0 pas » beside it was a fake zero (X7). A synced row of 0
 *     steps is a real zero and is shown. WORKOUTS: `syncedAt` is always null and a total of
 *     0 is the fact that no session was completed, so it is always shown.
 */
export interface ParticipantRowView {
  today: boolean;
  rank: boolean;
  counts: boolean;
  total: boolean;
}

export function participantRowView(
  progress: ChallengeProgress,
  c: Pick<CoachChallengeSummary, "phase" | "startsOn" | "endsOn" | "metric">
): ParticipantRowView {
  const counts = c.phase !== "UPCOMING" && progress.daysElapsed > 0;
  return {
    today: todayInWindow(progress, c),
    rank: counts,
    counts,
    total: counts && (c.metric !== "STEPS" || progress.syncedAt !== null),
  };
}

/**
 * The detail page's "today" cards, counted over the ACCEPTED participants who have a
 * challenge today (`todayInWindow`): an invited one has shared nothing, and one whose
 * today is outside the window has no challenge day to count — counting them read « 0 / 3 ·
 * 3 sans donnée aujourd'hui » for trainees who met every day, every night a challenge ends.
 *
 *   · `accepted` — that in-window count: the met card's denominator.
 *   · `metToday` — participants whose OWN today is a day the api marked MET. The api's
 *     verdict, not a re-comparison here: a WORKOUTS challenge has no days and counts none.
 *   · `withData` / `average` — over the participants who sent a number for today. `average`
 *     is `null` when nobody did: an average of nothing is not 0 steps.
 *   · `pastEnd` / `beforeStart` — accepted participants left out of `accepted` because their
 *     own today is after `endsOn` / before `startsOn` while the challenge is ACTIVE (ruling 8:
 *     the met card's foot names them). On any other phase nobody has a today and both are 0.
 */
export interface TodayStats {
  accepted: number;
  metToday: number;
  withData: number;
  withoutData: number;
  average: number | null;
  pastEnd: number;
  beforeStart: number;
}

function metOnToday(p: ChallengeProgress): boolean {
  return (p.days ?? []).some((d) => d.day === p.today && d.status === "MET");
}

export function todayStats(detail: CoachChallengeDetail): TodayStats {
  const { challenge } = detail;
  const joined = detail.participants.map((p) => p.progress).filter((p): p is ChallengeProgress => p !== null);
  const progress = joined.filter((p) => todayInWindow(p, challenge));
  const outside = (where: OwnDay) =>
    challenge.phase === "ACTIVE" ? joined.filter((p) => ownDay(p, challenge) === where).length : 0;
  const values = progress.map((p) => p.todayValue).filter((v): v is number => v !== null);
  return {
    accepted: progress.length,
    metToday: progress.filter(metOnToday).length,
    withData: values.length,
    withoutData: progress.length - values.length,
    average: values.length === 0 ? null : Math.round(values.reduce((a, b) => a + b, 0) / values.length),
    pastEnd: outside("PAST_END"),
    beforeStart: outside("BEFORE_START"),
  };
}

/**
 * The met card's foot (ruling 8): who is outside its count, in this order — no number
 * today, past the end, before the start — joined by « · », a part whose count is 0 left
 * out. `undefined` when every part is 0 (the card then has no foot, as built).
 */
export function metCardFoot(
  stats: Pick<TodayStats, "withoutData" | "pastEnd" | "beforeStart">,
  words: Pick<Copy["challenges"]["stats"], "withoutData" | "pastEnd" | "beforeStart">
): string | undefined {
  const parts = [
    stats.withoutData > 0 ? words.withoutData(stats.withoutData) : null,
    stats.pastEnd > 0 ? words.pastEnd(stats.pastEnd) : null,
    stats.beforeStart > 0 ? words.beforeStart(stats.beforeStart) : null,
  ].filter((part): part is string => part !== null);
  return parts.length === 0 ? undefined : parts.join(" · ");
}

/**
 * Whether the detail page draws its two "today" cards: an ACTIVE STEPS challenge with at
 * least one accepted participant whose own today is inside the window. With nobody in the
 * window (every trainee past the end on the last evening, or before the start on the first
 * morning) the cards would read « 0 / 0 » about a day nobody has (staff re-check of e4e9a46).
 */
export function showTodayCards(detail: CoachChallengeDetail): boolean {
  const { challenge } = detail;
  return challenge.phase === "ACTIVE" && challenge.metric === "STEPS" && todayStats(detail).accepted > 0;
}

/** Up to two initials from a display name; empty when there is no name to take them from. */
export function initialsOf(name: string | null | undefined): string {
  return (name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => Array.from(w)[0] ?? "")
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
