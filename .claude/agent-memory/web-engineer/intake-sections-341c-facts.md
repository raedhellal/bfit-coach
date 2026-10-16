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

**Not built — C6 (overview summary card):** the overview already has EV-341w's « Entretien » card
(`section[aria-labelledby='ov-intake']`), and J.3's 768 px budget (≤ 2,300 px, 7 px slack FR) counts it.
C6 as written adds a second "Intake" card and, under GRANT_MISSING, a second sentence. Raised to the
PO; build only once ruled (one card or two, and what GRANT_MISSING shows).

**Traps:**
- `/api/bff/clients/{id}/intake` returns `state` + `sections` only (no `status`/`completedAt`): a spec
  cannot read the finish there; assert it through the page (line, reload).
- A symlinked `node_modules` in a worktree shows as untracked (`.gitignore` has `node_modules/`, a dir
  pattern): stage by path, never `git add -A`.
- C8 is the live 1-minute-token run (`--grep C8` in `qa/intake-token-expiry.live.spec.ts`).

Related: [[intake-interview-341b-facts]], [[intake-routine-fields-341y2-facts]].
