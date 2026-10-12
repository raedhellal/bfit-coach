"use server";

import { revalidatePath } from "next/cache";
import { coachApi, type CoachTrialSessionRequest, type RoutineTrainingDay } from "./coachApi";
import { isClientId } from "./clientOverview";
import { asTrialRead, trialFailure, type TrialFailure, type TrialRead } from "./trialSession";

/**
 * EV-341j — the trial session's writes and the two template reads « Partir d'un modèle »
 * needs. Server actions like every write on this portal (ADR-0033 D33.6): each returns a
 * RESULT, never throws, and the card calls each through `settled` (a failed action request
 * resolves `undefined`).
 *
 * The assign and the withdraw keep `revalidatePath` (D33.6): the Programme tab re-renders with
 * the action's answer, and the roster's J4 pill is fresh on the next visit rather than after
 * the router cache's 30 s. The preview writes nothing and revalidates nothing.
 *
 * Nothing here is ever retried: a lost 201 followed by a retry is a 409
 * TRIAL_SESSION_ALREADY_OPEN, and a preview's digest is only good for the body it was made of.
 */

function revalidateTrial(clientId: string): void {
  revalidatePath(`/clients/${clientId}/routine`);
  revalidatePath("/");
}

export type TrialPreviewResult =
  | { ok: true; repairs: string[]; digest: string }
  | { ok: false; failure: TrialFailure };

export async function previewTrialSessionAction(
  clientId: string,
  body: CoachTrialSessionRequest
): Promise<TrialPreviewResult> {
  if (!isClientId(clientId)) return { ok: false, failure: "ACCESS_DENIED" };
  try {
    const preview = await coachApi.previewTrialSession(clientId, body);
    if (typeof preview?.digest !== "string" || !Array.isArray(preview.repairs)) return { ok: false, failure: "FAILED" };
    return { ok: true, repairs: preview.repairs.filter((r): r is string => typeof r === "string"), digest: preview.digest };
  } catch (err) {
    return { ok: false, failure: trialFailure(err) };
  }
}

export type TrialWriteResult = { ok: true; read: TrialRead | null } | { ok: false; failure: TrialFailure };

/** J2 — phase two: the previewed body, verbatim, plus the preview's digest. */
export async function assignTrialSessionAction(
  clientId: string,
  body: CoachTrialSessionRequest,
  digest: string
): Promise<TrialWriteResult> {
  if (!isClientId(clientId)) return { ok: false, failure: "ACCESS_DENIED" };
  try {
    const read = await coachApi.assignTrialSession(clientId, body, digest);
    revalidateTrial(clientId);
    return { ok: true, read: asTrialRead(read) };
  } catch (err) {
    const failure = trialFailure(err);
    // Another tab assigned one meanwhile: the page re-reads and shows it.
    if (failure === "ALREADY_OPEN") revalidateTrial(clientId);
    return { ok: false, failure };
  }
}

/** J3b — the withdraw (idempotent on the api: with nothing open it answers the same read). */
export async function withdrawTrialSessionAction(clientId: string): Promise<TrialWriteResult> {
  if (!isClientId(clientId)) return { ok: false, failure: "ACCESS_DENIED" };
  try {
    const read = await coachApi.withdrawTrialSession(clientId);
    revalidateTrial(clientId);
    return { ok: true, read: asTrialRead(read) };
  } catch (err) {
    return { ok: false, failure: trialFailure(err) };
  }
}

export type TemplateChoicesResult =
  | { ok: true; templates: { id: string; name: string }[] }
  | { ok: false };

/** J1 « Partir d'un modèle », step 1: the coach's library, names only. */
export async function trialTemplateChoicesAction(): Promise<TemplateChoicesResult> {
  try {
    const list = await coachApi.listTemplates();
    const templates = Array.isArray(list?.templates) ? list.templates : [];
    return { ok: true, templates: templates.map((t) => ({ id: t.id, name: t.name })) };
  } catch {
    return { ok: false };
  }
}

export type TemplateDaysResult = { ok: true; days: RoutineTrainingDay[] } | { ok: false };

/** J1 « Partir d'un modèle », step 2: one template's days, to copy one day's rows from. */
export async function trialTemplateDaysAction(templateId: string): Promise<TemplateDaysResult> {
  try {
    const template = await coachApi.getTemplate(templateId);
    const days = template?.document?.trainingDays;
    return Array.isArray(days) ? { ok: true, days } : { ok: false };
  } catch {
    return { ok: false };
  }
}
