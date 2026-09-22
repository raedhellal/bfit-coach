---
name: coach-portal-merge-is-release
description: b-fit-coach auto-deploys to production on merge to main — a QA verdict there is a release decision, and the story's gate now rests on a dated Raed statement
metadata:
  type: project
---

**`b-fit-coach` auto-deploys to a public production URL on merge to `main`.**
`curl https://bfit-coach-seven.vercel.app/api/version` returns `main`'s commit with
`"environment":"production"`. The README claimed the opposite (*"merges to no main and is deployed
nowhere"*) until `7f4f10a` on 2026-09-22 — **and the false banner was believed while deciding a push
was safe**, which is how EV-188b and EV-201 reached production unnoticed.

**Why:** there is no separate deploy step to hold, so **a QA pass on this repo is a release
decision**, not a pre-release one.

**How to apply:** for any `b-fit-coach` gate, say explicitly whether the branch should be released
*now*, and check `/api/version` before and after. There is **no release build number** on this
surface — the merge note names the **commit `/api/version` reports after the deploy** instead.

**The EV-202 ordering gate, as re-drawn by Ruling 8 (`b-fit-mobile` `16e9d97`, 2026-09-22):**
the constraint is no longer "EV-202b must not merge before the mobile store release carrying
EV-202c". It is a **property** (no account outside Evoli can write `milestone_weight_kg` /
`started_on` for a trainee whose device lacks EV-202c's consent copy), discharged **today only** by
**Raed's dated statement of 2026-09-22** that the portal URL is in no coach's hands, with the
release-blocking trip-wire hung on `EV-205a` AC9 (the first external coach grant) and `EV-205` AC7b
(a production coach census).

⚠️ **That discharge expires silently.** QA cannot witness the production coach population — no
access. Record the dependency; never write it up as verified. See
[[seeding-a-live-coach-portal-stack]] and [[ev202b-live-gate]].
