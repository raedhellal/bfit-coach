import { expect } from "@playwright/test";
import { test } from "./fixture-test";
import {
  KEEP_400_CODES,
  keepFailureRoute,
  reconcileKeep,
  type KeepReadOutcome,
  type KeepStaleCode,
} from "../src/lib/routineAiKeepReconcile";

/**
 * BUG-869 / BUG-870 — ADR-0036 § Amendment BUG-869/870's decision table as a pure function, one case
 * per row, with no browser and no server. This is the witness for staff's A1 (the stamp race and the
 * clock race), which QA cannot drive live: `proposal()` is several READ COMMITTED statements, so a
 * read naming P with a non-READY status after a Keep with no answer proves nothing about the Keep.
 */

const P = "0b8e6f3a-6c1d-4f7e-9a2b-1c3d5e7f9a0b";
const Q = "7d2c4b6a-8e0f-4a1b-9c3d-5e7f9a1b3c5d";

const read = (proposalId: string | null, status: string, errorCode: string | null = null): KeepReadOutcome => ({
  ok: true,
  proposal: { proposalId, status, errorCode },
});
const readFailed = (code: string): KeepReadOutcome => ({ ok: false, code });

test.describe("the Keep's own outcome: which ones read (rows 1-2 never reach the read)", () => {
  test("403 → accessEnded, 404 → hidden, no read", () => {
    expect(keepFailureRoute("ACCESS_DENIED")).toEqual({ kind: "accessEnded" });
    expect(keepFailureRoute("NOT_FOUND")).toEqual({ kind: "hidden" });
  });

  test("400 (every code Keep answers 400 with) → refused, unchanged, no read", () => {
    expect([...KEEP_400_CODES].sort()).toEqual([
      "COACH_DRAFT_INPUT_FORBIDDEN",
      "COACH_DRAFT_REPS_ON_DURATION",
      "COACH_DRAFT_SUBJECT_FIELD",
      "VALIDATION_ERROR",
    ]);
    for (const code of KEEP_400_CODES) expect(keepFailureRoute(code)).toEqual({ kind: "refused" });
  });

  test("409 COACH_DRAFT_EXISTS / COACH_PROPOSAL_STALE → read, carrying the 409's own code", () => {
    expect(keepFailureRoute("COACH_DRAFT_EXISTS")).toEqual({ kind: "reconcile", staleCode: "COACH_DRAFT_EXISTS" });
    expect(keepFailureRoute("COACH_PROPOSAL_STALE")).toEqual({ kind: "reconcile", staleCode: "COACH_PROPOSAL_STALE" });
  });

  test("no answer → read: FAILED (thrown, code-less gateway 5xx, settled fallback), a plain 500, any unnamed non-200", () => {
    for (const code of [
      "FAILED",
      "INTERNAL_ERROR", // A3: a plain 500 reconciles too (it replaces isLostAnswer for Keep)
      "CATALOG_UNAVAILABLE", // an api 503 that rolled back: the read names P READY → "still here", true
      "COACH_AI_BUSY",
      "UNAUTHORIZED", // 401
      "COACH_AI_RATE_LIMIT", // 429
      "ONBOARDING_REQUIRED", // a 409 the table does not name
      "SOMETHING_NEW",
    ]) {
      expect(keepFailureRoute(code), code).toEqual({ kind: "reconcile", staleCode: null });
    }
  });
});

