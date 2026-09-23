---
name: getcomputedstyle-takes-a-second-argument
description: A guard that reads getComputedStyle(el) is blind to ::before/::after paint, and the same call sees it with one more argument — so "the default tool does not report it" is never an acceptable disclosure
metadata:
  type: feedback
---

**A declared limit that is one expression wide is a to-do, not a limit.** If a disclosure
says *"the obvious call does not see it"*, check whether the obvious call takes one more
argument before writing the sentence.

**Why:** EV-214 shipped a paint guard whose disclosure read *"this limb reads
`getComputedStyle(el)` with no pseudo argument, so it does not see one"*. Every word was
true and it omitted that `getComputedStyle(el, "::before")` exists. `senior-po`'s ruling:
that satisfies the **letter** of the no-witness rule and defeats its **purpose**.
*"I could not construct one"* stays an acceptable third answer; *"the default tool does not
do it"* does not. EV-215 closed it in one expression and the limb went red in the same run
it had been green in.

**How to apply:**
- Reading paint on a DOM element means **three** computed channels — the element, and
  `getComputedStyle(el, "::before")` / `"::after"`. A `::before` gradient sitting behind a
  row's figures paints a **full bar beside "2 / 4 sessions"** with `getComputedStyle(el)`
  reporting `none`.
- Name the channel in the failure message. "Paints a background image" on an element whose
  own computed style is `none` sends the reader nowhere.
- Every disclosure on this guard states what it **does** — what it reads, when, at what
  configuration — and tells the reader to **build the mechanism and run the limb** rather
  than reason from the sentence. Four totality sentences have been written about it and all
  four were falsified by the next person to try one.
- Related: [[an-inline-denylist-is-one-var-hop-wide]],
  [[a-fixture-without-the-shape-cannot-guard-it]],
  [[a-picture-with-no-text-is-unassertable]].
