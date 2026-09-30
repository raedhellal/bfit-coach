---
name: routine-draft-write-path-facts
description: BUG-195c — how the trainee routine write path works since the whole-document contract (token, reps, one editor, partition), and the live-proof traps met building it
metadata:
  type: project
---

BUG-195c (branch `fix/bug195c-portal-routine-draft`, typed against b-fit-api
`fix/bug195b-routine-draft-contract` @ d46b08b, UNMERGED so `on-api-main: NO`) made Save
draft and Publish work. Facts that are decisions, not details:

- **One editor.** `components/routine/RoutineDocumentEditor.tsx` edits the whole
  `Routine`; `RoutineEditor` (trainee draft) and `TemplateEditor` are shells that own
  persistence only. The only mode switch is `subject` (template: goal/level selects;
  trainee: read-only, resolved by the server). Do not grow a second editor.
- **The body is built in ONE place**, `forDraftSave` in `lib/routineDocument.ts`:
  `{replacesDraftUpdatedAt, document}`, equipment/injuries `[]`, both day counts =
  `trainingDays.length`, `reps: null` on every DURATION exercise (staff ruling; the Reps
  control is hidden for a timed exercise so nothing a coach typed is lost).
- **The token is echoed as the api's STRING, never through `Date`** — the api compares
  microseconds, JS keeps milliseconds, a parsed token is a 409 on every save. The editor
  keeps it in a ref (async transitions read it). It starts from the draft the page READ,
  never from the envelope's `draftUpdatedAt` alone (a failed draft read + envelope token
  would overwrite a draft the coach never saw).
- **Every `COACH_DRAFT_EXISTS` opens the same dialog** (keep editing / load the saved
  version / "Replace the draft"), including the re-preview after
  `REPAIRS_UNACKNOWLEDGED` — the old two-tab test expected a silent overwrite; it now
  expects the dialog. No Replace button when the 409 has no `existingUpdatedAt`.
- **A save's response is merged, not re-seeded**: `withServerFields` takes only goal,
  level, the lists and day counts from the stored doc (typing during the round trip
  survives). `dirty` clears only if no edit happened since the send (`revision` ref).
- **The editor refuses locally** (`documentReasons`): 2–6 days, a day with no exercises,
  sets 1–20, blank rest, duplicate weekday, minutes ≤ 0. Save/Publish are disabled with
  the list on screen — so fixture seeds must be valid documents (Omar's 1-day plan got a
  second day for this).
- **`lib/routineVisibility.ts` is guard 4-e**: `satisfies Record<RoutineComponent,
  Visibility>` fails tsc for a missing component; `qa/routine-visibility.spec.ts` checks
  the keys against the vendored spec (28 = 8+4+4+9+3) and that every CONTROLLED label
  renders. The api publishes `Constraints` as `RoutineConstraints`.
- **Errors → sentences** in `lib/routineFailure.ts`, pure and duck-typed (no
  `instanceof ApiError`, which is server-only), so `qa/routine-draft-contract.spec.ts`
  unit-tests it. `searchCatalogAction` still returns `{code}` for CatalogPicker.
- **Fixture** stores whole documents (`StoredPlan`/`StoredDraft`), reproduces the api's
  boundary order (@Valid → subject refusal → reps → token), and journals every draft PUT
  at `GET /api/fixture/calls` → `draftPuts` (AC3.10's witness; the browser never sees
  the body).

Live-proof traps: `POST /coach-portal/invites` answers **201**; the seed catalog names
are "Push Up" (not Push-Up) and search sorts by name ("Copenhagen Plank" before
"Plank" for q=plank — match `^name` and take `.first()`); no trainee endpoint clears a
plan, so a re-run must rebuild over the plan the last run published;
`coach-affordance.live` needs `COACH_LIVE_PG_CONTAINER`; `coach-live.spec.ts` asserts
"0 / 2 profiles" but the api's STARTER capacity is 10 — red for that reason alone
(pre-existing, not a portal defect). See [[coach-portal-fixture-mode]],
[[a-whole-representation-put-needs-a-required-nullable-type]].
