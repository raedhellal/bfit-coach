---
name: an-empty-state-must-name-what-was-absent
description: An empty-state sentence must name the thing that was missing from the QUERY, not infer a fact about the user — a 0/0 gated on a plan row is not "no sessions"
metadata:
  type: feedback
---

An empty-state sentence names **what the block measured and did not find**, never a
conclusion about the person. If the branch condition is derived from a gate (a join, a
scope, a plan row), the copy must describe the gate.

**Why:** EV-208 / BUG-205. `AdherenceSeries` printed *"No sessions in the last 8 weeks"*
on `done === 0 && planned === 0`. Both numbers are gated on `hadAPlanDuring`, so the
branch fires whenever no week had a plan — reached with **no SQL at all** by a trainee
who calls `POST /me/plan/generate` and never `POST /plans/select`. The card then said the
client did nothing, directly above *Recent sessions* listing five dated workouts they did.
`senior-po` ruled it "not imprecise — false about a person", and it also contradicted the
per-week `"No plan"` state one line up. Both blocks were individually true; a page is not
the sum of individually true blocks.

**How to apply:**
- Read the empty-state condition back as a sentence before writing copy. "Both numerator
  and denominator are gated on X" means the sentence is about **X**, not about the metric.
- Ask which OTHER block on the same screen answers the question the empty sentence
  appears to answer. If one does, that block is the only one entitled to, and this block
  must stay in its own lane. Suppressing either block is the wrong fix — it hides
  information and makes one card's text depend on whether another is empty.
- The fix usually needs no api change: check whether the discriminator (here `hasPlan`
  per week) is already on the wire before proposing a contract change.
- Keep the genuine-zero case out of the empty branch. `done = 0, planned > 0` is a
  trainee who missed everything and must still read that way — see
  [[a-fixture-without-the-shape-cannot-guard-it]].
- Related: [[stories-carry-verbatim-copy]],
  [[copy-for-a-capability-that-does-not-exist]].
