---
name: mutants-against-a-hand-started-dev-server
description: run a mutant series against one hand-started fixture `next dev` (untracked config, webServer undefined) instead of one webServer boot per mutant; revert with git checkout of committed files
metadata:
  type: reference
---

EV-337j2 ran 14 mutant runs + 2 controls in ~15 min: `COACH_API_MODE=fixture
COACH_FIXTURE_SCENARIO=empty INVITE_BASE_URL=http://localhost:PORT nohup npx next dev -p PORT`
once, and an UNTRACKED `playwright.zz.config.ts` =
`{ ...base, webServer: undefined, testIgnore: undefined, use: { ...base.use, baseURL } }`.
Each mutant: python string-replace in src → curl the route with a fixture session (POST
`/api/auth/login` into a cookie jar, then GET) so HMR has compiled → `-g` the tests →
`git checkout -- <files>` (the feature is COMMITTED first, [[commit-before-mutating-an-edited-file]]).
A base check of tests written after the feature works the same way:
`git checkout <base> -- <src files>`, run, `git checkout HEAD -- <src files>` (it stages
them; the HEAD checkout clears the index too).

**How to apply:** control run first (all green); kill the listener PID and the npx PID
by number afterwards; delete the untracked config before the full suite (testIgnore
undefined would pull every live spec in). globalSetup still runs (single-worker guard,
warm-routes), so `--workers` stays 1.
