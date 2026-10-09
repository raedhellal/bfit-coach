---
name: targets-form-closed-on-load
description: EV-337g1 closed the client targets form behind « Modifier les objectifs »; every spec typing into it needs qa/targets-card.ts openTargetsForm, and the BUG-686 prehydration case became an opener witness
metadata:
  type: project
---

Since EV-337g1 (branch feat/ev337g1-nutrition-tab, 2026-10-09) the client nutrition page's targets card is a
named region ("Daily targets" / « Objectifs quotidiens ») that shows the stored values as a `<dl>` and keeps its
form CLOSED on load. « Modifier les objectifs » / "Edit targets" opens it; « Annuler » resets to the server
values; a save that lands closes it (unless a field was typed while the request was out); a failed or
lost-answer save keeps it open.

**Why:** G1.2's wording. The cost: 12 spec files typed into the always-open form (coach-nutrition, no-answer,
field-focus-ring, form-leave-guard, french-polish, pro-overview-followups, coach-routine,
recipes-and-editor-polish, page-read-budget, coach-nutrition-templates-apply, pro-roster-unnamed-client
(BUG-714), editor-prehydration-input). G1.5 allows only an ADDED click, so the edit is one shared helper,
`qa/targets-card.ts` `openTargetsForm(page)`, and a script check that each diff removes no line.

**How to apply:**
- A new spec that types targets on `/clients/{id}/nutrition` calls `openTargetsForm` first, and again after a
  save if it reads the input back. The view-mode values are in the `<dl>`, not in `getByLabel("Calories")`.
- A form that is closed on load has no field in the server HTML, so BUG-686's "typed before hydration" case
  cannot exist for it; editor-prehydration-input now pins "no field SSR, opener inert pre-hydration" instead
  (the sweep's dialog answer). Any other form moved behind an opener needs the same swap, and it is a case
  REPLACED, not a click added: say so to staff.
- Roster-config specs (BUG-714's pro-roster-unnamed-client, page-read-budget, templates-apply) are outside the
  default suite: run `-c playwright.roster.config.ts` with COACH_ROSTER_PORT.
See [[client-header-name-slot-is-the-h1]], [[unnamed-trainee-is-absent-not-unknown]].
