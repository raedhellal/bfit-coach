import type { CoachAccessScope, RosterClient } from "./coachApi";

/**
 * EV-337d — what the redesigned roster says about each row, decided from the api's row and
 * nothing else (plan §5.1, §7; Raed's ruling R6 of 2026-10-02).
 *
 * Pure and framework-free (no `server-only`, and only TYPES from `coachApi`, which is
 * server-only — the client island imports the filter helpers below): `qa/roster-view.spec.ts` drives it with a
 * stated "today", which is the only honest way to test a day boundary (a page test runs on
 * the real day, and Playwright's clock moves the browser, not the server).
 *
 * **Nothing here invents a value.** Each group and each status is a statement the api's
 * row supports:
 *   · `redFlagCount` is the api's own evaluation (EV-187a). `null` means no rule could be
 *     evaluated, and is never read as "no flags".
 *   · « Inactif » needs PROGRESS **and** a date (R6, EV-337 D1). Without PROGRESS the
 *     portal cannot know, so the row is never called inactive (plan §5.1).
 *   · There is no weekly adherence on the row (G1) and no pending-invite read (G2), so
 *     neither a ring nor an « Invitations en attente » group exists here.
 */

/** R6: « Inactif » after 7 days without a completed session. Exactly 7 is NOT inactive. */
export const INACTIVE_AFTER_DAYS = 7;

/** The zone "today" is read in (EV-337 D1: "more than 7 days before today (Europe/Paris)"). */
export const ROSTER_TODAY_ZONE = "Europe/Paris";

/**
 * The four groups, in the order they are drawn.
 *
 *   · `attention` — the api says at least one red flag fired.
 *   · `onTrack`   — a session within the last 7 days AND an evaluated zero flags. Both
 *                   halves are facts from the api; anything less is not "on track".
 *   · `inactive`  — PROGRESS held, last session more than 7 days ago, no flag.
 *   · `other`     — everything the portal cannot classify honestly: the activity is not
 *                   shared, the client has never completed a session, or the flags could
 *                   not be evaluated. The design files a not-shared client under « Sur la
 *                   bonne voie »; that is a claim made from nothing, so it is not followed.
 *
 * A flagged client who is also inactive is in `attention` (one row, one place) and carries
 * the inactive note on its row: the needs-attention order is the screen's job, and moving
 * the most urgent client to the bottom group would undo it.
 */
export type RosterGroup = "attention" | "onTrack" | "inactive" | "other";
export const ROSTER_GROUPS: readonly RosterGroup[] = ["attention", "onTrack", "inactive", "other"];

/** The filters with data behind them (EV-337 D5). « Adhérence < 50 % » (G1) and « Invitations » (G2) have none. */
export type RosterFilter = "all" | "flagged" | "inactive";
export const ROSTER_FILTERS: readonly RosterFilter[] = ["all", "flagged", "inactive"];

/** The one status pill a row carries. Each kind maps to one sentence in `copy.roster.status`. */
export type RosterStatus =
  | { kind: "flags"; count: number }
  | { kind: "inactive"; days: number }
  | { kind: "upToDate" }
  | { kind: "activityNotShared" }
  | { kind: "noWorkout" }
  | { kind: "flagsNotShared" };

export interface RosterRowView {
  group: RosterGroup;
  status: RosterStatus;
  /** Whole days between the last completed session and today (Paris); null when unknown. */
  daysSinceLastWorkout: number | null;
  /** True when R6 applies: PROGRESS held and more than 7 days. Independent of the group. */
  inactive: boolean;
  flagged: boolean;
}

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})/;

/** `coachApi.hasScope`, restated: fails closed for an api that sends no `scopes` on the row. */
function holds(scopes: CoachAccessScope[] | null | undefined, scope: CoachAccessScope): boolean {
  return Array.isArray(scopes) && scopes.includes(scope);
}

/** `YYYY-MM-DD` of `now` on the wall clock of `zone`. */
export function dayIn(now: Date, zone: string = ROSTER_TODAY_ZONE): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Whole calendar days from `from` to `to` (both `YYYY-MM-DD`); null for a malformed date. */
export function daysBetween(from: string, to: string): number | null {
  const a = ISO_DAY.exec(from);
  const b = ISO_DAY.exec(to);
  if (!a || !b) return null;
  const ms =
    Date.UTC(Number(b[1]), Number(b[2]) - 1, Number(b[3])) -
    Date.UTC(Number(a[1]), Number(a[2]) - 1, Number(a[3]));
  return Math.round(ms / 86_400_000);
}

/** `YYYY-MM-DD` that is `days` calendar days before `day`. Used by the fixture's boundary rows. */
export function dayMinus(day: string, days: number): string {
  const m = ISO_DAY.exec(day);
  if (!m) throw new Error(`not an ISO day: ${day}`);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) - days));
  return d.toISOString().slice(0, 10);
}

/**
 * One row → its group and status. `today` is Paris's `YYYY-MM-DD` (`dayIn(new Date())`).
 *
 * `typeof … === "number"` rather than `!== null` for the flag count, for the reason
 * `FlagBadge` gave: an api that predates EV-187a sends no `redFlagCount`, and `undefined`
 * is not "no flags" either.
 */
export function classifyRosterRow(client: RosterClient, today: string): RosterRowView {
  const progress = holds(client.scopes, "PROGRESS");
  const count = typeof client.redFlagCount === "number" ? client.redFlagCount : null;
  const flagged = count !== null && count > 0;
  const days =
    typeof client.lastCompletedWorkoutDate === "string"
      ? daysBetween(client.lastCompletedWorkoutDate, today)
      : null;
  // A date in the future (a clock or zone disagreement) is "0 days", never negative.
  const since = days === null ? null : Math.max(0, days);
  const inactive = progress && since !== null && since > INACTIVE_AFTER_DAYS;

  let status: RosterStatus;
  let group: RosterGroup;
  if (flagged) {
    group = "attention";
    status = { kind: "flags", count: count as number };
  } else if (inactive) {
    group = "inactive";
    status = { kind: "inactive", days: since as number };
  } else if (progress && since !== null && count === 0) {
    group = "onTrack";
    status = { kind: "upToDate" };
  } else {
    group = "other";
    status = !progress
      ? { kind: "activityNotShared" }
      : since === null
        ? { kind: "noWorkout" }
        : { kind: "flagsNotShared" };
  }
  return { group, status, daysSinceLastWorkout: since, inactive, flagged };
}

/** Does a row pass a filter? `flagged` and `inactive` read the row's facts, not its group. */
export function passesFilter(view: Pick<RosterRowView, "flagged" | "inactive">, filter: RosterFilter): boolean {
  if (filter === "flagged") return view.flagged;
  if (filter === "inactive") return view.inactive;
  return true;
}

/** Lower case, accents stripped, spaces collapsed: « Inès » is found by "ines". */
export function searchKey(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** A query matches a client's name or plan name (both as the api sent them). */
export function matchesSearch(haystack: string, query: string): boolean {
  const q = searchKey(query);
  if (!q) return true;
  return haystack.includes(q);
}
