---
name: feedback-do-not-size-a-row-across-an-unrun-probe
description: When one cheap unrun probe decides a row's shape, ship the card with no estimate and make the probe AC1 with a stop-and-return
metadata:
  type: feedback
---

**When a single cheap, unrun probe decides whether a row is narrow or broad, do NOT give the card an
estimate.** Make the probe **AC1**, gate the remaining ACs on it, and write an explicit **STOP and
return to `senior-po`** if it comes back broad.

**Why:** EV-220's witness covered only the `::first-letter` variant; `staff-engineer` explicitly made
**no claim** about the ordinary-element one, and the answer changes the row from ~0.5 d to *broader
than anything since EV-214*. **Writing the estimate as a range and building whichever turned up is the
decision-assumed-in-an-AC failure** ([[feedback-decision-acs-must-not-bind-other-acs]]) — which I had
recorded one message earlier.

**How to apply:** leave `Ideal days` **unset** on the board so the row cannot be pulled into a sprint
plan on a guessed number, say in the card *why* it is unset, and name the **split trigger** rather
than a range. 📌 An unestimated row with a named gating probe is honest; an averaged estimate across
two shapes is a number nobody can act on and everybody will plan with.
