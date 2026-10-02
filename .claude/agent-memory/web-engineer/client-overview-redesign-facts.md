---
name: client-overview-redesign-facts
description: EV-337e (b-fit-coach feat/pro-client-overview, 2026-10-02) — what the overview redesign changed that later branches and specs trip on: no tab strip on the overview, strict getByText collisions, free-text injuries say "pain", read depth 2, untestable summary failure state
metadata:
  type: project
---

Branch `feat/pro-client-overview` off `origin/release/coach-held-merges` 08f6e90 (EV-337e + BUG-660 + roster PB-1).

**Facts later branches need:**
- **The overview has no `ClientTabs` any more.** Its header has « Programme » / « Nutrition » LINKS
  (`copy.tabs.routine` / `copy.tabs.nutrition`, `.link-button`) beside the revoke menu. Routine and
  nutrition pages keep the strip (with « Vue d'ensemble ») until EV-337f/g. A spec that clicked
  `navigation "Trainee sections"` on the overview must use `getByRole("main").getByRole("link", { name: "Routine", exact: true })`.
- **English link names on the overview must not contain "routine" or equal "Nutrition"**:
  `coach-overview.spec.ts` clicks `getByRole("link", { name: "Routine" })` (substring, case-insensitive)
  and `{ name: "Nutrition", exact: true }`. Hence "Open the plan" / "Resume the draft" / "See the week".
- **New overview copy must not repeat an existing sentence**: specs use strict, unscoped
  `getByText` for "No weigh-ins in the last 8 weeks" (exact count 2 for Sara), "Last session"
  (exact), "No plan" (exact count 1), "Missed sessions" (exact), "No red flags", "No completed
  sessions yet", "This trainee has not shared their weigh-ins with you.". The activity card got
  its own sentences for that reason.
- **The trainee's free-typed injury note can say "pain"** (fixture Dana: "Sharp pain in the left
  shoulder…"). `injuryLabels` passes free text through. Anything shown OUTSIDE the routine tab's
  profile panel uses `codedInjuryLabels` (guardrailLabels.ts, coded tokens only, plan G5).
- **`BackLink`** (`src/components/ui/BackLink.tsx`, `.back-link`) is the one back link on the ten
  detail routes; `flush` aligns it above a title. `qa/pro-back-link.spec.ts` measures all ten.
- **Overview reads are depth 2 now**: getClient ‖ getClientProgress ‖ getMe, then getRoutine ‖
  getNutrition only for held scopes (page-read-budget re-pinned). The overview's getRoutine also
  sets the fixture's `lastRoutineClient` (the catalog-down switch keys on it).
- ~~No fixture switch fails getRoutine/getNutrition~~ — since EV-337m,
  `evoli_fixture_summary_read=<routine|nutrition>:<500|403>:<clientId>` does (see
  [[overview-followups-337m-facts]]).
- `expectNoEnglish` false-positives on api workout names that equal an English dictionary word
  (Tobias's "Legs"): run the guard on Lina.
- `field-focus-ring` "swap sheet recipe search" fails on the FIRST cold run of a fresh `next dev`,
  identically on base 08f6e90, then passes: pre-existing flake, not a regression.
- The `.status-pill-label` now wraps (PB-1); a pill can be two lines tall.

See [[coach-pro-roster-branch-facts]], [[coach-scope-contract-adr0015]], [[stories-carry-verbatim-copy]].
