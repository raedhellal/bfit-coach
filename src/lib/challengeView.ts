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
 * What an ACCEPTED participant's row may draw, decided once (QA PB-1 and PB-2 on 6269343).
 *
 *   · `today` — the today cell: `todayInWindow`, the cards' own question.
 *   · `rank` — not on an UPCOMING challenge. The api ranks by what each trainee's own
 *     calendar has counted, so a trainee east of UTC already on day 1 ranked « 1er » under
 *     a head that says the challenge has not started; with nobody started, every rank is a
 *     tie over zeros. Either way the rank says nothing the head allows.
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
    rank: c.phase !== "UPCOMING",
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
  const { challenge } = detail;
  const joined = detail.participants.map((p) => p.progress).filter((p): p is ChallengeProgress => p !== null);
  const progress = joined.filter((p) => todayInWindow(p, challenge));
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
