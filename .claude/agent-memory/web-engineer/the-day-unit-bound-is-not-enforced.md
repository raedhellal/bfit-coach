---
name: the-day-unit-bound-is-not-enforced
description: ADR-0024's "done − plannedSoFar ≤ 1" rests on the day unit, but b-fit-api accepts a client-supplied completion date with no future check — the bound is a usage assumption, not a constraint
metadata:
  type: project
---

ADR-0024 (EV-218) argues one fixture row covers the adherence hazard because
`done − plannedSoFar ≤ 1`, citing `TraineeAdherenceWeeks.java:179-186` (the day is the unit).
Traced 2026-09-23 on EV-218: **the bound holds only if no completion is dated after today.**

- `MeWorkoutController.complete` → `LogWorkoutCompletionUseCase.complete`:
  `sessionDate = request.getDate() != null ? request.getDate() : today`; no `@PastOrPresent`,
  no `isAfter(today)` check. A future date gives `completedAt = sessionDate.atStartOfDay(zone)`.
- `CoachPortalQueryService.adherenceWeeks` queries Monday..**Sunday** of the current week, so a
  Friday-dated completion on a Wednesday is a COMPLETED scheduled day in `done` and not in
  `plannedSoFar` (strictly before today).
- So `done − plannedSoFar` can reach `planned − plannedSoFar`. **Traced, not constructed end to
  end** (it would need a seeded trainee + coach link on the shared :8080 stack).

**Why it matters:** the one-row conclusion survives without the bound — any row with
`plannedSoFar ≥ 1` and `done > plannedSoFar` makes a `done / plannedSoFar` renderer emit a finite
>100 % value that parses and paints — but the *stated* argument is false as a claim about the
API. **Update 2026-09-23:** carded as EV-248, reproduced as BUG-225; senior-po ruled future-dated
completions not allowed; ADR-0024 withdrew the bound. The reviewer's reading: trigger 3 is
*moot*, not *fired* — the paint predicate tests presence, so the ratio's size never mattered.
An EV-210a api test currently asserts the bug as correct ("It is done (it happened)").

**How to apply:** when a web guard's sufficiency argument cites an API invariant, read the
WRITE path too (the endpoint that creates the rows), not only the read-side computation.
Related: [[done-can-exceed-plannedsofar]], [[a-false-reason-for-a-boundary-is-worse-than-none]].
