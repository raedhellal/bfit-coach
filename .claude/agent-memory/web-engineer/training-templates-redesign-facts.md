---
name: training-templates-redesign-facts
description: EV-337i (b-fit-coach feat/pro-training-templates, 2026-10-02) — the training-template list/editor redesign; StickyActionBar + tab-bar height trap, h1 pinned by editor-save-no-refresh, row actions behind a disclosure, checklist = publishabilityReasons
metadata:
  type: project
---

Branch `feat/pro-training-templates` off `origin/release/coach-held-merges` 1c0f93a (EV-337i, plan §5.7).

**Facts later branches (EV-337f programme, EV-337j nutrition templates/recipes) need:**
- **`StickyActionBar`** (`src/components/ui/StickyActionBar.tsx`, `.action-bar` in globals.css) is the
  plan's §4 component, first used by the template editor. Sticky, never fixed: `bottom:
  var(--shell-tabbar-h)` below 1024, `var(--legal-footer-h)` from 1024. **The tab bar is NOT
  always `--shell-tabbar-h` (60 px): it measured 66 px at 390 when « Modèles nutrition » wraps,
  61 at 1023.** The bar is drawn under the tab bar (z 16 < 20) with 8 px extra bottom padding
  so only padding can be covered. Measure with boundingBox, never trust the token.
- `FocusClearOfBars` now counts `.action-bar` and reads each bar's own computed `bottom` offset
  (a bar stuck ABOVE another bar is not at the viewport edge). `html:has(.action-bar)` raises
  scroll-padding-bottom. `qa/focus-clear-of-bars.spec.ts` pins it on `/templates/{id}` (WebKit
  390/1023): red only with BOTH removed (57/57 stops under the bar) — either alone suffices.
- **"WebKit ignores scroll-padding" was wrong** (staff, 2026-10-02). Witnessed with the island
  disabled: 180 px of padding kept every template-editor stop clear; the routine editor's 68 px left
  33 stops at 390 partly hidden (56–81 % visible). Cause not established. A probe that removes one
  protection at a time proves nothing when two overlap — remove both for the red.
- Checklist lines carry a visually hidden « Fait : » / « À faire : » (`.sr-only`), so a
  `toHaveText` on the `li` includes it; target the label span (or `getByText(exact)`) for words.
- **The editor's h1 must stay a SERVER value** (the stored template name, not the design's
  « Modifier le modèle »): `qa/editor-save-no-refresh.spec.ts` guards the update action's
  `revalidatePath` through the h1. The editor island now draws PageHead from a `title` prop;
  a prop from the server render still witnesses the revalidation. EV-337f's routine editor has
  the same constraint if it moves its head into an island.
- **Duplicate / Rename / Delete are behind the row's « ⋯ » disclosure** ("More actions" /
  « Plus d'actions », `aria-expanded`, panel in the row's flow — not a popover, not role=menu).
  Specs use a `rowAction(page, name, action)` helper (coach-library, coach-library-apply);
  coach-activation.stub opens it inline. Any new spec pressing those must open it first.
- « Nouveau modèle » is a LINK (`.link-button[data-variant=primary]`, added here); the page head
  draws none on an EMPTY library, so AC1's "one primary control" is the empty state's link.
- The checklist (`templateChecklist`, templateDocument.ts) restates `publishabilityReasons`;
  `qa/template-checklist.spec.ts` pins "all met ⇔ no reasons" and "every reason is on the card".
  PO Ruling 12 (2026-10-02): a MET line is a label (no full stop), an UNMET line is the validation's
  own sentence WITH its full stop (« Le jour 2 n'a aucun exercice. » = `templates.dayEmpty`).
- FR (PO Ruling 11): training row + dialog title « Appliquer à un client », dialog button « Appliquer »
  (one verb per dialog, matching the question); EN unchanged. Nutrition templates move to the same
  verbs in EV-337j. No `applyToClient` key — the plan's key name is superseded.
- h1 is « Modèles d'entraînement » / "Training templates"; the nav keeps « Modèles » / "Templates".
- `page.locator("#" + id)` fails on a React `useId` (":r1:"); use `[id="…"]`.
- A full default run under load (≈ 10) once failed all 23 WebKit tests at sign-in (`waitForURL` landing
  timeout, even `/activate`) in 37 min; the same tests passed 25/25 alone and the next full run was
  964/964 in 15 min. Re-run the WebKit subset alone before blaming a branch.

**Left out (no api data, plan §7 G19):** minutes per session and « utilisé par N clients » on the
row; the day ACCORDION (« Déplier ») and per-day "aucun exercice" header — `RoutineDocumentEditor`
is shared with the trainee editor (ADR-0018 D7), so its restyle is EV-337f's.

See [[client-overview-redesign-facts]], [[coach-pro-roster-branch-facts]], [[layout-assertions-need-occlusion]].
