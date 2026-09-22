---
name: ev187b-live-gate
description: EV-187b (b-fit-coach portal monitoring) live merge gate on 2026-09-22 — what passed, BUG-205 filed, and the seeding recipe that made a live pass possible
metadata:
  type: project
---

EV-187b `feat/ev187b-portal-monitoring` (`31e46f2`) was gated **live** on 2026-09-22 — production
`next build` + `next start`, `COACH_API_MODE=live`, real Chromium, against a throwaway `b-fit-api`
built from `b19c1f3` (= shipped `main`, the EV-187a half) on a throwaway Postgres.

**Why:** everything `staff-engineer` ran was `COACH_API_MODE=fixture`, and EV-188b's P1 lived in the
fixture/live gap. Raed authorised the merge conditional on this pass.

**How to apply:** the pass report is `b-fit-mobile/docs/qa/2026-09-22-EV-187b-qa-pass.md` with
screenshots under `docs/qa/evidence/2026-09-22-EV-187b/`. New row filed: **BUG-205 (P2)** — the
adherence card says *"No sessions in the last 8 weeks"* above a populated *"Recent sessions"* list.
BUG-195 reproduced live (portal draft PUT → 400, `constraints` missing) and was NOT re-filed.

See [[seeding-a-live-coach-portal-stack]] for the recipe, which is reusable for every future
coach-portal live pass.
