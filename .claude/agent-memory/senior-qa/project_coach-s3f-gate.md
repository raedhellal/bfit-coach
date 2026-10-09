---
name: project_coach-s3f-gate
description: 2026-10-09 coach train/coach-s3f d1fed49 (BUG-718 no Apply-to without a week card + BUG-720 lower-case "this trainee") gate — PASS; vacuous negative check from \b after « à », dictionary param-name sweep, facts-diff regressions, api-merge-condition needs a git tree
metadata:
  type: project
---

**2026-10-09, b-fit-coach `train/coach-s3f` @ d1fed49** = e4e3a5f (s3e, EV-337g1) + 4b3d30e (BUG-718 059c6bf) + 9e28c2a (BUG-720 b64774b) + my
s3e note. **Verdict: PASS.** Default 1732/0 (+5 first-name-fallback-case), roster 311 + 1 skip (+12 template-use-no-week-card, +14
pro-roster-unnamed-client). No new rows. Live api BLOCKED (Docker down). Session log: scratchpad `coach-s3f-qa.md`; artefacts scratchpad
`s3f/` (rig/, logs/, shots/, mut/*.diff, ref/). Previous: [[project_coach-s3e-gate]].

**Why:** a coach merge is a production deploy ([[coach-portal-merge-is-release]]).

**How to apply (reusable):**
- **A negative check with a broken matcher passes silently.** My FR "no « Appliquer à … » button on the page" used `/^(Appliquer à|Apply to)\b/`.
  `\b` after « à » is never a word boundary in a JS regex (ASCII word chars), so the check matched nothing and passed. It only surfaced because
  the POSITIVE case using the same matcher went red. Use `\s` or a lookahead after accented letters. Pair every "count is 0" check with a case
  where the same locator must find exactly one thing.
- **The "Use on a trainee" confirm dialog has no heading role.** Its title is the dialog's accessible name (aria-labelledby). Locate the dialog
  with `getByRole("dialog", { name: /Cut 1800/ })` and read the name from the labelledby ids.
- **`qa/api-merge-condition.spec.ts` fails from a `git archive` tree** ("not a git repository", "No b-fit-api checkout found beside this repo").
  Run the suite from an archive if you like, but re-run that one file from the git worktree, and say so in the log.
- **Copy case rules: sweep the dictionaries by PARAMETER NAME, not by call site.** Walk every function in `en`/`fr`, take the params named
  `first`/`firstName` from `fn.toString()`, call with the fallback, and classify each hit as sentence-initial or mid. It is a different method
  from the engineer's call-site trace, and it reproduced their count exactly (17 EN + 25 FR red on base). A blind every-argument sweep drowns in
  numeric args.
- **A previous gate's jsonl facts are a regression witness.** Re-run the old probe, normalise `localhost:<port>`, and Counter-diff the records:
  g1 272/272 and BUG-714 60/60 identical. The hub keeps rig + data for s3d (`docs/qa/evidence/2026-10-09-coach-s3d-gate/`), so it survives the
  scratchpad cleanups.
- **Mutate the merge resolution itself.** Revert a conflict hunk to each parent's side (MR-A: the 718 side, `de(first)`; MR-B: the 720 side,
  always quote). MR-A compiles and only behaviour catches it; MR-B also fails tsc (57 errors).
- **The branch spec template-use-no-week-card misses two mutants:** C1 (`mid(de(first))`: its FR lead allows [Cc], staff N1 not tightened)
  and C2 (week card covered below 600 px: it checks `toBeVisible()` at desktop width). My probe's hit test at 390 caught C2.
- **Fixture sentences:** `evoli_fixture_targets=refused|no_answer` and `evoli_fixture_week=fail|no_answer|rate_limited|generating`, set once the
  confirm dialog is open, reach every template-use outcome. `evoli_fixture_summary_read=nutrition:500:<id>` set BEFORE picking gives readFailed in
  the dialog; set after, it gives the no-card landing. `nutrition:403` after Confirm lands on /clients/denied with no stale outcome later.
- **Swap can grow mid-run** (5120 → 6144 MB total, free ~430 MB, while another session ran a suite). Check that swapouts are flat before starting
  the next job, not just the free figure.
