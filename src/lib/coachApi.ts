import "server-only";
import { apiFetch, ApiError } from "./apiFetch";
import { COACH_API_MODE, INVITE_BASE_URL } from "./env";
import { fixtureCoachApi } from "./coachApi.fixture";
import { sanitiseCoachName } from "./inviteName";

/**
 * The ONE module that knows b-fit-api's coach-portal contract.
 *
 * Every path, field name and error code the web surface depends on is written down
 * exactly once, here, and the names below are the API's own names verbatim — not a
 * prettier local vocabulary. A renamed field is a place where drift can hide; when
 * `traineeDisplayName` is called `traineeDisplayName` all the way to the JSX, a
 * contract change is a type error rather than an empty cell.
 *
 * Source of truth: `b-fit-api` `openapi.yaml` (`/coach-portal/*`) and the DTOs in
 * `com.bfit.application.dto.coachportal`, branch demo/evoli-pro-mve1.
 *
 * `COACH_API_MODE=fixture` swaps the whole module for src/lib/coachApi.fixture.ts so
 * the screens are demoable without an api. The switch is read from the server
 * environment only, and `live` is the default.
 */

// ── types (the api contract, as this surface consumes it) ────────────────────

/** `CoachProfileResponse.tier` — enum [STARTER] today; the ladder lands at MVE-6. */
export type CapacityTier = "STARTER";
/**
 * AC5's three rules. The api sends the code; src/lib/copy.ts owns the sentence.
 *
 * `PAIN_REPORTED` is published by the api and **never emitted**: there is no
 * structured pain signal in the product (`Feedback` is {EASY, OK, HARD} and no mobile
 * call site writes `workout_completion.notes`), so the server deliberately does not
 * compute that rule. We keep it in the vocabulary — and keep its sentence in copy.ts —
 * so the gap is visible rather than silently absent (ADR-0012 D6).
 */
export type RedFlagCode =
  | "MISSED_TWO_OR_MORE_SESSIONS"
  | "PAIN_REPORTED"
  | "NO_WEIGH_IN_14_DAYS";
/** `com.bfit.domain.workout.Feedback` — there is no PAIN value today (ADR-0012 D6). */
export type SessionFeedback = "EASY" | "OK" | "HARD";
/** The roster only ever lists ACTIVE rows; REVOKED links are history. */
export type ClientStatus = "ACTIVE";

/**
 * `GET /coach-portal/me` → `CoachProfileResponse`.
 *
 * Flat, not `{ capacity: { … } }`: the api returns the three capacity values
 * alongside the profile and inventing a nested object here would be this surface
 * disagreeing with its own contract for cosmetic reasons.
 */
export interface CoachMe {
  /** The coach's user id — the same account as their Evoli Fit login. */
  coachId: string;
  displayName: string;
  tier: CapacityTier;
  /** ACTIVE links held right now. */
  active: number;
  /** How many ACTIVE links the tier allows. */
  capacity: number;
}

/** One row of `GET /coach-portal/clients` → `CoachClientSummaryResponse`. */
export interface RosterClient {
  /** The `coach_clients` row id — the ONLY id the coach portal addresses. */
  id: string;
  traineeDisplayName: string;
  /** Null when the trainee's app is on no plan. */
  currentPlanName: string | null;
  /** `YYYY-MM-DD` (UTC) of the last completed workout; null if there has never been one. */
  lastCompletedWorkoutDate: string | null;
  currentStreakDays: number;
  status: ClientStatus;
  /** ISO-8601 instant — when the trainee accepted. */
  since: string;
}

/**
 * `GET /coach-portal/clients` → `CoachClientPageResponse`.
 *
 * A paged envelope, not a bare array: every collection endpoint on b-fit-api
 * paginates. The roster is one page in practice (see `ROSTER_PAGE_SIZE`).
 */
