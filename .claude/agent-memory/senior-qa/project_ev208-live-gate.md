---
name: ev208-live-gate
description: EV-208 (b-fit-coach adherence empty state) live merge gate 2026-09-23 — PASS at 6dadeb2, BUG-213 filed, and the two constructions that made AC2 and edge case 2 reachable
metadata:
  type: project
---

EV-208 `fix/ev208-adherence-empty-state` (`6dadeb2`, code `251d6cb`, base `main` `c9b73ec`) was gated
**live** on 2026-09-23 and passed on every item. Report:
`b-fit-mobile/docs/qa/2026-09-22-EV-208-qa-pass.md`, evidence under
`docs/qa/evidence/2026-09-22-EV-208/`. Zero paid model calls.

**The two shapes the api cannot produce on its own, and how they were built:**
- **AC2** (`done=0, planned=0` with `hasPlan=true`) is **unreachable through the product**:
  `planned = done + SKIPPED` over the whole week and every non-rest, non-completed day is SKIPPED, so
  a week with a plan is `0/0` only if **all seven `plan_schedule` rows are `is_rest_day=true`**. That
  is the EV-209 shape; build it with one `UPDATE plan_schedule SET is_rest_day = true`.
- **Edge case 2** (`0 / 24`) is just a selected plan with `selected_at` backdated 8+ weeks and no
  completions — the generated plan is 3 workout days × 8 weeks = exactly 24.

**Serving the base build is the cheapest live red witness.** `git worktree add --detach <base sha>`
into the scratchpad, **symlink the branch worktree's `node_modules`**, `next build` + `next start` on
a second port against the **same api and the same row**. BUG-205 printed its old sentence above five
real dated sessions on `c9b73ec`, green on `6dadeb2`. Remove the symlink before
`git worktree remove --force`, or it follows the link.

⚠️ **A driver script that hardcodes its port will silently test the wrong build** — the first "base"
run printed the *new* sentence because `BASE` was a const, not `process.env.PORTAL`. Read the output
for the sentence you expect to be RED before believing it.

**Filed: BUG-213 (P3)** — the *Adherence this week* **tile** reads `0 / 0` ("sessions completed of
planned") for a trainee whose *Last session* tile is dated today. Same mechanism as BUG-205
(`done` gated on `hasPlan`), different component, survives EV-208, identical at base. See
[[seeding-a-live-coach-portal-stack]] and [[coach-portal-merge-is-release]].
