---
name: project_coach-s3n-gate
description: 2026-10-11 coach train/coach-s3n (EV-356g library pages stop awaiting the roster) gate PASS + 2 introduced P3 (network drop mid-stream); frame-sampler probe, action-hold and socket-cut proxy, WebKit hydration is variable, mutants on useRosterRead
metadata:
  type: project
---

**2026-10-11, b-fit-coach `train/coach-s3n`** = 89ad1e5 (local main: 1d655a4 + BUG-743/744) + `perf/ev356g-library-roster-unblocked` @5071beb.
Session log: scratchpad `coach-s3n-qa.md`; artefacts scratchpad `s3n/` (rig/, probe/*.jsonl, logs/, evidence/). Previous: [[project_coach-s3m-gate]].
Verdict and counts live in the session log. Findings QA-S3N-1/2 (P3, introduced) went to the records pass, not filed by me.

**Why:** coach merge = production deploy ([[coach-portal-merge-is-release]]). The row changes WHEN a page's document ends (it now streams
an unresolved promise), and that is where the new failure modes are, not in the ACs.

**How to apply (reusable):**
- **Streaming a promise to a client island makes the document long-lived.** Test a network drop mid-document, not only a failed read:
  a socket destroyed after the head leaves `document.readyState` "loading" FOREVER in both engines, so Next never closes its inline
  Flight stream and the island's thenable never settles (picker « Chargement… » forever in Chromium; in WebKit the page never hydrates).
  On a CLIENT navigation the same cut DOES reject the thenable (failure sentence in ~0.9 s). Base (page awaits the read) sends no byte
  before the read, so the same drop is a browser error page. Rig: `s3n/rig/zz-s3n-proxy.mjs` CUT_PATH/CUT_MS (+CUT_FROM=request).
- **WebKit early hydration on a streamed document is VARIABLE**, not "always at doc end": 2/12 document cells hydrated at ~100 ms. Real
  mouse clicks every 100 ms from list paint measure the inert window (16–18 dropped clicks) instead of skipping it.
- **Hold only server actions** for "nothing optimistic": proxy delays responses whose request has a `next-action` header; witness =
  first non-RSC fetch's `responseStart` from Resource Timing; assert every frame before it.
- Resource Timing entries appear only at responseEnd: poll for a streamed action/RSC entry, or a held response reads as "no entry".
- Frame samplers that slice `dialog.innerText` must not truncate: a 400-char slice hid "Creating…" and the challenge fieldset line.
- The kit `Modal` has NO Escape (BUG-171): test BUG-699's not-dirty with a backdrop click.
- Mutants on `useRosterRead`: FAILED→ready[] killed 24/24; LOADING→ready[] 18/24, survivors = WebKit doc cells hydrated at doc end.
- Session dev WebKit W13/W8 red ("ends on /", ~1 in 10) is the known keep-alive flake: repeat-each=5 gave 1/10 again.
- `api-merge-condition.spec.ts:171/:223` red in a `git archive` tree (no .git): re-run them in the git worktree.