export interface RosterPage {
  items: RosterClient[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

/**
 * The api caps `size` at 100 and the largest contemplated tier is 100 profiles, so
 * one page of 100 is the whole roster for every tier that can exist. If a tier ever
 * exceeds that, this constant stops being sufficient and the roster needs real
 * pagination — which is why the page reads `totalElements` and not `items.length`.
 */
export const ROSTER_PAGE_SIZE = 100;

/** `POST /coach-portal/invites` → 201 `CoachInviteResponse`. Raw token, once, ever. */
export interface InviteResponse {
  inviteId: string;
  token: string;
  /** ISO-8601 instant, creation + 7 days. */
  expiresAt: string;
}

/** What the UI actually renders: the api's token wrapped in this surface's URL. */
export interface Invite extends InviteResponse {
  url: string;
}

/** `TraineeWeightPoint`. */
export interface WeightPoint {
  /** `YYYY-MM-DD`. */
  date: string;
  weightKg: number;
}

/** `TraineeLastSession` — block 3. */
export interface LastSession {
  /** `YYYY-MM-DD` (UTC) of completion. */
  date: string;
  /** The workout's title; null if the workout row has since gone. */
  name: string | null;
  /** Null renders "No feedback given". */
  difficulty: SessionFeedback | null;
}

/**
 * `GET /coach-portal/clients/{id}` → `TraineeOverviewResponse`.
 *
 * Exactly AC5's five blocks and nothing else. Note there is **no plan name here** —
 * the plan is a roster-row field only, so the overview header must not claim one.
 */
export interface ClientOverview {
  /** The `coach_clients` row id. */
  clientId: string;
  traineeDisplayName: string;
  /** ISO-8601 instant — when the trainee accepted. */
  since: string;
  /** Block 1. Week boundaries are UTC (ADR-0012 risk (c)). */
  adherenceThisWeek: { done: number; planned: number };
  /** Block 2. */
  currentStreakDays: number;
  /** Block 3 — null renders "No sessions yet". */
  lastSession: LastSession | null;
  /** Block 4 — weigh-ins over the last 8 weeks, oldest first. Empty, never null. */
  weightSeries: WeightPoint[];
  /** Block 5 — an EMPTY list is "No red flags". */
  redFlags: RedFlagCode[];
}

// ── error helpers ────────────────────────────────────────────────────────────

export { ApiError } from "./apiFetch";

/**
 * The coach portal answers 403 uniformly for a foreign id, a revoked link AND an id
 * that never existed, so the prefix is not an existence oracle. All three land here
 * and must read the same to the coach.
 */
export function isForbidden(err: unknown): boolean {
  return err instanceof ApiError && err.status === 403;
}
export function isCapacityReached(err: unknown): boolean {
  return err instanceof ApiError && err.code === "COACH_CAPACITY_REACHED";
}

// ── the live client ──────────────────────────────────────────────────────────

const liveCoachApi = {
  getMe(): Promise<CoachMe> {
    return apiFetch<CoachMe>("/coach-portal/me");
  },
  listClients(page = 0, size = ROSTER_PAGE_SIZE): Promise<RosterPage> {
    return apiFetch<RosterPage>(`/coach-portal/clients?page=${page}&size=${size}`);
  },
  createInvite(): Promise<InviteResponse> {
    return apiFetch<InviteResponse>("/coach-portal/invites", { method: "POST" });
  },
  getClient(id: string): Promise<ClientOverview> {
    return apiFetch<ClientOverview>(
      `/coach-portal/clients/${encodeURIComponent(id)}`
    );
  },
  async revokeClient(id: string): Promise<void> {
    // 204 No Content — `apiFetch` parses an empty body to null, which is the point.
    await apiFetch<void>(
      `/coach-portal/clients/${encodeURIComponent(id)}/revoke`,
      { method: "POST" }
    );
  },
};

export type CoachApi = typeof liveCoachApi;

const impl: CoachApi = COACH_API_MODE === "fixture" ? fixtureCoachApi : liveCoachApi;

export const coachApi = {
  ...impl,
  /**
   * The invite URL is built here, not by the api: only this surface knows the host a
   * phone can reach it on (ADR-0012 D5 — LAN IP for the demo, `pro.evoli.fit` when
   * ⛔ D8 lands). Shown and QR-encoded from this one string so the two are
   * byte-identical, which is AC2.
   *
   * The coach's display name is appended as `?coach=<name>` (EV-183 AC3): the mobile
   * consent screen has to name the coach *before* the trainee accepts, and the api has
   * no pre-accept lookup for an invite token, so the name has to travel on the link.
   * It is a hint, not a credential — the app falls back to "Your coach" without it, so
   * a failed /coach-portal/me must never cost the coach their invite.
   */
  async createInviteWithUrl(): Promise<Invite> {
    const [inviteResult, meResult] = await Promise.allSettled([impl.createInvite(), impl.getMe()]);
    if (inviteResult.status === "rejected") throw inviteResult.reason;
    const invite = inviteResult.value;

    const coachName =
      meResult.status === "fulfilled" ? sanitiseCoachName(meResult.value.displayName) : null;
    const query = coachName ? `?coach=${encodeURIComponent(coachName)}` : "";

    return { ...invite, url: `${INVITE_BASE_URL}/i/${invite.token}${query}` };
  },
};

/**
 * Ordering rule for the roster: needs attention first (EV-183's roster read).
 *
 * **Least recently seen first**, which is the only needs-attention signal the list
 * endpoint carries: `CoachClientSummaryResponse` has no `redFlags` field, and the
 * flags are computed per trainee by `GET /coach-portal/clients/{id}`. Fetching them
 * for the roster would mean one extra request per row on every render of the landing
 * page — an N+1 against a tier ladder that already contemplates 100 profiles — so the
 * red-flag chip lives on the overview only, and the roster sorts by
 * `lastCompletedWorkoutDate` ascending instead. A trainee who has never completed a
 * workout (null) sorts first: they are the most in need of attention, not the least.
 */
export function sortNeedsAttentionFirst(items: RosterClient[]): RosterClient[] {
  return [...items].sort((a, b) => {
    // "" sorts before every real YYYY-MM-DD, so null (never trained) leads.
    const av = a.lastCompletedWorkoutDate ?? "";
    const bv = b.lastCompletedWorkoutDate ?? "";
    if (av !== bv) return av < bv ? -1 : 1;
    return a.traineeDisplayName.localeCompare(b.traineeDisplayName);
  });
}
