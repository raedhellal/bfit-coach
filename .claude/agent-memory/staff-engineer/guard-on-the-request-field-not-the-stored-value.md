---
name: guard-on-the-request-field-not-the-stored-value
description: A write guard that validates the client's field while the stored value is DERIVED from it plus another field; EV-248 bounded `date` but workout_sessions.date = date@00:00Z + durationSeconds
metadata:
  type: feedback
---

A write-side bound must be checked against the value the READERS read, not the request field it is
named after. EV-248 (BUG-225) bounded `WorkoutCompletionLogRequest.date`, but
`WorkoutSessionJpaEntity.fromDomain` sets `workout_sessions.date` from `completed_at`, and the use
case builds `completed_at = date.atStartOfDay(UTC) + durationSeconds` (unbounded Integer). A
past `date` + `durationSeconds = 4d30m` on a Wednesday stored a FRIDAY row with 200 — BUG-225's
exact world — and `Integer.MAX_VALUE` stored 2094. `workout_completions.date` kept the request date,
so the two tables disagreed. 15 write-side mutants were all killed; none reached this limb, because
every test fed the future through `date`.

**Why:** the branch's javadoc said "the writer can never accept a date the reader then hides", and
senior-po's ruling not to open a trainee-side row rested on "the write side now stops new ones". Both
false, found only by opening the entity mapper.

**How to apply:** for any "field X may not be Y" guard, trace X to the column every reader uses
(open the JPA `fromDomain`/mapper, not just the use case). List every other request field that feeds
the same column and try one of them. Related: [[invariant-cited-from-code-that-does-not-validate-its-input]],
[[defect-pattern-bound-that-does-not-bound]].

**Round 2 (a296efd, 2026-09-24):** the fix checked the computed `completedAt` against the request's
bound — correct, and witnessed (LA/Paris header, Tue + 50h -> 400). But every duration test ran on
the NO-HEADER branch, so M12 (stored date checked against the server+1 fallback instead of the
request's bound) survived 61/61. When a guard selects between two bounds, the new limb must be
tested on each branch of the selection, not just the one the original witness used.
