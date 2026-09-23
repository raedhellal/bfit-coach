---
name: an-inline-denylist-is-one-var-hop-wide
description: A denylist over inline style TEXT is walked past by moving the value into a custom property; combined with an invalid value it blinds the computed read at the same moment
metadata:
  type: project
---

`qa/coach-adherence-property.spec.ts` reads a week row's paint on four channels. Two of
them are text patterns over the inline `style` attribute, and a text pattern is **one
`var()` hop wide**:

```
--adh-paint: linear-gradient(90deg, var(--blue-500) 100%, transparent 0%);
background-image: var(--adh-paint)
```

puts no image function in any `background` value. On its own that is **partial** — the
computed read still catches the half that paints. **Combined with the `Infinity%` shape**
(`done / plannedSoFar` on a fixture row seeded `1 / 3 / 0` — see
[[done-can-exceed-plannedsofar]]) it is **total**: Chrome discards the invalid gradient, so
`getComputedStyle(...).backgroundImage` is `none` on all three boxes at the same instant
the attribute holds no image function. Witnessed on the EV-214 limb: Lina/Tobias/Noor red,
**Ines green** — the exact row the inline clause had been added for.

**How to apply:**
- Read the custom-property **declaration** in the same attribute; do not resolve the
  `var()`. A general CSS resolver was ruled out of scope, and a gradient declared in a week
  row's own inline style is the mechanism whether or not that attribute is where it is
  spent.
- **Per-clause attribution is the standard here** (witness-rule clause 4): two clauses
  killing the same mutant shows neither is needed. Build a mutant only the new clause
  kills, and if you cannot isolate one by construction, disable that clause alone against
  the mutant and show the test flip. That counterfactual run is the evidence.
- Related: [[getcomputedstyle-takes-a-second-argument]],
  [[a-fixture-without-the-shape-cannot-guard-it]].
