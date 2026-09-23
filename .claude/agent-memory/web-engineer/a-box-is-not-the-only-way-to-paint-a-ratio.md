---
name: a-box-is-not-the-only-way-to-paint-a-ratio
description: An honest-looking adherence bar can be painted with no layout box and no background-image — ::before, and box-shadow inset with a vw offset, both do it
metadata:
  type: project
---

EV-214 closed **one** channel in `b-fit-coach`'s week rows (an element's own
`background-image`, read both computed and inline). The reviewer immediately built two
more that stay green against it:

- **`::before` / `::after`.** `getComputedStyle(el)` with no pseudo argument does not see
  it, and no inline attribute can express it. Cheap to close — `getComputedStyle(el,
  "::before")` is one expression and was verified red-against-bypass / green-against-
  clean.
- **`box-shadow: inset <pct>vw 0 0 0 rgba(…)`.** Paints a full bar beside "2 / 4
  sessions" with the whole suite green: no box, no background image. `border-image` and
  `mask-image` are the same family.

And two that are **not a channel gap at all** — they are the element's own
`background-image` on the computed channel, i.e. inside what the limb already reads:

- **a time-shifted paint** — `animation: … 1ms 8s forwards`: every computed value is
  `none` at t=0 and the bar is fully painted at t=11s;
- **a viewport-gated paint** — `@media (max-width: 520px)`: green at the default
  viewport, a full bar at the 320 px width this portal is swept at.

**A DOM read samples one instant and one viewport**, and that is a dimension of the gap
that no amount of widening the *property* list closes.

**Why it matters:** the adherence surface has now produced six distinct mechanisms for
drawing a flattering picture (inline width, gradient background, pseudo-element,
inset shadow, delayed animation, media query), and every guard written so far has been a
guard against the *last* one. A limb over one CSS property is a limb over one spelling.

**How to apply:** write the guard's javadoc as *"this limb READS X"*, never as *"nothing
can draw Y"*. Every totality sentence written about this file has been falsified by the
next person to try one — three times in three reviews, each time by a mechanism the
sentence's author had not thought of, which is exactly what a totality sentence cannot
survive. Say which channel, at which instant, at which viewport, and treat everything
else as open until a mutant says otherwise. See
[[an-invalid-css-value-computes-to-none]] and
[[a-picture-with-no-text-is-unassertable]].

**Necessity is not shown by two clauses killing one mutant.** Under the EV-214 bypass
both the computed and the inline clause fire on the same world, so deleting either cost
nothing; the computed clause was only shown to be load-bearing by a mutant that
delivered the gradient from `globals.css` with the ratio in a custom property and no
inline style at all. A necessity argument needs a mutant that *only* that clause kills.
