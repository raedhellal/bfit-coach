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
 * The detail page's "today" cards, counted over the ACCEPTED participants only (an
 * invited one has shared nothing).
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
    .filter((p): p is ChallengeProgress => p !== null);
  const values = progress.map((p) => p.todayValue).filter((v): v is number => v !== null);
  return {
    accepted: progress.length,
    metToday: progress.filter(metOnToday).length,
    withData: values.length,
    withoutData: progress.length - values.length,
    average: values.length === 0 ? null : Math.round(values.reduce((a, b) => a + b, 0) / values.length),
  };
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
