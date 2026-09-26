---
name: a-guard-reads-at-a-sample-say-which
description: EV-217 — how the P-ADH paint limb samples time/width/state, what a derived settle wait must include, and what escapes both samples
metadata:
  type: project
---

EV-217 (2026-09-26, branch `test/ev217-settled-instant-and-320`) made the paint limb in
`qa/coach-adherence-property.spec.ts` read at three samples per world: on load at 1280,
SETTLED at 1280, and on a fresh load at 320 (`WIDTHS[0]` from `qa/layout.ts`). Only the
paint limb; geometry, C3 and text still read once, and the banner says so. Hover/focus
(AC3b, BUG-222) was NOT built on that branch — the dispatch scoped time + width only.

**Why:** both witnesses (`@keyframes … 1ms 8s forwards`; `@media (max-width: 520px)`) were
on the element's own `background-image`, a channel the limb already read. Adding channels
closes neither; only another sample does.

**How to apply (the non-obvious parts, each witnessed by a check mutant):**
- Derive the wait from `document.getAnimations()`, scoped to the list, its descendants
  AND ITS ANCESTORS. An unregistered custom property animated on the `<ul>`'s parent
  (`*:has(> ul)`), unset until then, makes the row's `var()` declaration invalid at
  computed-value time (`none` at t=0) and paints at 8 s. Dropping ancestors from scope
  lets it through. Reading the list's own `animation-*` declarations would miss it too.
- The margin is not what makes the sample safe; the post-wait assertion "every animation
  in scope has `playState === 'finished'`" is. Margin-only wait + that check = red;
  without the check = green on M-Q1.
- A paint that exists only WHILE an animation runs (no `fill`) is visible to neither
  sample (constructed, green). Disclosed, no row. Infinite/over-budget animations fail.
- Use `expect.soft` per sample and name the sample in the message, or a red first sample
  hides whether the later ones would have caught it (attribution is the reviewer's ask).
- Park the pointer (`mouse.move(0,0)`) and assert `ul:hover`/`ul:focus-within` false;
  the park itself has no witness today (sign-in click doesn't land over the list).
- Cost on clean code ≈ 0.6 s per world (250 ms margin + one navigation at 320).

Pitfalls met: `origin/main` moved mid-task (EV-256e merged by another session), so
`git diff origin/main -- src/` showed 256e's files as "mine" — use `origin/main...HEAD`.
Two `next dev` on one worktree share `.next`: stop the scratch server before a default-
config run. A mutant runner that `git checkout`s the spec reverts uncommitted edits —
commit first. Related: [[a-paint-probe-must-sample-where-the-channel-paints]],
[[the-card-frame-trips-a-card-rooted-scan]], [[an-invalid-css-value-computes-to-none]].
