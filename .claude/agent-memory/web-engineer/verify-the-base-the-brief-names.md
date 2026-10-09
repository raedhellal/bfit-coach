---
name: verify-the-base-the-brief-names
description: a coordinator's "the base already holds X" can be false; check with git merge-base --is-ancestor before building on it
metadata:
  type: feedback
---

EV-337g1's brief said base 198a293 held BUG-713's heading logic; `git merge-base --is-ancestor 355b19d 198a293`
said no, and the spec it named (`client-tab-load-error-heading`) did not exist there. Later the coordinator
moved the branch onto BUG-714's tip (51f7faa), which did hold it.

**Why:** building on an assumed fix produces a rebase conflict later and evidence against the wrong code.

**How to apply:** at the start of a slice, for every fix the brief says the base contains, run
`git merge-base --is-ancestor <fix-sha> <base>` and `ls` the specs it names; write the result in the progress
file and keep building on the base as given (do not merge an unmerged branch in yourself). On a rebase onto a
fix that rewrote the same files, take your file and re-apply the fix's lines verbatim, then diff the fix's
lines against its tip (should be indentation only).
