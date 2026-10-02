import type { ChallengeProgress, CoachChallengeDetail, CoachChallengeSummary } from "@/lib/coachApi";

/**
 * EV-337h — what the redesigned challenge screens derive from the api's numbers, in one
 * pure place (no runtime import of `coachApi`, which is `server-only`).
 *
 * Nothing here invents a value. Each figure is either read from the api or counted from
 * what it returned, and a figure with nothing behind it is `null`, which the screen names
 * (« Aucune donnée aujourd'hui »), never `0`.
 *
 * **Whose calendar.** The window position (« Jour 5 sur 7 », « Commence dans 3 jours ») is
 * counted on the UTC date, because that is the calendar the api's own `phase` is computed
 * on (`ChallengePhase`, "computed on the server's UTC date for coach reads"). Counting it on
 * another clock could print « Jour 8 sur 7 » beside « Actif ». So the result is clamped to
 * what the phase allows. The per-participant "today" figures use each trainee's OWN today
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

/** Where the window stands today, by phase. `null` when the dates cannot be read. */
export type WindowPosition =
  | { phase: "ACTIVE"; day: number; days: number; endsOn: string }
  | { phase: "UPCOMING"; startsIn: number; days: number; startsOn: string }
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
      return { phase: "UPCOMING", startsIn: Math.max(1, start - today), days: c.days, startsOn: c.startsOn };
    case "ENDED":
      return { phase: "ENDED", days: c.days, endsOn: c.endsOn };
    default:
      // A phase this portal does not know (a newer api): say nothing about the window.
      return null;
  }
}

/**
 * Whether a participant's OWN today falls inside the challenge's window.
 *
 * The api computes `phase` on the UTC date but each trainee's `today` in their own zone,
 * and nulls `todayValue` when that today is outside the window. So on the last evening
 * (22:30 UTC on `endsOn` is 00:30 the next day in Paris) the challenge is still ACTIVE
 * while a Paris trainee's today is already past the end, and on the first morning a
 * trainee west of UTC is still before the start. Such a null is not "no data today": there
 * is no challenge day to report for that trainee. The row and the stat cards both ask this
 * one question, so they cannot disagree (staff, EV-337h review of 55d2126).
 */
export function todayInWindow(progress: ChallengeProgress, c: Pick<CoachChallengeSummary, "startsOn" | "endsOn">): boolean {
  return progress.today >= c.startsOn && progress.today <= c.endsOn;
}

/**
 * The detail page's "today" cards, counted over the ACCEPTED participants whose own today
 * is inside the window (`todayInWindow`): an invited one has shared nothing, and one whose
 * today is outside the window has no challenge day to count — counting them read « 0 / 3 ·
 * 3 sans donnée aujourd'hui » for trainees who met every day, every night a challenge ends.
 *
 *   · `metToday` — participants whose OWN today is a day the api marked MET. The api's
 *     verdict, not a re-comparison here: a WORKOUTS challenge has no days and counts none.
 *   · `withData` / `average` — over the participants who sent a number for today. `average`
 *     is `null` when nobody did: an average of nothing is not 0 steps.
 */
export interface TodayStats {
  accepted: number;
  metToday: number;
  withData: number;
  withoutData: number;
  average: number | null;
}

function metOnToday(p: ChallengeProgress): boolean {
  return (p.days ?? []).some((d) => d.day === p.today && d.status === "MET");
}

export function todayStats(detail: CoachChallengeDetail): TodayStats {
  const progress = detail.participants
    .map((p) => p.progress)
    .filter((p): p is ChallengeProgress => p !== null && todayInWindow(p, detail.challenge));
  const values = progress.map((p) => p.todayValue).filter((v): v is number => v !== null);
  return {
    accepted: progress.length,
    metToday: progress.filter(metOnToday).length,
    withData: values.length,
    withoutData: progress.length - values.length,
    average: values.length === 0 ? null : Math.round(values.reduce((a, b) => a + b, 0) / values.length),
  };
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
