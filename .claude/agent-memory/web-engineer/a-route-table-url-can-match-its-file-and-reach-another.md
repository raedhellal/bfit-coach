---
name: a-route-table-url-can-match-its-file-and-reach-another
description: EV-352 352.4 — checking a spec's file→URL table by pattern match is not enough; /templates/new matches templates/[id] but Next serves templates/new. Resolve by Next's precedence
metadata:
  type: project
---

`qa/render-error-every-route.spec.ts` keeps `ROUTE_FILES` (page file → URL the test opens).
A static check that only derives each file's pattern (groups dropped, `[param]` = one
segment) and tests the URL against it passes `"templates/[id]/page.tsx": "/templates/new"`:
the URL matches `[id]`, yet Next serves the STATIC `templates/new/page.tsx`, so the dynamic
page is never tested. The 352.4 test therefore also resolves each URL among EVERY page file
(static 0 < `[p]` 1 < `[...p]` 2 < `[[...p]]` 3, segment by segment) and requires the winner
to be the listed file. Witnessed 2026-10-08: pattern-only stayed green on that mutant; the
resolution limb named "served by templates/new/page.tsx".

**Why:** "the URL matches its file" and "the URL reaches its file" are different claims; a
table guard that checks the first lets one page be tested twice and another never.

**How to apply:** any file→URL or URL→file table in a spec: resolve with precedence, refuse
(throw on) segment shapes the resolver does not model (`@slot`, `(.)` interceptors) rather
than guessing. Page files are `page.{tsx,ts,jsx,js}` (Next's default `pageExtensions`; the
coach's next.config sets none). Never run two `next dev` in one checkout to iterate on such
mutants (shared `.next`); a scratch config spreading the real one with `webServer: undefined`
and only the single-worker globalSetup reuses one server for fast red/green loops.
See [[re-rooting-a-scan-can-narrow-it]], [[a-fixture-without-the-shape-cannot-guard-it]].
