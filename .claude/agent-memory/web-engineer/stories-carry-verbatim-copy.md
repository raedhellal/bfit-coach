---
name: stories-carry-verbatim-copy
description: EV-* stories in the hub carry the FINAL user-visible sentences; senior-qa asserts them character by character, so copy is not a place to improve on the story
metadata:
  type: feedback
---

Sentences quoted in an EV-* story's acceptance criteria are **final copy**, not a
paraphrase of intent. Put them in `src/lib/copy.ts` verbatim, mark them with the AC they
come from, and do not reword them — including punctuation, em dashes and capitalisation.

**Why:** `senior-qa` verifies them character by character against the story, and a story
is also where a deliberate *omission* is recorded. EV-184 forbids any sentence promising
equipment safety, because `RoutinePolicy` repairs for injuries only and the
equipment-aware version (BUG-053) is approved but undeployed. A helpful-sounding
"checked against their equipment" would be a paper claim of exactly the kind
`VISION.md` forbids.

**How to apply:**
- Read the story before writing the screen; the ACs are the spec, the brief is a summary.
- Where the same sentence appears in two stories (e.g. "From the trainee's profile — you
  cannot change these here." in both EV-184 AC1 and EV-185 AC1), it lives in copy.ts once
  so it cannot drift on one tab.
- Never render the same required sentence twice on one screen: two matches make the
  criterion unassertable. The no-repairs publish modal originally used "No changes were
  needed" as both heading and body for this reason and had to be split.
- When a sentence is deliberately absent, say so in a comment naming the bug or ADR that
  makes it absent, so the next engineer does not "fix" the gap.
