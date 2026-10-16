/**
 * EV-341w + EV-341b — whether the coach's WHOLE INTAKE exists on this deployment: the request
 * for consent and the interview behind it. The release hold, made a switch rather than a merge
 * order. ONE flag holds every intake surface (EV-341b story R6, 2026-10-15):
 *
 *   · the EV-341w « Demander l'accord » card on the client overview, and its consent poll
 *     (`/api/bff/clients/{id}/intake-consent`) and two server actions (`intakeActions.ts`);
 *   · the « Entretien » tab (`ClientTabs`);
 *   · the interview page, `/clients/{id}/intake`;
 *   · both intake route handlers, the autosave `/api/clients/{id}/intake/{section}` and the
 *     read `/api/bff/clients/{id}/intake`;
 *   · the intake section of `/invited/{userId}`;
 *   · B12's sentence in the revoke dialog (`RevokeMenu`'s `intakeOn`).
 *
 * Every gate reads `INTAKE_REQUEST_ENABLED` (`src/lib/env.ts`, G1). Turning it on in production
 * is EV-369, and nothing else.
 *
 * The card may go live only in the same coach deploy as EV-341b or later, and never before
 * EV-341q (the trainee's answer screen) is in an app build Raed has shipped: before that, the
 * coach's request reaches no screen. A merge to `main` deploys this repo, so the hold cannot
 * be "do not merge yet"; it is this predicate.
 *
 * ⚠ The switch is DEPLOYMENT-WIDE: `on` shows the card to EVERY coach this deployment serves,
 * and it reads no account, role or allow-list. It does not implement `D-PROV-1`'s go-live
 * gate (Evoli's own test accounts only): turning it on where real coaches sign in releases
 * the feature to all of them. That gate is a release decision recorded in the story's hold,
 * not something this code enforces.
 *
 * ON only for the exact value `on` of `COACH_INTAKE_REQUEST` (server environment, never
 * shipped to the browser). Absent, empty, `true`, `ON`, `1` and anything else are OFF: a
 * switch that fails open would release the feature on a typo. Pure, so
 * `qa/intake-consent-unit.spec.ts` pins it with no server.
 *
 * OFF means: no card on the overview, no `GET …/intake-consent` in its render, the BFF read
 * answers 404, and the two server actions refuse before calling the api.
 *
 * EV-341b (story R6, 2026-10-15): the switch holds the interview too (the list above), so the
 * name says less than it does. It is not renamed (a merged, QA-passed variable), and a second flag would add
 * two states nobody wants (the card without the page, or the page without the card). OFF also
 * means (G2–G7): no « Entretien » tab, `/clients/{id}/intake` is a 404 that reads no intake, consent or routine (the
 * `[id]` layout still reads the client, as for any client URL), the save
 * handler and `/api/bff/clients/{id}/intake` are 404 for every method before any other check, no
 * intake section on `/invited/{userId}`, and the revoke dialog keeps `main`'s body. Every gate
 * reads `INTAKE_REQUEST_ENABLED` (`src/lib/env.ts`, G1). Turning it on is carded as EV-369.
 */
export const INTAKE_REQUEST_FLAG = "COACH_INTAKE_REQUEST";

export function intakeRequestEnabled(raw: string | undefined | null): boolean {
  return raw === "on";
}
