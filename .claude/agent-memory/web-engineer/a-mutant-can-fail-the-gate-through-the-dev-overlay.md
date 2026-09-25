---
name: a-mutant-can-fail-the-gate-through-the-dev-overlay
description: A renderer mutant that breaks hydration puts Next's dev overlay on the page, and the overlay fails unrelated layout tests; count console errors in every probe
metadata:
  type: feedback
---

A CSS mutant delivered as `<style>{css}</style>` inside a server component (b-fit-coach,
EV-253, BUG-218's `ul::after` bar) had SSR escape its `""` to `&quot;&quot;`. The client
text differed, so hydration failed (21 console errors over seven worlds). Next's dev
overlay (`<nextjs-portal>`) then sat over Save at 320 px, and
`coach-progress-goal.spec.ts`'s occlusion check went red, with 17 serial tests after it
not run. The mutant was "killed by two clauses", and one of them had nothing to do with
the bar.

**Why:** a red outside the section you expect looks like a second limb catching the
construction. It can be the harness. In this case the probe's paint numbers were
identical in both deliveries, so paint alone could not tell them apart.

**How to apply:**
- Every paint probe also records `console` errors and `pageerror`. A non-zero count means
  the mutant is a dud until explained.
- Inject CSS with `<style dangerouslySetInnerHTML={{ __html: css }} />`, never text
  children. Or put the rule in `globals.css` and pass the ratio as an inline custom
  property.
- When an unexpected test goes red under a mutant, read its error before crediting it: a
  hit on `NEXTJS-PORTAL` in `qa/layout.ts`'s occlusion message is the overlay.

Related: [[a-paint-probe-must-sample-where-the-channel-paints]],
[[a-witness-does-not-choose-between-two-checks]].
