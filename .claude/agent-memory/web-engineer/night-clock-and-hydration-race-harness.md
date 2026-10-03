---
name: night-clock-and-hydration-race-harness
description: How to reproduce the coach suite's two "false" reds at any hour — the 00:30-Paris clock shift and the WebKit pre-hydration fill — and the facts behind qa/sign-in.ts (chore/coach-test-hardening, 2026-10-03)
metadata:
  type: project
---

**Night reds (00:00–02:00 Paris).** Run any config at a chosen hour:
`QA_CLOCK_SHIFT_MS=$(node -e 'console.log(Date.parse(process.argv[1])-Date.now())' 2026-10-04T00:30:00+02:00) NODE_OPTIONS="--import ./qa/clock-shift.mjs" TZ=Europe/Paris npx playwright test …`.
The preload moves the runner, workers and every `next dev` process (each prints
`[clock-shift] pid …`); `qa/fixture-test.ts` moves the browser with an init script.
The shim is a function, not a class: `Date()` without `new` must return the string. Not `context.clock.setSystemTime`: Playwright replays it per document against the
RUNNER's `Date.now()`, which the preload shifted, so the page drifts back by the shift.
Shift forward only.

On base 047415a at 00:30 Paris: roster config 177 passed / 4 failed (coach-challenges
create « Upcoming », coach-french-roster « Il y a 2 j », pro-roster D1/R6 EN+FR "10 days");
default config 1111/1111. Cause: fixture `isoDate` did local `setDate` and printed
`toISOString()`. It is now `dayMinus(dayIn(now), n)` (Paris), the calendar `rosterView`
classifies against. The create test takes N10's `timezoneId: "UTC"` (cherry-picked a8a3dbf).
Specs that mirror fixture dates must use the same calls: coach-progress-goal does.

**WebKit sign-in race.** `qa/sign-in.ts` `signInThroughForm` is the one form sign-in:
every fixture-mode spec uses it (67 calls in 57 specs + `french.ts`, after staff's nit 1;
the first cut's "58" left eight spec sites raw). Only the live/stub/legacy/refresh configs
keep their own. Options: `labels` (exact or RegExp wording), `landing: null` (refusal paths),
`beforeSubmit` (pro-shell's document-load mark). Each wait is 40 % of the test timeout, at most
25 s, so a failure names the helper's step instead of "Test timeout".
Witness = « Sign in » enabled (SSR'd `disabled`; only React state enables it). Facts:
- A fill before hydration never reaches state; the plain helper then clicks a
  `<button disabled>` until timeout.
- **Re-filling the SAME text after hydration may never reach state** (nutrition editor:
  hydrated at 2.5 s, 40 re-fills over 80 s, Save stayed disabled). Clear, then fill.
- CPU burners alone (10 cores, load 26–30) did NOT reproduce it: old helpers 28/28.
  `taskpolicy -b -p <pid>` on `ms-playwright/webkit-*/com.apple.WebKit.WebContent.xpc`
  did: the old plain body failed 20 of 25 tries, and the 28 WebKit focus tests went 6/28 on
  the old helpers, 28/28 on the new ones.
- `--workers` above 1 is refused by BUG-249's guard, so "max workers" is no stressor here.
- Forcing it deterministically: hold `/_next/static/chunks/` in `page.route` until the
  password field has a value (`qa/sign-in-hydration.spec.ts`); goto with
  `domcontentloaded`, or `load` deadlocks on the held async chunks.

See [[a-server-clock-is-not-a-browser-clock]], [[challenges-followups-337n-facts]].
