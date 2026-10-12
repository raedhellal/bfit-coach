/**
 * EV-341w — whether « Demander l'accord » exists on this deployment. The story's RELEASE
 * HOLD, made a switch rather than a merge order.
 *
 * The card may go live only in the same coach deploy as EV-341b or later, and never before
 * EV-341q (the trainee's answer screen) is in an app build Raed has shipped: before that, the
 * coach's request reaches no screen. And `D-PROV-1`'s go-live gate keeps it off for every
 * coach outside Evoli's own test accounts until the flags are read. A merge to `main`
 * deploys this repo, so the hold cannot be "do not merge yet"; it is this predicate.
 *
 * ON only for the exact value `on` of `COACH_INTAKE_REQUEST` (server environment, never
 * shipped to the browser). Absent, empty, `true`, `ON`, `1` and anything else are OFF: a
 * switch that fails open would release the feature on a typo. Pure, so
 * `qa/intake-request-gate.spec.ts` pins it with no server.
 *
 * OFF means: no card on the overview, no `GET …/intake-consent` in its render, the BFF read
 * answers 404, and the two server actions refuse before calling the api.
 */
export const INTAKE_REQUEST_FLAG = "COACH_INTAKE_REQUEST";

export function intakeRequestEnabled(raw: string | undefined | null): boolean {
  return raw === "on";
}
