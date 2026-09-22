---
name: copy-for-a-capability-that-does-not-exist
description: A label in copy.ts for a state the product cannot reach is a shipped claim; delete it and guard the concept, not one spelling
metadata:
  type: feedback
---

A sentence sitting in `src/lib/copy.ts` for a state the product **cannot reach** is a
shipped claim, whether or not a coach ever sees it rendered. Delete it, and leave a
comment naming the story and the reason so the next author does not "complete the
vocabulary" again.

**Why:** the portal carried `redFlagLabels.PAIN_REPORTED: "Reported pain in a session"`
for months, justified as "so the vocabulary is complete the day EV-082 makes the rule
fire". The rule has never fired and cannot — nothing writes
`workout_completion.notes` — and EV-082 is not scheduled, so the product was advertising
a guardrail it does not have. EV-187 AC4 made its removal release-blocking. The enum
member itself stays in the TypeScript union, because that union is b-fit-api's published
wire vocabulary and omitting it would be a false statement about the wire; the *sentence*
is the claim.

**How to apply:** when a story forbids a string, guard the **concept, not one spelling**.
b-fit-api's own guard began as the literal `"Reported pain"` and a review walked through
it three times ("Pain reported in a session", "reported pain", "REPORTED PAIN") — a guard
pinned to one syntactic form is worse than none, because it reads as proof. The portal's
`qa/coach-red-flags-vocabulary.spec.ts` reuses that regex and carries a **witness test**:
planted spellings must match, `PAIN_REPORTED` and a true sentence about injuries must
not. Related: [[stories-carry-verbatim-copy]].
