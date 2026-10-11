---
name: project_coach-s3j-gate
description: 2026-10-11 coach train/coach-s3j 8c29c7d (BUG-738 roster-failed picker + BUG-739 one-route editors B′) gate; per-frame re-mount sampler, WebKit prefetch-cancel console artefact, create-then-New identity hole, form-leave-guard WebKit dev-only Back race
metadata:
  type: project
---

**2026-10-11, b-fit-coach `train/coach-s3j` @ 8c29c7d** = 50f31f7 (s3h) + 6609ee8 (BUG-738 @8e6801a) + 8c29c7d (BUG-739 @06fcbdd).
Session log: scratchpad `coach-s3j-qa.md`; artefacts scratchpad `s3j/`. Previous: [[project_coach-s3h-gate]]. Verdict and numbers
live in the session log, not here. FAIL at 8c29c7d (roster 349.1), re-gated PASS at 1d6c442 (registry fix 311a5e6, qa/ only).

**Why:** a coach merge is a production deploy ([[coach-portal-merge-is-release]]); BUG-739 also owes a Vercel deploy smoke (Q8).

**How to apply (reusable):**
- **WebKit on `next start` works over plain http** if the session cookies are re-added without `Secure`. In a scratch ARCHIVE I patch
  `qa/sign-in.ts` (env-gated `QA_DESECURE=1`, WebKit only: `POST /api/auth/login` on the context, re-add cookies, goto landing), so
  every existing spec runs unchanged in WebKit on `next start`. Never in the git tree; run full suites on a CLEAN archive.
- **WebKit logs `Failed to fetch RSC payload … Load failed` / `… due to access control checks` for the PREVIOUS page's AUTO prefetches
  when a page is left mid-prefetch, into the NEXT document's console.** It is on base too, not hydration, and not caused by an HTTPS
  proxy. A console-clean check must load each URL in a fresh tab (old tab idle, then closed), or it reds on Next 14 + WebKit.
  Any `next start` run of `editor-create-then-update`'s console test in WebKit reds 2/2 for this reason; on `next dev` no AUTO fires.
- **Re-mount witness = per-animation-frame sampler started before the held answer**: count frames where an expando-marked input is
  `!isConnected` and frames where the notice is gone after it showed. Base shows it as "notice never visible" at the answer.
- **The editor identity rule compares the PROP.** After a create with no update the prop is still `null` (only `adopted` holds X), so a
  soft push to `/x/new` keeps X's editor and Save updates X under « Nouvelle recette ». Same on base. Not reachable by a click today
  (no editor → New link): any future link from an editor to New/another editor must re-run that probe.
- **`next build` overwrites nothing, but `next dev` in the same tree replaces `.next`**: a later `next start` then fails "no production
  build". Rebuild after any dev run in that tree.
- **form-leave-guard create-step tests (:734, :767) in WebKit: `next dev` only, ~15–40 % red on base and tip, 0/32 on `next start`.**
  Red = the final Back does not move, and a second Back lands two entries back (skips the library). Instrumenting history calls
  makes it vanish. Do not blame a branch for it.
- **Always run the FULL roster config on a train that adds a page file.** `render-error-every-route` 349.1 binds every `src/app` page to
  `ROUTE_FILES`/`NO_SHELL`, and the DEFAULT config ignores it. BUG-739's two `editor/page.tsx` files went red only there (engineer's
  1843/0 and staff's runs never ran it). Its 352.4 own-file check does not strip a query string, and it models no rewrites.
- Next's route announcer is an empty `role="alert"` on every page: count alerts with text, never all alerts.
- Mutant lint trap again: an unused-arg mutant is refused by `next build` lint; build `--no-lint` and say so.
