---
name: a-server-clock-is-not-a-browser-clock
description: Coach fixture reads the date on the SERVER; Playwright clock control only moves the browser. To test a weekday, pass the date into fixtureAdherence.adherenceSeries(specs, now)
metadata:
  type: project
---

The coach portal's fixture computes `plannedSoFar` from the **server** process's UTC day.
Playwright `page.clock` moves only the **browser** clock, so a page test "on a Monday"
runs on the real day and proves nothing. `senior-po` caught this in EV-217's draft on
2026-09-23.

EV-249 moved `WeekSpec` + `adherenceSeries` into `src/lib/fixtureAdherence.ts` (no
`server-only`) with a `now: Date = new Date()` parameter. The worlds' tuples stay in
`coachApi.fixture.ts`, behind `server-only`.

Measured (EV-249 AC3, pre- and post-move identical): derived current-week `plannedSoFar` =
`min(planned, elapsed calendar days since Monday UTC)`. It does **not** count scheduled days.
So a stated tuple matches its derived value on exactly one weekday: Lina `[3,4,2]` on
**Wed**, Ines `[1,3,0]` on **Mon**. A test with one tuple misses an ignored-override bug on
that tuple's day, so the test uses both.

**How to apply:** to vary the day, call the function with a date. Do not reach for
`page.clock`. To simulate the process clock for a whole node run, use a `--import` preload
that subclasses `Date` (only the zero-arg constructor and `Date.now` shifted).

**Faking the whole gate's day.** `NODE_OPTIONS="--import fakeclock.mjs"` reaches the
runner, the workers **and** `next dev`, but not Chromium. Shift **forward** only (for
example to next Monday). Shifting back makes the session cookie already expired to the
real-clock browser, and warm-routes dies on `/login?error=expired`. Even a forward shift
fails `coach-library.spec.ts:266` ("Updated just now"), because the server stamps a future
`updatedAt`. That failure is the split clock, not the change under test. Add a scratch
probe spec that logs `new Date()` so each run shows which day it saw.

**Roster config port:** `playwright.roster.config.ts` reads `COACH_ROSTER_PORT` (default
3301), not `COACH_PORT`. Passing `COACH_PORT` is silently ignored.

Worktree agent pitfall: bash commands that combine `git` with redirects to paths outside
the worktree, or long `&&` chains, are refused by the isolation check. Write scripts with
the Write tool and keep git calls plain. See [[done-can-exceed-plannedsofar]].
