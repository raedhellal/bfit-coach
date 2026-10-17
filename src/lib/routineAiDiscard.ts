/**
 * EV-376 / EV-377 — the routine AI discard, as PURE functions (no server import), so the request
 * path and the fixture's decision are unit-testable with no server (`qa/routine-ai-discard-unit.spec.ts`,
 * EV-186f U9 b–c). `coachApi.discardRoutineAiProposal` requests `routineAiProposalPath`, and the
 * fixture's DELETE applies `routineAiDiscardOutcome`.
 */

/**
 * `…/routine/ai-proposal`, with `?proposalId=` only when an id is given. No id: no `?` at all
 * (EV-377 AC3), so the api discards the link's proposal whatever its id, as before EV-376.
 */
export function routineAiProposalPath(clientId: string, proposalId?: string | null): string {
  const base = `/coach-portal/clients/${encodeURIComponent(clientId)}/routine/ai-proposal`;
  return proposalId ? `${base}?${new URLSearchParams({ proposalId })}` : base;
}

/** What one DELETE does to the link's routine proposal (b-fit-api 731b1262, EV-376). */
export type RoutineAiDiscardOutcome =
  /** No proposal on the link: 204, nothing touched. */
  | { touched: false; effect: "none" }
  /** An id was named and the link's proposal is another one: 204, left exactly as it is. */
  | { touched: false; effect: "kept" }
  /** RUNNING → CANCELLED (its late result is dropped; the unit is not given back). */
  | { touched: true; effect: "cancelled" }
  /** A settled proposal is deleted. */
  | { touched: true; effect: "deleted" };

/**
 * The api's rule: without an id the link's proposal is discarded whatever its id; with one, only a
 * proposal holding that id (compared case-insensitively, as a UUID). `current` is the link's
 * proposal after it has settled, or null.
 */
export function routineAiDiscardOutcome(
  current: { proposalId: string; status: string } | null,
  named: string | null | undefined
): RoutineAiDiscardOutcome {
  if (!current) return { touched: false, effect: "none" };
  if (named && current.proposalId.toLowerCase() !== named.toLowerCase()) return { touched: false, effect: "kept" };
  return current.status === "RUNNING" ? { touched: true, effect: "cancelled" } : { touched: true, effect: "deleted" };
}
