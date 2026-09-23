---
name: feedback-decision-acs-must-not-bind-other-acs
description: A row may not defer a decision in one AC and depend on its outcome in another — the other ACs must hold under every option, or be written as pending
metadata:
  type: feedback
---

**Where a row contains a DECISION AC, every other AC must either be satisfiable under ALL the options
that decision may take, or be written explicitly as PENDING it.** An AC that silently assumes one
branch becomes **unsatisfiable the moment another is chosen**.

**Why:** EV-218 AC4 said the replacement for the spelling denylist was `architect`'s and *"not
pre-answered"*. **AC1's `Given` then assumed an answer** — *"the existing fixture worlds, no new
fixture"*. ADR-0024's accepted option (d) adds a fixture row, after which AC1's named construction is
**green by design** on the world AC1 names. The property still held and the suite still went red;
**the DoD checkbox simply could not be ticked by anyone.**

**This is a different cause from the over-specified-mechanism family
([[feedback-write-acs-against-the-real-surface]]) and the fix is ORDERING, not phrasing.**

**How to apply — the tell is cheap:** if a row says *"I am not pre-answering this"* in one AC, grep
that row's **other** ACs for anything that would change under each option. **I wrote both sentences,
in one document, on the same day.** *Deferring a decision is not the same as being neutral about it —
the rest of the row has to be neutral too.* Where a downstream row depends on a pending decision,
write its `Given` as *"takes the fixture/state as it finds it and names what it found"* (EV-219 AC1).
