---
name: seeding-a-live-coach-portal-stack
description: Recipe + the four hard constraints when seeding real trainees through b-fit-api's own HTTP API for a live b-fit-coach QA pass
metadata:
  type: project
---

Seeding real coach-portal data through the product's own API works, and is what makes a live pass
possible instead of a fixture pass. Sequence per trainee:

`POST /auth/register` (returns tokens — use them, do NOT log in again) → `PUT /me/profile`
(needs `consentAccepted` **and** `privacyPolicyVersion`/`termsVersion`, else 409
`CONSENT_VERSION_STALE`) → `POST /me/onboarding/complete` → `POST /me/plan/generate` →
`POST /plans/select` → `POST /me/workouts/{workoutId}/complete` → `POST /me/nutrition/weigh-in`.

**Both completion and weigh-in accept their own `date`, so real multi-week history is seedable with
no SQL.** The generated plan trains Mon/Wed/Fri (3 planned per ISO week).

**Four constraints that will bite:**

1. **`POST /me/plan/generate` does NOT write `user_plan`.** Only `POST /plans/select` does. Without
   it `planSelectedAt` is null and every adherence week reads `hasPlan=false`. (This is also the
   trigger for BUG-205.)
2. **`user_plan.selected_at` is always "now"** — backdating it is the one unavoidable SQL edit for
   any 8-week history. Disclose it.
3. **`CapacityTier.STARTER` is a compiled constant of 2.** Seat-cycle instead: invite → accept →
   `POST /me/my-coach/revoke`, which leaves a real row with a real `consent_id`; then
   `UPDATE coach_clients SET status='ACTIVE', revoked_at=NULL, revoked_by=NULL`.
4. **`POST /me/my-coach/accept` grants all four scopes by design** — a partial-scope link (needed for
   AC1's 403 cases) has no product path and must be narrowed in SQL.

**Rate limits that stall a bulk seed:** `register-per-ip: 20/min`, `login-per-account: 5/min`,
`login-per-ip: 20/min`, 1-minute fixed windows. Batch ~16 per minute and sleep; never re-login when
the register response already handed you a token.

**`EXERCISE_PROVIDER` defaults to `musclewiki` but the seeded catalog rows are `provider='seed'`** —
so `GET /coach-portal/catalog/exercises` answers **503 `catalog_unavailable`** on a fresh throwaway
DB and every routine/publish path is dead for an environmental reason. Restart with
`EXERCISE_PROVIDER=seed` before concluding anything about the portal's publish flow.

Publishing through the api needs the two-step `publish/preview` → take its `digest` → `publish`.

**Three more traps, measured on the EV-208 gate (2026-09-23):**
- `POST /auth/register` returns the token at **`tokens.accessToken`**, not `accessToken` (login
  returns it at the top level). Access tokens last **15 minutes**; re-login per step in a long seed.
- ⚠️ **CORRECTED 2026-09-23 (EV-209 gate): plan ids are deterministic from the USER ID, not the
  profile** — `PlanGeneratorService` computes `deterministicId("plan:" + userId)`. So **every
  trainee gets its own `plans` row** and an SQL edit to one plan's `plan_schedule` never touches
  another's. The earlier note here said the opposite; varying `weeklyDays`/`primaryGoal` to force a
  distinct plan is unnecessary (though `weeklyDays` is still the knob for the *shape*:
  `resolveWorkoutDays` has cases for **2–6 only**, so 1 and 7 scheduled days have no product path).
- The STARTER seat cap is re-checked on every accept, so once N links are ACTIVE no further accept
  succeeds: `UPDATE coach_clients SET status='REVOKED', revoked_at=now(), revoked_by='TRAINEE'`
  first, run the invite/accept/revoke cycle, then reactivate them all in one statement.
- A link with `WORKOUTS` removed from `coach_clients.scopes` does **not** hide the adherence block:
  it renders with *"This trainee has not shared their progress with you."*

**Four more, measured on the EV-209 gate (2026-09-23):**
- **`coach_profiles` has no `id` column** — the PK is `user_id`. `insert into coach_profiles
  (user_id, display_name, capacity_tier, created_at)`. And `coach_clients` names the trainee column
  **`trainee_id`**, not `trainee_user_id`.
- **Emails are stored lower-cased.** A seed that builds an address containing an upper-case tag and
  then looks the row up with `where email = '<the literal>'` gets **zero rows** while the
  registration itself succeeded — a confusing failure. Use `where lower(email) = lower(...)`, and
  assert the id is non-empty before using it.
- **The api's clock is `Clock.systemUTC()`** (`ApplicationConfig`), so *its* today is the UTC date,
  not the host's. After ~22:00 CEST every "current week" / "today" assertion is about yesterday.
- **`weeklyDays: 3` generates exactly the BUG-198 fixture**: workouts on dow 1/3/5, `is_rest_day`
  on 2/4/6/7, rest days pointing at a `Mobility Flow` workout. No SQL needed for that shape.
