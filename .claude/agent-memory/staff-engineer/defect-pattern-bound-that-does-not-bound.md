---
name: defect-pattern-bound-that-does-not-bound
description: Recurring defect — a risk is "bounded" by a repo default, an omission-test, or an unsized cap; none of the three is a bound
metadata:
  type: feedback
---

Reject three shapes of fake bound when they appear in an Evoli ADR or story:

1. **A repo default presented as a deployed fact.** `BFIT_AI_ENABLED` defaults to `false` in
   `application.yml`, but Railway's environment is not in the tree. "Spend is zero because the flag
   defaults off" is unverifiable from here. Require the deployed value to be read at deploy time,
   and check whether the feature's own acceptance criteria silently *require* the flag to be on
   (ADR-0015 D6 vs EV-185 AC3 — they could not both be true).
2. **An omission-test.** "A test asserting the coach path does not write `plan_assignments`" passes
   forever for the wrong reason. Prefer a structural rule (ArchUnit deny-list / package allowlist)
   so the omission is a compile-time fact.
3. **An unsized cap.** "3 applies per link per day" means nothing until someone multiplies it out.
   Make the ADR state the resulting ceiling in model calls (one meal-week apply is ~7 model calls
   plus per-meal image generation; 30 clients x 3 = ~630 calls/day).

**Why:** each of these reads as a mitigation in review and evaporates in production.

**How to apply:** whenever an ADR says "bounded by", ask what number it bounds to and whether the
bound is a fact about the repo or about the deployment.

Related: [[defect-pattern-cited-seam-does-not-exist]]