test.describe("the reconcile read (rows 3-10)", () => {
  for (const code of ["COACH_DRAFT_EXISTS", "COACH_PROPOSAL_STALE"] as KeepStaleCode[]) {
    test(`409 ${code}, the read names P (any status) → stale with the 409's own code`, () => {
      expect(reconcileKeep(code, P, read(P, "READY"))).toEqual({ kind: "stale", code });
      expect(reconcileKeep(code, P, read(P, "EXPIRED", "COACH_PROPOSAL_STALE"))).toEqual({ kind: "stale", code });
      expect(reconcileKeep(code, P, read(P, "EXPIRED"))).toEqual({ kind: "stale", code });
      expect(reconcileKeep(code, P, read(P.toUpperCase(), "READY"))).toEqual({ kind: "stale", code });
    });

    test(`409 ${code}, the read does not name P (NONE, or another id) → unconfirmed (BUG-870)`, () => {
      expect(reconcileKeep(code, P, read(null, "NONE"))).toEqual({ kind: "unconfirmed" });
      expect(reconcileKeep(code, P, read(Q, "READY"))).toEqual({ kind: "unconfirmed" });
      expect(reconcileKeep(code, P, read(Q, "RUNNING"))).toEqual({ kind: "unconfirmed" });
    });
  }

  test("ADR unit row: after 409 COACH_DRAFT_EXISTS, a read naming P EXPIRED/STALE → stale with COACH_DRAFT_EXISTS", () => {
    expect(reconcileKeep("COACH_DRAFT_EXISTS", P, read(P, "EXPIRED", "COACH_PROPOSAL_STALE"))).toEqual({
      kind: "stale",
      code: "COACH_DRAFT_EXISTS",
    });
  });

  test("no answer, the read names P READY → stillHere (Keep enabled, keepUnconfirmedStillHere)", () => {
    expect(reconcileKeep(null, P, read(P, "READY"))).toEqual({ kind: "stillHere" });
  });

  test("ADR unit row: after an api 500, a read naming P READY → stillHere", () => {
    const route = keepFailureRoute("INTERNAL_ERROR");
    expect(route).toEqual({ kind: "reconcile", staleCode: null });
    if (route.kind !== "reconcile") throw new Error("unreachable");
    expect(reconcileKeep(route.staleCode, P, read(P, "READY"))).toEqual({ kind: "stillHere" });
  });

  test("A1 stamp race: after a thrown Keep, a read of {P, EXPIRED, COACH_PROPOSAL_STALE} → unconfirmed", () => {
    expect(reconcileKeep(null, P, read(P, "EXPIRED", "COACH_PROPOSAL_STALE"))).toEqual({ kind: "unconfirmed" });
  });

  test("A1 clock race: after a thrown Keep, a read of {P, EXPIRED, errorCode: null} → unconfirmed", () => {
    expect(reconcileKeep(null, P, read(P, "EXPIRED"))).toEqual({ kind: "unconfirmed" });
  });

  test("no answer, the read names P with any other non-READY status → unconfirmed", () => {
    for (const status of ["FAILED", "RUNNING", "CANCELLED", "SOMETHING_NEW"]) {
      expect(reconcileKeep(null, P, read(P, status)), status).toEqual({ kind: "unconfirmed" });
    }
  });

  test("no answer, the read does not name P → unconfirmed (never 'not kept': a Keep past its lookup can still commit)", () => {
    expect(reconcileKeep(null, P, read(null, "NONE"))).toEqual({ kind: "unconfirmed" });
    expect(reconcileKeep(null, P, read(Q, "READY"))).toEqual({ kind: "unconfirmed" });
  });

  for (const staleCode of [null, "COACH_DRAFT_EXISTS", "COACH_PROPOSAL_STALE"] as (KeepStaleCode | null)[]) {
    const after = staleCode ?? "no answer";
    test(`after ${after}: the read is 403 → accessEnded, 404 → hidden, anything else → unconfirmed`, () => {
      expect(reconcileKeep(staleCode, P, readFailed("ACCESS_DENIED"))).toEqual({ kind: "accessEnded" });
      expect(reconcileKeep(staleCode, P, readFailed("NOT_FOUND"))).toEqual({ kind: "hidden" });
      for (const code of ["FAILED", "INTERNAL_ERROR", "COACH_AI_BUSY", "CATALOG_UNAVAILABLE"]) {
        expect(reconcileKeep(staleCode, P, readFailed(code)), code).toEqual({ kind: "unconfirmed" });
      }
    });
  }
});
