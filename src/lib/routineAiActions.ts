"use server";

import { revalidatePath } from "next/cache";
import { ApiError } from "./apiFetch";
import {
  coachApi,
  type CoachRoutineAiProposalRequest,
  type CoachRoutineAiProposalResponse,
  type CoachRoutineDraftResponse,
} from "./coachApi";
import type { RoutineAiFailure } from "./routineAi";

/**
 * EV-186b / EV-186n / EV-186f — the routine AI panel's writes (start, discard, keep) and its one poll, as server actions:
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

/**
 * « Générer » — `POST …/routine/ai-proposal`, for both kinds: a REGENERATE brief (EV-186b) or a
 * REVISE request (EV-186f). The body is built by `briefRequest` / `reviseRequest` and passed
 * through untouched. Writes no plan and no draft (EV-186a A1, EV-186e).
 */
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

/**
 * « Écarter » — `DELETE …/routine/ai-proposal`, idempotent. The quota unit is not given back.
 * EV-376: `proposalId` is the one the panel is showing, when it knows it, so a run another tab
 * started since is left alone (the api answers 204 and touches nothing).
 */
export async function discardRoutineAiAction(
  clientId: string,
  proposalId?: string | null
): Promise<DiscardRoutineAiResult> {
  try {
    await coachApi.discardRoutineAiProposal(clientId, proposalId);
    return { ok: true };
  } catch (err) {
    return { ok: false, failure: aiFailure(err) };
  }
}

export type KeepRoutineAiResult =
  | { ok: true; draft: CoachRoutineDraftResponse }
  | { ok: false; failure: RoutineAiActionFailure };

/**
 * « Garder » — `POST …/routine/ai-proposal/keep`. The kept DRAFT comes back as stored; nothing
 * is published (the trainee's app still shows the old plan).
 *
 * Then, best effort, the settled proposal is deleted. The api keeps a kept proposal READY until
 * it expires (a second Keep of it is `409 COACH_DRAFT_EXISTS`), so without this a reload would
 * offer the coach the suggestion they just kept, whose only possible outcome is that 409. A
 * failed delete changes nothing the coach did: the draft is written either way. The delete names
 * THIS proposal (EV-376, staff ruling 1b on EV-186n): a Regenerate another tab started between
 * the Keep and the delete is no longer cancelled by it.
 *
 * Revalidated like every draft write, so the page's next render carries the kept draft and its
 * `aiDraftedAt`; the editor re-seeds from THIS response, not from that render.
 */
export async function keepRoutineAiAction(clientId: string, proposalId: string): Promise<KeepRoutineAiResult> {
  let draft: CoachRoutineDraftResponse;
  try {
    draft = await coachApi.keepRoutineAiProposal(clientId, { proposalId });
  } catch (err) {
    return { ok: false, failure: aiFailure(err) };
  }
  await coachApi.discardRoutineAiProposal(clientId, proposalId).catch(() => undefined);
  revalidatePath(`/clients/${clientId}/routine`);
  revalidatePath(`/clients/${clientId}`);
  return { ok: true, draft };
}
