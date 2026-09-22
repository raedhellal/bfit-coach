---
name: coach-portal-auto-deploys-to-production
description: b-fit-coach main auto-deploys to bfit-coach-seven.vercel.app — merging IS shipping, and the README said the opposite until 7f4f10a
metadata:
  type: project
---

`b-fit-coach` `main` **auto-deploys to a public production URL**,
`https://bfit-coach-seven.vercel.app`. Confirmed by staff review on 2026-09-22:
`curl …/api/version` answered the sha of `main` with `"environment":"production"` and a
build time minutes old.

**Why it matters:** `README.md:12` said *"This repo merges to no `main` and is deployed
nowhere"* — corrected on `main` at `7f4f10a`, but it is how a release gate gets waved
through by someone who reads the README instead of the URL. Any story with an ordering
constraint ("must not reach coaches before X") is discharged at the MERGE here, not at
some later deploy step.

**How to apply:** treat a merge to `b-fit-coach` main as a production release. Check
`/api/version` rather than the README when you need to know what is deployed. For
EV-202b the gate was satisfied by Raed stating the URL is in no coach's hands today —
a named, dated statement recorded in the merge note, which is the substitute the story
allows for a store build number. Related: [[coach-portal-surface]].
