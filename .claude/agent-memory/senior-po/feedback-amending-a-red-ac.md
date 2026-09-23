---
name: feedback-amending-a-red-ac
description: When an AC is red against correct merged code, amend it only if the replacement is strictly stronger AND carries its own witness; otherwise it is a bug row
metadata:
  type: feedback
---

An AC that goes **red against correct, merged code** may be amended **only** when both hold:
the replacement is demonstrably **strictly stronger** than the letter, and it **carries its own
witness** (a named failing world, a red mutant, a both-direction probe). Otherwise the red is a
**bug row**, not an AC edit.

**Why:** on harness rows like [[decision-ev210-ac4-source-grep]], *"the AC is red, so change the
AC"* is precisely the move that destroys the row — it tunes the harness to the defect, which is the
failure mode the row exists to prevent. EV-210's own out-of-scope section says a red limb is a
`senior-qa` bug row. So the amendment path needs a bar high enough that it cannot be used as an
escape hatch.

**How to apply:** when an implementer reports a deviation, first verify the red is not a real defect
(read the code at the sha, not a live worktree). Then ask: *is the literal rule satisfied by an empty
repository, or by deleting a guard?* If yes, the letter is the weaker statement and the deviation is
the ruling. Write the ruling **into the story** with the witness named, and state in the same
paragraph that a red harness is still a bug row by default — otherwise the amendment reads as
licence. An amendment with no witness that it strengthens is itself the defect.
