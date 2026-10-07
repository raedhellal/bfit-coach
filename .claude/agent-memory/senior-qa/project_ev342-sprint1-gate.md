---
name: project_ev342-sprint1-gate
description: EV-342 sprint-1 coach train 2325555 gate 2026-10-07 — 4 units PASS (342c live C.1 blocked on Docker); rig facts for list-route holds, write-bound injection, stalled sign-in, and two pre-existing flakes
metadata:
  type: project
---

**2026-10-07, b-fit-coach `train/ev342-sprint1` @ 2325555** (EV-342a cc49c76, EV-342c eeca6e3, BUG-690 7ef8e65, BUG-689/672 78ce221).
All four PASS; EV-342c's C.1-on-live-api BLOCKED-ON-DOCKER. No new product row. Log: session scratchpad `sprint1-qa.md`.
Default 1356/1357, roster 197+1 skip, legacy 8, timeout 4, refresh 1, activation 24.

**Why:** coach merge = Vercel production deploy ([[coach-portal-merge-is-release]]), so the second gate decides release.

**How to apply (reusable rig facts):**
- **A list route cannot be held with `evoli_fixture_read_delay`** (detail reads only). Use `evoli_fixture_api_latency=<ms>` (every
  call, cap 2 s). Cookies ignore the port, so one cookie serves an http server and its TLS front.
- **A probe of `startNavigationProgress` push sites:** wrap `window.dispatchEvent` to time `evoli:navigation-start`. A red witness
  (restore one `loading.tsx`, delete one call) was caught. With the call deleted, a lint error breaks `next build`; use `void fn;`.
- **Testing the 60 s write bound:** copy a scratch worktree, set `API_WRITE_TIMEOUT_MS = 3_000`, and use a stub with a holdable POST
  plus an abandoned counter. Also ran the real 60 s bound: 60302 ms.
- **Sign-in against a never-answering /auth/login hangs 301.6 s**, then the BFF answers 503 « Cannot reach the server ». That cut is
  undici's 300 s headers timeout, not our code. Vercel's own limit is unmeasured.
- **zsh does not word-split `$VAR`.** `env $E cmd` with `E="A=1 B=2"` gave "Invalid URL". `refresh-single-flight.spec.ts` reads
  `STUB_API_ORIGIN`, so moving `STUB_API_PORT` alone gives ECONNREFUSED :8098.
- **Pre-existing flakes, do not blame a branch:**
  - `field-focus-ring` swap-sheet fails on the cold first rep only. Seen again here.
  - In WebKit, `pro-programme-accordions.spec.ts:325` "publish re-seeds … day 6 at 390" fails about 25% of the time: train 11/42,
    base c2768c2 10/42, "day 1's fields are shown … not found".
- **`next start` rig artefacts:**
  - WebKit over http drops the Secure session cookies: the `library-filter-prehydration` WebKit rows go to /login (8 red), and
    `nav-progress` WebKit-FR fails.
  - `coach-challenges.spec.ts:84` reads "1 hour ago" once the server is more than 20 min old, because of its seed time.
