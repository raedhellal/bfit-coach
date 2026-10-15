---
name: new-string-test-copies-the-code-not-the-po-ruling
description: A spec for a NEW user-facing string pins the engineer's wording while the story carries a different PO copy ruling; also "red on base" written in commit messages before any run (fluidity batch 1, 2026-10-10)
metadata:
  type: feedback
---

When a branch adds a new string, check the literal in the code AND in the spec against the story's **Copy** ruling. Do not check it only against copy.ts.

**Case (perf/coach-fluidity-1 @ b4c3d33, EV-356c).**
- The PO ruled « Le tri n'a pas pu être modifié. Réessayez. » / "The sort could not be changed. Try again."
- The engineer shipped « L'ordre n'a pas pu être changé… » / "The order could not be changed…". The commit called it "wording is the engineer's, flagged for senior-po", so the engineer had not read the story's ruling.
- pro-roster.spec.ts typed the SAME engineer literals. The "every label is a literal, never imported from copy.ts" rule was kept to the letter, but the literal was still taken from the code, so the test confirmed the code by construction. AC C.3 fails as written.

**Why:** the literal-not-import rule only protects against a reworded string when the literal comes from the AC. When the engineer writes both the string and the test, the rule is vacuous.

**How to apply:**
- For every new copy key in a diff, grep the story for « and quote the ruling next to the two literals in the review.
- A mismatch is Blocking: a story's ACs win on scope.

**Same branch, claims without a run.**
- 98cd002 and 4a637bd say "red on d717e57", but they were committed before the first run. The progress log shows 22:44 and 22:47 commits, and the first run was at 00:17, default config only.
- The roster-config specs never ran.
- Before an engineer's "red on base" goes into a merge record, compare the commit time with the progress log's run times. This is the same failure as [[pushed-is-not-ran]] and [[claim-substitution-defect-class]].

**Also from this review (useful, not defects):**
- A per-card `running` tag read as `pending && tag` is a sound fix for "shared useTransition labels every action" when every starter is disabled on `pending`.
- A `pressed` guard covers the render where an urgent setState after an await lands while `pending` is still true. That window is sub-frame and needs a MutationObserver to pin.

**Recurrence (EV-356g @ b-fit-coach 5071beb, 2026-10-11).** The story says only "a loading line". The branch invented « Chargement de vos clients… » / "Loading your clients…", and the spec's `LOADING` literal copies it. No PO ruling exists in the hub, so it is Should fix (no contradiction), not Blocking. The same branch also RETIRED a shipped sentence "by the coordinator under Raed's delegation", recorded only in a commit message. A sibling row (BUG-746 Expected (4)) still pinned the retired words. When a branch retires a string, grep BUGS.md and the stories for the OLD literal: a later row's AC may pin it ([[stale-sibling-banner-contradicts-the-new-one]]).
