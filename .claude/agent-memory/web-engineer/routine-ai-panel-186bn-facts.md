---
name: routine-ai-panel-186bn-facts
description: EV-186b/n (2026-10-16) — the routine « Régénérer avec l'IA » panel; where it lives, the api shapes, fixture switches, and the traps hit
metadata:
  type: project
---

Branches (stacked, unmerged): `feat/ev186b-coach-routine-ai-panel` (panel, brief, running,
refusals, Discard, STUB banner) → `feat/ev186n-coach-routine-ai-diff` (diff, repair marks, Keep,
Try again, STALE). Spec vendored from b-fit-api `feat/ev186a-coach-routine-regenerate` @ 9c3bff69,
`on-api-main: NO` — neither may merge until EV-186c + EV-186a merge on the api and the spec is
re-vendored from api main.

**Where:**
- `src/lib/routineAi.ts` (pure, client-safe): `routineAiCapability` (own-field `=== true`),
  `briefRequest` (the ONE body builder), `routineAiSentence` (code → table sentence, Failed
  fallback, never the server message), `heldUntil` (429 only), `pollDelayMs` (2 s to 130 s, then
  10 s; the portal never times a run out), `routineDiff`/`dayRows` (LCS by name, gaps paired as
  replaced), `repairMarkFor`/`repairMarkSentence`.
- `src/lib/routineAiActions.ts` — start/read/discard/keep server actions; 403 → ACCESS_DENIED,
  404 → NOT_FOUND (flag went off), no answer → FAILED. Keep then DELETEs the settled proposal
  (best effort) so a reload does not re-offer it.
- `src/components/routine/RoutineAiPanel.tsx` (+ `RoutineAiDiff.tsx` on 186n). On 186b the page
  draws it in `lead`; on 186n `RoutineEditor` draws it (prop `ai`) because Keep re-seeds the
  working copy (`kept()`), and the editor shows the disclosure (`initialAiDraftedAt`).
- The page reads `getRoutineAiProposal` + `readMuscleFacet()` ONLY when the capability is true
  (one more round: depth 3 flag-on, 2 flag-off).

**API shapes:** capability `aiProposals: {routine, nutrition, instruction}` on the routine AND
nutrition reads, typed `unknown` here on purpose. POST body `{kind: "REGENERATE", brief: {goal,
days 2–6, sessionLength ∈ 20/30/45/60/75/90, emphasis? ≤5 exact facet values, notes? ≤500 NFC}}`
→ 202 `{proposalId, status}`. GET → `{status NONE|RUNNING|READY|FAILED|CANCELLED|EXPIRED,
baseSource, baseDocument, proposal, repairs, repairMarks[{dayOfWeek, exerciseIndex, injury,
repair}], engine, errorCode, createdAt, expiresAt}`. Keep → `CoachRoutineDraftResponse` with
`aiDraftedAt` (OMITTED, not null, for a non-AI draft). `kind` has no REVISE on 9c3bff69, so
EV-186f (« Modifier avec l'IA ») has no contract yet.

**Fixture switches** (cookies): `evoli_fixture_ai_caps=on|instruction|absent|string|null|partial|truthy`
(default = all false), `evoli_fixture_ai=unavailable|busy|catalog|rate_link|rate_coach|off|fail|stub|expired`,
`evoli_fixture_ai_error=<code>`, `evoli_fixture_ai_delay_ms=<n>` (default 1500). Settles lazily on
read. `/api/fixture/calls` → `aiPosts` (body keys only). Dana's Tue « Push » carries two SHOULDER marks.

**Traps:**
- The contract-drift guard pins `SCHEMAS_EXPECTED` AND a SORTED `REQUEST_FACING_EXPECTED`; a
  nested request type (`CoachRoutineAiBrief`) counts as request-facing.
- `qa/first-name-fallback-case.spec.ts` pins every copy fn `firstName()` reaches (KEYS 38 → 45).
- A FR string equal to EN (« {n}/500 ») needs a `coach-i18n` allowlist entry.
- The SHOULDER label is « Shoulders » / « Épaules », not the singular.
- WebKit tests fail here with "WebKit is not installed" — on origin/main too; not a regression.
