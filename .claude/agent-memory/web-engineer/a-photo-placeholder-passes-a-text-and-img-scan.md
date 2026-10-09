---
name: a-photo-placeholder-passes-a-text-and-img-scan
description: an R8/G16 "no photo" check that reads text and <img> misses the grey placeholder box the plan also forbids; probe blank leaf boxes and url() backgrounds
metadata:
  type: feedback
---

EV-337j2 J2.3 (no photo, tag, portion… R8) first checked `img/picture/canvas`,
`role=img`, file inputs and a word list over text and attributes. Mutant M7b, an
`aria-hidden` 44 × 44 grey `div` in each row (the "photo missing" slot the plan
§5.4/§5.9 explicitly forbids), passed all of it.

**Why:** a placeholder has no text, no role and no image: the absence-of-photo rule is
about a shape, not a word.

**How to apply:** in a row-scoped R8 check, also fail on any HTMLElement leaf (no element
children, not inside an `<svg>`) with empty `innerText` and a box ≥ 16 × 16, and on any
`url(` background on an element or its `::before`/`::after`
([[getcomputedstyle-takes-a-second-argument]]). Leaves inside icons are SVG, so the
kit's buttons do not trip it. Sabotage it with the placeholder before trusting it
([[a-fixture-without-the-shape-cannot-guard-it]]).
