---
name: invariant-cited-from-code-that-does-not-validate-its-input
description: An ADR cited `done − plannedSoFar ≤ 1` from the api's computation, but the input date is client-supplied and unchecked, so the invariant never held
metadata:
  type: feedback
---

ADR-0024's "one row is enough" rested on `done − plannedSoFar ≤ 1`, cited from
`TraineeAdherenceWeeks.java`. The computation is correct, but its INPUT is not constrained:
`WorkoutCompletionLogRequest.date` has only `@Schema` (no `@PastOrPresent`), `LogWorkoutCompletionUseCase`
accepts any date, and `CoachPortalQueryService.adherenceWeeks` reads Monday to Sunday. So a completion dated
later in the week counts in `done` and not in `plannedSoFar`. I accepted the bound in round 2 without
opening the write path. (Traced in source; not constructed end to end.)

It turned out not to be load-bearing: a presence-only predicate (`!== "none"`) doesn't care about the
ratio's value, only whether it parses (`plannedSoFar ≥ 1`), so the ratio family never needed a bound.

**Why:** an invariant derived from a read path is only as strong as the validation on the write path.

**How to apply:** when an ADR cites "X ≤ Y by construction" from a computation, open the endpoint that
WRITES X's inputs and look for the validation annotation or check. Also ask whether the decision even
needs the bound. It is often dead weight that becomes a reversal trigger nobody watches.

Related: [[defect-pattern-bound-that-does-not-bound]], [[defect-pattern-cited-seam-does-not-exist]]
