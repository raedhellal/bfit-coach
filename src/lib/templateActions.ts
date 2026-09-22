"use server";

import { revalidatePath } from "next/cache";
import {
  coachApi,
  draftExistsUpdatedAt,
  isDraftExists,
  isCatalogUnavailable,
  isForbidden,
  isPlanEmpty,
  isTemplateLimitReached,
  isTemplateNameTaken,
  isTemplateNotPublishable,
  isTemplateSourceEmpty,
  isTemplateTooLarge,
  type CoachTemplate,
  type CoachTemplateApplyResult,
  type CoachTemplateSaveRequest,
  type CoachTemplateSource,
} from "./coachApi";

/**
 * EV-188b's write path. The library pages are server components; every control on them
 * is a client island, and these actions are the only way one reaches b-fit-api — the
 * bearer token, the base URL and the nine unmerged paths all stay on the server.
 *
 * Each action returns a RESULT and never throws, for the reason `routineActions.ts`
 * gives: this story has SIX refusals with six different sentences on screen
 * (`COACH_TEMPLATE_NAME_TAKEN`, `_LIMIT_REACHED`, `_TOO_LARGE`, `_SOURCE_EMPTY`,
 * `COACH_DRAFT_EXISTS`, `CATALOG_UNAVAILABLE`), and a thrown error collapses all six
 * into one boundary. ADR-0016 D9.5 exists because a template limit reported as a
 * generic denial is a coach who thinks the product is broken; throwing here would undo
 * that on the web side.
 *
 * ⚠ Every call site must wrap these in `settled()` — a server action whose REQUEST
 * fails resolves with `undefined` rather than rejecting, and in this story the state
 * that would be lost is a template the coach has been building for ten minutes.
 */

export type TemplateFailure =
  | "ACCESS_DENIED"
  | "NAME_TAKEN"
  | "LIMIT_REACHED"
  | "TOO_LARGE"
  | "SOURCE_EMPTY"
  | "NOT_PUBLISHABLE"
  | "PLAN_EMPTY"
  | "CATALOG_UNAVAILABLE"
  | "FAILED";

function classify(err: unknown): TemplateFailure {
  if (isTemplateNameTaken(err)) return "NAME_TAKEN";
  if (isTemplateLimitReached(err)) return "LIMIT_REACHED";
  if (isTemplateTooLarge(err)) return "TOO_LARGE";
  if (isTemplateSourceEmpty(err)) return "SOURCE_EMPTY";
  if (isTemplateNotPublishable(err)) return "NOT_PUBLISHABLE";
  if (isPlanEmpty(err)) return "PLAN_EMPTY";
  if (isCatalogUnavailable(err)) return "CATALOG_UNAVAILABLE";
  /**
   * ADR-0012 D4 — the api answers ONE 403 for a foreign template, an id that never
   * existed and one deleted in another tab. The portal must not invent a distinction
   * the server refuses to make, so all three land here and read the same to the coach.
   */
  if (isForbidden(err)) return "ACCESS_DENIED";
  return "FAILED";
}

function revalidateLibrary(): void {
  revalidatePath("/templates");
}

export type TemplateResult =
  | { ok: true; template: CoachTemplate }
  | { ok: false; code: TemplateFailure };

export async function createTemplateAction(
  body: CoachTemplateSaveRequest
): Promise<TemplateResult> {
  try {
    const template = await coachApi.createTemplate(body);
    revalidateLibrary();
    return { ok: true, template };
  } catch (err) {
    return { ok: false, code: classify(err) };
  }
}

export async function updateTemplateAction(
  id: string,
  body: CoachTemplateSaveRequest
): Promise<TemplateResult> {
  try {
    const template = await coachApi.updateTemplate(id, body);
    revalidateLibrary();
    revalidatePath(`/templates/${id}`);
    return { ok: true, template };
  } catch (err) {
    return { ok: false, code: classify(err) };
  }
}

export async function renameTemplateAction(id: string, name: string): Promise<TemplateResult> {
  try {
    const template = await coachApi.renameTemplate(id, name);
    revalidateLibrary();
    return { ok: true, template };
  } catch (err) {
    return { ok: false, code: classify(err) };
  }
}

export async function duplicateTemplateAction(id: string): Promise<TemplateResult> {
  try {
    const template = await coachApi.duplicateTemplate(id);
    revalidateLibrary();
    return { ok: true, template };
  } catch (err) {
    return { ok: false, code: classify(err) };
  }
}

export type DeleteTemplateResult = { ok: true } | { ok: false; code: TemplateFailure };

export async function deleteTemplateAction(id: string): Promise<DeleteTemplateResult> {
  try {
    await coachApi.deleteTemplate(id);
    revalidateLibrary();
    return { ok: true };
  } catch (err) {
    return { ok: false, code: classify(err) };
  }
}

export async function saveAsTemplateAction(
  clientId: string,
  name: string,
  source: CoachTemplateSource
): Promise<TemplateResult> {
  try {
    const template = await coachApi.saveRoutineAsTemplate(clientId, { name, source });
    revalidateLibrary();
    return { ok: true, template };
  } catch (err) {
    return { ok: false, code: classify(err) };
  }
}

/**
 * AC3's apply, in the ONE shape ADR-0016 D9.1 permits.
 *
 * `replacesDraftUpdatedAt` is omitted on the first attempt — absent means "only if
 * there is no draft" — and the caller retries with the timestamp this result hands
 * back. There is no force, and there is no pre-read: the dialog that says "this
 * replaces your unpublished draft" is shown only once the server has said one exists,
 * and the retry asserts the exact draft the coach was told about. A second tab that
 * saved in between produces `DRAFT_EXISTS` a second time, with a NEW timestamp, and the
 * coach is asked again about the draft that is actually there.
 *
 * `DRAFT_EXISTS` with a null `existingUpdatedAt` is its own outcome and not a retryable
 * one: retrying without the assertion would destroy a draft on a guess.
 */
export type ApplyTemplateResult =
  | { ok: true; applied: CoachTemplateApplyResult }
  | { ok: false; code: "DRAFT_EXISTS"; existingUpdatedAt: string | null }
  | { ok: false; code: TemplateFailure };

export async function applyTemplateAction(
  templateId: string,
  clientId: string,
  replacesDraftUpdatedAt?: string
): Promise<ApplyTemplateResult> {
  try {
    const applied = await coachApi.applyTemplate(templateId, clientId, replacesDraftUpdatedAt);
    // The trainee's routine tab now has a draft on it. Nothing about their PLAN
    // changed — apply writes no `plans` row — so only the coach's own views are stale.
    revalidatePath(`/clients/${clientId}/routine`);
    revalidatePath(`/clients/${clientId}`);
    return { ok: true, applied };
  } catch (err) {
    if (isDraftExists(err)) {
      return { ok: false, code: "DRAFT_EXISTS", existingUpdatedAt: draftExistsUpdatedAt(err) };
    }
    return { ok: false, code: classify(err) };
  }
}
