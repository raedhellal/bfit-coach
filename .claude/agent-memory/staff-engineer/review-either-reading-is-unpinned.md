---
name: review-either-reading-is-unpinned
description: When an engineer writes "the tests pass under either reading" of a PO ruling, the behaviour they chose is unbound; mutate to the other reading, expect GREEN, and ask for a pin
metadata:
  type: feedback
---

An engineer's own note that *"the tests only exercise X and Y, so they pass under either reading"*
is a confession that the reading they built is unpinned. Treat it as a finding to measure, not as
candour to credit.

**Seen on EV-337g2** (b-fit-coach `feat/ev337g2-apply-card` @ 5258ef9, 2026-10-09). Ruling R2 said
the template outcome sentence "goes away when the coach confirms the next apply". The engineer cleared
it on ANY answer of the next current-targets apply (failures included) and said the tests covered
success and cancel only. My mutant S3 (`clearOutcome()` -> `if (result.ok) clearOutcome()`) left all 5
G2.3c/G2.3d tests GREEN. So the failure half was a reading nobody could see regress. The R2 text
supported the engineer's reading ("the next attempt is the boundary"; "cancelling is not an attempt"),
so no PO ruling was needed. Only a pin was missing.

**Why:** a reading built without a pin can flip in a later refactor with nothing going red. It is the
same shape as [[defect-class-second-half-not-independently-bound]]: the success half bound, the
failure half free.

**How to apply:**
1. Settle the reading against the ruling's own words: the heading, the precedent it cites, and its
   "not an attempt" exclusions. A "Given … and the apply lands" in one AC is that test's setup. It does
   not narrow the rule.
2. Mutate the code to the other reading and expect GREEN. That proves the gap with a witness.
3. Ask for one pin on the chosen side, e.g. a failing retry clears the sentence and the week card's
   own error line shows. Rate it Should-fix, not Blocking, when the ruling's text supports the reading.

Harness: [[review-sabotage-harness-must-self-check]]. Run it in a detached worktree:
[[review-verify-in-isolated-worktree]].
