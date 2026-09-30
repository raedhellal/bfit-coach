"use server";

import { revalidatePath } from "next/cache";
import {
  coachApi,
  type CatalogPage,
  type CoachRoutineDraftRequest,
  type CoachRoutineDraftResponse,
  type PublishPreview,
  type PublishResult,
  type Routine,
} from "./coachApi";
import { routineFailure, type RoutineFailure } from "./routineFailure";

/**
 * EV-184b's write path, re-contracted by BUG-195c. Server actions are the only way the
 * routine editor — a client island — reaches b-fit-api: the bearer token, the base URL
 * and every path stay on the server, and the browser sees nothing but these signatures.
 *
 * Each action returns a RESULT rather than throwing. The editor distinguishes nine
 * refusals and each has its own sentence (or, for a 409, its own dialog); a thrown
 * error would collapse them into one error boundary. The api's codes are translated
 * once, by `routineFailure` in `src/lib/routineFailure.ts` — pure, so its mapping is
 * unit-tested with no server at all.
 *
 * ADR-0015 D5: a 403 is `ACCESS_DENIED` and nothing more specific — the api's denial
 * body is identical for a scope denial, a foreign id, a revoked link and an id that
 * never existed, so a write that comes back 403 means access ended.
 */
export type { RoutineFailure };

/**
 * The routine tab's own route, so a publish is visible on the next server render —
 * and the roster, because EV-283b's "Plan changed" marker is derived from the same
 * write: a publish sets `routineChangedSinceYourPublish` back to false, so the row it
 * came from is stale the moment this action returns. Next 14.2 happens to purge the
 * whole client router cache on ANY revalidate, which would clear the marker without
 * this line; that is an implementation detail of one Next version, not a contract,
 * so the roster is named here explicitly.
 */
function revalidateRoutine(clientId: string): void {
  revalidatePath(`/clients/${clientId}/routine`);
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/");
}

export type SaveDraftResult =
  | { ok: true; draft: CoachRoutineDraftResponse }
  | { ok: false; failure: RoutineFailure };

/**
 * `PUT …/routine/draft` with the body `forDraftSave` built. The response is the STORED
 * draft: its `updatedAt` is the token the NEXT save must echo, and its document carries
 * the four fields the server resolved.
 */
export async function saveDraftAction(
  clientId: string,
  body: CoachRoutineDraftRequest
): Promise<SaveDraftResult> {
  try {
    const draft = await coachApi.saveRoutineDraft(clientId, body);
    revalidateRoutine(clientId);
    return { ok: true, draft };
  } catch (err) {
    return { ok: false, failure: routineFailure(err) };
  }
}

export type DiscardDraftResult = { ok: true } | { ok: false; failure: RoutineFailure };

export async function discardDraftAction(clientId: string): Promise<DiscardDraftResult> {
  try {
    await coachApi.discardRoutineDraft(clientId);
    revalidateRoutine(clientId);
    return { ok: true };
  } catch (err) {
    return { ok: false, failure: routineFailure(err) };
  }
}

export type PreviewResult =
  | { ok: true; preview: PublishPreview; draft: CoachRoutineDraftResponse }
  /**
   * `saved` is the DRAFT the first half wrote before the preview failed, or null when
   * the save itself was refused. It exists for EV-190 AC2 and for the token: a publish
   * that saved and then hit a 503 from the catalog has left the coach's work safely on
   * the server, so the unsaved-changes flag must drop — and the next save must echo the
   * `updatedAt` this one produced, or it would be refused as somebody else's draft.
   */
  | { ok: false; failure: RoutineFailure; saved: CoachRoutineDraftResponse | null };

/**
 * Save, then preview — one action, deliberately.
 *
 * EV-184 AC3 starts from "a saved draft", and the digest the preview hands back is an
 * acknowledgement OF that draft (ruling 2). If the editor could preview unsaved edits,
 * the coach would acknowledge repairs computed against a plan the server has never
 * seen, and publish would then either refuse with a 409 the coach cannot act on or —
 * worse — publish the older saved draft. Pressing Publish therefore commits the draft
 * first, which is also what a coach expects the button to mean.
 *
 * The save carries the editor's token like any other save, so a Publish pressed over a
 * draft somebody else changed is a `409 COACH_DRAFT_EXISTS` BEFORE anything is written
 * or previewed — never a silent overwrite followed by a preview of the wrong plan.
 */
export async function previewPublishAction(
  clientId: string,
  body: CoachRoutineDraftRequest
): Promise<PreviewResult> {
  let saved: CoachRoutineDraftResponse | null = null;
  try {
    saved = await coachApi.saveRoutineDraft(clientId, body);
    revalidateRoutine(clientId);
    const preview = await coachApi.previewPublish(clientId);
    return { ok: true, preview, draft: saved };
  } catch (err) {
    return { ok: false, failure: routineFailure(err), saved };
  }
}

export type PublishActionResult =
  | { ok: true; result: PublishResult }
  | { ok: false; failure: RoutineFailure };

export async function publishAction(
  clientId: string,
  digest: string
): Promise<PublishActionResult> {
  try {
    const result = await coachApi.publishRoutine(clientId, digest);
    revalidateRoutine(clientId);
    return { ok: true, result };
  } catch (err) {
    return { ok: false, failure: routineFailure(err) };
  }
}

export type ReloadResult =
  | {
      ok: true;
      /** The live plan, or null when there is none (or it carries no routine document). */
      published: { planId: string | null; planName: string | null; document: Routine } | null;
      /** The saved draft, or null when there is none. */
      draft: { document: Routine; updatedAt: string } | null;
    }
  | { ok: false; failure: RoutineFailure };

/**
 * BUG-195c — "Load the saved version", the conflict dialog's non-destructive answer.
 *
 * The same two reads the page makes, so the editor re-seeds from what the server holds
 * NOW rather than from props a render ago. A draft that has meanwhile been published or
 * discarded reads as `draft: null`, and the editor falls back to the live plan exactly
 * as a fresh page load would.
 */
export async function reloadRoutineAction(clientId: string): Promise<ReloadResult> {
  try {
    const routine = await coachApi.getRoutine(clientId);
    const published = routine.routine
      ? { planId: routine.planId, planName: routine.planName, document: routine.routine }
      : null;
    if (!routine.hasDraft) return { ok: true, published, draft: null };
    const saved = await coachApi.getRoutineDraft(clientId);
    const draft =
      saved?.document && saved.updatedAt ? { document: saved.document, updatedAt: saved.updatedAt } : null;
    return { ok: true, published, draft };
  } catch (err) {
    return { ok: false, failure: routineFailure(err) };
  }
}

export type CatalogResult =
  | { ok: true; page: CatalogPage }
  | { ok: false; code: RoutineFailure["code"] };

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
    return { ok: false, code: routineFailure(err).code };
  }
}
