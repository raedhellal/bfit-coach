---
name: ev202b-live-gate
description: EV-202b (coach portal milestone + start-date form) live merge gate 2026-09-22 — PASS at 080110f, BUG-210 filed, and the en-GB "Sept" finding
metadata:
  type: project
---

EV-202b `feat/ev202b-portal-progress-block` tip **`080110f`** (fix `2facf52`) was gated **live** on
2026-09-22 and **PASSED**: production `next build` + `next start` on `:3394`, `COACH_API_MODE=live`,
real Chromium, against a throwaway `b-fit-api` built from **`9218a77`** (= shipped `main`, the
EV-202a half) on a throwaway Postgres on `:55460`. Zero paid model calls.

**Why:** everything `staff-engineer` ran was fixture mode, and its one Should-fix was a **reproduced
keystroke race** — an edit made between Save and the response was reverted by `revalidatePath`'s
prop push. The fix is per-field dirty flags (`reseedPreservingEdits`), and I confirmed it **on a
real network against a real api**: RED at `5c8b7d3` (field reverted to "67"), GREEN at `080110f`
(typed "69" survived), table showing the stored value both times. The technique is in
[[holding-a-save-open-without-faking-it]].

**Row filed: BUG-210 (P3)** — `src/lib/format.ts`'s `Intl.DateTimeFormat("en-GB", {month:"short"})`
renders September as the four-letter **`Sept`**, so the block reads `(15 Sept 2026)` where EV-202
AC2 quotes `(15 Sep 2026)`. **September is the only month affected** (ICU 72+ behaviour), it is
**pre-existing and already in production**, and it is non-blocking. The reason no test caught it is
worth remembering: `coach-progress-goal.spec.ts:145` pins AC2's sentence but leaves the dates as
`\(.+\)` — the AC is "asserted" with the one wrong token wildcarded.

**BUG-195 reproduced live again** on the Routine tab and was NOT re-filed.

Pass report: `b-fit-mobile/docs/qa/2026-09-22-EV-202b-qa-pass.md`, evidence under
`docs/qa/evidence/2026-09-22-EV-202b/`. Release gate context in
[[coach-portal-merge-is-release]]; seeding recipe in [[seeding-a-live-coach-portal-stack]].
