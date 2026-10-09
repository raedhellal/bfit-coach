---
name: project_coach-s3e-gate
description: 2026-10-09 coach train/coach-s3e e4e3a5f (EV-337g1 nutrition frame + closed targets card) gate — PASS; wrong-reason base red from a branch-only locator, timed-out background jobs keep running, held-answer rig, dblclick as the reachability witness
metadata:
  type: project
---

**2026-10-09, b-fit-coach `train/coach-s3e` @ e4e3a5f** = 428bc7d (s3a–s3d, local main) + 9f0adf9 (my s3d note) + EV-337g1
`feat/ev337g1-nutrition-tab` d382767. **Verdict: PASS.** Default 1727/0 (+31 = pro-nutrition-frame exactly), roster 285 + 1 skip.
Live api (BUG-714 (9)) BLOCKED: Docker down. No new rows. Session log: scratchpad `coach-s3e-qa.md`; artefacts scratchpad `s3e/`
(rig/ probes, logs/, shots/). Previous: [[project_coach-s3d-gate]].

**Why:** a coach merge is a production deploy ([[coach-portal-merge-is-release]]).

**How to apply (reusable):**
- **A base-red probe must find things by content that exists on BOTH trees.** My first base run located the targets card by the
  branch's new named `<section>`, so G1.3 (must hold on base) went red for the wrong reason. Locate the card by its title plus a
  button (`div` filter `has` title, `has` button, `.last()`), and assert the new markup (the region) as its own check.
- **A Bash call that hits its 600 s timeout moves to the background and KEEPS RUNNING the rest of its `;` chain.** I re-ran the
  chain's second half in the foreground, and the two runs hit one fixture server at once (resets interleave, the log is mixed).
  After a timeout, wait for the background job; never re-issue its remaining steps.
- **Earlier gates' scratch dirs can vanish mid-run** (the orchestrator cleans the disk; the hub keeps only tail60 logs). Copy any
  reference log you will diff against (per-file test counts) into the current gate's dir at the start.
- **Holding a server action's answer for real:** `page.route(url, r => { if POST: resp = await r.fetch(); wait 2.5 s;
  r.fulfill({response: resp}) })`. The write commits server-side, and only the answer waits. This works in Chromium and WebKit.
  See [[holding-a-save-open-without-faking-it]].
- **Same-task `b.click(); b.click()` on a kit `Modal` confirm sends 2 writes, on base and on train alike.** A real `dblclick()` sent
  1 write, 12 times out of 12. Use `dblclick` as the witness for "a person can reach it" before filing a double-submit
  ([[feedback_guard-rows-vs-product-rows]]).
- **Routine tab below 1280:** the profile card is folded into a line (EV-342f), and a hidden copy exists. Filter leaves with
  `getClientRects().length > 0`, or screenshot the viewport instead.
- **Tooling:** `sips --cropOffset` still center-crops, and PIL is not installed. For a visual check, take a viewport screenshot in a
  spec. For pixel diffs, run a `pngjs` script placed inside an archived tree (it needs node_modules). Quote heredocs (`<<'EOF'`)
  when the body has template-literal backticks: an unquoted heredoc ran them as a command and blanked an assertion message.
- **zsh still does not word-split `set -- $pair`.** I hit it again starting two `next start` servers in a loop.
