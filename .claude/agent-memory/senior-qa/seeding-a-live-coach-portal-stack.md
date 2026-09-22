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
- **Plan ids are deterministic from the onboarding profile**, so two trainees with the same answers
  share one `plans` row — any SQL edit to `plan_schedule` hits both. Vary `weeklyDays`/`primaryGoal`
  to force a distinct plan before editing one.
- The STARTER seat cap is re-checked on every accept, so once N links are ACTIVE no further accept
  succeeds: `UPDATE coach_clients SET status='REVOKED', revoked_at=now(), revoked_by='TRAINEE'`
  first, run the invite/accept/revoke cycle, then reactivate them all in one statement.
- A link with `WORKOUTS` removed from `coach_clients.scopes` does **not** hide the adherence block:
  it renders with *"This trainee has not shared their progress with you."*

