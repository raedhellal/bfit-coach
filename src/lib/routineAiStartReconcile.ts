/**
 * BUG-871: what the routine AI panel shows after a start (« Générer », « Réessayer », the Update
 * box's « Générer ») that did not come back `202`. Binding design: ADR-0036 § Amendment BUG-871
 * (hub `docs/adr0036-bug871`), Option B, and senior-po's ruling 5, flip gate F13 and the EXPIRED
 * ruling on EV-186 (hub main 1f539414).
 *
 * A pure module (no `server-only`, no React) so `qa/routine-ai-start-reconcile-unit.spec.ts` can hold
 * every row of the decision table, F13(c)'s three cases included.
 *
 * The rule:
 *   · a start refused with a code its contract names (`START_REFUSALS`) keeps today's handling. None
 *     of those reserves a unit, so « Rien n'a été modifié » is true there;
 *   · EVERYTHING ELSE reconciles: one `GET …/routine/ai-proposal`, inside the start's transition. A
 *     read showing an adoptable status with an id other than `prevId` is a run this panel had not
 *     seen, and it is adopted. Otherwise the panel says `routineAi.startUnconfirmed`, which claims
 *     neither outcome, and sets the pre-flight mark;
 *   · the next start pressed while the mark is set reads first (the pre-flight). A run this panel had
 *     not seen is adopted with NO POST; otherwise the start goes as usual.
 *
 * ⚠ The allowlist is default-closed, and is used INSTEAD of an `isLostAnswer`-style classifier
 * (`src/lib/lostAnswer.ts`, nutrition only). That classifier reads a plain api 500 as a received
 * refusal, but a 500 raised after the start's transaction committed is a spent unit and a run. Do not
 * "simplify" this back to `isLostAnswer`: that brings back « Rien n'a été modifié » for a paid run.
 *
 * `prevId` is `knownId` at the press: the last proposal id the panel received from the api (the
 * page's `initial` read, every adopt, every poll result, a 202's id). It is NOT the view: after a
 * reload on `failed` / `stale`, « Réessayer » opens the brief with nothing shown while the row on the
 * server is still the old one (staff A1).
 */

/**
 * The start refusals that keep today's behaviour (no read; `409 COACH_AI_PROPOSAL_RUNNING` keeps its
 * own existing read and adopt). Each is a code the start contract names, and none reserves a unit
 * (openapi start description, and `CoachAiProposalService.request` @ b-fit-api 4f7be130).
 * `ACCESS_DENIED` / `NOT_FOUND` are the server action's names for any 403 / 404.
 */
export const START_REFUSALS: ReadonlySet<string> = new Set([
  "ACCESS_DENIED",
  "NOT_FOUND",
  "COACH_DRAFT_INPUT_FORBIDDEN",
  "VALIDATION_ERROR",
  "COACH_AI_INSTRUCTION_INVALID",
  "COACH_PLAN_EMPTY",
  "COACH_AI_PROPOSAL_RUNNING",
  "COACH_AI_RATE_LIMIT",
  "COACH_AI_UNAVAILABLE",
  "CATALOG_UNAVAILABLE",
  "COACH_AI_BUSY",
]);

/**
 * What a start that did not answer 202 leads to, BEFORE `refused()` may be called. `code` is the
 * server action's failure code: `FAILED` is no answer (a transport error, a code-less gateway 5xx,
 * the browser's `settled` fallback); `INTERNAL_ERROR` is an api 500; `AUTH_UNAUTHORIZED` a 401;
 * `INVALID_REQUEST` and the other global codes are undocumented for this endpoint.
 */
export function startFailureRoute(code: string): { kind: "refused" } | { kind: "reconcile" } {
  return START_REFUSALS.has(code) ? { kind: "refused" } : { kind: "reconcile" };
}

/** The reconcile (or pre-flight) read, as the panel got it. */
export type StartRead =
  | { ok: true; proposal: { proposalId?: string | null; status?: string | null } }
  /** `ACCESS_DENIED`, `NOT_FOUND`, or anything else (`FAILED`, a 5xx, the `settled` fallback). */
  | { ok: false; code: string };

/** The statuses a start may adopt. `NONE`, `CANCELLED` and any status the panel does not know are not. */
const ADOPTABLE: ReadonlySet<string> = new Set(["RUNNING", "READY", "FAILED", "EXPIRED"]);

function sameId(a: string | null | undefined, b: string | null): boolean {
  return typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase();
}

