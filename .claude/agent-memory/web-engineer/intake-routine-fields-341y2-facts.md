---
name: intake-routine-fields-341y2-facts
description: EV-341y2 (2026-10-15) — the four routine fields on the intake page; where they live, the api shapes, the catalogue-presence check, fixture switches, and the traps hit
metadata:
  type: project
---

`feat/ev341y2-intake-routine-fields` (b-fit-coach, off main bfb4164d). Spec vendored at api `443ac5d8`
(spec:sync with `B_FIT_API_DIR` = a detached api worktree at origin/main; the api checkout itself sits on
another branch).

**Where:**
- `src/lib/intakeForm.ts` — new kinds `muscles` (GOALS.emphasis, max 5), `exercises` (HISTORY liked/avoided,
  max 10, `other`), `single` + `clearable` (AVAILABILITY.splitPreference). Pick lists keep the COACH'S order
  and keep values the catalogue dropped (`pickList`), never filtered.
- `src/components/intake/IntakeCatalogFields.tsx` — `EmphasisControl` (checkbox group of the facet, labels =
  `muscleLabel` via `filterOptions`, chips with « Retirer … »), `ExerciseListControl` (chips + the day
  editor's `CatalogPicker`, keepOpen, focusSearch, focus back on the opener on close).
- `CatalogPicker` gained opt-in `rowBlock` / `limitNote` / `focusSearch` (day editor passes none).
- `src/lib/intakeCatalog.ts` (server-only) — `readMuscleFacet()` (search size 1, read `muscles`) and
  `droppedExerciseNames()` (q=<name>, size 50, ≤4 pages; "dropped" only when every match was read and none
  is exact; unknown = unmarked).
- `coachApi.searchCatalog(q, muscle, equipment, paging?)` — page/size only when given.

**API shapes (y1):** GOALS `emphasis: string[]` (≤5, exact facet values, carry-over of stored values at the
replaced version), HISTORY `likedExercises`/`avoidedExercises: string[]` (≤10, exact catalogue `name`,
none in both → 400 naming `avoidedExercises`), AVAILABILITY `splitPreference: FULL_BODY|UPPER_LOWER|
PUSH_PULL_LEGS|NO_PREFERENCE|null`. Catalogue checks run BEFORE the version compare (stale version = 400).
The api's catalogue `q` is `trim()` + case-insensitive LIKE, ORDER BY name.

**Fixture switches:** `evoli_fixture_catalog_drop_muscle=calves`, `evoli_fixture_catalog_drop_exercise=
<URI-encoded name, |-separated>`, `evoli_fixture_catalog=down`. `evoli_fixture_intake_extra=on` now declares
`aheadOfThisBuild` (emphasis is known). Fixture facet: back biceps calves chest core glutes hamstrings quads
shoulders triceps.

**Traps:**
- `getByRole` skips `hidden` panels: after a reload B6 opens the first unanswered section; open the section
  before asserting its chips.
- A save held by `evoli_fixture_intake_save_delay_ms` outlived the per-test reset and wrote into the NEXT
  test's store (B7 "in flight" → B7a saw GOALS « Started »). Fixed: the fixture drops a held save whose
  `state()` object was replaced.
- Other agents run sharded suites on this box: default port 3300 collides (ERR_ABORTED in warm-routes), and
  load ~20 makes warm-up sign-in time out. Use `COACH_PORT=33xx`; wait for load before timing specs.
- A change + undo inside 1.5 s coalesces into ONE PUT (YP4 « Effacer »): wait for the first PUT before undoing.

Related: [[intake-interview-341b-facts]], [[stories-carry-verbatim-copy]].
