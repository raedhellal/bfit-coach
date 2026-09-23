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

**Why it matters:** the adherence surface has now produced four distinct mechanisms for
drawing a flattering picture (inline width, gradient background, pseudo-element,
inset shadow), and every guard written so far has been a guard against the *last* one.
A limb over one CSS property is a limb over one spelling.

**How to apply:** when a spec claims a picture cannot be drawn, say which *channel* it
reads and treat every other channel as open unless a mutant says otherwise — and never
write "nothing paints X" when the limb reads one property on one element. See
[[an-invalid-css-value-computes-to-none]] and
[[a-picture-with-no-text-is-unassertable]].

**Necessity is not shown by two clauses killing one mutant.** Under the EV-214 bypass
both the computed and the inline clause fire on the same world, so deleting either cost
nothing; the computed clause was only shown to be load-bearing by a mutant that
delivered the gradient from `globals.css` with the ratio in a custom property and no
inline style at all. A necessity argument needs a mutant that *only* that clause kills.
