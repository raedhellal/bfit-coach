---
name: done-can-exceed-plannedsofar
description: On the adherence wire done <= planned holds by construction but done <= plannedSoFar does NOT — a bar drawn from done/plannedSoFar divides by zero on a Monday
metadata:
  type: project
---

`WeekAdherence` on `GET /coach-portal/clients/{id}/progress` carries `done`, `planned`,
`plannedSoFar`, `hasPlan` and `partial`. **`done` counts completions dated today *or
later*; `plannedSoFar` counts scheduled days *strictly before* today.**

**Why it matters:** `0 <= done <= planned` is an invariant (EV-210a checks it over
generated worlds). **`done <= plannedSoFar` is not.** Training on a scheduled Monday
gives `done = 1, plannedSoFar = 0` — a literal one over zero. Any renderer drawing a bar
from `done / plannedSoFar` renders over 100 % or emits `width: Infinity%` on an ordinary
Monday, and the over-100 direction makes a struggling client look reassuring on the one
page built to catch disengagement. `AdherenceSeries` shipped that once (a **full** bar
beside "2 / 4 sessions", found in staff review, not by 209 green tests).

**How to apply:** the current week draws **no bar at all** — a week that has not finished
has no proportion to draw — and every other week divides by `week.planned` with a zero
guard. If a future design wants to draw the in-progress week, it must **print**
`plannedSoFar` too: the row is one fact or it is nothing.
`qa/coach-adherence-property.spec.ts` enforces that (P-ADH C2) against fixture trainee
Ines (`…0014`), whose current week **states** `[1, 3, 0]` — the derived `plannedSoFar`
only produces the hazard while `done` exceeds the days elapsed, so for `[1, 3]` it holds on a
(UTC) Monday only and a world relying on it stops discriminating from Tuesday. See [[a-picture-with-no-text-is-unassertable]].

**Since EV-218 (2026-09-23):** Lina's current week states `[3, 4, 2]` — the fixture's only
`done > plannedSoFar >= 1` row, where a `done / plannedSoFar` renderer emits a valid 150 % that
the post-parse paint read sees. Ines's `1 / 0` row is now green on the paint limb by design.
And the api's `done − plannedSoFar ≤ 1` is not enforced: see [[the-day-unit-bound-is-not-enforced]].
