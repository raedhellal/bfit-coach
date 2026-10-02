---
name: overview-followups-337m-facts
description: EV-337m (b-fit-coach feat/pro-overview-followups, 2026-10-02) — overview gating follows the api's own scope per block (adherence, flags, lastSession); four overview-only fixture trainees and two cookie switches; WebKit contexts inherit the suite's Accept-Language; addCookies path trap
metadata:
  type: project
---

Branch `feat/pro-overview-followups` off `origin/release/coach-held-merges` 99dc73b (EV-337m, BUG-674, BUG-675).

**Gate each overview block on the scope the API computes it under, read in b-fit-api, not
on the scope the block "feels like".** At c82e55b (`CoachPortalQueryService.overview`):
adherenceThisWeek = WORKOUTS, redFlags = WORKOUTS or WEIGH_INS (`TraineeRedFlagRules.evaluate`
null only when neither), streak = PROGRESS, lastSession = **WORKOUTS**, weightSeries =
WEIGH_INS. The portal had adherence + flags + lastSession on PROGRESS (BUG-674 and staff's
nit 1, all fixed on this branch; lastSession in a4dad39). Each moved gate needs a witness of
its own: after Sara's fixture adherence became null, deleting `workoutsShared &&` from the
adherence value survived every spec until the legacy stub (3/4 with no `scopes`) asserted
the dash (ae8654b). Template "use on a trainee" also revalidates `/clients/{id}` (b98f978).

**Fixture additions (overview-only, not on any roster):** …0020 Yann (WORKOUTS only,
MISSED fired, plan seeded), …0021 Pablo (`["PAIN_REPORTED"]`, a wire no api sends — exists
to test the labelled-codes filter), …0022 Quentin (MISSED + `"SOMETHING_NEW"`), …0023 Wanda
(progress `weeks: 1`). Yusuf's overview now sends `adherenceThisWeek {0,2}` and
`redFlags []` (it used to send null for both, which no api does for a WORKOUTS link), and
Sara's (PROGRESS + WEIGH_INS) `adherenceThisWeek` is now null (it sent `0 / 3`, which the old
PROGRESS gate DISPLAYED and the new WORKOUTS gate hides). A fixture row is only as faithful as
the gate reading it: re-read every row's blocks against the api's scope when a gate moves.
Cookie switches: `evoli_fixture_roster_workouts_flag=1` (adds Yann's roster row) and
`evoli_fixture_summary_read=<routine|nutrition>:<500|403>:<clientId>` (fails that read
everywhere it is made). Both documented in the fixture's challenge-switch comment block.

**Unlabelled flag codes draw no card** (page filters, `RedFlagEvidence` skips too). When the
api returned codes and none is labelled, « À traiter » says `noRedFlagsShown` ("No alert to
show." / « Aucune alerte à afficher. »), never "No red flags" (X7). That sentence is mine,
not the PO's: flagged for review.

**Test traps hit (each cost a run):**
- A context from a manually launched `webkit` inside a Playwright test gets the SUITE's
  context options, including `qa/fixture-test.ts`'s `Accept-Language: en-US`. A
  `locale: "fr-FR"` context rendered English. Set `extraHTTPHeaders` explicitly.
- WebKit on `next dev`: a fill before hydration leaves the login submit disabled. Retry the
  whole fill+click in `expect(...).toPass()` (field-focus-ring.spec.ts recipe).
- `addCookies({ url: page.url() })` on a `/clients/<id>` page sets the cookie with THAT path;
  a second set from `/` gives two same-name cookies and the server reads the first. Use
  `new URL("/", page.url()).href`.
- M6 (exact-match injuries) and M8 (revalidate the overview) are green on base by nature:
  M6 pins behaviour that was already right, and Next 14.2 purges the whole router cache on
  any action revalidation, so the overview was already fresh. Say so; prove sensitivity by
  mutation instead.

See [[client-overview-redesign-facts]], [[coach-portal-fixture-mode]], [[stories-carry-verbatim-copy]].
