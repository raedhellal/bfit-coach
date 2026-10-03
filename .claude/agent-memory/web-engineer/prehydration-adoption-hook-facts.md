---
name: prehydration-adoption-hook-facts
description: BUG-686 follow-up (2026-10-03) — which coach-portal forms had the pre-hydration input race, why the shared useAdoptPrehydrationInput hook snapshots then replays one field per flushSync, and how the sweep spec witnesses it
metadata:
  type: project
---

Every SSR'd controlled field on the portal had the BUG-686 race on a862698, not just
/login. Fixed on `fix/prehydration-input-other-forms` with `src/lib/useAdoptPrehydrationInput.ts`.
Put a ref from it on any root that holds fields (kit `Card` has `rootRef` for this).

**Affected (witnessed in Chromium and WebKit, field by field):** /activate (3 passwords +
consent box), the template, recipe, nutrition-template and routine editors, the daily
targets, the progress goal, the template search, the recipe meal-time filter, the roster
search (populated only), and the FR/EN radio switch on EVERY page. The template editor
saved the server's name while showing the typed one.
**Not affected:** Add a client, New challenge, Save as template and every other `Modal`
form. `Modal` returns null while closed, so none of their fields are in the server HTML,
and a click on the opener before hydration opens nothing.

**Why the hook looks the way it does (each of these broke a simpler version):**
- Any re-render writes every controlled value back into its DOM node, so the hook must
  SNAPSHOT the typed values in the mount effect, before anything renders.
- Editors' handlers close over the render's draft (`setDraft({...draft, x})`). Replaying in
  one batch kept only the last field, so it replays one field per `flushSync`. That runs
  from a `setTimeout`, because `flushSync` cannot flush inside a passive effect.
- React's value tracker saw the TYPED value at hydration, so a plain `input` event fires
  no onChange. The fix sets the rendered value through the node (the tracker sees it),
  then sets the typed value through the prototype setter, then dispatches. Checkbox and
  radio do the same on `checked` and dispatch a plain `click` Event, which has no
  activation behaviour. A select needs only `change`.
- "What React rendered" is `defaultValue` / `defaultChecked` / `option.defaultSelected`.
  React 18's post-mount sets those at hydration, so no internals are needed.
- React itself resets a textarea whose rendered value is non-empty, so text typed into it
  is lost and nothing can adopt it (recipe steps).

**Witness technique:** `qa/prehydration-sweep.spec.ts` compares `__reactProps$…`.value /
.checked with the DOM after release. `qa/prehydration.ts` holds the chunks and runs the
engine/lang/width matrix. A Save that is not gated on the field needs
`expectStateHoldsWhatIsShown` before the click: a click on server HTML does nothing.

**next start + WebKit:** WebKit drops the session cookie on http://localhost, because it is
`secure` when IS_PROD. Every signed-in WebKit test times out there. Run next start Chromium-only.

Related: hub `prehydration-input-race`, [[night-clock-and-hydration-race-harness]].
