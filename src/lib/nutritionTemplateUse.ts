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
  /** 409 `WEEK_GENERATION_IN_PROGRESS` on the week step (ADR-0030): retry in a few minutes. */
  | "WEEK_GENERATING"
  | "WEEK_FAILED"
  | "WEEK_UNKNOWN"
  | "TARGETS_FAILED"
  | "TARGETS_UNKNOWN";

export interface UseOutcome {
  clientId: string;
  template: string;
  kind: UseOutcomeKind;
  floorCalories: number | null;
  /** `Date.now()` when the dialog handed it off. See `OUTCOME_TTL_MS`. */
  at: number;
}

/**
 * The outcome crosses ONE navigation — library → the trainee's nutrition page — in
 * `sessionStorage`.
 *
 * Not the URL. A query string would put a sentence the coach reads as the product's
 * statement ("“Cut 1800” is now Lina's plan.") in the hands of anyone who can send the
 * coach a link. Session storage is this tab's own and is written only by the dialog that
 * made the writes.
 *
 * ⚠ The landing is NOT guaranteed (staff review of EV-273b, blocker 1). The trainee's
 * layout can redirect to /clients/denied before the page renders, and then nothing on
 * that page reads the hand-off. Three things keep a sentence from surfacing later as if
 * it were new, and none of them alone is enough:
 *   · the banner is mounted on EVERY branch of the nutrition page, error branches
 *     included, so any render of that trainee's page consumes it;
 *   · /clients/denied discards any pending hand-off (`discardOutcome`) — access-lost
 *     has nothing to report about a trainee page the coach never reached;
 *   · it expires: older than `OUTCOME_TTL_MS` is dropped unread, whoever reads it.
 * An outcome for trainee A is never shown on trainee B's page (and is left for A).
 */
const KEY = "evoli.coach.nutritionTemplateOutcome";

/**
 * Two minutes. The hand-off is written, then a client navigation follows at once; even a
 * cold dev compile lands in seconds. Anything older is a landing that never happened.
 */
export const OUTCOME_TTL_MS = 120_000;

export function handOffOutcome(outcome: Omit<UseOutcome, "at">): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify({ ...outcome, at: Date.now() }));
  } catch {
    /* storage disabled — the page still renders the server's targets and week */
  }
}

/** Access-lost: drop whatever was waiting, unread. */
export function discardOutcome(): void {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    /* storage disabled — nothing to discard */
  }
}

/**
 * The allow-list `takeOutcome` checks a stored kind against. Derived from an EXHAUSTIVE
 * record, so a kind added to `UseOutcomeKind` and forgotten here fails `tsc` instead of
 * being silently dropped on the trainee's page (`satisfies` rejects a missing key and an
 * unknown one alike).
 */
const KINDS = Object.keys({
  APPLIED: 0,
  WEEK_RATE_LIMITED: 0,
  WEEK_GENERATING: 0,
  WEEK_FAILED: 0,
  WEEK_UNKNOWN: 0,
  TARGETS_FAILED: 0,
  TARGETS_UNKNOWN: 0,
} satisfies Record<UseOutcomeKind, 0>) as readonly UseOutcomeKind[];

/**
 * Read-and-remove, for THIS trainee only. An expired or malformed hand-off is removed and
 * never shown; one for another trainee is left alone (it expires on its own).
 */
export function takeOutcome(clientId: string, now: number = Date.now()): UseOutcome | null {
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
    discardOutcome();
    return null;
  }
  const o = parsed as Partial<UseOutcome> | null;
  if (!o || typeof o.at !== "number" || now - o.at > OUTCOME_TTL_MS || now < o.at) {
    discardOutcome();
    return null;
  }
  if (o.clientId !== clientId) return null;
  discardOutcome();
  if (typeof o.template !== "string" || !KINDS.includes(o.kind as UseOutcomeKind)) return null;
  return {
    clientId,
    template: o.template,
    kind: o.kind as UseOutcomeKind,
    floorCalories: typeof o.floorCalories === "number" ? o.floorCalories : null,
    at: o.at,
  };
}
