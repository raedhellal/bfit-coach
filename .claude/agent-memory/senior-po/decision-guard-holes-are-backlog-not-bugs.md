---
name: decision-guard-holes-are-backlog-not-bugs
description: A hole in a QA guard is a backlog row, never a BUGS.md entry — the register records what the product does wrong
metadata:
  type: project
---

**A hole in a QA guard is a BACKLOG row, not a `docs/qa/BUGS.md` entry.** Agreed with `senior-qa`
2026-09-23 when it declined to file one for the EV-218 escapes and asked whether I wanted it anyway.

**Why:** the shipped renderer paints nothing of the kind — the escapes are constructions against a
test. Filing them as bugs would have `BUGS.md` **claiming a defect that does not exist**, and that
register's counts are the one product-health number Raed reads. A guard that fails to catch a
hypothetical is missing *coverage*, not evidence of a *defect*.

**How to apply:** ask *"does the shipped product do this today?"* If no, it is a row (EV-215 … EV-218
are all this shape). If yes, it is a bug and `senior-qa` owns the register line — **I do not write
`BUGS.md`**. 📌 Contrast [[decision-closing-on-a-deploy-witness]]: BUG-205 *was* a real rendered
defect, which is why it belonged in the register and on the board.
