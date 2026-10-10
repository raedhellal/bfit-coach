---
name: red-on-base-at-a-precondition
description: A "red on base" count includes tests that fail at a setup/precondition step encoding the new behaviour, so the claim the test carries was never evaluated on base; read WHERE each base run went red before counting it as a defect witness (fluidity batch 1, pro-roster-states :152/:192)
metadata:
  type: feedback
---

When a branch claims "N tests red on base", read the failing line of each base log, not the count.
A rewritten regression test can go red on the base at a PRECONDITION that only the new behaviour
satisfies (fluidity batch 1 @ 3058616: pro-roster-states :152/:192 failed at `BAR toBeVisible
"the roster is still loading"` because on d717e57 loading.tsx commits the skeleton and ends the bar).
Its real claims (one nav, five links, a link can be followed — BUG-667) were never evaluated on base.
That is "behaviour changed", not "red for the defect".

**Why:** the merge record turns "red on base" into a claim that the test detects the defect. Counting
precondition reds inflates the witness set; the same test could be green on a base that has the defect.

**How to apply:** for every base-red test, classify: red at the defect assertion (witness) / red at a
precondition or setup (behaviour changed, not a witness) / skipped by serial mode (re-run alone, and check
the src state is logged for off-script re-runs). Also confirm the server compiles live src (`next dev`,
reuseExistingServer:false) or was rebuilt, else the base swap was not served. Related: [[new-string-test-copies-the-code-not-the-po-ruling]].
