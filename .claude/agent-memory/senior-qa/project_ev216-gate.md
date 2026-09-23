---
name: project_ev216-gate
description: EV-216 gate 2026-09-23 — FAIL eadd421, PASS afebbe7, PASS 7b64a16 (pin 19); clip-region and fullPage-drops-hover probe traps; BUG-222 hover quantifier for EV-217
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

**Re-gate at `7b64a16` (BUG-221 entry, pin 19) — started 2026-09-23, written incrementally.** A first
attempt at this tip was lost with its session (nothing recorded; treat as not run). Ports
3365–3368, `lsof`-verified free; 3300/3302/3303 belong to other sessions and were not touched.
- `7b64a16`: `src/` diff vs `fdd654d` empty; `tsc exit=0`, `lint exit=0`, cold `next build exit=0` (`.next` confirmed gone first).
- `COACH_PORT=3365 npx playwright test` → **261 passed, exit=0**; roster config **18 passed, exit=0**; `--list` exit=0, **261 in 16 files**.
- Roster diff vs `afebbe7` (line numbers stripped): **8 changed lines = the FOUR world titles 18 → 19**, nothing else. `grep -c "19 enumerated"` = 4, `"18"` = 0. The AC3 ratchet title carries no number. **The implementer's "five world titles" is a miscount, the second in a row** — cosmetic, but its reports' counts should be checked, not relayed.
- BUG-221 escape re-planted byte-identical; PAINT PROBE first: current row "2 / 4 sessions" **0.993** (control 0.031), 0.744 on 3/4, 0.496 on finished 2/4 — my afebbe7 numbers exactly. The implementer read 0.957/0.675/0.475: same order and proportions, a different detector/plant; the number is the probe's, the paint is the same.
- Whole gate with the escape live: **4 failed / 257 passed, exit=1**; the four reds are only the AC1 world tests (`:1516`); **32 offences, every one `[-webkit-mask-box-image-source on its own box]`**, zero `DECLARES` (implementer: 30 — plant scope, same channel).
- **Independence on the whole gate**: entry removed, pin 18, mutant still planted → **261 passed, exit=0**. Nothing else in the suite sees it; the cell is load-bearing. Spec restored.
- False-positive direction: the clean-tree run above IS it — 261 passed with the entry present and pin 19.
- W5 (fifth walk-past): M1's exact shadow gated on `li:hover`. ⚠️ My `fullPage` probe first read 0.046 under hover — a `fullPage` screenshot resizes the viewport and DROPS the hover; the computed value said otherwise, so the probe was wrong. Viewport-clip probe: current row "2 / 4 sessions" **REST 0.031 → HOVER 1.000**, 0.651→0.894 on 3/4, 0.440→0.596 on finished 2/4.
- W5 whole gate: **261 passed, exit=0** with the hover bar live. Filed **BUG-222 `[GUARD]` P2** — fourth implicit quantifier (interaction state), EV-217's family, NOT a condition on EV-216. BUG-221 closed on my re-run. **Verdict at `7b64a16`: PASS.**

**Probe trap to carry forward:** `page.screenshot({ fullPage: true })` resizes the viewport and DROPS
`:hover` — it read 0.046 on a row whose computed shadow was 1280 px. When the computed value and
the pixels disagree, suspect the probe first; for any state-dependent paint, scroll into view and
capture in the viewport.
