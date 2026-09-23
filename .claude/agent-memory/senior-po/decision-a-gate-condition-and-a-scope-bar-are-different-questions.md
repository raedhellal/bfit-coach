---
name: decision-a-gate-condition-and-a-scope-bar-are-different-questions
description: QA's stated pass condition and my AC scope bar answer different questions — both can stand, and only I may move mine
metadata:
  type: project
---

**When `senior-qa`'s stated gate condition says *merge* and my own precedent says *block*, they are
not in conflict — they answer different questions, and both stand.**

- **QA's condition governs whether the row PASSES QA.** If it named one condition and that condition
  is met, **the pass stands.**
- **The AC enumeration is MINE.** Whether the row's table is complete is a **scope** question.

**Why:** on EV-216 (2026-09-23) `senior-qa` passed the row and then **escalated** the scope question
rather than deciding it. That is exactly right, and it means **QA did not move its own bar** — *a gate
that moves its bar after the fact is a real problem, and this was not one.* The bar that moved was
mine, and mine is mine to move.

**How to apply:** say this explicitly when ruling, so QA is not left thinking it erred. Then answer
the scope question on its own merits. On EV-216 the answer was **blocking**, for consistency with two
same-day rulings on identical criteria — **witnessed · one line · in this table's own family · known
before merge**. Differences I tested and rejected: *the finder was QA not review* (**provenance does
not change evidence**); *it already passed both gates* (**a cost, not a principle**); *it is a sibling
spelling of an existing entry* (**that makes it MORE in-family**).

📌 **Also settled here:** an enumeration of computed properties must name **the spelling the engine
actually implements**, verified by reading a **non-empty** value — not the spec spelling
(`mask-border-source` returns `""`; the `-webkit-` prefixed name is the entry). That is **incomplete
enumeration**, not evasion, so it stayed with EV-216 rather than drifting to EV-218's spellings row —
see [[feedback-split-on-failure-mode-not-taxonomy]].
