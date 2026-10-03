---
name: programme-frame-337f1-facts
description: EV-337f1 (b-fit-coach feat/pro-programme-frame, 2026-10-03) — the programme page frame + sticky bar; the sticky containing-block trap, the `lead`/`aside` slots f2/f3/g1 hang off, the long-plan fixture switch, EN h2 is "Routine"
metadata:
  type: project
---

Branch `feat/pro-programme-frame` off `origin/main` a862698 (EV-337f1, plan §5.3).

**Facts later slices (f2 accordions, f3 change list, g1 nutrition frame) need:**
- **A sticky bar never rises above its PARENT's top.** With ClientHeader + h2 + banner rendered
  by the page outside the editor island, the bar's containing block began at y≈402 on Yusuf
  (banner) at 320×568, and « Publier » sat under the tab bar on load. Fix: the page passes
  head + banner into `RoutineEditor` as `lead`, so the island's root starts at the page top.
  A mutant that puts head+banner back outside turns F1.1 red at 320 on load; a mutant that
  keeps only the banner inside does NOT (cb top ~300 is high enough) — so the witness needs
  a client WITH the banner. g1's nutrition bar (if any) has the same trap.
- **Slots:** `RoutineEditor` takes `lead` (above the frame) and `aside` (server-rendered
  ReactNodes, passed through). `ProgrammeFrame` (inside RoutineEditor.tsx) draws
  `.layout-split.prog-split` > `.prog-aside` (first in DOM, above <1280) + `.prog-main`.
  f3's « Modifications depuis la publication » belongs in the `aside` the page builds.
- The bar: `StickyActionBar` label `routine.actionsLabel`; `.prog-bar-actions` /
  `.prog-bar-pair` (globals.css "EV-337f1"). Buttons get `BAR_BUTTON` inline style
  (height auto, minHeight 44, whiteSpace normal) because kit `Button` sets height/nowrap
  INLINE — CSS cannot override it without !important. FR labels wrap to 2 lines at 320/390.
- Notice + error now render IN the bar (`.action-bar-note`, role status/alert, on demand as
  before); the U6 `scrollIntoView` effect was removed. `coach-routine.spec` U6 still passes
  (the bar is in the viewport). `publishShowsFirst` is a `<p>` in the page right above the bar
  and is Publish's `aria-describedby`.
- **EN `routine.title` is "Routine", FR "Programme".** Ruling 16 says the h2 reads
  "Programme" in EN too but also "routine.title, unchanged copy" — kept the copy; flagged.
  `routine.title` also names a from-scratch plan (`blankRoutine`), so changing it moves specs.
- The profile card is titled `routine.profileTitle` ("Trainee profile" / « Profil du client »)
  — it used to borrow `routine.title`.
- **Fixture switch `evoli_fixture_long_plan=<clientId>`** swaps a SEEDED plan (planId in
  `SEED_PLAN_IDS`) for a 6×6 « Six Day Split » in the STORE on the routine read; a plan
  published since is left alone; the per-test reset restores it.
- A WebKit context you create yourself gets the runner's en-US Accept-Language: pass
  `extraHTTPHeaders: { "Accept-Language": "fr-FR" }` or the French sign-in labels never appear
  (the helper times out as "never hydrated?").

See [[training-templates-redesign-facts]], [[client-overview-redesign-facts]], [[layout-assertions-need-occlusion]].
