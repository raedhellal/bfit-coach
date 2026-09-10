import "server-only";
import type {
  ClientOverview,
  CoachApi,
  CoachMe,
  InviteResponse,
  RosterClient,
  RosterPage,
  WeightPoint,
} from "./coachApi";

/**
 * In-memory fixture for `COACH_API_MODE=fixture`.
 *
 * This exists so the four screens can be reviewed and demoed without a running api —
 * NOT so the product can pretend to have a backend. Two rules keep it honest:
 *   1. It is server-side and env-gated; `live` is the default and the demo runs live.
 *   2. Its shapes are the same TypeScript types the live client returns — the api's
 *      own field names — so a contract change breaks this file at compile time
 *      instead of letting the fixture drift into a nicer world than production.
 *
 * Dates are computed from `now` on every call, so the fixture never shows a stale
 * "last workout" three months in the past.
 *
 * `COACH_FIXTURE_SCENARIO=empty` serves the zero-trainee roster (AC1's empty state,
 * which is also what the Playwright smoke spec asserts); anything else serves the
 * populated roster.
 */

const SCENARIO = process.env.COACH_FIXTURE_SCENARIO === "empty" ? "empty" : "populated";
const CAPACITY = 2; // CoachProfile.CapacityTier.STARTER.capacity()

function isoDate(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function isoInstant(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString();
}

const LINA_ID = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
/**
 * Two more trainees that exist ONLY as overview reads, for the two other states of
 * AC5's block 4 (BUG-144): exactly one weigh-in, and none at all. They are not on any
 * scenario's roster on purpose — the roster and the per-trainee overview are separate
 * api reads and the fixture has always answered `getClient(LINA_ID)` in the `empty`
 * scenario too, so addressing a trainee the roster does not list is the fixture's
 * existing shape, not a new fiction. Nothing here is reachable in `live` mode.
 */
const NILS_ID = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0002";
const SARA_ID = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0003";

/** 71.2 kg → 70.4 kg over eight weekly weigh-ins. */
const WEIGHTS = [71.2, 71.0, 71.1, 70.8, 70.9, 70.6, 70.5, 70.4];

function weightSeries(): WeightPoint[] {
  return WEIGHTS.map((weightKg, i) => ({
    date: isoDate((WEIGHTS.length - 1 - i) * 7 + 1),
    weightKg,
  }));
}

function lina(): RosterClient {
  return {
    id: LINA_ID,
    traineeDisplayName: "Lina M.",
    currentPlanName: "Intermediate Muscle Building Routine",
    lastCompletedWorkoutDate: isoDate(1),
    currentStreakDays: 4,
    status: "ACTIVE",
    since: isoInstant(23),
  };
}

/**
 * The overviews the fixture can answer, by id. `NO_WEIGH_IN_14_DAYS` is attached to
 * the trainee who has never weighed in because that is the rule the api would actually
 * compute for them — the flags and block 4 have to agree here as they do in the api.
 */
const OVERVIEWS: Record<string, () => ClientOverview> = {
  [LINA_ID]: () => ({
    clientId: LINA_ID,
    traineeDisplayName: "Lina M.",
    since: isoInstant(23),
    adherenceThisWeek: { done: 2, planned: 4 },
    currentStreakDays: 4,
    lastSession: { date: isoDate(1), name: "Upper Body A", difficulty: "HARD" },
    weightSeries: weightSeries(),
    // MISSED_TWO_OR_MORE_SESSIONS only: PAIN_REPORTED is never emitted by the api
    // (ADR-0012 D6), so a fixture that showed it would be fiction.
    redFlags: ["MISSED_TWO_OR_MORE_SESSIONS"],
  }),
  [NILS_ID]: () => ({
    clientId: NILS_ID,
    traineeDisplayName: "Nils K.",
    since: isoInstant(9),
    adherenceThisWeek: { done: 1, planned: 3 },
    currentStreakDays: 1,
    lastSession: { date: isoDate(2), name: "Full Body A", difficulty: "OK" },
    weightSeries: [{ date: isoDate(1), weightKg: 72.5 }],
    redFlags: [],
  }),
  [SARA_ID]: () => ({
    clientId: SARA_ID,
    traineeDisplayName: "Sara P.",
    since: isoInstant(30),
    adherenceThisWeek: { done: 0, planned: 3 },
    currentStreakDays: 0,
    lastSession: null,
    weightSeries: [],
    redFlags: ["NO_WEIGH_IN_14_DAYS"],
  }),
};

/** Revoke mutates this so AC6's flow can be walked through in fixture mode too. */
let revoked = false;

export const fixtureCoachApi: CoachApi = {
  async getMe(): Promise<CoachMe> {
    return {
      coachId: "1a2b3c4d-0000-4000-8000-00000000c0ac",
      displayName: "Alex R.",
      tier: "STARTER",
      active: SCENARIO === "empty" || revoked ? 0 : 1,
      capacity: CAPACITY,
    };
  },

  async listClients(page = 0, size = 100): Promise<RosterPage> {
    const items = SCENARIO === "empty" || revoked ? [] : [lina()];
    return {
      items: page === 0 ? items : [],
      page,
      size,
      totalElements: items.length,
      totalPages: items.length === 0 ? 0 : 1,
    };
  },

  async createInvite(): Promise<InviteResponse> {
    // 32 bytes of randomness → base64url, the same shape the api's token has, so the
    // URL and the QR code are the length they will really be.
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const token = btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    return { inviteId: crypto.randomUUID(), token, expiresAt };
  },

  async getClient(id: string): Promise<ClientOverview> {
    const known = OVERVIEWS[id];
    if (!known || revoked) {
      const { ApiError } = await import("./apiFetch");
      throw new ApiError(403, "Forbidden", "COACH_ACCESS_DENIED");
    }
    return known();
  },

  async revokeClient(): Promise<void> {
    revoked = true;
  },
};
