"use server";

import { ApiError } from "./apiFetch";
import {
  coachApi,
  type CoachRoutineAiProposalRequest,
  type CoachRoutineAiProposalResponse,
} from "./coachApi";
import type { RoutineAiFailure } from "./routineAi";

/**
 * EV-186b — the routine AI panel's writes and its one poll (Keep is EV-186n's), as server actions:
 * the bearer, the base URL and the paths stay on the server; the island sees these signatures.
 *
 * Each returns a RESULT and never throws, for the same reason as `routineActions.ts`: the
 * panel has a sentence per refusal code and a thrown error would collapse them into one
 * boundary. A 403 is `ACCESS_DENIED` and nothing more (ADR-0015 D5: the denial body is the
 * same for a revoked link, a missing scope and a foreign id). A 404 is `NOT_FOUND`: the routes
 * are unregistered while `bfit.coach-ai.routine.enabled` is off, so the flag went off after
 * this page was drawn. No answer at all (a timeout, a lost connection) is `FAILED`.
 *
 * The api's `message` is NOT carried in any result: the panel renders the sentence for the
 * code (EV-186b B4), and a field that is not there cannot be rendered by mistake.
 */

export type RoutineAiActionFailure = RoutineAiFailure | { code: "ACCESS_DENIED" };

function aiFailure(err: unknown): RoutineAiActionFailure {
  if (!(err instanceof ApiError)) return { code: "FAILED" };
  if (err.status === 403) return { code: "ACCESS_DENIED" };
  if (err.status === 404) return { code: "NOT_FOUND" };
  const scope = err.details?.scope;
  return {
    code: err.code ?? "FAILED",
    scope: scope === "link" || scope === "coach" ? scope : null,
    retryAfterSeconds: err.retryAfterSeconds,
  };
}

export type StartRoutineAiResult =
  | { ok: true; proposalId: string }
  | { ok: false; failure: RoutineAiActionFailure };

/** « Générer » — `POST …/routine/ai-proposal`. Writes no plan and no draft (EV-186a A1). */
export async function startRoutineAiAction(
  clientId: string,
  body: CoachRoutineAiProposalRequest
): Promise<StartRoutineAiResult> {
  try {
    const started = await coachApi.startRoutineAiProposal(clientId, body);
    return { ok: true, proposalId: started.proposalId };
  } catch (err) {
    return { ok: false, failure: aiFailure(err) };
  }
}

export type ReadRoutineAiResult =
  | { ok: true; proposal: CoachRoutineAiProposalResponse }
  | { ok: false; failure: RoutineAiActionFailure };

/** The poll — `GET …/routine/ai-proposal` (no-store on the api, and `apiFetch` never caches). */
export async function readRoutineAiAction(clientId: string): Promise<ReadRoutineAiResult> {
  try {
    return { ok: true, proposal: await coachApi.getRoutineAiProposal(clientId) };
  } catch (err) {
    return { ok: false, failure: aiFailure(err) };
  }
}

export type DiscardRoutineAiResult = { ok: true } | { ok: false; failure: RoutineAiActionFailure };

/** « Écarter » — `DELETE …/routine/ai-proposal`, idempotent. The quota unit is not given back. */
export async function discardRoutineAiAction(clientId: string): Promise<DiscardRoutineAiResult> {
  try {
    await coachApi.discardRoutineAiProposal(clientId);
    return { ok: true };
  } catch (err) {
    return { ok: false, failure: aiFailure(err) };
  }
}
