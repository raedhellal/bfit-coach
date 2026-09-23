---
name: feedback-fix-the-neighbouring-instance
description: When handed a correction, look for the same defect elsewhere in your own work — the behaviour that ends a pattern instead of servicing it
metadata:
  type: feedback
---

**When someone hands you a correction, go looking for the SAME defect in the neighbouring places you
wrote — especially your own earlier reasoning.** Praise this when it happens and do it myself.

**Why:** on EV-215 the implementer was asked only to fix a channel-4 header. It also went back to its
**own** `[^:;]*` safety note, which implied a reach it does not have, and made it say explicitly that
it is a **false-positive argument only**. Its reason: *"QA's judgement was right about both halves and
I would rather the file carry the correction than the reader rediscover it."* **That was the first
time in that file anyone found the neighbouring instance rather than fixing the one named** — and the
file had by then absorbed eight corrections of the same family.

**How to apply:** a correction to one sentence is evidence about **how I was reasoning**, not just
about that sentence. After any amendment, grep my own recent stories for the same shape. I had a live
example the same day: the *"four totality sentences"* count went stale in my own rule within a day of
writing it, and I only caught it because someone else flagged the implementer's copy. **Servicing a
pattern is fixing each instance as it is reported; ending one is going to find the others.**
Related: [[feedback-write-acs-against-the-real-surface]].
