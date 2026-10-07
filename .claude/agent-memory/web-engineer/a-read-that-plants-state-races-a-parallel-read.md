---
name: a-read-that-plants-state-races-a-parallel-read
description: EV-342c — a fixture switch that writes the store inside one read breaks when that read is made parallel with another; plus the programme tab's read order and the harness's template-draft option
metadata:
  type: project
---

EV-342c (2026-10-07) made `routine/page.tsx` read `getRoutine` and `getRoutineDraft` in one
`Promise.allSettled`. Three `pro-programme-accordions` tests went red: the fixture switch
`evoli_fixture_unbindable_day` PLANTED a draft inside `getRoutine`, and the draft read,
now concurrent, could run before the plant and answer "no draft" while the routine said
`hasDraft: true`.

**Why:** a fixture switch that mutates state during a read is an ordering assumption.
Sequential reads hid it; the api never does this, so it is a fixture defect, not a product one.

**How to apply:**
- When you parallelise reads, grep the fixture for switches that write `state()` inside a
  read (`withUnbindableDaySwitch`, anything that `.set(` in a `get*`). Apply the switch in
  every read that can observe its effect (it must be idempotent).
- Programme tab rules after EV-342c: `hasDraft` decides whether the draft answer is USED;
  a draft failure with `hasDraft: false` is ignored, with `hasDraft: true` it is the load
  error; a 403 on either read is the denial. `evoli_fixture_draft_read=<500|403|orphan>:<id>`
  reaches each. The template-library lookup stays sequential (staff ruling 2026-10-01)
  until EV-342d puts the name on the draft.
- `PERF_DRAFT_TEMPLATE=1` makes `transitions.measure.ts` apply a template to PERF_CLIENT
  first, so "overview -> routine (first)" is the 3-round page (was 4). The base can be
  measured with the branch's harness file, since the harness is not part of the build.

See [[every-fixture-test-starts-from-the-seed]], [[coach-portal-fixture-mode]].
