import "server-only";
import type {
  ClientOverview,
  CoachApi,
  CoachMe,
  InviteResponse,
  RosterClient,
  RosterResponse,
  WeightPoint,
} from "./coachApi";

/**
 * In-memory fixture for `COACH_API_MODE=fixture`.
 *
 * This exists so the four screens can be built, reviewed and demoed while ADR-0012's
 * D4 endpoints are still under challenge — NOT so the product can pretend to have a
 * backend. Two rules keep it honest:
 *   1. It is server-side and env-gated; `live` is the default and the demo runs live.
 *   2. Its shapes are the same TypeScript types the live client returns, so when D4
 *      lands the only file that changes is coachApi.ts.
 *
 * Dates are computed from `now` on every call, so the fixture never shows a stale
 * "last workout" three months in the past.
 *
 * `COACH_FIXTURE_SCENARIO=empty` serves the zero-trainee roster (AC1's empty state,
 * which is also what the Playwright smoke spec asserts); anything else serves the
 * populated roster.
 */

const SCENARIO = process.env.COACH_FIXTURE_SCENARIO === "empty" ? "empty" : "populated";
const CAPACITY = 2; // ADR-0012 D4: STARTER_CAPACITY = 2

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
const LINA_TRAINEE_ID = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0002";

/** 71.2 kg → 70.4 kg over eight weekly weigh-ins. */
const WEIGHTS = [71.2, 71.0, 71.1, 70.8, 70.9, 70.6, 70.5, 70.4];

function weightSeries(): WeightPoint[] {
  return WEIGHTS.map((kg, i) => ({ date: isoDate((WEIGHTS.length - 1 - i) * 7 + 1), kg }));
}

function lina(): RosterClient {
  return {
    id: LINA_ID,
    traineeId: LINA_TRAINEE_ID,
    displayName: "Lina M.",
    planName: "Intermediate Muscle Building Routine",
    lastWorkoutDate: isoDate(1),
    streakDays: 4,
    status: "ACTIVE",
    redFlags: ["MISSED_SESSIONS"],
  };
}

/** Revoke mutates this so AC6's flow can be walked through in fixture mode too. */
let revoked = false;

export const fixtureCoachApi: CoachApi = {
  async getMe(): Promise<CoachMe> {
    return {
      userId: "1a2b3c4d-0000-4000-8000-00000000c0ac",
      displayName: "Alex R.",
      capacity: {
        active: SCENARIO === "empty" || revoked ? 0 : 1,
        capacity: CAPACITY,
        tier: "STARTER",
      },
    };
  },

  async listClients(): Promise<RosterResponse> {
    if (SCENARIO === "empty" || revoked) return { items: [] };
    return { items: [lina()] };
  },

  async createInvite(): Promise<InviteResponse> {
    // 32 bytes of randomness → base64url, the same shape ADR-0012 D4 specifies, so
    // the URL and the QR code are the length they will really be.
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
    if (id !== LINA_ID || revoked) {
      const { ApiError } = await import("./apiFetch");
      throw new ApiError(403, "Forbidden", "COACH_ACCESS_DENIED");
    }
    return {
      id: LINA_ID,
      traineeId: LINA_TRAINEE_ID,
      displayName: "Lina M.",
      planName: "Intermediate Muscle Building Routine",
      coachedSince: isoInstant(23),
      adherenceThisWeek: { done: 2, planned: 4 },
      streakDays: 4,
      lastSession: { date: isoDate(1), name: "Upper Body A", feedback: "HARD" },
      weightSeries: weightSeries(),
      redFlags: ["MISSED_SESSIONS"],
    };
  },

  async revokeClient(): Promise<void> {
    revoked = true;
  },
};
