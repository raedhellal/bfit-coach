---
name: project_coach-s3c-gate
description: 2026-10-09 coach train/coach-s3c 794bc91 (EV-344 fold, BUG-711, BUG-712) gate — PASS; 2A holds on Lina only (content-dependent, row proposed); hidden-field locator trap, inventory diff for "nothing lost", cookie-free route to a stored out-of-range draft
metadata:
  type: project
---

**2026-10-09, b-fit-coach `train/coach-s3c` @ 794bc91** = fa23b84 (coach-s3b) + EV-344 298cc5d + BUG-711 121f754 + BUG-712 dc7a457.
**Verdict: PASS.** Counts: default 1682/0 failed/0 skipped (the 4 EV-342f fixme are plain now), roster 239 + 1 skip.
The session log is the scratchpad `coach-s3c-qa.md`; artefacts are under the scratchpad `s3c/` (rig/, shots/, *.jsonl). The previous gate is
[[project_coach-s3b-gate]].

**Why:** a coach merge is a production deploy ([[coach-portal-merge-is-release]]). EV-342f goes Done at EV-344's merge, so F.1 as
`D-FOLD-1` (A) states it was recorded here.

**How to apply (reusable):**
- **A first-screen AC measured on one client is content-dependent. Measure the other seeded trainees too.** EV-344.2A has 18 px of
  spare room on Lina at 1024×800.
  - A 2-day plan prints "A plan has between 2 and 6 training days." (+21 px). Dana's Day 1 header then ends 3 px under the bar.
  - Yusuf's "… changed this plan … You're seeing their version." adds +61 px. His header ends wholly under the bar at both viewports.
  - Proposed as a product P3 for senior-po. It is not a gate fail, because the AC names Lina.
- **A `display:none` field drops out of the accessibility tree.** `getByRole('spinbutton')` on a folded card, or the fold toggle at
  ≥ 1280, then waits until the TEST timeout, and `.catch` does not save it. In probes use CSS locators: `.plan-settings-card
  input[type=number]` and `.plan-settings-toggle`. I lost three reruns to this.
- **"Nothing is lost" (EV-344.6-type) check:** compare the base and the tip at the same width. Diff the multiset of `.prog-main`
  innerText lines, the (tag, type, accessible name) of every control, and 22 Tab stops from the plan name. This is cheap and decisive.
- **F.4 / 9A screenshot pairs:** run three `next start` builds side by side: production, the train base, and the tip. Byte-compare
  viewport and fullPage PNGs. The control is the same page below 1280, which must differ.
- **A cookie-free way to a stored out-of-range draft:** a template saved at 120 min (templates have no range reason), then « Use on a
  trainee ». It lands with the card open. This needs the populated scenario.
- **Base-red for a fix that adds its own fixture switch:** start from `git archive <base>`, then
  `git diff <base> <tip> -- src/lib/coachApi.fixture.ts <spec> | git apply`. Check that every red snapshot shows the OLD sentence.
- **One mutant tree serves a shared module's two callers.** Run it under both configs (default for 711, roster for 523) and predict the
  red set first. `classifyPlacement` keeps a duplicate non-ApiError guard, so placement "thrown" survives a policy mutant.
- **zsh does not word-split `set -- $pair`.** Run pair loops under `bash -c`.
- **A gate config without a webServer** (GATE_URL, GATE_MATCH, chromium + webkit projects) lives in the scratchpad `s3c/rig/pw-gate.config.ts`.
  Run WebKit only against `next dev` (the Secure cookie trap).
