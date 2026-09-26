---
name: project_ev217-gate
description: EV-217 gate 2026-09-26 — PASS at f185c82 (merge onto e646834); own mutants QA1-QA5; [GUARD] BUG-258 (paint only while animating); :839 flake = BUG-232 drifted
metadata:
  type: project
---

**EV-217 gated PASS at `f185c82`, 2026-09-26** (base `e646834`, local merge `fe985c6`). Evidence on hub branch
`docs/ev217-qa-gate` (tip cfb3b66, not merged), `docs/qa/evidence/2026-09-26-EV-217-gate/`.

- Mutants that each go red ALONE (patcher `mutants/patch.mjs` puts `<style>` beside the card, `qa-now` on the
  current `li`, inline `--qa-r`/`--qa-n`): QA1 `0%,99% none / 100% G`, `2.5s 3 forwards` → settled-only, and it
  witnesses that the wait is `endTime` (iterations), not duration+delay. QA2 `@container (max-width:300px)` box-shadow
  → 320-only. QA3 45 s finite animation on a descendant + QA2 → budget red AND 320 red; control QA3c budget only.
- Paint-only-while-running (no fill) is green at every sample → filed [GUARD] BUG-258 P2, closes on EV-270 AC3.
- `coach-routine.spec.ts:839/:840` (`goBack` ERR_ABORTED / URL stuck) IS BUG-232 (`:820/:821` + 19 lines of drift).
  Its isolated repro `-g "roster breadcrumb asks too" --repeat-each 100` was 3/100 on main alone. Don't re-file.

**Traps:** zsh treats `echo ======` as `=cmd` expansion and aborts the chain. `rm $VAR/...` is blocked by the
safety check; use literal paths or `"${S:?}"`. Foreground `sleep` is blocked; wait with `until grep -q ...; do sleep 5; done`.
Related: [[project_ev218-gate]], [[guard-rows-vs-product-rows]].
