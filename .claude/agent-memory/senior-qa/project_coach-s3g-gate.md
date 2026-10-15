---
name: project_coach-s3g-gate
description: 2026-10-09 coach train/coach-s3g 83ff8e4 (EV-337j2 recipe library + BUG-724 search ring + BUG-730 unsaved guard) gate — PASS; natural-race keystroke rig, badge-at-keystroke witness, mid-flight save loss in non-useCoachForm editors, kit-field ring carrier trap
metadata:
  type: project
---

**2026-10-09, b-fit-coach `train/coach-s3g` @ 83ff8e4** = cb7a94a + a1a42e8 (EV-337j2) + 127b840 (my s3f note) + 22fc8ce (BUG-724) +
83ff8e4 (BUG-730). **Verdict: PASS.** Default 1812/0 (+80: field-focus-ring +6, form-leave-guard +9, pro-recipes-library +64,
roster-view +1), roster 316 + 1 skip (+5). Live api BLOCKED (Docker down). Proposed QA-S3G-1 and QA-S3G-2 (both P3, pre-existing).
Session log: scratchpad `coach-s3g-qa.md`; artefacts scratchpad `s3g/`. Previous: [[project_coach-s3f-gate]].

**Why:** a coach merge is a production deploy ([[coach-portal-merge-is-release]]).

**How to apply (reusable):**
- **A held `history.back()` is not the only model of BUG-730's race.** Also run a NATURAL one: wrap `history.back` to call the real
  `back()` and dispatch a keystroke at `setTimeout(0)`. In Chromium that keystroke lands before React commits the save's clean render.
  Record two facts at the keystroke: is the sentinel still current, and is the "Unsaved changes" badge still on screen. They proved
  the residual window (QA-S3G-2) on base and train alike. WebKit's popstate beats setTimeout(0), so the same rig is green there.
- **Counters for a guard probe go in sessionStorage**, installed with `addInitScript`: leave-dialog mounts (MutationObserver, WeakSet
  of dialogs), `history.back()` calls, landed popstates. They survive the cross-document Backs a page.evaluate counter loses.
- **The coach-visible oracle beats the hook's state:** Back asks ⇔ the field differs from what the save sent; then read the server
  in a fresh page of the same context. That found QA-S3G-1: TemplateEditor and RecipeEditor `setDirty(false)` on any answer, so text
  typed during « Saving… » is shown saved and lost. The useCoachForm forms (NT editor, progress goal) get it right (markSent/markSaved).
- **Hold a server action's answer** with `page.route("**/*")` + `route.fetch()` + wait + `fulfill` for POSTs carrying `next-action`.
  Unroute before reading the server in a new page.
- **Kit fields paint their focus outline on `div.kit-field`, not the input.** A ring probe that frames the input misses the left and
  right sides. Walk up to the first ancestor whose computed outline is not none while focused. `.roster-search` labels carry their own.
- **Playwright `isVisible()` is true for an sr-only 1×1 clipped node.** Check the box and the clip instead.
- **`locator.press("End")` + `pressSequentially` typed at the START of a filled field.** Use `focus()`, `keyboard.press("End")`,
  `keyboard.type`. Anchor "saved" checks on exact values, not an end-anchored regex.
- **The portal is light-only** (globals.css header). `colorScheme: "dark"` paints the same pixels. Report that as a fact, not as a gap.
- **Sign-in labels follow the browser locale.** An FR sign-in under an en-US context hangs 25 s. Set `test.use({ locale: "fr-FR" })`.
- **zsh `$r:qa/...` is the `:q` modifier.** Write `"${r}:qa/..."` in `git show` loops.
- **A tree that needs its own webServer run** (`form-leave-guard`, `field-focus-ring`) can be pointed at a mutant archive with
  `COACH_PORT`/`COACH_ROSTER_PORT`. `rm -rf .next` first, and run one at a time.
