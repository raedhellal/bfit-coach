---
name: a-not-applicable-needs-the-whole-write-path
description: EV-344 staff B1/nit 5 (2026-10-09) — "no field can make a save be refused" and "known flake" were both claimed from half the evidence; trace to the DB CHECK, and measure a flake on base
metadata:
  type: feedback
---

Two claims staff falsified on EV-344 @ `889598f`:

1. **EV-344.5 "not applicable"** — I traced the portal (NumberField floors at 1, no
   `failureSentence` case names a card field) and the api's `RoutinePolicy`, and stopped.
   Staff kept going: `Constraints.minutesPerSession` is only `@Positive`, publish writes it raw
   into `plans.session_minutes`, and **`V11__personalized_plans.sql` has `CHECK
   (session_minutes BETWEEN 20 AND 90)`**. So 15 or 120 saves as a draft and is refused at
   Publish (an unhandled DataIntegrityViolation → generic error). The NumberField has no upper
   clamp (html `max` only).
2. **"known flake"** for `coach-progress-goal.spec.ts:952` — the known-flaky list only has
   `:568` of that file. Measured afterwards: 1/20 on base `6caecb8`, 1/20 on the branch.

**Why:** an N/A or a "not this branch" is a "cannot" claim, and needs a trace to the last
layer that can refuse (CLAUDE.md's witness rule) or a base measurement.

**How to apply:** for "can X be refused", follow the value through the use case to the entity
AND `git grep` the migrations for a CHECK / NOT NULL / UNIQUE on its column. For a red test
you blame on flakiness, quote the list entry or run `--repeat-each=20` on base first.

See [[a-first-viewport-ac-is-about-the-bottom]].
