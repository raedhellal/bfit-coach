---
name: feedback-split-on-failure-mode-not-taxonomy
description: Split rows on how things FAIL, never on what category they belong to — and a witness from a synthetic harness is not a witness on the real surface
metadata:
  type: feedback
---

**Split rows on FAILURE MODE, never on TAXONOMY.** The neighbouring-shapes rule ("do not merge two
things that fail differently") is about **how they fail**, not about which category they sit in.

**Why:** I split `::first-letter`/`::marker` out of EV-216 into EV-219 on the principle *"a short
pseudo-element list is a different defect from a short property list."* **It is not.** Both fail as
**incomplete enumeration** — which is EV-216's *own named* failure mode, written in its story. **I
described a property (different failure modes must not be merged) and implemented a taxonomy — the
four-deviation rule, committed inside the ruling that cited it.** EV-219 was withdrawn the next day.

**The test that caught it, and the one to reuse:** *am I applying the same standard to two
identically-situated findings?* I had already ruled `content` **blocking** for being *witnessed + one
line + known before merge*. `::first-letter` was all three. The only difference was which **axis** it
sat on. **Different standards for identically-situated findings is not a split, it is an
inconsistency.**

📌 **The right model for a guard that reads a rendered surface: it reads a MATRIX of (box × property).
One enumeration, and it can be short on either axis.**

🔴 **The other lesson, and it is the transferable one: A WITNESS TAKEN IN A SYNTHETIC
`page.setContent` HARNESS IS NOT A WITNESS ON THE REAL SURFACE.** Two of four escapes did not survive
the move — `::marker` generates no box at all because the row is `display: grid`. **Before allocating
an ID to a reported bypass, ask which surface it was constructed on.** See
[[feedback-probe-the-mutant-before-trusting-green]]: *carding a phantom is the same defect as missing
a real one, and it costs a row.*

**When withdrawing a row:** keep the card and story as the record, say *why*, and **spend the ID** —
never reuse it. The board carries a `Withdrawn` (resolved) state for this; `Done` would owe a merge
sha and `Open` invites someone to pick it up.
