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
- A known-red case is `test.fail(title, { annotation: { type: "issue", description:
  "BUG-…" } }, body)` via `KNOWN_REQUIRED_OMISSIONS`. It fails the run the day the
  case passes, so the fix (BUG-195c) must delete the marker AND the now-stale
  register entries in the same commit, or the name check goes red on "stale".
- Blind spot, stated in the spec: an UNTAGGED type nested in a body
  (`RoutineDayEntry` inside `CoachRoutineDraftRequest.trainingDays`) is not checked.
- No "server-resolved" allowance on purpose: under ADR-0018 D1 (1-D) the four
  subject-owned fields are SENT and overwritten; `Routine.goal/level` are
  `@NotBlank`, so omitting one is a 400 however the server would resolve it.
- The synthetic fixture under `qa/fixtures/contract-drift/` keeps a known omission
  in front of the parsers after BUG-195 closes; it is the only clause that sees a
  broken block-list parser (mutant M4).

See [[a-fixture-without-the-shape-cannot-guard-it]], [[a-witness-does-not-choose-between-two-checks]].
