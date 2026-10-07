---
name: the-fixture-never-reaches-apifetch
description: BUG-690 — fixture mode answers in-process, so transport behaviour (timeouts, headers, retries) is only provable in live mode against a stub; the stall-api harness and the timeout bounds
metadata:
  type: project
---

`COACH_API_MODE=fixture` swaps `coachApi` for `coachApi.fixture.ts` wrapped by the journal;
`src/lib/apiFetch.ts` is never called. A latency cookie holds a fixture read, but it can
never prove anything about the transport.

**Why:** BUG-690's AC said "a fixture read held past the timeout". Implementing it there
would have tested a copy of the timeout written into the fixture, not `apiFetch`.

**How to apply:**
- For a transport-level change, use a live-mode stub config (refresh, legacy, activation
  and, since BUG-690, `playwright.timeout.config.ts` + `qa/stall-api.mjs` on ports
  3305/8096, `npm run test:e2e:timeout`). A new stub spec must be in `playwright.config.ts`'s
  `testIgnore` and in `fixture-isolation.spec.ts`'s `NOT_ON_THE_FIXTURE_SERVER`.
- The stub's "abandoned" counter (`res.on("close")` before answering) is the witness that the
  PORTAL gave up, not the browser.
- Bounds: reads (GET/HEAD) 8 s, writes 60 s; one deadline per call including the 401 refresh
  replay (raced, since the refresh `apiPost` has no signal). Past it, `ApiTimeoutError`,
  deliberately not an `ApiError`, so it is never read as a refusal and actions file it as
  `NO_ANSWER`. `apiPost`, `apiGetAs` and middleware's refresh fetch are NOT bounded: they
  are the session path (auth changes need Raed's say-so).
- Measured: a never-answered roster read shows the load error at ~8.4 s.

See [[coach-portal-fixture-mode]], hub [[live-api-proof-for-a-web-surface]].
