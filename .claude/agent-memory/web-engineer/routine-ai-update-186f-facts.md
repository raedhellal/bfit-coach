---
name: routine-ai-update-186f-facts
description: EV-186f (2026-10-16) — « Modifier avec l'IA », the routine Update box (a REVISE); where it lives, the api shapes, fixture switches, and the traps
metadata:
  type: project
---

Branch `feat/ev186f-coach-routine-ai-update`, first stacked on 186n (87fb42cd), now on main
23c3b452 (186b/n merged). Spec re-vendored from b-fit-api main @ 731b1262 (EV-186e REVISE
merged at cd57faa7, EV-376 id-scoped DELETE at 1c61d1e4, BUG-860).

**Where:** all inside 186b/n's files — no new component.
- `src/lib/routineAi.ts`: `ROUTINE_AI_CHIPS`, `hasVisibleText` (the api's "visible code point":
  not `\s`, not U+200B–U+200D/U+FEFF), `updateBlocked` (empty | tooLong, NFC code points),
  `chipsIn`/`withChip` (chips are DERIVED from the box text: a chip travels iff its label's words
  are in the box — the text is the one source of truth), `reviseRequest` (the ONE REVISE body
  builder), `opsRejectedCount` (REVISE + array only). `routineAiSentence` takes `failure.kind`:
  a 429 link on a REVISE is the 10-edits sentence; COACH_PLAN_EMPTY has its own row.
- `RoutineAiPanel.tsx`: view `update`; `failed`/`stale`/`running` carry `proposalKind` and
  `proposalId`; a FAILED REVISE draws the sentence + the box with the session text (U5);
  `shownProposal(view)` feeds discard's `?proposalId=` (EV-376) and the log kind.
- `RoutineEditor.tsx` computes `canUpdate = ai.instruction && (saved draft || activePlan)` (U6:
  an unsaved blank plan is not a base). The page passes `instruction` from `routineAiCapability`.
- `src/lib/routineAiDiscard.ts` (pure): `routineAiProposalPath(clientId, proposalId?)` (no id → no
  `?`) is the ONE URL `coachApi.discardRoutineAiProposal` requests; `routineAiDiscardOutcome` is the
  fixture DELETE's decision (none / kept / cancelled / deleted). Extracted because `coachApi.ts` and
  the fixture are `server-only` and cannot be imported by a node unit spec (U9b/U9c).
- The panel section carries `data-proposal-id` (the proposal on screen) so U9a compares the
  DELETE's id with EXACTLY that one.
- 429 hold is PER KIND: `held: Partial<Record<ProposalKind, number>>`, set by `refused(f, kind)`;
  the brief reads `isHeld("REGENERATE")`, the box `isHeld("REVISE")` (staff B1: the api's REGEN
  and EDIT counters are separate; one shared hold froze both).
- U8 `unsavedNote` under the box only while the editor is `dirty` (prop already on the panel).
- Chips are NOT toggles (U1a): no `aria-pressed`; drawn "soft" while their words are in the box.
  The kit `Button` `ariaPressed` prop was added then removed (kit.tsx equals main).
- The Update textarea is `disabled={!hydrated}` (staff S1: a FAILED Update read on load is
  server-drawn; typing before hydration was wiped).

**API shapes:** POST `{kind: "REVISE", instruction?, chips?: RevisionChip[] ≤4}`; refusal order
(`CoachRoutineAiUseCase#requestRevise`): forbidden key (brief too) → guard → bounds (TOO_LONG,
CONTROL_CHARACTER, FENCE_TOKEN, chips TOO_LONG/UNKNOWN_CHIP, EMPTY) → engine → catalogue (only if
the reviser needs it) → base (400 COACH_PLAN_EMPTY) → service (busy, quota EDIT 10/100, 409).
GET adds `outcome {opsReturned, opsApplied, opsRejected[{index, op?, reason}], unbindable[{day,
index}]}` (READY REVISE only), `unbindable: string[]`, `catalogChecked` (both REQUIRED now).
DELETE `?proposalId=` (EV-376): another proposal is left alone, still 204; non-UUID → 400.

**Fixture:** `evoli_fixture_ai_caps=instruction`; `evoli_fixture_ai_ops_rejected=<n>` (U3). The
reviser is the api's stub (E5): « échange » / « inverse » / « intervertis » / "swap" → SWAP_DAYS
of the two EARLIEST training days (Lina: Mon ↔ Wed, Fri untouched); else FAILED
COACH_AI_NOTHING_APPLIED. `/api/fixture/calls` → `aiPosts` (+ `chips`, `instructionLength`, never
text) and `aiDiscards` ({proposalId, touched}).

**Traps:**
- contract-drift: SCHEMAS_EXPECTED 106 → 109 (+3 REVISE read types); request-facing list unchanged.
- first-name-fallback-case KEYS 45 → 48 (painHint, rateLimitLinkEdit, planEmpty).
- FR placeholder « Ex. : … » (NBSP before the colon, the file's convention); planEmpty uses
  `q()` for the guillemets.
- U6's COACH_PLAN_EMPTY is only reachable by a two-tab race (the other tab discards the draft).
- **Mutant runs: COMMIT FIRST.** Restoring a mutant with `git checkout -- <file>` also reverts
  every uncommitted edit in that file (it cost me the B1/S1 fixes once; re-applied by script).
  Commit, then mutate, then `git checkout`.
- A blank plan needs exercises on two days before « Save draft » enables (Nils specs).
- Folded unchanged days still render `[data-weekday]` inside `routine-ai-unchanged` <details>.
- Merged origin/main 23c3b452 (186b, 186n, R2-1) at e091c4b: clean; R2-1's chunk `.catch` fallback
  and 186f's `canUpdate`/`instruction` coexist; chunk-fail spec runs on the start config.
