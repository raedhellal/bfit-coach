"use server";

import { revalidatePath } from "next/cache";
import {
  coachApi,
  isCatalogUnavailable,
  isForbidden,
  isPlanEmpty,
  isRepairsUnacknowledged,
  type CatalogPage,
  type CoachRoutineDraft,
  type CoachRoutineDraftRequest,
  type PublishPreview,
  type PublishResult,
} from "./coachApi";

/**
 * EV-184b's write path. Server actions are the only way the routine editor — a client
 * island — reaches b-fit-api: the bearer token, the base URL and every provisional
 * path stay on the server, and the browser sees nothing but these five signatures.
 *
 * Each action returns a RESULT rather than throwing. The editor has to distinguish
 * four refusals from each other (empty plan, catalog down, unacknowledged repairs,
 * everything else) and each one has its own sentence in the story; a thrown error
 * would collapse them into one error boundary. The `code`s below are this surface's
 * own vocabulary — the api's codes are translated once, here, by the predicates in
 * `coachApi.ts`, so a renamed api code is a one-line change.
 */

export type RoutineFailure =
  | "SCOPE_MISSING"
  | "PLAN_EMPTY"
  | "CATALOG_UNAVAILABLE"
  | "REPAIRS_UNACKNOWLEDGED"
  | "FAILED";

function classify(err: unknown): RoutineFailure {
  if (isPlanEmpty(err)) return "PLAN_EMPTY";
  if (isCatalogUnavailable(err)) return "CATALOG_UNAVAILABLE";
  if (isRepairsUnacknowledged(err)) return "REPAIRS_UNACKNOWLEDGED";
  if (isForbidden(err)) return "SCOPE_MISSING";
  return "FAILED";
}

/** The routine tab's own route, so a publish is visible on the next server render. */
function revalidateRoutine(clientId: string): void {
  revalidatePath(`/clients/${clientId}/routine`);
  revalidatePath(`/clients/${clientId}`);
}

export type SaveDraftResult =
  | { ok: true; draft: CoachRoutineDraft }
  | { ok: false; code: RoutineFailure };

export async function saveDraftAction(
  clientId: string,
  draft: CoachRoutineDraftRequest
): Promise<SaveDraftResult> {
  try {
    const saved = await coachApi.saveRoutineDraft(clientId, draft);
    revalidateRoutine(clientId);
    return { ok: true, draft: saved };
  } catch (err) {
    return { ok: false, code: classify(err) };
  }
}

export type DiscardDraftResult = { ok: true } | { ok: false; code: RoutineFailure };

export async function discardDraftAction(clientId: string): Promise<DiscardDraftResult> {
  try {
    await coachApi.discardRoutineDraft(clientId);
    revalidateRoutine(clientId);
    return { ok: true };
  } catch (err) {
    return { ok: false, code: classify(err) };
  }
}

export type PreviewResult =
  | { ok: true; preview: PublishPreview }
  | { ok: false; code: RoutineFailure };

/**
 * Save, then preview — one action, deliberately.
 *
 * EV-184 AC3 starts from "a saved draft", and the digest the preview hands back is an
 * acknowledgement OF that draft (ruling 2). If the editor could preview unsaved edits,
 * the coach would acknowledge repairs computed against a plan the server has never
 * seen, and publish would then either refuse with a 409 the coach cannot act on or —
 * worse — publish the older saved draft. Pressing Publish therefore commits the draft
 * first, which is also what a coach expects the button to mean.
 */
export async function previewPublishAction(
  clientId: string,
  draft: CoachRoutineDraftRequest
): Promise<PreviewResult> {
  try {
    await coachApi.saveRoutineDraft(clientId, draft);
    const preview = await coachApi.previewPublish(clientId);
    return { ok: true, preview };
  } catch (err) {
    return { ok: false, code: classify(err) };
  }
}

export type PublishActionResult =
  | { ok: true; result: PublishResult }
  | { ok: false; code: RoutineFailure };

export async function publishAction(
  clientId: string,
  digest: string
): Promise<PublishActionResult> {
  try {
    const result = await coachApi.publishRoutine(clientId, digest);
    revalidateRoutine(clientId);
    return { ok: true, result };
  } catch (err) {
    return { ok: false, code: classify(err) };
  }
}

export type CatalogResult =
  | { ok: true; page: CatalogPage }
  | { ok: false; code: RoutineFailure };

/**
 * AC2: "selecting an exercise that does not exist in the catalog is not possible".
 * That is enforced by there being no action that accepts an exercise NAME — the only
 * way into the editor is a row returned from here, carrying its catalog slug.
 */
export async function searchCatalogAction(
  q: string,
  muscle: string,
  equipment: string
): Promise<CatalogResult> {
  try {
    return { ok: true, page: await coachApi.searchCatalog(q, muscle, equipment) };
  } catch (err) {
    return { ok: false, code: classify(err) };
  }
}
