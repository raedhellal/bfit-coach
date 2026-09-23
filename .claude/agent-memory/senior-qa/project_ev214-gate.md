---
name: project_ev214-gate
description: EV-214 (no unmeasurable picture in a week row) gate 2026-09-23 — PASS at 6e5eac8; the mutant ledger, and the two channels (time and viewport) that make the limb's totality sentence false
metadata:
  type: project
---

**EV-214 gated PASS at `6e5eac8`, 2026-09-23** (test file + 3 web-engineer memory files;
no production source, no fixture). 260 passed (256 + 4), roster 18, tsc/lint/`next build`
exit 0. Run from a detached worktree of the real repo, so `qa/api-merge-condition.spec.ts`
resolves the sibling via `--git-common-dir` and `B_FIT_API_DIR` is unnecessary — **prefer a
worktree over a scratch copy** for this repo's suite for exactly that reason.

**Mutants I ran red that nobody had (adds to [[project_ev210b-gate]]'s ledger):**
- `rows.length === weeks` — `series.weeks.slice(0,7)` → red. Its message says *"rendered no
  week rows at all"* for **any** count ≠ 8; wrong for every non-zero miss.
- the anti-vacuity `inspected >= minimumElements` — date/figures rendered as bare text
  nodes → red at "only 20 elements … guarantees at least 24". Shipped margin is 24 vs ~20.
- the `url(` alternative of `INLINE_BACKGROUND_IMAGE`, which the file declared as having
  **no witness in either direction**: `background: url(data:…) no-repeat 0 0 / Infinity%
  100%` → Ines red **from the inline clause alone**, Lina red from the computed one.

**🔴 The thing to carry forward: a `background-image` ban is a ban at ONE INSTANT and ONE
VIEWPORT.** Two mutants paint a full bar beside "2 / 4 sessions" with the limb green, both
on the element's *own* `background-image`, computed channel:
- **time** — `@keyframes` + `animation: … 1ms 8s forwards`. Computed is `none` when the
  spec reads and the gradient at t=11 s. Screenshot witness.
- **viewport** — the same gradient under `@media (max-width: 520px)`. The EV-214 tests run
  only at the default 1280×720; `qa/layout.ts` sweeps this portal at 320–414 px.

**How to apply:** when any spec here asserts *"nothing paints X"*, ask **when** it read and
**at what width**, not only which property. Both are unstated in EV-214's AC1 and both are
load-bearing. Related: [[coach-portal-merge-is-release]] — a PASS on this repo is a release.
