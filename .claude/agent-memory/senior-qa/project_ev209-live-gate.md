---
name: ev209-live-gate
description: EV-209 gate + post-merge production closure 2026-09-23 — PASS at 34bcf99, BUG-198 closed on the DEPLOYED merge commit d1a7daa, BUG-214/BUG-215 filed; the merge-commit-vs-branch-tip trap and the fact production IS drivable
metadata:
  type: project
---

EV-209 `fix/ev209-adherence-counts-scheduled-only` (**`34bcf99`**, base `main` `b333b1a`, a
fast-forward) was gated **live** on 2026-09-23 and **PASSED on every item**; verdict: merge.
Report: `b-fit-mobile/docs/qa/2026-09-23-EV-209-qa-pass.md`, evidence under
`docs/qa/evidence/2026-09-23-EV-209/`. Zero paid model calls.

**The rig that made the red witness cheap — reuse it for any b-fit-api behaviour change.**
`git archive` base **and** branch into two dirs, `bootRun` them on **:8091** and **:8092**
**against ONE throwaway Postgres**. Same rows, two builds, read seconds apart — so base is a true
control, not a separate experiment. Boot the base one first (Flyway lock). Readings:

| | base `b333b1a` (production) | branch |
|---|---|---|
| 3 rest-day sessions, 0 prescribed | **`3/6` = 50 % adherent**, headline `3/27` | `0/3`, headline `0/24` |
| rest-only plan week, 2 sessions | **`2/2` = 100 % adherent** | `0/0` |

**The generated plan IS the BUG-198 fixture** — `weeklyDays: 3` produces workouts on dow 1/3/5 and
`is_rest_day = true` on 2/4/6/7 with **no SQL edit**. Only two edits were needed and both are
about *who reads*, not *what is read*: the coach role + `coach_profiles` row (no self-serve coach
signup exists) and the backdated `user_plan.selected_at`.

⚠️ **`ApplicationConfig` supplies `Clock.systemUTC()`, so the api's "today" is the UTC date, not
the host's.** At 01:08 CEST the api's today was still the *previous* day. This silently breaks any
current-week reasoning. **Verify it, don't assume it**: I caught it because a week with two SKIPPED
days reported `missed.size() = 1`, which is only consistent with today being the Tuesday.
Consequence: **`MISSED_TWO_OR_MORE_SESSIONS` cannot fire on a Monday or Tuesday at all** (threshold
2, counts days *strictly before today* in the current ISO week), and `missedThisWeek` has **no DTO
field** — it reaches a coach only through that flag. So AC4's `scheduledName` evidence is not
witnessable live before Wednesday UTC. I named that as a coverage gap rather than rounding it up.

**Item 3, "could not construct one", is the reusable shape of a negative capability claim.** Drive
*every* writer rather than reading them: `PlanGeneratorService` via `POST /me/plan/generate` at
every `weeklyDays` its switch has a case for (2–6; **1 and 7 have no product path**), and
`RoutinePlanWriter` via `PUT /me/coach/routine`. Census: 49 rows / 7 plans / 0 divergent. Then force
the state by SQL and **disclose it** to show the symptom. `RoutinePlanWriter` writes
`rest = (workoutId == null)` then `rest ? recoveryWorkoutId : workoutId`, so its rest days point at
a real **Recovery** workout — the two conditions are mutually exclusive by construction.

**Perf:** +1 `plan_schedule` read **per roster row** (52 → 78 on 26 rows), counted in the Postgres
statement log. Latency delta **changed sign** between page sizes (−3.4 % / +4.2 %) — noise, so no
bug filed, numbers in `PERF.md`. The count **does not vary with page size**: the roster evaluates
every ACTIVE row to sort by `needs_attention`, so the +1 multiplies by **roster** size.

**Filed BUG-214 (P3)** — `plan_schedule` permits `is_rest_day = false AND workout_id IS NULL`, and
the two readers disagree; fix is the schema (`CHECK` + `ON DELETE RESTRICT`), never "aligning" a
predicate. **The draft's proposed id was right but only after re-checking** — BUG-214 existed in
`BUGS.md` *only* inside the previous refresh's "Next free id" sentence, which is exactly what a
`grep -c '^| BUG-214 |'` distinguishes from a real row.

