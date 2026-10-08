"use server";

import { revalidatePath } from "next/cache";
import {
  ApiError,
  coachApi,
  isForbidden,
  isNutritionTemplateLimitReached,
  isNutritionTemplateNameTaken,
  isValidationError,
  isWeekApplyRateLimited,
  isWeekGenerationInProgress,
  type CoachTargetsResult,
  type NutritionTemplate,
  type NutritionTemplateTargetsRequest,
} from "./coachApi";

/**
 * EV-273b's write path. Same shape and reasoning as `templateActions.ts`: every action
 * returns a RESULT and never throws, and every call site wraps it in `settled()`.
 *
 * ── The library (AC1, AC2) ──────────────────────────────────────────────────
 * A save body is built HERE from two named values, `{ name, targets }`, and the targets
 * object from four named numbers. Nothing is spread in from the caller, so no key the
 * client island happened to hold (a stored `mealStructure`, a future field) can ride
 * along. That is AC2's "top-level keys are exactly `name` and `targets`", made a
 * property of this file rather than of the island.
 *
 * ── "Use on a trainee" (AC4, AC5; ADR-0016b D16b.7) ─────────────────────────
 * THREE actions, called one after another from the browser, never one action running
 * the chain (rule 0): the browser must observe each step's outcome, so the prefix it
 * reports is the prefix that happened.
 *
 *   1. `readNutritionForUseAction` — the dialog-open read (rule 1). Its
 *      `currentWeekStart` is what step 3 sends.
 *   2. `applyTemplateTargetsAction`  → `PUT …/nutrition/targets`.
 *   3. `applyTemplateWeekAction`     → `POST …/nutrition/week/apply` with `{ weekStart }` and
 *      nothing else, so the week is built at the trainee's OWN structure (N6).
 *
 * The api never receives a template id at use (N3): no argument here names one.
 *
 * ── "Received" and "no answer" are different outcomes (rule 2) ─────────────
 * `ApiError` means b-fit-api answered with a status: that is RECEIVED, and a refusal is
 * a fact. Anything else thrown on the way (a network failure, a timeout, a reset
 * connection between this server and the api) means nobody knows whether the write
 * landed, so it is `NO_ANSWER` — never folded into a refusal. The browser-side twin of
 * the same case is the `settled()` fallback at the call site: a server action whose
 * REQUEST fails resolves `undefined`, and the island maps that to `NO_ANSWER` too.
 *
 * One exception to "a status is a refusal" (BUG-523, senior-po's ruling of 2026-09-30,
 * extending BUG-248's rule for a lost answer): a `502`, `503` or `504` is a status the
 * portal received, but from whatever stands between it and b-fit-api, which may have
 * written behind it. It does not prove nothing changed, so it is `NO_ANSWER`. None of the
 * three is a refusal b-fit-api itself sends on these endpoints (see `coachApi.ts`'s table).
 */

export type NutritionTemplateFailure =
  | "NAME_TAKEN"
  | "LIMIT_REACHED"
  | "OUT_OF_BOUNDS"
  | "ACCESS_DENIED"
  | "FAILED";

function classify(err: unknown): NutritionTemplateFailure {
  if (isNutritionTemplateNameTaken(err)) return "NAME_TAKEN";
  if (isNutritionTemplateLimitReached(err)) return "LIMIT_REACHED";
  if (isValidationError(err)) return "OUT_OF_BOUNDS";
  // One 403 for foreign, unknown and deleted (EV-273a AC4). Not an existence oracle.
  if (isForbidden(err)) return "ACCESS_DENIED";
  return "FAILED";
}

function revalidateLibrary(): void {
  revalidatePath("/nutrition-templates");
}

/** The four numbers, by name — never the caller's object. */
function targetsOf(t: NutritionTemplateTargetsRequest): NutritionTemplateTargetsRequest {
  return { calories: t.calories, proteinG: t.proteinG, carbsG: t.carbsG, fatG: t.fatG };
}

export type NutritionTemplateResult =
  | { ok: true; template: NutritionTemplate }
  | { ok: false; code: NutritionTemplateFailure };

export async function createNutritionTemplateAction(
  name: string,
  targets: NutritionTemplateTargetsRequest
): Promise<NutritionTemplateResult> {
  try {
    const template = await coachApi.createNutritionTemplate({ name, targets: targetsOf(targets) });
    revalidateLibrary();
    return { ok: true, template };
  } catch (err) {
    return { ok: false, code: classify(err) };
  }
}

/** Edit: the editor holds every field it sends. A rename from the library uses `renameNutritionTemplateAction`. */
export async function updateNutritionTemplateAction(
  id: string,
  name: string,
  targets: NutritionTemplateTargetsRequest
): Promise<NutritionTemplateResult> {
  try {
    const template = await coachApi.updateNutritionTemplate(id, {
      name,
      targets: targetsOf(targets),
    });
    revalidateLibrary();
    revalidatePath(`/nutrition-templates/${id}`);
    return { ok: true, template };
  } catch (err) {
    return { ok: false, code: classify(err) };
  }
}

/**
 * Rename (staff follow-up to EV-273b). The api has no rename mapping: a rename is a
 * whole PUT of `{ name, targets }`. The library row's targets are what was RENDERED, so
 * sending them from a tab left open reverted targets another tab had saved since
 * (witnessed: tab B saved 2000 kcal, stale tab A renamed, the row went back to 1800).
 * So the targets are READ here, from the api, immediately before the write.
 *
 * ⚠ This NARROWS the window, it does not close it. The api takes no If-Match and no
 * version on this PUT, so an edit that lands between this GET and this PUT is still
 * overwritten. Closing it needs a rename mapping or a precondition on the api's side.
 */
