---
name: project_coach-s3k-gate
description: 2026-10-11 coach train/coach-s3k f4d6842 (BUG-741/742 test-only guard signals) gate PASS; old-reader mutation variants, M-flash is timing-dependent (use 0 ms), QA_DESECURE breaks sign-out tests, BUG-749 rate unchanged 23/64 vs 25/64
metadata:
  type: project
---

**2026-10-11, b-fit-coach `train/coach-s3k` @ f4d6842** = 4e95519 (s3j) + `test/bug-741-742-guard-signals` @ a66df84. Test-only.
Session log: scratchpad `coach-s3k-qa.md`; artefacts scratchpad `s3k/`. Previous: [[project_coach-s3j-gate]]. PASS; numbers live
in the session log.

**Why:** a test-only train still ships (coach merge = deploy, [[coach-portal-merge-is-release]]); the gate's job was to prove the
new witnesses can fail, not only that they pass.

**How to apply (reusable):**
- **Prove a witness by restoring the OLD reader, not only by mutating the product.** Mutant + new spec red is half; mutant + old
  reader green is the false pass the row described (M-S2 + flag `disarmed`: progress-goal 49/49, form-leave-guard :285 6/6 green).
  Keep a control: old reader + no mutant must be fully green, or the variant itself is broken. Script: `s3k/rig/variants.mjs`
  (exact-anchor edits that throw if an anchor is not found exactly once).
- **Staff's M-flash (busy cleared 20 ms after the sort starts) is machine-timing dependent**: triage red 1/8 here vs 3/3 for the
  engineer. When the order lands inside 20 ms, busy did NOT leave early and a pass is correct. Use M-flash0 (0 ms timer): red 5/5,
  green 5/5 with the snapshot assertion dropped.
- **QA_DESECURE (WebKit on `next start`) cannot run a sign-out test**: the deletion Set-Cookie is Secure (IS_PROD), WebKit drops it
  over http, the re-added non-Secure cookies survive. `back-to-pro-roster :216` "S1: signing out…" red on base AND train. Not a defect.
- **zsh does not word-split `$VAR`**: passing "a b c" as targets to a script gave one regex and "No tests found" for every cell.
  Drive multi-arg loops from `bash -c`, or use `${=VAR}`.
- **BUG-749 measurement recipe:** interleave train/base batches of 16 (fresh .next each) and compare with Fisher; 64 a tree gives a
  ±17-point CI. "Navigation canceled by policy check" is a common form of the red (11/23, 13/25), not a rare one.
