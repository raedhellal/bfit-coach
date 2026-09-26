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
(AC3b, BUG-222) was split to EV-270 by senior-po (hub 0efd7f4), with the fill-none paint.

**Why:** both witnesses (`@keyframes … 1ms 8s forwards`; `@media (max-width: 520px)`) were
on the element's own `background-image`, a channel the limb already read. Adding channels
closes neither; only another sample does.

**How to apply (the non-obvious parts, each witnessed by a check mutant):**
- Derive the wait from EVERY animation in `document.getAnimations()` — do not filter by
  DOM relation. Influence is not a DOM relation: an ancestor reaches the list by an
  inherited custom property (unset -> `var()` invalid -> `none` at t=0), and a SIBLING of
  the card reaches it through layout (staff-engineer's `qaGrow`: sibling grows in a flex
  row, a container query on the `<ul>` fires). My list+descendants+ancestors filter at
  7bdfcba was REQUEST CHANGES for exactly that. The clean page runs no animation at all.
- The margin is not what makes the sample safe; the post-wait assertion "every animation
  in scope has `playState === 'finished'`" is. Margin-only wait + that check = red;
  without the check = green on M-Q1.
- A paint that exists only WHILE an animation runs (no `fill`) is visible to neither
  sample (constructed, green). senior-po overruled "disclosed, no row": a constructed bar
  beside a count gets a row (EV-270 AC3). Infinite/over-budget animations fail.
- Make the settle preconditions SOFT and skip only the settled read, or one unsettleable
  animation (a spinner on `<body>`) hides the 320 px sample.
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