export async function renameNutritionTemplateAction(
  id: string,
  name: string
): Promise<NutritionTemplateResult> {
  try {
    const current = await coachApi.getNutritionTemplate(id);
    const template = await coachApi.updateNutritionTemplate(id, {
      name,
      targets: targetsOf(current.targets),
    });
    revalidateLibrary();
    revalidatePath(`/nutrition-templates/${id}`);
    return { ok: true, template };
  } catch (err) {
    return { ok: false, code: classify(err) };
  }
}

export async function duplicateNutritionTemplateAction(
  id: string
): Promise<NutritionTemplateResult> {
  try {
    const template = await coachApi.duplicateNutritionTemplate(id);
    revalidateLibrary();
    return { ok: true, template };
  } catch (err) {
    return { ok: false, code: classify(err) };
  }
}

export async function deleteNutritionTemplateAction(
  id: string
): Promise<{ ok: true } | { ok: false; code: NutritionTemplateFailure }> {
  try {
    await coachApi.deleteNutritionTemplate(id);
    revalidateLibrary();
    return { ok: true };
  } catch (err) {
    return { ok: false, code: classify(err) };
  }
}

/* ── "Use on a trainee" ──────────────────────────────────────────────────── */

export type UseFailure = "ACCESS_DENIED" | "REFUSED" | "NO_ANSWER";

/** BUG-523 — the gateway statuses: received, but not an answer from the api. */
const GATEWAY_STATUSES: ReadonlySet<number> = new Set([502, 503, 504]);

function classifyUse(err: unknown): UseFailure {
  if (!(err instanceof ApiError)) return "NO_ANSWER";
  if (GATEWAY_STATUSES.has(err.status)) return "NO_ANSWER";
  if (isForbidden(err)) return "ACCESS_DENIED";
  return "REFUSED";
}

/** What the confirm dialog needs from the fresh read, and nothing else. */
export interface UseReading {
  targets: NutritionTemplateTargetsRequest | null;
  currentWeekStart: string;
}

export type ReadForUseResult = { ok: true; reading: UseReading } | { ok: false; code: UseFailure };

/** Rule 1 — issued when the dialog OPENS, not at page render. */
export async function readNutritionForUseAction(clientId: string): Promise<ReadForUseResult> {
  try {
    const nutrition = await coachApi.getNutrition(clientId);
    return {
      ok: true,
      reading: {
        targets: nutrition.targets ? targetsOf(nutrition.targets) : null,
        currentWeekStart: nutrition.currentWeekStart,
      },
    };
  } catch (err) {
    return { ok: false, code: classifyUse(err) };
  }
}

/**
 * "Use on a trainee" writes the targets and the week the trainee's nutrition tab AND the
 * overview's nutrition card draw, so both are revalidated (EV-337m, staff nit 3; the same
 * reason as `revalidateNutrition` in `nutritionActions.ts`). Next 14.2 happens to purge the
 * whole client router cache on ANY revalidate, so the overview is fresh today without the
 * second line; that is one Next version's implementation detail, not a contract.
 */
function revalidateTraineeNutrition(clientId: string): void {
  revalidatePath(`/clients/${clientId}/nutrition`);
  revalidatePath(`/clients/${clientId}`);
}

export type ApplyTargetsResult =
  | { ok: true; result: CoachTargetsResult }
  | { ok: false; code: UseFailure | "INVALID" };

/** Step 1. The floor is the api's (`floorCalories` in the answer), never guessed here. */
export async function applyTemplateTargetsAction(
  clientId: string,
  targets: NutritionTemplateTargetsRequest
): Promise<ApplyTargetsResult> {
  const body = targetsOf(targets);
  // `saveTargetsAction`'s rule, for the same reason: a server action is a public
  // endpoint. Nothing is sent, so this is a refusal the portal RECEIVED from itself.
  if (Object.values(body).some((v) => !Number.isFinite(v) || v <= 0)) {
    return { ok: false, code: "INVALID" };
  }
  try {
    const result = await coachApi.saveNutritionTargets(clientId, body);
    revalidateTraineeNutrition(clientId);
    return { ok: true, result };
  } catch (err) {
    return { ok: false, code: classifyUse(err) };
  }
}

export type ApplyWeekResult =
  | { ok: true }
  | { ok: false; code: UseFailure | "RATE_LIMITED" | "WEEK_GENERATING" };

/** Step 2 — the body's keys are exactly `weekStart` (AC5, N6). */
export async function applyTemplateWeekAction(clientId: string, weekStart: string): Promise<ApplyWeekResult> {
  try {
    await coachApi.applyMealWeek(clientId, { weekStart });
    revalidateTraineeNutrition(clientId);
    return { ok: true };
  } catch (err) {
    if (isWeekApplyRateLimited(err)) return { ok: false, code: "RATE_LIMITED" };
    // ADR-0030 — the trainee's own generation of this week is still running. Read by
    // CODE only, like the week card's `classify()`: retry later, not "couldn't be rebuilt".
    if (isWeekGenerationInProgress(err)) return { ok: false, code: "WEEK_GENERATING" };
    return { ok: false, code: classifyUse(err) };
  }
}
