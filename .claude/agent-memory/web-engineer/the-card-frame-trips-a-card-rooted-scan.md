---
name: the-card-frame-trips-a-card-rooted-scan
description: Rooting the P-ADH C2 paint or geometry limb at the adherence card's <section> goes red on shipped code, on the kit Card's box-shadow and the CardHead icon's <path>; only the text limb re-roots clean
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
wider region renders, with its computed shadow and background and every leaf. The
measurement patch and probe from that run were parked in the session scratchpad
`ev259-out/`, which is not durable, so rebuild them from this note if they are gone.
Related: [[re-rooting-a-scan-can-narrow-it]],
[[a-mutant-can-fail-the-gate-through-the-dev-overlay]].
