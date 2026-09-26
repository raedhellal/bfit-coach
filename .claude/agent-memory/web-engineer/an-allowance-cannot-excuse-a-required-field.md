---
name: an-allowance-cannot-excuse-a-required-field
description: EV-222 — the drift spec's missingInPortal register used to wave through fields the api REQUIRES on a request body, so BUG-195 printed a green line; what the required-field check covers and what it is blind to
metadata:
  type: project
---

`qa/contract-drift.spec.ts` compared NAMES and let `qa/contract-deviations.ts`
excuse any omission. For a response that is a decision; for a REQUEST body a
required field the portal omits is a 400, and no register entry changes that. So
`CoachRoutineDraftRequest matches Routine on the wire` was green on 45d237a while
every Save draft against a live api was a 400 (BUG-195).

**Why:** a register of "knowing disagreements" is only safe for disagreements that
cannot break a call. The allowance and the defect looked identical to the test.

**How to apply:**
- "Request-facing" is derived from the api's artefact (every `$ref` under a
  `requestBody`, then the `$ref` closure), not from a `…Request` name — the body
  BUG-195 is about is a `Routine`. 16 interfaces today, pinned as
  `REQUEST_FACING_EXPECTED`; the spec has both `required: [a, b]` and block-list
  `required:` spellings, and `required: false` on parameters above `schemas:`.
- `checkRequired(spec, entry, register)` is the ONE omission computation, called by the
  live cases and by the synthetic self-test WITH a register that excuses the omitted
  field. The first cut fed the fixture's register only to the message, so a check that
  filtered by the register passed the synthetic test; staff showed marker-deleted +
  filter = 77/77 green with five required fields omitted. Hand the synthetic run the
  same inputs as the real one, or it certifies a different function.
- A second, independent rule reads the REGISTER: no `missingInPortal` key may be a field
  the request schema requires. It is what survives BUG-195c deleting the marker.
- Known-red cases use `test.fail(title, { annotation: { type: "issue", description:
  "BUG-…" } }, body)` via `KNOWN_REQUIRED_OMISSIONS`. They fail the run the day the case
  passes, so BUG-195c must delete the marker AND the register entries together.
- Top-level coverage: every `/coach-portal` requestBody root must have an `@wire`
  interface or an `UNTAGGED_REQUEST_ROOTS` entry (today `CoachPublishRequest`, sent
  inline as `{ digest }`). Nested untagged types (`RoutineDayEntry`) are still unchecked.
- Pin names, not counts (`REQUEST_FACING_EXPECTED` is the 16 sorted names): a count
  passes a swap.
- No "server-resolved" allowance. Cite the api (`Routine.goal/level` `@NotBlank`), not
  ADR-0018, which is PROPOSED.
- `git checkout -- qa` to restore after a mutant also wipes your UNCOMMITTED fix. Commit
  before mutating (lost one edit round this way on 2026-09-25).

See [[a-fixture-without-the-shape-cannot-guard-it]], [[a-witness-does-not-choose-between-two-checks]].
