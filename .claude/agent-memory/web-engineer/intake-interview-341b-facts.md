---
name: intake-interview-341b-facts
description: EV-341b (2026-10-15) — the intake page, the autosave engine built from the ACs, the route-handler cookie gap B17 found, the session-subject header, and the test rigs
metadata:
  type: project
---

`feat/ev341b-intake-tab` (b-fit-coach, off 76dbc77). The parked `feat/ev342o-autosave` 4c3b4e5 is NOT on
origin (Raed's Mac only), so B3's hook/transport were built here from the ACs; staff's H1–H4 designed out.

**Where:**
- `src/app/clients/[id]/intake/page.tsx` (server reads), `src/components/intake/IntakeInterview.tsx` (island).
- `src/lib/intakeForm.ts` — catalogue as data; form keys `<SECTION>.<field>`; `sectionToApi` writes the WHOLE
  section (absent = cleared on the api); multi-choices kept in catalogue order.
- `src/lib/autosave.ts` (engine, injected timers, B18 in `qa/intake-autosave-unit.spec.ts`), `useAutosave.ts`,
  `autosaveTransport.ts` (`classifySave` table, `putIntakeSection`).
- `PUT /api/clients/[id]/intake/[section]` (CSRF: refuseCrossOrigin → 415 → session subject → UUID → section);
  `GET /api/bff/clients/[id]/intake` for « Recharger ».
- `useCoachForm` got `extraDirty` back; the island passes `acked` (server-held values) as `server`, never
  calls `saved()`/`markSent()` (a global markSent would revert other sections' pending fields).

**API shapes (EV-341a, in prod since 8655a2e5):** GET → `{state: READY, status, sections{S:{version,updatedAt,
values}}}` or `{state: GRANT_MISSING}` only. PUT body `{version, values}` → 200 `{version, updatedAt}`; 400
`INTAKE_FIELD_INVALID` (`details.field`) / `COACH_FIELD_NOT_ACCEPTED`; 403 `COACH_ACCESS_DENIED` (also no
INTAKE); 409 `INTAKE_VERSION_CONFLICT` (`details.version/updatedAt`). Roster rows' link id is `id`, not `clientId`.

**Pitfalls found:**
- 🔴 **Route handlers do not see the middleware's rotated cookie** (Next 14.2.35 `mergeMiddlewareCookies` tests
  `"x-middleware-set-cookie" in req.headers`, false for web `Headers`). Pages are fine. Once the browser drops the
  expired access cookie (Max-Age = token life), `readAccessToken()` in a handler is null → 401. Fix:
  `src/lib/handlerSession.ts` reads the header, then cookie, then `routeAccessToken()`; `apiFetch(..., {bearer})`.
  EV-341w's `/api/bff/clients/[id]/intake-consent` poll has the SAME latent gap (not fixed, reported).
- `SessionEpochGuard` (D33.14) blocks unmarked clicks after another tab's sign-in, and says timer writes must be
  guarded: each save carries `x-evoli-session-subject` (sha256 of sub, `src/lib/sessionSubject.ts`); handler
  401 `SESSION_CHANGED` on mismatch. « Réessayer » is `sessionSafe` (B15). After a successful save the guard
  reloads the stale tab: specs must wait for re-hydration before clicking.
- React StrictMode (reactStrictMode: true) unmounts once: the engine has `resume()` before `dispose()`.
- A save must start from a field handler, never an effect on values: « Recharger » writes values and must send nothing.
- Chromium `<input type=date>` is one field with three Tab stops; type digits "06152027" (en-US).

**Rigs:** fixture switches `evoli_fixture_intake_save=fail`, `evoli_fixture_intake_save_delay_ms`; PUT bodies in
`GET /api/fixture/calls` `intakePuts`; grant = `POST /api/fixture/intake {answer:"grant"}`; spec PUTs need the
subject header (`subjectHeader()` in `qa/intake-interview.spec.ts`). B17: `npm run test:e2e:intake-live`
(port 3302, api :8099 with `JWT_ACCESS_TTL=1m`, local profile; reads the consent wording hash from ../b-fit-api).
Container's Playwright 1.63 wants chromium 1243; only 1194 at /opt/pw-browsers → symlinked scratch dir.
Another agent's docker work stopped my throwaway Postgres once mid-session: check `docker ps` before a live run.

Related: [[coach-form-hooks-342o-facts]], [[session-epoch-guard-bug745-facts]], [[prehydration-adoption-hook-facts]].
