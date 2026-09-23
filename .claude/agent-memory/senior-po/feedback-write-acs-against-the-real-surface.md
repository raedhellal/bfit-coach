---
name: feedback-write-acs-against-the-real-surface
description: ACs written before the harness exists go red against correct code; name every value the wire/DOM actually has, and say whether a ban is on source text or rendered output
metadata:
  type: feedback
---

When an AC must talk about a value the code exposes, write it against the **actual wire or the
actual DOM** — name **every** value the surface has, and say explicitly whether a ban applies to the
**source text** or to the **rendered output**. They are different rules and only one is ever meant.

**Why:** EV-210 had **two** ACs red against correct merged code, same cause both times. AC1(b) named
one wire number where the wire has two (`planned()` and `plannedSoFar()`); AC4 banned a *string* from
`src/`/`qa/` where what is actually forbidden is a **rendered** string — its letter would have deleted
the javadoc explaining the fix and the regression test enforcing it. Both ACs were written **before
the harness existed**, from the prose of the defect. The harness, written afterwards against the real
surface, was the more precise statement of the same intent — and stronger, both times. Two on one
story is a pattern about how I write ACs, not two slips.

**How to apply:** at writing time, if I cannot name the concrete field/attribute an AC will be read
from, that AC is not yet testable by QA without asking me a question. Prefer *"equals what is printed
beside it"* (a relation between two things on the surface) over *"equals <named internal value>"* —
the relation survives a renderer that exposes neither. See [[feedback-amending-a-red-ac]] for what to
do once one has already gone red.
