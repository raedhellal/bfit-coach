---
name: repo-wide ratchet outside the story's specs
description: a branch that adds a counted construct (router.refresh(), etc.) goes red on a src-wide pin spec the story's own specs never run
type: feedback
---
EV-095b round 1 (coach 17c6a7d): MessageThread.tsx:154 added the 15th `router.refresh()`;
`qa/editor-save-no-refresh.spec.ts` pins the src-wide count at 14, so the branch was red there.
My round-1 run covered the messages + roster specs and missed it; the engineer found it at 843ebca.

**Why:** ratchet/pin specs (`readdirSync(src, { recursive: true })` + a count) live in unrelated
files and only run in the full default suite.
**How to apply:** at every review, `git grep -l "readdirSync(src" qa/` and run those specs too,
plus `git grep -c` the counted literal on base vs tip. A moved pin needs the new call judged
legitimate (does its action already revalidate?), not just the number bumped.
