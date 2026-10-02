---
name: challenges-followups-337n-facts
description: EV-337n (feat/pro-challenges-followups, 2026-10-02) — the head's UTC phase gates every row "today", participantRowView, a never-synced total is a fake zero, met-card foot (ruling 8), zone-edge + extra-challenge fixture switches
metadata:
  type: project
---

EV-337n challenge items (N1, N2, N4 + QA PB-1/PB-2 on EV-337h `6269343`). Extends
[[challenges-redesign-portal-facts]], which said "ended and upcoming render no today cell" —
that was FALSE at the zone edges until this branch.

**Why:** each item below is a rule a later edit would break silently, or a fixture lever a
spec needs.

**How to apply:**
- **The head's phase is part of "today".** `todayInWindow(progress, c)` in
  `src/lib/challengeView.ts` is `c.phase === "ACTIVE" && ownDay(...) === "IN_WINDOW"`. The
  trainee's own today alone let a Tokyo trainee show « Aujourd'hui 5 000 / 10 000 pas » under
  « Commence demain » (UPCOMING, UTC) and an LA trainee « 6 000 / 5 000 pas » under « Terminé ».
  Pass the whole `challenge` (needs `phase`, `metric`), never a `{startsOn, endsOn}` range.
- **`participantRowView(progress, challenge)`** = `{today, rank, counts, total}` is the ONE place
  the row decides. UPCOMING: no rank, no days-met/total, no sync line (the api ranks over the
  trainee's own day 1). ENDED keeps final standings (rank, days met, total). The day strip is
  NOT gated: dated per-day facts, never labelled "today" — a deliberate choice, not an oversight.
  `data-rank` is blanked when the rank is hidden.
- **`total` vs `syncedAt` (read at b-fit-api main, `ChallengeProgressCalculator.steps`):** total
  is a `long`, never null; syncedAt is the latest winning row up to today and null exactly when
  there is none. So STEPS `syncedAt: null` ⇒ the 0 total is a sum over nothing (fake zero, X7):
  hide it. A synced 0 is real. WORKOUTS: syncedAt ALWAYS null and 0 sessions is a fact — never
  apply the sync rule there.
- **Met card foot (ruling 8):** `todayStats` has `pastEnd`/`beforeStart` (ACTIVE only; `accepted`
  stays the in-window denominator); `metCardFoot(stats, copy.challenges.stats)` joins
  withoutData · pastEnd · beforeStart with « · », zero parts omitted. Copy keys
  `stats.pastEnd`/`stats.beforeStart`. Adding keys to `todayStats` breaks every `toEqual` on it.
- **Fixture levers (`coachApi.fixture.ts`, populated scenario):**
  `evoli_fixture_challenge_edges=1` serves `FIXTURE_EDGE_CHALLENGE_IDS` (…e1 upcoming-east,
  e2 ended-west, e3 never-synced, e4–e6 last evening, e7 first morning), built per read from the
  real UTC date (never stored; delete is a no-op, the 20-unended cap ignores them).
  `StoredParticipant.zoneOffsetDays` moves a trainee's today ±1 like the api's zone rule.
  `evoli_fixture_challenge_extra=<n>` (any scenario, cap 200) adds n ENDED « Défi NNN » after the
  seeds — 60 gives 63 = 2 pages of 50. The pager links measured 83×44 / 101×44 at 390 FR.
- **A stat value that is words breaks mid-word at 320.** « Aucune donnée aujourd'hui » at 20 px
  bold in a 2-up card broke « aujourd'h / ui » (`overflow-wrap: anywhere` on `.stat-card-value`).
  Wrap a words value in `[data-value-words]` (16 px). `brokenWords()` in
  `qa/pro-challenges.spec.ts` finds mid-word breaks with a Range per word — reuse it.
- **WebKit for these specs:** a scratch config OUT of the tree (testDir = worktree `qa`,
  webServer `cwd` = worktree, its own `node_modules` symlink). Without `qa/warm-routes.ts` in
  `globalSetup`, the first test's sign-in races a cold compile ("navigation interrupted by
  another navigation to /") — harness, not product; warmed it is 8/8.
- **Red-on-base needs the tip fixture:** on the bare base the new page specs are red only
  because the switches do not exist. Copy the tip `coachApi.fixture.ts` into the base worktree
  to get the real red (PB-1: `.participant-today` count 2; PB-2: `[data-total]` count 1; N1: no
  foot). N2 is green there — the pager was already 44 px; it was only never measured.
