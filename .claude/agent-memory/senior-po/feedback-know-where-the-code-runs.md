---
name: feedback-know-where-the-code-runs
description: Before an AC tells a test to control something (a clock, a zone, a header), check which process actually reads it
metadata:
  type: feedback
---

**Before an AC says how a test controls an input, check which process reads that input.**

**Why:** EV-217 AC3c told the page test to set Monday and Sunday with "Playwright's clock control".
That controls the **browser's** clock. The portal's fixture is `server-only` and calls `new Date()` on
the **server**, so the samples would have run on the real day and proved nothing. The test would have
passed and looked like evidence. Caught only because I checked where the fixture runs while answering a
sequencing question. The fix routes the date through EV-249's parameter.

**How to apply:** for any "control X in the test" AC, name the process that reads X (browser, Next.js
server, API) and make sure the control reaches it. Then require the test to **check** that the
controlled value took effect (the page reflects the chosen day) before believing a result. That's
[[feedback-probe-the-mutant-before-trusting-green]] applied to test inputs rather than mutants.

Related, same day: a shared helper's behaviour on **missing** input can differ from what its name
suggests. `RequestTimeZoneResolver` returns UTC for a missing header too, so "use the resolver"
would have rejected genuine late-evening sessions. Read what a helper does with absent input before
ruling that a route should use it.

**Second round on the same AC (EV-217 AC3c):** after fixing the browser-clock mistake I wrote "EV-249
adds that", and it didn't (the fixture never passes a date). Then the reviewer showed the thing being
sampled (`plannedSoFar`) never reaches the page, so the sample could observe nothing. I **withdrew** the
AC rather than rewriting it. **Before choosing a mechanism for a test, check the test can observe the
thing at all.** If it can't, the answer is a stated scope with a revisit trigger, not a cleverer
mechanism. A known working `Date` preload is recorded on EV-217 for if it's ever needed.
