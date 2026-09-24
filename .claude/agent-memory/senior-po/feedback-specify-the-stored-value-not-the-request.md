---
name: feedback-specify-the-stored-value-not-the-request
description: Write ACs about the value the readers actually use, found by reading the reader code, never about the request field; and don't cite a fix's effect as fact before it's verified
metadata:
  type: feedback
---

**An AC about data must name the value the readers actually use, found by reading the reader code.
Never the request field, and never a field no reader consults.**

**Why:** two rows on 2026-09-23 made this mistake, both mine.
- **EV-248** banned a future request `date`. The coach reads the UTC date of `completed_at`, which is
  `date + durationSeconds`, and `durationSeconds` had no limit. Review stored a 2094 session with a 200.
- **EV-250** said to date a session locally and keep `completedAt` as the real moment. The coach-portal
  reads take the day from `completedAt` in UTC (`CoachPortalQueryService`), and `WorkoutSession` has
  no date field. So the fix as specified would have changed nothing the coach sees. It also meant my
  "doesn't need `architect` first" was wrong; the row is now blocked on where a local day is stored.

`staff-engineer`'s note for this is titled "guard on the request field, not the stored value".

**How to apply:** before writing an AC about a date, amount or status, grep the **readers** that
produce what the user sees and name the field they use. Before saying "no architect needed", check
that the data the fix needs is actually stored.

**Second lesson, same pass:** I wrote "the write side now stops new ones" as a reason in a ruling.
It was true of the **intended** fix and false at the reviewed tip. **Don't cite a fix's effect as a
fact until the fix is verified.** Write "once X lands", and say what gets revisited if it doesn't.
Related: [[feedback-know-where-the-code-runs]], [[feedback-write-acs-against-the-real-surface]].
