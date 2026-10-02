---
name: challenges-redesign-portal-facts
description: EV-337h (feat/pro-challenges, 2026-10-02) — challenge list cards + detail participant rows/cards; the markup hooks specs use, todayValue's two nulls, the h1/pill split, the poll-on-cards test, FR word changes
metadata:
  type: project
---

EV-337h (`feat/pro-challenges`, off `release/coach-held-merges` 99dc73b) redrew `/challenges`
and `/challenges/[id]`. Supersedes the table facts in [[challenges-portal-facts]] (null-is-never-0,
api ranks, BUG-473 source rule all still hold).

**Why:** each item below either cost a run or is a rule a later edit would break silently.

**How to apply:**
- **Markup hooks (specs depend on them):** list = `ul.challenge-grid` > `li[data-challenge-id]` >
  `a.challenge-card` (WHOLE card is the link, `aria-labelledby` the `h2` title; « Voir le détail »
  is an aria-hidden span, BUG-661). Detail participants = `li[data-participant][data-status]`
  inside the region "Participants' progress"; rank `[data-rank-label]`; name link
  `[data-participant-link]` (44 × 44, the only link in the row — the row is NOT a link because
  it holds role=img squares and a progressbar a link name would swallow). Phase pill
  `.challenge-head [data-phase]`. `ProgressTable.tsx` kept its filename (no deletion), it
  renders the list now. Row ≥768 (two grid lines to 1279, one from 1280), card <768, CSS only.
- **`todayValue: null` has TWO meanings** (coachApi.ts doc): nothing sent today, OR the trainee's
  `progress.today` is outside the window. Only the first is « Aucune donnée aujourd'hui ». ⚠ The dates alone did NOT keep ended/upcoming
  rows free of a today cell at zone edges (QA PB-1); since EV-337n the phase gates it too — see
  [[challenges-followups-337n-facts]].
- **Phase is UTC, a trainee's today is theirs — ONE predicate for both.** Staff blocker on
  55d2126: the stat cards gated on `phase === "ACTIVE"` alone while the rows checked the
  trainee's today, so at 22:30 UTC on `endsOn` Paris trainees who met every day read « 0 / 3 ·
  3 sans donnée ». `todayInWindow(progress, challenge)` in `challengeView.ts` is now asked by the
  row AND `todayStats`. Any new "today" aggregate must filter through it. The fixture seeds
  mid-window, so the boundary lives in `qa/challenge-view.spec.ts` (constructed api shapes),
  imported as `view.*` so a missing export fails one test, not the file.
- **Before day 1, hide what reads like a fault:** no totals, no sync line (`syncedAt` is null for
  everyone before the start).
- **The h1 must hold the name only.** `PageHead` puts its whole `title` node in the h1, so a badge
  passed there joins the accessible name (« 10 000 pas par jour En cours »). The detail page
  draws its own `.challenge-head`; reuse that shape for any title + status pill.
- **Window position is UTC** (`src/lib/challengeView.ts`, pure, type-only coachApi import): the
  api computes `phase` on its UTC date, so « Jour n sur N » counts the same calendar and clamps.
  Fixture seeds relative to the server's start day: a run crossing UTC midnight reads day+1.
- **Before day 1 the api's numbers are zeros** (`daysElapsed 0`, `daysMet 0`, `total 0`): the row
  hides days-met and total until `daysElapsed > 0` — « 0 sur 0 · 0 pas » read as a claim.
- **Stats only from api numbers:** joined/invited from the summary; met today = the api's MET
  on each trainee's own today; average over participants WITH a number (none → named). The two
  "today" cards only on ACTIVE + STEPS with ≥1 accepted. No decline count anywhere (no DECLINED).
- **Poll test on cards:** `page.clock.install()` before sign-in, set `evoli_fixture_today_steps`,
  `clock.fastForward(44_000)` (still old), then `+1_500` → the card shows the new number. Red with
  the interval sabotaged; red on base because the card locator is absent.
- **FR words changed:** phase ACTIVE « En cours » → « Actif » (story's Actif / À venir / Terminé);
  ACCEPTED « Participe » → « A rejoint » (no accent: the verb). New identical EN/FR keys
  (`participantsTitle`, `ratio`) need the `SAME_IN_BOTH` allowlist in `qa/coach-i18n.spec.ts`.
- **Red-on-base recipe:** a second detached worktree at the base, node_modules symlink, copy
  the new spec + the config that matches it, run on another port. Separate `.next`, so it can
  run while the tip worktree is idle (never two `next dev` in one tree).
- The Write tool again wrote `\u202f` / `\u00a0` as literal characters in a spec; scan after writing
  ([[unicode-escapes-in-written-source]]).
