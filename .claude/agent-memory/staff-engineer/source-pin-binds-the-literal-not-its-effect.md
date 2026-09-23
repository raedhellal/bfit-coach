---
name: source-pin-binds-the-literal-not-its-effect
description: A fixture source pin holds the tuple's text, not the code that honours it; and a ratchet inside a loop over a table cannot hold that table
metadata:
  type: feedback
---

Two ratchet defects from EV-218 (2026-09-23). I made the second one myself in the ADR-0024 round-1 recommendation.

1. **A source pin binds the literal and not its effect.** The pin `lastFixtureTuple("LINA_ID") === "[3,4,2]"`
   stays green if `adherenceSeries` stops honouring the third element (`plannedSoFar: derivedSoFar`).
   Put that together with a simulated Monday (`elapsedThisWeek = 0`) and construction 3, and the WHOLE GATE
   passed (263), because the guard's binding went back to depending on the calendar. On Wednesday the same
   mutant gives 4 red. Nothing reads `plannedSoFar`, so nothing notices the override being ignored. The
   pin on Ines's `[1,3,0]` has had the same exposure since EV-210b.
2. **A ratchet inside `for (const world of WORLDS)` cannot catch the world being removed from `WORLDS`.** I
   said my `toContain("3 / 4 sessions")` would bind "the world's presence in the table", and it didn't.
   It also can't see an unprinted field: drop the third element and the row still prints "3 / 4".

**Why:** both look like protection in review and both bind a spelling or a location instead of the behaviour.

**How to apply:** for any fixture-driven guard, mutate the *mechanism* that gives the literal its effect as
well as the literal itself. For any ratchet, delete the table entry it relies on and see if anything goes red.
If the mechanism sits behind `import "server-only"`, extracting the pure helper into a non-server-only module
is the cheap way to unit-test it.

Related: [[list-ratchet-binds-length-not-reads]], [[defect-pattern-bound-that-does-not-bound]]
