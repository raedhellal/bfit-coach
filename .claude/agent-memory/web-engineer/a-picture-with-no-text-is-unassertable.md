---
name: a-picture-with-no-text-is-unassertable
description: An aria-hidden bar or chart carries no text, so a text-assertion suite cannot see it disagreeing with the number beside it — emit the drawn value as a data attribute
metadata:
  type: project
---

A bar, sparkline or meter rendered `aria-hidden` with its value only in an inline
`width` is **invisible to every assertion a Playwright suite normally makes**. EV-187b's
adherence card shipped a review with a **full bar next to "2 / 4 sessions"** and 209 green
tests; the staff reviewer found it by running a dev server and reading `width:` off the
fill span by hand, which is not a gate.

**How to apply:** give the drawn element a `data-*` attribute holding the number its
geometry is computed from — the *same expression*, read once — and assert in the spec that
it equals the value recomputed from the row's own printed label. Then "the picture agrees
with the figure beside it" is a gate rather than a hope.

🔴 **`data-fill` alone does not bind (witnessed, EV-210b).** A mutant that left
`data-fill` honest and drew `width: 100%; transform: scaleX(1)` passed every
attribute-based assertion. **Measure the boxes**: `getBoundingClientRect()` of the fill
over its parent, which includes transforms and is not clipped by `overflow: hidden`, so a
200 % bar reports 200. `qa/coach-adherence-property.spec.ts` finds bars structurally —
every text-free *painted* leaf in the row, plus anything carrying `data-fill` even at
zero width so a genuine 0 % week is still checked — and then holds `data-fill` itself to
the geometry. **The blind spot is narrower than "a gradient"** (the staff review probed
it): a gradient-painted leaf and a bar moved onto the text-bearing label both go red.
What stays green is a picture painted with **no layout box of its own**, in a row whose
measurable bars already meet the minimum count — e.g. a gradient behind the figures.
That is a follow-up row, and it is written in the file rather than assumed away.

Two further things that spec needs:
- a counter proving it did not pass by finding **no** bars at all;
- read the label from its own element, not the row's `textContent` — a date column
  renders "10 Aug 2026" straight into "3 / 4 sessions" and a digit-greedy match pulls
  "20263 / 4" out of it.

**The design rule the incident also settled:** a partial or unscheduled period draws **no
bar**. A week that has not finished has no proportion to draw, and a bar drawn against
either denominator over-claims in a direction that makes a struggling client look fine —
the same direction as EV-187a's blocking defect and BUG-198. Related:
[[a-card-located-by-its-text-asserts-nothing]], [[layout-assertions-need-occlusion]].
