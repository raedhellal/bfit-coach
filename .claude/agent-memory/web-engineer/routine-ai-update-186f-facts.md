---
name: routine-ai-update-186f-facts
description: EV-186f (2026-10-16) — « Modifier avec l'IA », the routine Update box (a REVISE); where it lives, the api shapes, fixture switches, and the traps
metadata:
  type: project
---

Branch `feat/ev186f-coach-routine-ai-update`, stacked on `feat/ev186n-coach-routine-ai-diff`
(87fb42cd, approved, unmerged). Spec re-vendored from b-fit-api main @ 731b1262 (EV-186e REVISE
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
- `kit.tsx` `Button` gained `ariaPressed` (undefined renders nothing).

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
