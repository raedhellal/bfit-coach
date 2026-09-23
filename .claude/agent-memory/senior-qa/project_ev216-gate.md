---
name: project_ev216-gate
description: EV-216 (paint channels nobody reads) gate 2026-09-23 — FAIL at eadd421, PASS at afebbe7; border-image-source on ::first-letter paints in the gutter above the row; mask-border is the next open channel
metadata:
  type: project
---

**EV-216 gated FAIL at `eadd421` and PASS at `afebbe7` (pin 18), 2026-09-23.** Everything executable was green — tsc 0, lint 0,
cold `next build` 0, `npx playwright test` **261 passed** (baseline 260 at `fdd654d`; the +1 is the
AC3 ratchet, confirmed by diffing `--list` rosters), roster config 18 passed. The FAIL is a
**capability sentence that is false**, not a red test. Bugs filed: **BUG-217 (P1)**, BUG-218 (P2),
BUG-219 (P3), BUG-220 (P3).

**🔴 The finding to carry into every later row in this family: `border-image-source` on
`::first-letter` PAINTS.** The band is drawn in the **10 px gap above the row box**, so an
element-clipped screenshot of the `li` reads ~0.006 and looks empty — which is how two people
measured it empty after already fixing the "wrong box" trap once. Sample with a pad around the
element (`PROBE_PAD`), and always run an **isolation control** (same box, same border, no
border-image) plus a **beside-check** (solid colour) before believing an emptiness.
- Narrow form (`padding-right: r*0.5vw`) is green on the **whole gate**: 261 passed with 0.586 of
  the row width blue beside "2 / 4 sessions" (control 0.031).
- The 100 vw form is killed — by `qa/layout.ts`'s **320 px sideways-scroll sweep**, not by P-ADH C2.
  ⚠️ The file's own M5/M6 `::first-letter` witnesses use `padding-right: 100vw` and were only ever
  run against the adherence FILE, so their "escape" claims are file-scoped, not gate-scoped.
- `mask-image` on `::first-letter` is honestly empty: computed `none` even when declared, while a
  flat `background-color` on the same box paints the full padding box.

**Mutants re-run with paint traces (adds to [[project_ev214-gate]]'s ledger):** M1 `box-shadow`
(1.000/0.894/0.596 proportional; 4 failed, 29 offences, all `[box-shadow on its own box]`, zero
DECLARES; independence 16 passed) and M6 `box-shadow on ::first-letter` (same numbers as the file
records; 4 failed, 32 offences — the file says 12, a selector-scope difference, not a defect;
independence 16 passed).

**Two more walk-pasts with witnesses:** a bar drawn by `ul::after` (outside the `li` scan) is 261
green; and an entry RENAMED and repointed together (`box-shadow on its own box` →
`outline-style on its own box`) keeps length 17, unique names, name-equals-read and unique pairs —
16 passed with M1 painting. A pin on the SET of `(property, pseudo)` pairs would close the latter.

**How to apply:** in this family, a green suite proves nothing until the mutant has been photographed
AND the probe's clip region has been widened past the element box. Related:
[[coach-portal-merge-is-release]] — a PASS here is a production release, which is why a false
"cannot" in the shipped disclosure is blocking rather than cosmetic.

**Re-gate at `afebbe7` (BUG-217 fixed).** tsc/lint/cold `next build` 0, 261 passed, roster 18,
`--list` 261 in 16 files with only the four world titles moving 17 → 18. My escape is now **4 failed,
32 offences, all `[border-image-source on ::first-letter]`, zero DECLARES**; **independence run on
the WHOLE GATE** (cell removed, pin 17, mutant live) = 261 passed. BUG-217 closed on my own re-run.

**🔴 The next open channel, filed as BUG-221 (P2), not blocking:** `-webkit-mask-box-image-source`
(mask-border) on the row's own box with a flat background COLOUR, `-webkit-mask-box-image-slice: 0
fill` — **261 passed with the current-week row painted end to end (0.993 vs control 0.031)**, every
one of the 18 channels initial. Measured for whoever closes it: the standard spelling
`mask-border-source` computes `""` in this Chromium and would trip the guard's own empty-value
assertion, so the entry must be the `-webkit-` one.
