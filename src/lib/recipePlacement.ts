/**
 * EV-256e AC1 — is "Use one of my recipes" offered at all?
 *
 * Only a literal `true` turns it on. Production serves `false` until EV-256f is in the
 * trainees' build (story R5), and an api that predates EV-256c omits the field; both —
 * and any malformed value — must HIDE the action. Pure, with no server import, so
 * `qa/recipe-placement-flag.spec.ts` can pin the fail-closed cases the fixture (which
 * always serves a boolean) cannot reach.
 */
export function recipePlacementOn(nutrition: { recipePlacementEnabled?: unknown } | null | undefined): boolean {
  return nutrition?.recipePlacementEnabled === true;
}
