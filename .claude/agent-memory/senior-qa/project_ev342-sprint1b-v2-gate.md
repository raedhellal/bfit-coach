---
name: project_ev342-sprint1b-v2-gate
description: 2026-10-07 EV-342 sprint-1b v2 train 711f4c2 — all six units PASS, mergeable onto d7ab381; BUG-701 closed by moving the overview chips under the tab bar; how a rebuilt train was verified against the SHAs already passed
metadata:
  type: project
---

**2026-10-07, b-fit-coach `train/ev342-sprint1b-v2` @ 711f4c2.** It is ba0ca15 plus EV-342e 954ba79 (redone per senior-po's BUG-701
ruling) plus BUG-699 a39bd6b.
- **Verdict: all six units PASS.** EV-342f passes as a partial: F.1's exercise-row half is still carried, and the 4 fixme skips are it.
- **The train is mergeable onto d7ab381,** which is its ancestor.
- Counts: default 1453 + 4 skips, roster 218 + 1 skip, 0 failures.
- The earlier rounds are in [[project_ev342-sprint1-gate]]. The session log is the scratchpad `sprint1b-qa.md`, "Gate v2" section.

**Why:** a coach merge is a production deploy ([[coach-portal-merge-is-release]]). Twice in one day a rebuilt train arrived carrying SHAs
I had already passed. The cheap and honest move is to prove each rebuilt merge adds exactly the tip I passed, then re-run only the full
suites plus the changed unit.

**How to apply:**
- **Proving a merge added exactly the tip I passed:**
  - Without conflicts: `git diff <train-before> <tip>` must equal `git diff <merge^1> <merge>` byte for byte.
  - When the merged files also carry other units' changes: compare only the sorted `+`/`-` lines. Hunk context differs, so a whole-diff
    compare gives a false "differs".
- **"Same place" for a header/bar:** measure `getBoundingClientRect().top` of the bar on all three client pages, at scroll 0 after
  networkidle.
  - Clients: Lina (no chips), Dana `…0004` (coded injury), Quentin `…0022` (long name), Yusuf `…0007` (WORKOUTS only), Petra `…0006`
    (NUTRITION only).
  - Also Dana with a 50-character name via the cookie `evoli_fixture_display_name=<id>:<urlencoded>`.
- **A row asking for "red when X is put back":** build the mutant by reverse-applying the fix commit's src hunks
  (`git show <fix> -- <files> | git apply -R`). That is faithful even when the train has moved those files.
- **Filtering a per-language probe with `-g` by language:** titles that carry the OTHER language also match ("E3 keyboard en" and
  "… fr"). Those cross-language rows fail and are probe artefacts. Read which row failed before calling a red.
