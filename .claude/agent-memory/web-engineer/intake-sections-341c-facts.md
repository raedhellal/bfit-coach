---
name: intake-sections-341c-facts
description: EV-341c (2026-10-16) — intake sections 5–8 and « Terminer »; where the read-only blocks come from, the complete action, the C6/EV-341w overview-card conflict left unbuilt, and test traps
metadata:
  type: project
---

`feat/ev341c-intake-sections-5-8` (b-fit-coach, off main e1eb1a8). Api contract read at a1ccafd5
(already in the vendored spec at 443ac5d8: `CoachIntakeCompleted`, `POST …/intake/complete`).

**Where:**
- `src/lib/intakeForm.ts` — `INTAKE_FORM_SECTIONS` is all eight; HEALTH / MEASUREMENTS = `[notes]` only;
  NUTRITION = 6 fields + notes; COACH_NOTES = `{kind:"notes", max:4000}`. `notes` carries its `max`.
  The save handler and the BFF read widen through that one constant.
- `src/app/clients/[id]/intake/page.tsx` — sections 5–7's read-only blocks, each on its own scope:
  injuries = routine read's `guardrails` (WORKOUTS); weight = `overview.progressGoal.currentWeight`
  (WEIGH_INS, "latest of any age" — NOT `weightSeries`, which is 8 weeks); food facts =
  `getNutrition().dietProfile` (NUTRITION) via `ProfileFacts` (carries `fromProfile`). Passed to the
  island as `readOnly`, drawn above each section's note.
- `src/lib/intakeActions.ts` `finishIntakeAction` — the ONLY revalidating intake write (ADR-0034
  D34.10 (3)): revalidates `/clients/{id}` and `/clients/{id}/intake`. Island shows `finishedAt ??
  props.completedAt` (formatInstant, UTC); button disabled under GRANT_MISSING (aria-describedby B11).
- Fixture: `completedAt` on the intake link; `evoli_fixture_intake_complete=fail`.

**C6 cut to EV-374** (senior-po, hub main 0d27f475), with C5's overview clause. Do not build it on
341c. EV-374's card must print the date with `formatIntakeFinishedOn` (`src/lib/format.ts`, UTC by
design) and owes the witness for the action's `revalidatePath` (its finished line read after a
client-side return within 30 s) — until then the revalidation is intent, and the docstring says so.

**Staff round (fb2374f → 688cad4/797b16c):**
- « Terminer » signed out (N1): disabled while `autosave.signedOut` (describedby = the session
  sentence's id); action maps 401 → `SIGNED_OUT`; an action that resolves with NO result (middleware
  sent the POST to /login, or a bare 503) probes the BFF read like « Recharger » and, if the session
  is gone, calls `autosave.endSession()`. Otherwise `finishFailed` (C5b: role=alert, button enabled,
  cleared on retry; 403 → `accessEnded()`).
- Mixed-scope subjects in the spec (F1): Pablo …0021 (WORKOUTS+WEIGH_INS), Sara …0003 (PROGRESS+
  WEIGH_INS), Petra …0006 (NUTRITION). Read-witness = `/api/fixture/calls` `api[]` (`op`, `arg`).
- C8 now also presses « Finish » after an idle expiry (server action `cookies()` path, F3).

**Traps:**
- `/api/bff/clients/{id}/intake` returns `state` + `sections` only (no `status`/`completedAt`): a spec
  cannot read the finish there; assert it through the page (line, reload).
- A symlinked `node_modules` in a worktree shows as untracked (`.gitignore` has `node_modules/`, a dir
  pattern): stage by path, never `git add -A`.
- C8 is the live 1-minute-token run in `qa/intake-token-expiry.live.spec.ts`; QA runs the whole file.
- `[WebServer] failed to forward action response TypeError: fetch failed` in the N1 test is
  expected: next dev forwarding a session-less server action that middleware redirected to /login.
- Scope-gating specs need a mixed-scope subject: all-on/all-off cannot catch a block gated on the
  wrong scope (verified by mutation on this branch: old tests stayed green).

Related: [[intake-interview-341b-facts]], [[intake-routine-fields-341y2-facts]].
