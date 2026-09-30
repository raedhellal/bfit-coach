---
name: challenges-portal-facts
description: EV-321b step challenges on b-fit-coach — null-is-never-0 contract, who ranks, the trainee's "today", French grouping that a screenshot hides, the native date field's locale, fixture switches and where the specs run
metadata:
  type: project
---

EV-321b (`feat/ev321b-portal-challenges`, 2026-09-30, off the EV-324 French branch) added
`/challenges`, `/challenges/[id]`, `src/lib/challengeDocument.ts` (pure: builder, checks,
error mapping), `src/lib/challengeActions.ts`, `src/components/challenges/*`. Typed against
b-fit-api `feat/ev321a-coach-challenges-api` @ `1749060`, UNMERGED at the time
(`spec/b-fit-api.sha` says `on-api-main: NO`; re-sync after the api merges).

**Why these are worth keeping:** each one either cost a red run or is a rule a later edit
would break silently. Raed's investor demo (Sat 2026-10-03) peaks on this page.

**How to apply:**
- **`null` is never `0` on this page.** `ChallengeDay.value` / `todayValue` null = the phone
  sent nothing (the api stores no row); a stored 0 is a real MISSED. The table renders "—"
  with NO progress bar (an empty bar is a picture of zero), the strip draws a dashed square
  with `data-value=""`. `qa/coach-challenges.spec.ts` "NO_DATA…" was witnessed red on a
  `?? 0` sabotage.
- **INVITED rows carry no number at all** (`rank`/`progress` null): accepting is the
  per-challenge consent. The row says so in one sentence spanning the data columns.
- **The api ranks; the portal renders in served order.** Competition ranking (1, 1, 3),
  STEPS by daysMet then total, name as tiebreak; INVITED after by name. The fixture ports
  `ChallengeProgressCalculator` + the ranking so the table is fed the api's shape.
- **A STEPS invite needs the LINK, no data scope** (`requireManagedLink`); WORKOUTS needs
  the WORKOUTS scope and the api marks it "no portal or app UI yet" — the portal creates
  STEPS only but renders a served WORKOUTS challenge (null `daysMet`/`days`).
- **The trainee's "today" is theirs:** the zone the app last declared (X-Timezone on
  accept/sync), else UTC−12, moved forward by a later stored row. A trainee with no zone
  can show YESTERDAY as "today" on a UTC afternoon. The fixture uses UTC and says so.
- **Read French numbers from the DOM, never from a screenshot.** fr-FR groups four digits
  with U+202F ("1 000") in Node and Chrome alike, and the portal's font draws U+202F almost
  zero-width, so a PNG reads "1000". I misread one, "fixed" a disagreement that did not
  exist (`useGrouping: "always"`), and reverted it once `page.getByText(...).textContent()`
  showed `1U+202f000`. See [[unicode-escapes-in-written-source]].
- **A native `<input type="date">` is drawn in the BROWSER's UI locale**, not the page's
  (headless Chromium showed 09/30/2026 on a fr-FR page). The dialog restates the window in
  the page's language under the fields (`data-testid="challenge-window"`).
- **Fixture:** seeded in the POPULATED scenario only (fixed ids `FIXTURE_CHALLENGE_IDS`);
  cookies `evoli_fixture_link=ended` → create 403, `evoli_fixture_challenge_cap=reached`
  → 409, `evoli_fixture_today_steps=<n>` → Lina's today row on the ACTIVE challenge,
  `evoli_fixture_roster=fail` → the roster read 500s (the dialog says the clients could not
  be loaded, never "no linked clients"). Visibility follows the roster, like the api's
  `VISIBLE_LINK` (hidden, not 403).
- **The progress bar floors and its green is `today >= target`** (staff nit): `Math.round`
  painted 9,950–9,999 as a full green bar on an IN_PROGRESS day. `data-met` states it; the
  spec measures fill width against the track and compares colours with a met row.
- **"Updated at" is the browser's clock** (`LoadedAt` client island): a server render can
  only say UTC. The time is absent from SSR to avoid a zone hydration mismatch; specs pin
  `timezoneId` to Kiritimati (+14) and Paris so a UTC string cannot pass.
- **Where the specs run:** `coach-challenges.spec.ts` on the ROSTER config (the default
  suite's roster is empty), `coach-challenges-empty.spec.ts` + `challenge-rules.spec.ts` on
  the default one, `coach-challenges.live.spec.ts` on the live config. The testIgnore /
  testMatch alternations are unanchored: `coach-challenges)\.spec\.ts` does NOT match the
  `-empty` or `.live` files, which is why each is listed on its own.
- **The 1749060 re-vendor brought EV-316's `AuthTokens.expiresAt`** (api main) — unrelated
  drift, registered in `qa/contract-deviations.ts`. A sibling branch that re-vendors past
  `239c8ab` meets the same entry; keep the lines byte-identical.

See [[coach-portal-i18n-facts]], [[coach-portal-fixture-mode]],
[[a-picture-with-no-text-is-unassertable]].
