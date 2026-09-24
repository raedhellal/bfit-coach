---
name: feedback-probe-the-mutant-before-trusting-green
description: A green suite under a non-painting mutant is indistinguishable from one under a hole — confirm the mutant does the harmful thing before believing any result
metadata:
  type: feedback
---

**A green suite under a non-painting mutant is indistinguishable from a green suite under a hole.**
Confirm the mutant **actually does the harmful thing** — by a rendered observation, not by the code
reading as though it would — **before** accepting any green *or* red as evidence.

**Why:** `senior-qa` earned this three times in one pass, including against its own work. It caught
its **own dud**: Chrome resolves `var()` in a custom property at the **declaring** element, so nothing
painted — *a dud that looks like a wider escape.*

**This is the mirror of [[feedback-mutant-independence]]:** that rule says a mutant dying to two
clauses proves neither is needed; this one says **a mutant that never fired proves nothing at all, in
either direction.** Together: *a mutant is evidence only when you know both that it did the harmful
thing and which clause stopped it — neither half is inferable from an exit code.*

**How to apply — and it cuts toward ME, not only toward QA:** an unprobed dud **manufactures a
phantom bypass** as readily as an unprobed hole hides a real one. That dud would have produced a
**card for a bypass that does not exist**. **Carding a phantom is the same defect as missing a real
one, and it costs a row.** So when a constructed bypass is reported to me, ask whether it was probed
to paint before I allocate an ID to it.

📌 **A test labelled "current behaviour, known wrong" is worth keeping.** EV-248 pinned the dateless
path that way, and it passes on both old and new code, so it describes today's behaviour exactly. The
row that fixes it (EV-250) must **invert** it rather than delete it: it's already the red-before
witness.
