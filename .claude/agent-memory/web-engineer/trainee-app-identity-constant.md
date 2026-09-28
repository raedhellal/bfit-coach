---
name: trainee-app-identity-constant
description: EV-289 — the two trainee apps' names/schemes/bundle ids live in src/lib/traineeApps.ts; lite values are D-LITE-1/D27.5a defaults; "Open in Evoli Fit" role-name matches the Lite link unless exact
metadata:
  type: project
---

`src/lib/traineeApps.ts` (EV-289) is the one place for `EVOLI_FIT` (`evolifit`,
`com.fit.evoli.app`) and `EVOLI_FIT_LITE` (`evolifitlite`, "Evoli Fit Lite",
`com.fit.evoli.lite`), plus `INVITE_APPS` (order: full, then lite — senior-po's) and
`inviteDeepLink`. The invite page maps over `INVITE_APPS`.

**Why:** the lite name is Raed's open `D-LITE-1` and the bundle id is confirmed only before
the first upload (ADR-0027 D27.5a); a rename must be one edit.

**How to apply:**
- If D-LITE-1 lands, edit the constant; the literal labels in `qa/invite-landing.spec.ts`
  go red on purpose and are edited with the story.
- `getByRole("link", { name: "Open in Evoli Fit" })` also matches "Open in Evoli Fit Lite"
  (substring, strict-mode violation): always `exact: true`. See
  [[playwright-gettext-is-case-insensitive-substring]].
- No store links: none exist (D8 / EV-037); "coming soon" stays. The fallback sentence
  still says "Install Evoli Fit" only — a copy question for senior-po, not changed.
