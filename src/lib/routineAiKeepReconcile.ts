/**
 * BUG-869 / BUG-870: what the routine AI panel shows after a « Garder » (Keep) that did not come
 * back `200`. Binding design: ADR-0036 § Amendment BUG-869/870 (hub `docs/adr0036-bug869-870`),
 * its decision table, staff's A1 and A3 rules, and senior-po's copy on EV-186 (hub b6be4c95).
 *
 * A pure module (no `server-only`, no React) so `qa/routine-ai-keep-reconcile-unit.spec.ts` can
 * hold every row of the table, including the two races QA cannot drive live.
 *
 * The rule: after any Keep result other than 200, 400, 403 or 404, the panel reads
 * `GET …/routine/ai-proposal` once and branches on "does that read still name P?". It never infers
 * "kept". It shows what the server holds, or says it could not confirm.
 *
 * ⚠ For Keep, this reconcile REPLACES the portal's lost-answer rule (`src/lib/lostAnswer.ts`,
 * BUG-523 / BUG-711), on purpose. That rule reads a plain 500 as a received failure. Keep reconciles
 * a 500 instead: a 500 raised after Keep's transaction committed is a real committed case, and the
 * reconcile never asserts a refusal the read does not show (ADR-0036 A3). Do not "fix" Keep back to
 * `isLostAnswer`: that brings back "Nothing was changed" for a draft that was written.
 */

/** The two 409 codes the api's Keep sends (openapi `/keep`, b-fit-api main @ 4f7be130). */
export type KeepStaleCode = "COACH_DRAFT_EXISTS" | "COACH_PROPOSAL_STALE";

/**
 * The codes Keep answers with a `400`, which keep today's handling (the code's own sentence, no
 * read). The failure the server action returns carries the code but not the status
 * (`routineAiActions.ts` is unchanged, ADR-0036 A3), so the 400 row is matched by code. Traced on
 * b-fit-api main @ 4f7be130:
 *   · `VALIDATION_ERROR` (proposalId missing) and `COACH_DRAFT_INPUT_FORBIDDEN` (any other key):
 *     the openapi `/keep` 400 description;
 *   · `COACH_DRAFT_SUBJECT_FIELD` and `COACH_DRAFT_REPS_ON_DURATION`: `keepProposal` →
 *     `CoachDraftResolution.resolve` → `CoachDraftDocument.requireCoachShaped`, a
 *     `PlanValidationException` that `RestExceptionHandler.handlePlanValidation` answers 400.
 * Every other code is "no answer" for Keep, so an unknown 400 code is reconciled: the read decides,
 * and nothing false is said either way.
 */
export const KEEP_400_CODES: ReadonlySet<string> = new Set([
  "VALIDATION_ERROR",
  "COACH_DRAFT_INPUT_FORBIDDEN",
  "COACH_DRAFT_SUBJECT_FIELD",
  "COACH_DRAFT_REPS_ON_DURATION",
]);

/** What a refused Keep leads to, before any read. */
export type KeepFailureRoute =
  /** 403: the link ended. */
  | { kind: "accessEnded" }
  /** 404: the routes are off on this server. */
  | { kind: "hidden" }
  /** 400: the code's own sentence, as today. */
  | { kind: "refused" }
  /** Read the proposal once. `staleCode` is the 409's own code, or null for "no answer". */
  | { kind: "reconcile"; staleCode: KeepStaleCode | null };

/**
 * `code` is the server action's failure code: `ACCESS_DENIED` (403), `NOT_FOUND` (404), the api's
 * code, or `FAILED` (a transport error, a code-less gateway 5xx, the browser's `settled` fallback).
 * "No answer" is any of those last ones, any 5xx including a plain 500, and any non-200 the table
 * does not name (401, 429, another 409 such as `ONBOARDING_REQUIRED`, …).
 */
export function keepFailureRoute(code: string): KeepFailureRoute {
  if (code === "ACCESS_DENIED") return { kind: "accessEnded" };
  if (code === "NOT_FOUND") return { kind: "hidden" };
  if (KEEP_400_CODES.has(code)) return { kind: "refused" };
  if (code === "COACH_DRAFT_EXISTS" || code === "COACH_PROPOSAL_STALE") return { kind: "reconcile", staleCode: code };
  return { kind: "reconcile", staleCode: null };
}

/** The reconcile read, as the panel got it. */
export type KeepReadOutcome =
  /** `errorCode` is never consulted: an EXPIRED P reads the same with or without COACH_PROPOSAL_STALE (A1). */
  | { ok: true; proposal: { proposalId?: string | null; status?: string | null; errorCode?: string | null } }
  /** `ACCESS_DENIED`, `NOT_FOUND`, or anything else (`FAILED`, a 502/503/504, the `settled` fallback). */
  | { ok: false; code: string };

export type KeepReconcile =
  /** A 409 and the read still names P (any status): today's `stale` view, with the 409's own code. */
  | { kind: "stale"; code: KeepStaleCode }
  /** No answer and the read names P `READY`: the same proposal, « Garder » enabled, `keepUnconfirmedStillHere`. */
  | { kind: "stillHere" }
  /** The read cannot show P still offered: one alert and « Show what's saved », no Keep, no paid « Try again ». */
  | { kind: "unconfirmed" }
  | { kind: "accessEnded" }
  | { kind: "hidden" };

function sameId(a: string | null | undefined, b: string): boolean {
  return typeof a === "string" && a.toLowerCase() === b.toLowerCase();
}

/**
 * ADR-0036 § Amendment BUG-869/870's table, rows 3 to 10. `staleCode` is the Keep's 409 code, or
 * null when the Keep had no answer; `proposalId` is P, the proposal the Keep named.
 *
 * Why a non-READY P after "no answer" is `unconfirmed`, never `stale` (staff A1): `proposal()` is
 * several READ COMMITTED statements, not one snapshot. A Keep that commits between its lookup and
 * its draft-stamp read is answered `{P, EXPIRED, COACH_PROPOSAL_STALE}` (the stamp race), and
 * `isExpired` can cross `expires_at` after Keep's own check while the Keep still commits (the clock
 * race). Only P `READY` proves the Keep had not committed when the stamp read ran.
 *
 * Why a read that does not name P is `unconfirmed`, never "not kept": no row with id P ever exists
 * again after its Keep commits (I1), but a Keep already past its lookup can still commit after the
 * read (ADR B1).
 *
 * Why the 409 path may say `stale` when P is still named: the competing write that caused the 409
 * committed before the 409 was sent, so the following read is not exposed to the A1 race.
 */
export function reconcileKeep(staleCode: KeepStaleCode | null, proposalId: string, read: KeepReadOutcome): KeepReconcile {
  if (!read.ok) {
    if (read.code === "ACCESS_DENIED") return { kind: "accessEnded" };
    if (read.code === "NOT_FOUND") return { kind: "hidden" };
    return { kind: "unconfirmed" };
  }
  const namesP = sameId(read.proposal.proposalId, proposalId);
  if (staleCode !== null) return namesP ? { kind: "stale", code: staleCode } : { kind: "unconfirmed" };
  return namesP && read.proposal.status === "READY" ? { kind: "stillHere" } : { kind: "unconfirmed" };
}
