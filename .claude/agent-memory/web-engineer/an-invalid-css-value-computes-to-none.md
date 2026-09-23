---
name: an-invalid-css-value-computes-to-none
description: A gradient built from a divide-by-zero renders `Infinity%`, which is invalid CSS — Chrome drops the whole declaration and getComputedStyle reports `none`, so a computed-value ban misses it
metadata:
  type: project
---

Witnessed on EV-214 (b-fit-coach, `AdherenceSeries.tsx`, week rows of the adherence block):

- Lina — `background: linear-gradient(90deg, var(--blue-500) 100%, transparent 0%)` →
  computed `linear-gradient(90deg, rgb(79, 124, 255) 100%, rgba(0, 0, 0, 0) 0%)`.
- Ines — the same expression with `done / plannedSoFar = 1 / 0` →
  inline `…var(--blue-500) Infinity%…`, computed **`none`**.

`Infinity%` is not a valid `<length-percentage>`, so the `background` shorthand is
discarded at parse time and the element paints nothing.

**Why it matters:** a guard phrased as *"computed `background-image` is `none`"* is
**green** on the divide-by-zero shape and red only on the shape that happens to be valid
— i.e. it is weakest exactly where the renderer is most broken. The 1/0 case is not
benign either: the same renderer paints a flattering 100 % as soon as `plannedSoFar`
is 1 instead of 0, so the day of the week decides whether the guard binds.

**How to apply:** ban the **declaration** as well as the painted result — read
`getComputedStyle(el).backgroundImage` *and* the inline `style` attribute for a
background-image value (`gradient`, `url(`, `image-set(`). Neither read subsumes the
other: the computed read catches a gradient arriving from a stylesheet or a CSS custom
property, the inline read catches one Chrome refused to parse. Related:
[[a-picture-with-no-text-is-unassertable]].
