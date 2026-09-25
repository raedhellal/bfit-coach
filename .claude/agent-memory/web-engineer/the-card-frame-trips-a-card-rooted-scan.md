---
name: the-card-frame-trips-a-card-rooted-scan
description: Rooting the P-ADH C2 paint or geometry limb at the adherence card's <section> goes red on shipped code (Card box-shadow, CardHead icon <path>); ruled text-only at the card, paint/geometry stay at the list
metadata:
  type: project
---

EV-259 (2026-09-25) asked for every P-ADH C2 limb in `qa/coach-adherence-property.spec.ts`
to read the adherence card (the `<section aria-label>`) instead of the `<ul>`. I measured
it on shipped `src/` at `f92b63c`, and its edge-case-1 stop fired on two of the three limbs:

- **Paint:** 4/4 worlds red, with one offence each. The kit `Card` `<div>` has
  `box-shadow: var(--e-card)` (`src/components/ui/kit.tsx`), which is non-initial on the
  `box-shadow on its own box` entry.
- **Geometry:** 4/4 worlds red, with one offence each. `CardHead`'s `UiIcon` renders
  `<svg><path/></svg>`, and the `<path>` is a text-free painted leaf (15.83 px of a 19 px
  svg, 83.3 %) with no figures beside it.
- **Text:** 10/10 green when the expected content is title + headline + rows (EV-208
  worlds: title + note sentence). With BUG-235 planted it goes red in 5 worlds, and put
  back at the list it is 10 passed.

What the shipped card holds outside the `<ul>`: section, Card div (white, 1 px border,
shadow), CardHead div > div > icon div (`--blue-50` fill) > svg > path, a title div
("Adherence, last 8 weeks") and the headline `<p>`. The icon paints blue in the probe's
card-outside-ul band (0.016 on the clean control). A pixel probe of "the card" is
therefore never 0.000.

**Why:** "root at the card" sounds like a pure widening, but the card is also the design
system's frame, and the frame paints on channels the enumerated limbs ban. The story
forbids a carve-out, so the boundary is `senior-po`'s decision.

**How to apply:** before proposing any wider root for these limbs, first list what the
wider region renders, with its computed shadow and background and every leaf. 
**Ruled 2026-09-25 (senior-po, option 1):** only the text limb moved to the card
(`cardTextNodes`, where the expected content is title + headline + rows, or title + EV-208
sentence). Paint and geometry stay at the `<ul>`. Geometry-at-card plus BUG-236 went to
EV-220 AC3d. Paint-at-card has no row until someone builds a witness. A narrower root that
skips the frame ("the card body") was refused as a renamed carve-out. That shape of
answer is the one to reuse: leave a limb whole at a smaller root, and name the unread
region.
Related: [[re-rooting-a-scan-can-narrow-it]],
[[a-mutant-can-fail-the-gate-through-the-dev-overlay]].
