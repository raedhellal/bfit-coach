---
name: colour-plus-ratio-padding-is-a-picture
description: "'A colour cannot encode a ratio positionally; only an image can' is false — background-color with a ratio-sized padding on ::first-letter paints a proportional bar past every image-channel guard"
metadata:
  type: feedback
---

A guard scoped to **image** channels rests on the claim that a flat colour cannot draw a
proportion. It can: the ratio goes in the **box**, not the paint.

```css
li > span:first-child::first-letter { padding-right: var(--ratio-vw); background-color: rgba(79,124,255,.85); }
```

Measured against `aea5782` (2026-09-23), Lina's series, control MAXLINE 0.074: **1.000** beside
*"21 Sept 2026 — 2 / 4 sessions"*, **0.902** on a 3/4, **0.604** on a 2/4, 0.070 on a 0/4 —
proportional, with **no image function anywhere**, and the guard **16 passed, exit 0**. It
evades the image enumeration because there is no image, and it evades the geometry limb
because `::first-letter` is not an element the limb can measure. (I did **not** test the
ordinary-element variant, so I make no claim about whether the geometry limb covers that one.)

**Why:** the sentence *"a colour cannot encode a ratio positionally; only an image can"* has
sat in `qa/coach-adherence-property.spec.ts` since EV-214 as the stated reason
`background-color` is out of scope. The scope decision may still be right; the reason given
for it is false, and a reader trusting it never tries the construction.

**How to apply:** whenever a paint guard draws its boundary at "images only", construct the
colour-plus-sized-box version before accepting the boundary's justification. Ask for the
*reason* in the disclosure to be corrected even when the *scope* is left alone — they are
separate decisions and only one of them is the reviewer's.
Related: [[content-and-first-letter-are-paint-channels]],
[[non-vacuity-counter-does-not-bind-a-second-picture]], [[harmless-variant-falsifies-the-coverage-claim]].
