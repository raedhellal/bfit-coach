---
name: screenshot-pairs-differ-by-subpixel
description: base-vs-tip element screenshots of an "unchanged" block differ by sub-pixel antialiasing once the page layout around it moves; compare with ±2 px shift and count >64-delta pixels
metadata:
  type: reference
---

EV-337g1's "must not change" pairs (pill, dialog, floor line, diet card, week, food log; 51f7faa vs tip) were
byte-identical only where the block's page position did not move. Elsewhere 2–168 rows "differed": the block
starts at a different fractional y, so glyphs rasterise on another half-pixel row (worst channel delta 3–49;
a title row 205 on 33 px that the eye cannot tell apart at 4x). A tall element screenshot also catches the
fixed top bar / tab bar at a scroll-dependent place.

**How to apply:** report pairs as: identical / shift-tolerant match (best dy in -2..2, dx in -1..1) with the
count of pixels off by >64 / real difference, and LOOK at any high-delta region enlarged before calling it
noise. A pure-stdlib PNG decoder is enough (no PIL in the sandbox python). Write the capture spec as an
untracked `qa/zz-*.capture.spec.ts`, run it in both worktrees, delete it.
