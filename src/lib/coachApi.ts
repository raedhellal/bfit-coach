import "server-only";
import { apiFetch, ApiError } from "./apiFetch";
import { COACH_API_MODE, INVITE_BASE_URL } from "./env";
import { fixtureCoachApi } from "./coachApi.fixture";

/**
 * The ONE module that knows b-fit-api's coach-portal contract.
 *
 * ADR-0012 §D4 is still under staff-engineer challenge, so every path, field name and
 * error code the web surface depends on is written down exactly once, here. When D4
 * moves, this file moves and no screen changes. Screens import `coachApi`, never
 * `apiFetch`.
 *
 * `COACH_API_MODE=fixture` swaps the whole module for src/lib/coachApi.fixture.ts so
 * the screens are demoable before WP-1..WP-3 land. The switch is read from the server
 * environment only.
 */

// ── types (the D4 contract, as this surface consumes it) ─────────────────────

export type CapacityTier = "STARTER";
/** AC5's three rules. The api sends the code; src/lib/copy.ts owns the sentence. */
export type RedFlagCode = "MISSED_SESSIONS" | "PAIN_REPORTED" | "NO_WEIGH_IN";
/** `com.bfit.domain.workout.Feedback` — there is no PAIN value today (ADR-0012 D6). */
export type SessionFeedback = "EASY" | "OK" | "HARD";
export type ClientStatus = "ACTIVE" | "REVOKED";

/** GET /coach-portal/me */
export interface CoachMe {
  userId: string;
  displayName: string;
  capacity: {
    active: number;
    capacity: number;
    tier: CapacityTier;
  };
}

/** GET /coach-portal/clients → `{ items: RosterClient[] }` */
export interface RosterClient {
  /** the `coach_clients` row id — the id every /coach-portal/clients/{id} call takes */
  id: string;
  traineeId: string;
  displayName: string;
  planName: string | null;
  /** ISO-8601 date (YYYY-MM-DD) of the last COMPLETED workout, or null. */
  lastWorkoutDate: string | null;
  streakDays: number;
  status: ClientStatus;
  redFlags: RedFlagCode[];
}

export interface RosterResponse {
  items: RosterClient[];
}

/** POST /coach-portal/invites — the raw token is returned once and never again. */
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

export interface WeightPoint {
  /** ISO-8601 date of the weigh-in. */
  date: string;
  kg: number;
}

/** GET /coach-portal/clients/{id} */
export interface ClientOverview {
  id: string;
  traineeId: string;
  displayName: string;
  planName: string | null;
  /** ISO-8601 instant — `coach_clients.consent_at`. */
  coachedSince: string;
  adherenceThisWeek: { done: number; planned: number };
  streakDays: number;
  lastSession: {
    date: string; // ISO-8601 date
    name: string;
    feedback: SessionFeedback | null;
  } | null;
  /** Weigh-ins inside the last 8 weeks, oldest first. Empty array = none. */
  weightSeries: WeightPoint[];
  redFlags: RedFlagCode[];
}

// ── error helpers ────────────────────────────────────────────────────────────

export { ApiError } from "./apiFetch";

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
  listClients(): Promise<RosterResponse> {
    return apiFetch<RosterResponse>("/coach-portal/clients");
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
   */
  async createInviteWithUrl(): Promise<Invite> {
    const invite = await impl.createInvite();
    return { ...invite, url: `${INVITE_BASE_URL}/i/${invite.token}` };
  },
};

/** Ordering rule for the roster: needs attention first (EV-183's roster read). */
export function sortNeedsAttentionFirst(items: RosterClient[]): RosterClient[] {
  return [...items].sort((a, b) => {
    if (b.redFlags.length !== a.redFlags.length) {
      return b.redFlags.length - a.redFlags.length;
    }
    // Then the least recently seen — a trainee with no workout at all sorts first.
    const av = a.lastWorkoutDate ?? "";
    const bv = b.lastWorkoutDate ?? "";
    if (av !== bv) return av < bv ? -1 : 1;
    return a.displayName.localeCompare(b.displayName);
  });
}
