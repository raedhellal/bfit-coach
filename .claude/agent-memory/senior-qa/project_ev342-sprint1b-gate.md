---
name: project_ev342-sprint1b-gate
description: EV-342 sprint-1b coach train ba0ca15 gate 2026-10-07 — 691/f/g/o PASS, 342e FAIL (tab bar jumps for an injured client, BUG-699 proposed); rig facts on locale, bfcache, Chrome channel, F.4 compare
metadata:
  type: project
---

**2026-10-07, b-fit-coach `train/ev342-sprint1b` @ ba0ca15** = d7ab381 + BUG-691 5a6375c, EV-342e 242d5fa, EV-342f 2630a4b,
EV-342g a2fc25f, EV-342o 02212a8. Verdicts:
- BUG-691: PASS.
- EV-342e: FAIL on E.1. Proposed BUG-699: Dana's overview header carries the injury pill and the other two pages do not,
  so the tab bar moves 34 px at 390.
- EV-342f: PASS as a partial (F.1 exercise-row half NOT MET, carried).
- EV-342g: PASS.
- EV-342o: PASS.

Run counts: default 1423 + 4 fixme skips, roster 217 + 1 skip, legacy 8, timeout 4, refresh 1, activation 24.
The session log is in the scratchpad `sprint1b-qa.md`. Sprint 1 is in [[project_ev342-sprint1-gate]].

**Why:** a coach merge is a production deploy ([[coach-portal-merge-is-release]]), so this gate decides the release.

**How to apply (reusable rig facts):**
- **The context `locale` wins over `setExtraHTTPHeaders({Accept-Language})`.** A probe that signs in through the API with an FR header
  under an en-US context still renders EN. Use `test.use({ locale })`. I used an env var and ran EN and FR as two passes.
- **Real Chrome (`channel: "chrome"`) renders a tab the browser opens itself (Cmd+click) in the system language**, not the context's
  locale. WebKit's new tab follows the context. This is a harness artefact.
- **Playwright passes `--disable-back-forward-cache` to Chromium.** Even with it removed, client pages send `Cache-Control: no-store`,
  so Chrome keeps them out of bfcache, and Back to them is a document reload. A "bfcache" ask on this portal is really the reload path.
- **The sessionStorage of a Cmd+click tab is not cloned** (Chrome, WebKit; opener null). A per-tab note cannot leak into a new tab.
- **G2-type asks ("skip link with unsaved changes"):** after typing, `body.focus()` does not move focus. Go back up with Shift+Tab
  (Alt+Shift+Tab in WebKit).
- **An F.4-type "unchanged at ≥1280" compare:** build the integration tree WITHOUT the unit (a scratch worktree with the other tips
  merged no-ff). Byte-compare PNGs. Prove the compare can fail by running it below the breakpoint, where it must differ.
- **"Same place" ACs need a client with header chips (Dana `…0004`).** Lina has none, which is how BUG-699 slipped past the spec.
- A no-guardrails layout can be simulated by removing `.prog-profile` from the live DOM. The fixture cannot send null guardrails.
