/**
 * EV-273b — the client-safe half of "Use on a trainee": the constants the islands
 * need and the hand-off of the outcome to the trainee's nutrition page.
 *
 * NOT `coachApi.ts`: that module is `server-only`, and a client island importing one
 * value from it drags `apiFetch` into the browser bundle (the build refuses).
 */

/** `CoachTemplateNames.MAX_LENGTH` — the api refuses a longer name with a 400. */
export const NUTRITION_TEMPLATE_NAME_MAX = 80;

/**
 * AC4 — the dialog warns when the template's calories are below the HIGHER of the two
 * floors (1500 male / 1200 otherwise). The portal does not know the trainee's sex and
 * does not guess it, so it names no number: the number the engine actually saved is
 * shown after the apply, from the targets response's `floorCalories`.
 */
export const FLOOR_WARNING_BELOW = 1500;

/**
 * Every outcome AC5 words. `floorCalories` rides along on the three outcomes whose
 * targets write was RECEIVED as a 200, because the floor fired on that write whatever
 * then happened to the week.
 */
export type UseOutcomeKind =
  | "APPLIED"
  | "WEEK_RATE_LIMITED"
  | "WEEK_FAILED"
  | "WEEK_UNKNOWN"
  | "TARGETS_FAILED"
  | "TARGETS_UNKNOWN";

export interface UseOutcome {
  clientId: string;
  template: string;
  kind: UseOutcomeKind;
  floorCalories: number | null;
}

/**
 * The outcome crosses ONE navigation — library → the trainee's nutrition page — in
 * `sessionStorage`, and is read once and removed there.
 *
 * Not the URL. A query string would put a sentence the coach reads as the product's
 * statement ("“Cut 1800” is now Lina's plan.") in the hands of anyone who can send the
 * coach a link. Session storage is this tab's own, is written only by the dialog that
 * made the writes, and a reload shows the page's server-read truth without the banner.
 */
const KEY = "evoli.coach.nutritionTemplateOutcome";

export function handOffOutcome(outcome: UseOutcome): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(outcome));
  } catch {
    /* storage disabled — the page still renders the server's targets and week */
  }
}

const KINDS: readonly UseOutcomeKind[] = [
  "APPLIED",
  "WEEK_RATE_LIMITED",
  "WEEK_FAILED",
  "WEEK_UNKNOWN",
  "TARGETS_FAILED",
  "TARGETS_UNKNOWN",
];

/** Read-and-remove, for this trainee only. Anything malformed is dropped, not shown. */
export function takeOutcome(clientId: string): UseOutcome | null {
  let raw: string | null = null;
  try {
    raw = window.sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    window.sessionStorage.removeItem(KEY);
    return null;
  }
  const o = parsed as Partial<UseOutcome> | null;
  if (!o || o.clientId !== clientId) return null;
  window.sessionStorage.removeItem(KEY);
  if (typeof o.template !== "string" || !KINDS.includes(o.kind as UseOutcomeKind)) return null;
  return {
    clientId,
    template: o.template,
    kind: o.kind as UseOutcomeKind,
    floorCalories: typeof o.floorCalories === "number" ? o.floorCalories : null,
  };
}