**Corrected BUG-213** — its *Fix shape* offered "count completions in a no-plan week in the
numerator" as one of two equivalent options. That is the **EV-187a blocking defect B1**, rejected
and reverted (`docs/qa/2026-09-22-EV-187a-staff-review.md`, witness
`PROBE hasPlan=false done=3 planned=3`). Marked closed by that ruling and removed
`TraineeAdherenceWeeks.java` from its *Suspected files*. **A row that names the wrong suspect will
get the wrong fix built** — that is the reason to correct it, not tidiness.

**`build.commit` is the post-merge witness**, not a 200 and not `health: UP`. The
`git archive` trees have no `.git`, so `ApplicationBootSmokeTest.infoEndpointServesTheCommit…`
fails with `"unknown"` on **both** base and branch — an archive artefact, proved by running it at
base, not a branch defect.

See [[seeding-a-live-coach-portal-stack]], [[ev208-live-gate]], [[backend-control-tree-harness]].

---

## Post-merge (same day) — three things worth more than the gate itself

🔴 **A "verify by sha" instruction must name the MERGE COMMIT, not the branch tip.** I told the
coordinator to check `/actuator/info` for `34bcf99…`. The merge was `--no-ff` (per CLAUDE.md) *and*
`main` had moved to `e9736a9` in between, so the deployed sha is the merge commit
**`d1a7daa`** — and my string **would have failed a perfectly good deploy**. Say *"the sha `main`
points at after the merge"*. **My "it fast-forwards" claim was true when measured and false ~30
minutes later: a fast-forward claim has a shelf life of minutes.**

**Before reusing gate evidence against a different sha, diff the trees.**
`git diff <gated> <deployed> -- src/` empty ⇒ licence to close on the gate's red control instead of
rebuilding it. Here the only extra commit was an agent-memory one.

🔴 **PRODUCTION *IS* DRIVABLE for the coach portal — my own memory said it was not.** The
`bug201-ac4-recheck` note recorded "prod could not be driven (no coach)". Wrong:
**`coach@evoli.fit` / `Password123!` logs in on Railway**, has a real `coach_profiles` row and a
roster. So a coach-portal row can be closed on production with product calls only, no SQL. The
prescription comes back from `GET /me/plan/schedule?from=&to=` (both params required, else 400).

**Closing a coach-portal adherence row on production without DB access:** you cannot backdate
`selected_at`, so only the *current* week has `hasPlan=true`. That is enough — run the repro inside
the current week: control → ad-hoc session on a day production's own schedule calls `restDay:true`
→ prescribed session. `0/3 → 0/3 → 1/3` (pre-fix the middle reads `1/2`). Revoke the link
afterwards; the throwaway trainee cannot be deleted (no account-delete endpoint).

🔴 **BUG-215 (P0) came out of that login, and it is the real find.** All three seeded accounts —
`admin@evoli.fit` (ROLE_ADMIN, **no MFA challenge**), `coach@evoli.fit`, `user@evoli.fit` — sign in
on production with the repository-published password. **It is NOT BUG-002** (that is the *migration*
defect, correctly fixed; moving a migration never deletes rows already written — rule 7, one fix does
not close both). **But BUG-002's closure probe has EXPIRED**: it closed partly on `admin@evoli.fit →
401` on 2026-09-04; today the same probe is `200`. **A closure that rests on an environment probe
has a shelf life too — the code fix stayed correct while the environment drifted back.** Cause not
determined and deliberately not guessed; `SPRING_PROFILES_ACTIVE` on Railway is the one-look
candidate, because if it includes `local` a purge undoes itself next deploy.

⚠️ **I was blocked from `GET /admin/users` on PII grounds and did not work around it.** The coach
read already demonstrated third-party data access, so the severity did not need it. Establishing
*enough* and stopping is the right move on a production security probe.

**BUG-205 was checked for BUG-213's shape and is NOT in it** — its api option is legitimate (it does
not un-gate `done`). The narrower correction: `hadAPlanDuring` is the **symptom site, not the fix
site** (the information is not in the table it reads); the repair is EV-040c `plan_assignments`.
**Do not pattern-match one row's correction onto its neighbours** — check whether the option is
actually closed by a ruling before removing a suspect.

Merged and pushed as `d1f3b84` (`qa/ev209-gate-and-bug214`). Register: 213 rows, open
`P0 1 · P1 6 · P2 31 · P3 80` = 118, fixed 92. **The P0 band, empty since 2026-09-04, is not empty.**
