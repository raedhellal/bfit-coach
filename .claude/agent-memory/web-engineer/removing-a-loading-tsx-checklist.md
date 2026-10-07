---
name: removing-a-loading-tsx-checklist
description: EV-342a — what else changes when a coach-portal route loses its loading.tsx (programmatic pushes, parent-segment coverage, the BUG-597 spec, how to measure)
metadata:
  type: project
---

EV-342a (2026-10-07, `perf/ev342a-fast-route-skeletons`) deleted the challenge list's and
the three libraries' `loading.tsx` (list and detail). Only `(roster)/loading.tsx` is left.

**Why:** React's ~300 ms reveal throttle applies to every committed `loading.tsx` fallback,
so a first visit painted at ~310 ms while the RSC answer was ready at ~50 ms. Without a
fallback React keeps the OLD page until the new one is ready (55–73 ms measured).

**How to apply, when a route loses its skeleton:**
- `grep -rn "router\.\(push\|replace\)" src` for every target under that route and put
  `startNavigationProgress(href)` right before it. A Link click is seen by
  `NavigationProgress`; a push from code is not, and the coach sees nothing on a slow read.
- A PARENT segment's `loading.tsx` also covers sibling routes with none of their own:
  `nutrition-templates/loading.tsx` was what `/nutrition-templates/new` showed. Deleting it
  changed `/new` too.
- Specs that stood inside a skeleton (BUG-597's `evoli_fixture_read_delay` tests in
  `narrow-widths.spec.ts`) are rewritten, not deleted: a MutationObserver installed before
  the click records "shimmer ever seen", the bar's time, and that the old page was still
  on screen. Red on the base with the skeleton restored is the witness.
- Measure with `qa/perf/transitions.measure.ts` against `next start` (fixture, populated,
  `PERF_HOLD_MS=40 PERF_RUNS=3`); `skeletonShown` per row is the before/after tell.
  `next start` and Playwright's `next dev` share `.next` in one worktree: run them in
  sequence, never together.

See [[layout-assertions-need-occlusion]] (hub) and the BUG-670 nav-progress note.
