---
name: decision-future-dated-completions
description: Product ruling 2026-09-23 — a workout completion may not be dated after today; backdating stays allowed; EV-248
metadata:
  type: project
---

**A workout completion may not be dated after today.** Ruled 2026-09-23, carded as **EV-248**
(`b-fit-api`, gated on a Testcontainers witness).

**Why:** a completion record says a workout happened on that date; a future date can't be true yet.
The API accepted it with no check, so a trainee could log Friday on a Wednesday and the coach's
current-week adherence rose at once. P-ADH's prose already forbids this, but its formal C1
(`done <= planned`) didn't, and EV-210a's world 8 encoded it as correct with a false comment ("it
happened"). I wrote both C1 and the AC that asked for that world.

**How to apply:**
- Doing a planned session early is fine: record it on the day it happened. Whether it counts towards
  the prescribed day is EV-209's rule.
- Backdating a forgotten session stays allowed. Any past-date limit would be a separate row.
- The bound is not "server-today": Evoli's users are mostly in France, ahead of UTC, and a strict
  check would reject genuine late-evening sessions every night. Use the trainee's local date if the
  API knows it, otherwise server-today + 1 day.
- When formalising a property from prose, check the formal version forbids **everything** the prose
  does. That's the four-deviation pattern ([[feedback-write-acs-against-the-real-surface]]) in my own
  property statement.

**Reproduced 2026-09-23 as BUG-225 (P2; P1 if mobile sends future dates).** Rulings from the witness:
- **Date bound:** the route reads `X-Timezone` like its siblings. But `RequestTimeZoneResolver` returns
  UTC for a *missing* header as well as an unreadable one, so a missing/unreadable header must fall
  back to server-today + 1 day, never strict UTC. Check what a shared helper does with absent input
  before ruling that a route should use it.
- **The read side is part of the fix.** Write-side rejection leaves stored future rows visible, and
  once the test's model stops counting them, the reader has to match. Coach-portal reads ignore dates
  after server-today + 1 day. No data changes.
- **The no-date default (UTC) is deliberately untouched** until QA witnesses the midnight mis-dating.
- **Past affected rows can't be counted:** `created_at` comes from the client's date. No cleanup.
- **When a test asserts wrong behaviour, fix the helper that produced the expectation, not only the
  worlds that surfaced it.** World 16 carried the same assumption silently.

**Trainee-side reads (2026-09-23): recorded, not a row.** The trainee's own progress, last workout and
calendar still show a stored future row. Not built because new rows can't be written, still-future rows
are countable, and the harm is to the trainee who sent it rather than to a coach being misled about
someone. **Trigger:** a non-zero count of completions dated after today (third item on BUG-215's
ops-pass list), or AC5 finding a mobile path that sent future dates. Test for "row or not": who is
misled, and can the affected population be counted?