/**
 * True when `proposal` is a run this panel had not seen: an adoptable status AND an id that is not
 * `prevId`. A started run always carries an id the panel has never received (a fresh UUID, or the id
 * a take-over rewrites), so a row whose id equals `prevId` is never adopted, whatever its status
 * (senior-po's EXPIRED ruling: that includes `{F, EXPIRED}` after a reload on `stale`).
 */
export function unseenRun(prevId: string | null, proposal: { proposalId?: string | null; status?: string | null }): boolean {
  const id = proposal.proposalId;
  if (typeof id !== "string" || id === "") return false;
  if (typeof proposal.status !== "string" || !ADOPTABLE.has(proposal.status)) return false;
  return !sameId(id, prevId);
}

export type StartReconcile =
  /** Adopt the read: `running` + poll, `ready`, `failed` (its run's sentence) or `stale`. */
  | { kind: "adopt" }
  /** `routineAi.startUnconfirmed` as a notice on the current view, « Générer » enabled, the mark set. */
  | { kind: "unconfirmed" }
  | { kind: "accessEnded" }
  | { kind: "hidden" };

/** ADR-0036 § Amendment BUG-871, the "anything else" rows: after a start that reconciles. */
export function reconcileStart(prevId: string | null, read: StartRead): StartReconcile {
  if (!read.ok) {
    if (read.code === "ACCESS_DENIED") return { kind: "accessEnded" };
    if (read.code === "NOT_FOUND") return { kind: "hidden" };
    return { kind: "unconfirmed" };
  }
  return unseenRun(prevId, read.proposal) ? { kind: "adopt" } : { kind: "unconfirmed" };
}

export type StartPreflight =
  /** A run this panel had not seen: adopt it, and send NO POST. */
  | { kind: "adopt" }
  /** Read 403: the link ended. No POST. */
  | { kind: "accessEnded" }
  /** Read 404: the routes are off. No POST. */
  | { kind: "hidden" }
  /** Anything else, or the read failed any other way: start as usual (every start row applies). */
  | { kind: "start" };

/** The pre-flight read, made only by a start pressed while the mark is set. */
export function preflightStart(prevId: string | null, read: StartRead): StartPreflight {
  if (!read.ok) {
    if (read.code === "ACCESS_DENIED") return { kind: "accessEnded" };
    if (read.code === "NOT_FOUND") return { kind: "hidden" };
    return { kind: "start" };
  }
  return unseenRun(prevId, read.proposal) ? { kind: "adopt" } : { kind: "start" };
}

/** Everything that may move `knownId`. A view switch is listed so the table can say it does not. */
export type KnownIdEvent =
  /** The page's own read, any status (CANCELLED included); null when that read failed. */
  | { kind: "initial"; proposal: { proposalId?: string | null } | null }
  /** Any adopt: the mount read, the 409's read, a reconcile or pre-flight read, Show what's saved. */
  | { kind: "adopt"; proposal: { proposalId?: string | null } }
  /** A poll result (NONE sets it to null). */
  | { kind: "poll"; proposal: { proposalId?: string | null } }
  /** A 202's `proposalId`. */
  | { kind: "started"; proposalId: string }
  /** Moving between views (brief, Update box, idle, failed, stale…): never resets it. */
  | { kind: "view" };

export function nextKnownId(current: string | null, event: KnownIdEvent): string | null {
  switch (event.kind) {
    case "initial":
      return event.proposal?.proposalId ?? null;
    case "adopt":
    case "poll":
      return event.proposal.proposalId ?? null;
    case "started":
      return event.proposalId;
    case "view":
      return current;
  }
}

/** Everything the pre-flight mark answers to. */
export type MarkEvent =
  /** `startUnconfirmed` shows: set. */
  | "unconfirmed"
  /** An adopt from any source, the poll included: cleared. */
  | "adopt"
  /** A pre-flight read that ran (whatever it showed, or if it failed): cleared. */
  | "preflightRan"
  /** Unmount (a reload): cleared, the island's state is gone. */
  | "unmount"
  /** A view change (brief → idle → brief, the Update box…): unchanged. */
  | "view"
  /** A Discard (by id, for the id shown: it cannot touch the unknown run): unchanged. */
  | "discard";

export function nextMark(mark: boolean, event: MarkEvent): boolean {
  switch (event) {
    case "unconfirmed":
      return true;
    case "adopt":
    case "preflightRan":
    case "unmount":
      return false;
    case "view":
    case "discard":
      return mark;
  }
}
