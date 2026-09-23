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

---

🔴 **UNIFIED 2026-09-23 after a FOURTH deviation — these are ONE defect, not four.** Every one
over-specified the **mechanism of checking** instead of the **property**:

| AC | Over-specified | Actually required |
|---|---|---|
| EV-210 AC1(b) | one wire value (`planned()`) | the property over **every** value the wire has |
| EV-210 AC4 last limb | a **string in files** | the string **never rendered** |
| EV-210 AC4 (iii) | *"deleting X turns it red"* | the counter is **anti-vacuity** |
| EV-214 AC1 | *"computed style, **not** inline"* | the picture caught **however expressed** |

**THE RULE: state the PROPERTY and its FALSIFIER. Constrain the mechanism only where the mechanism
IS the requirement. And EXCLUDING a channel, a value or a location is a CLAIM THAT THE EXCLUDED ONE
ADDS NOTHING — a claim about behaviour, needing a witness like any other.**

**Why this one bit hardest:** EV-214 AC1's *"not the inline attribute"* made that row's own AC2
unmeetable. The `1/0` bypass emits `Infinity%`, invalid CSS, so Chrome drops the declaration and
`getComputedStyle` reports `none` — the guard was green on the exact hazard the row existed for. And
the same renderer paints a flattering 100 % when `plannedSoFar` is 1, so **the day of the week
decided whether the guard bound.**

**Two of the four — AC4(iii) and EV-214 AC1 — are the same defect in the same direction: an
unevidenced NEGATIVE that I wrote.** CLAUDE.md's no-witness rule already forbade it; I was not
applying it to my own exclusions. See [[feedback-never-assert-an-unprobed-consequence]].

📌 **Clause 1 in a guard's own support code (EV-249, 2026-09-23):** EV-218's pin read the fixture file
as **text** and checked it said `[3,4,2]`. Breaking the code that honours that value left the pin green
and the whole gate green on a Monday. A pin on source text stands in for a check on behaviour only if
something else checks the behaviour. When a guard depends on support code, ask what tests the support
code's **effect**.

And a small one from the same pass: I wrote an AC from memory of how a derivation works ("two scheduled
days elapsed") and it was wrong; the code counts elapsed days. Read the code before stating what it
does, and when the AC depends on it, make the AC measure it.
