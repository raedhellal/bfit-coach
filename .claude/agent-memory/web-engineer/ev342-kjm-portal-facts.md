---
name: ev342-kjm-portal-facts
description: EV-342k identity cookie, EV-342j folded session list, EV-342m per-locale dictionary chunks — what each changed, the numbers, and the traps hit while measuring (2026-10-07)
metadata:
  type: project
---

Three b-fit-coach perf slices built 2026-10-07 off c2768c2, one branch each (not merged
when written; check `git branch -a` before relying on any of it).

**EV-342k** (`perf/ev342k-coach-name-without-me`): httpOnly cookie `evoli_pro_coach` =
JSON `{s: access-token sub, c: coachId, n: displayName}`, written by `/api/auth/login`
(coach landing only, never PENDING) and `/api/auth/activate` through
`rememberCoach()` = one `coachApi.getMe(bearer)`. `readCoachMe()` is cookie-first,
honoured only when `s` equals the CURRENT token's sub, else one `/me` per request; its
type is narrowed to `{coachId, displayName}` so no page can read capacity from it. Only
the roster calls `coachApi.getMe()` now (capacity). Cleared by `clearSession` and
middleware `toLogin`. page-read-budget: `getMe` only in the roster row.

**EV-342j** (`perf/ev342j-overview-sessions-once`): « Activité récente » = AC5 summary
line + ONE `<ul>` of sessions, 5 shown, « Voir les N dernières » (N = real count) reveals
the rest in place. Weigh-in rows were DROPPED from the card (judgment call on the PO's
"latest 5 sessions"; flag if a PO/Raed ruling says otherwise). `SessionHistory.tsx` was
repurposed as the client island rather than deleted (deleting files needs a sign-off).
J.3 ("one screen shorter than 3,133 px at 768") is NOT reachable by the fold: 3,222 →
2,791 px under next start; next dev measures ~33 px less than next start.

**EV-342m** (`perf/ev342m-locale-only-bundle`): `src/lib/i18n/client.tsx` loads each
dictionary with `import()` and `use()` (vendored React canary; `/// <reference
types="react/canary" />` above "use client"); `endSentence` moved to its own module so
`copy.fr.ts` does not import `copy.ts`. Every client module is EAGER-imported into the
route's entry (next-flight-client-entry-loader), so only a dynamic import inside a client
module leaves First Load JS. The route table then drops ~35 kB, but it no longer counts
the dictionary chunk the page still fetches (EN 16.6 / FR 20.3 kB gz vs 36.5 kB both):
report the net, not the table. Measured net (JS bytes a cold load transfers under next
start): FR −13.7 to −14.6 kB, EN −17.4 to −18.3 kB. Cost: the dictionary fetch starts at
module evaluation, so hydration can wait one round trip (localhost +0–9 ms median).

**Traps:** in zsh, `"$T:qa/x"` applies the `:q` modifier — write `"${T}:path"`.
« Ajouter un client » is in code comments, which `next dev` ships, so a browser-side probe
must be a dictionary value found nowhere else (`Ouvrir le plan`, `Add a client`); prod
chunks escape accents (`d\xe9connecter`). Running Playwright (`next dev`) in a worktree
overwrites its production `.next`. See [[one-worker-per-fixture-server]].

**Staff fixes (same day):** `rememberCoach` races `AbortSignal.timeout(1500)` — an
unbounded read there held the ACTIVATION response after the account was already activated;
the fixture latency cookie (cap 2 s) is the witness. The fixture's activated accounts have
their own sub while `/me` answers the shared COACH_ID, which is what makes `c != s`
testable. `CopyProvider` sits ABOVE `app/error.tsx` and there is no `global-error.tsx`: a
throw there is Next's bare error page, so a failed dictionary chunk reloads once
(sessionStorage flag). An overview card's not-shared sentence must name the scope actually
missing: Sara holds PROGRESS without WORKOUTS, so "has not shared their progress" is false
about her.
