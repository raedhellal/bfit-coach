---
name: bar-and-its-own-label-disagree
description: Defect pattern — a chart drawn against one denominator while the text beside it prints another; the picture and the number on the same row become two different facts
metadata:
  type: feedback
---

When an api sends **two denominators for the same period** (e.g. `planned` vs
`plannedSoFar`, full-window vs elapsed-window), check which one **draws** and which one
**reads**. If they differ, the bar and the label on the same row are two different facts
and one of them is wrong to the eye.

**Why:** EV-187b (`b-fit-coach 11d984b`, `src/components/client/AdherenceSeries.tsx:81-83`)
measured the in-progress week's bar against `plannedSoFar` while printing
`<done> / <planned>` beside it. Rendered witness on 2026-09-22: the current week showed a
**100 % bar next to "2 / 4 sessions"**. The mirror case is worse — `plannedSoFar = 0` with
`done > 0` (a trainee who trains on the week's first scheduled day) gives an **empty bar
next to "1 / 3"**. Both sides were individually defensible and both were justified at
length in comments, which is what stopped anyone noticing.

**How to apply:**
- The give-away is a local like `measuredAgainst = week.partial ? a : b` sitting a few
  lines above a `copy.x(week.done, week.b)` call. Read the two together, not separately.
- A spec asserting `not.toContainText("%")` does **not** catch it: the contradiction is
  between a CSS width and a sentence, and no text assertion spans both.
- Verify by **rendering and scraping the style attribute**, not by reading. Start the
  fixture dev server on a free port and read `width:` off each bar next to its row text —
  that is a ten-line probe and it is the only thing that shows the disagreement.
- `aria-hidden` on the bar lowers the severity (screen readers are unaffected) but does
  not remove it: the chart exists to be scanned.
- The fix is usually "draw nothing for the partial bucket", matching whatever treatment
  the not-applicable bucket already has — not a third denominator.

Related: [[defect-pattern-cited-seam-does-not-exist]] (the same branch cited a guard file
at three call sites under a name that did not exist).
