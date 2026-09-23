---
name: a-rendered-ratchet-cannot-hold-an-unprinted-field
description: A ratchet that reads rendered figures cannot hold a fixture field nothing prints, and one inside a table loop cannot hold the table row — witness each loss separately
metadata:
  type: feedback
---

EV-218 (ADR-0024 decision 3) prescribed ONE rendered line as the ratchet for Lina's hazard tuple
`[3, 4, 2]`: `expect(rows[rows.length-1].rowText).toContain("3 / 4 sessions")`, said to bind "the
fixture value, the world's presence in the table, and the render path". Mutated, it held only the
render path and `done`/`planned`:

- **Third element dropped** (`[3, 4]`) or **swapped with the `[3, 4]` week before it**: still prints
  "3 / 4 sessions", rendered ratchet green. And on the day it ran (a Wednesday) the derived
  `plannedSoFar = min(4, 2) = 2` equalled the stated one, so the whole suite was identical.
- **Lina dropped from `WORLDS`**: the assertion lives in the loop, so it vanished with her.

Kept the rendered line, and added one non-loop test: Lina is in `WORLDS` with that `currentWeek`,
and her LAST fixture tuple in source (comments stripped) is `[3,4,2]`. Each loss went red alone.

🔴 **And a source pin holds the TEXT, not the code that honours it** (staff review of EV-218).
Breaking `adherenceSeries`'s override (`plannedSoFar: derivedSoFar`) with the tuple untouched
left every pin green; on a simulated UTC Monday with construction 3 planted the whole gate was
262 green (senior-qa: Tuesday and Sunday gave 4 failed) — blind only to a renderer whose value
the parser discards, since every current week then derives `plannedSoFar = 0`.
My own clause-8 run mutated the DATA and never the CODE that reads it — mutate both sides of a
fixture→code seam. The real fix is a unit test outside `server-only` (carded, not built).

**Why:** the hazard is in `plannedSoFar`, which nothing prints; a rendered check can only hold
what is rendered. A check inside an iteration cannot notice the iteration shrinking.

**How to apply:**
- For each thing a ratchet claims to bind, plant the deletion and watch it go red. List the
  bindings separately.
- A **weekday-dependent fixture** can be tested on any day by STATING the tuple a given weekday
  would derive (`[3, 4, 0]` = Monday). EV-218's clause-8 witness was built that way: every world at
  `plannedSoFar = 0` with Lina's stated row kept gives Lina alone red; without it, the paint limb
  was entirely green.
- Probe runner: a separate Playwright config on its own port with the server started by
  Playwright, never concurrent with the gate (both would write `.next`). Mutate from `git show
  HEAD:<path>` each time so only one mutant is ever planted.

Related: [[a-fixture-without-the-shape-cannot-guard-it]], [[a-paint-probe-must-sample-where-the-channel-paints]],
[[the-day-unit-bound-is-not-enforced]].
