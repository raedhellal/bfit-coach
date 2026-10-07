---
name: coach-form-hooks-342o-facts
description: EV-342o (2026-10-07) — useCoachForm / useAutosave, the BUG-665 four-form migration, the guard's navigation trap, and the test sync points that made the leave-guard specs deterministic
metadata:
  type: project
---

`feat/ev342o-coach-form-hooks` (b-fit-coach, rebased onto d7ab381 = sprint 1). BUG-665 was RESTATED to four
forms (nutrition template editor, daily targets, progress goal, « Nouveau défi ») and EV-342o's
merge condition names them as the hook's consumer, so both ship on the one branch;
`fix/bug665-nutrition-template-unsaved` was left at base.

**Where:** `src/lib/coachFormState.ts` (pure rules), `src/lib/useCoachForm.tsx`,
`src/components/ui/UnsavedChangesDialog.tsx`.

**Autosave is PARKED on `feat/ev342o-autosave` (4c3b4e5, parent 2c3ebcc)** by staff's
REQUEST CHANGES: "No unused hook lands on main" is categorical. It holds `autosave.ts`
(engine, injected clock), `autosaveTransport.ts` (`putAutosave`), `useAutosave.ts`, the
`copy.autosave` words and `useCoachForm`'s `extraDirty` (deleted from the merging branch).
EV-341b replays it: `git rebase --onto <main> 2c3ebcc feat/ev342o-autosave`. Before that
lands, staff's H1–H4 must be done:
- **H1 (blocking then):** `resolveConflict(key, version)` re-arms the idle timer with the
  coach's PENDING payload, so after a 409 the engine silently PUTs the stale answers at the
  new version = last-writer-wins with a delay, and the spec enshrines it. ADR-0034 Q6/B5 says
  re-read and SHOW BOTH. Fix: `resolveConflict(key, version, keep: P | null)` (null = take the
  server's, drop pending); test both branches.
- **H2:** `useAutosave`'s doc says `router.refresh()` on `onAccessEnded`; it must say
  `form.endAccess(() => router.refresh())` (the sentinel blocks the layout redirect).
- **H3:** the transport reads any non-JSON 2xx (a 204 too) as session ended; pin in the
  route handler's test that it always answers `{version, updatedAt}` JSON.
- **H4:** `extraDirty` comes back with a test where only the autosave queue is dirty and the
  guard asks.
- Also: ONE guarded form per page (two dirty islands = two sentinels, two stacked dialogs):
  the intake's sections must be one form or lift the guard.
The old progress-goal form helpers (`editField`/`markSent`/`reseedPreservingEdits`/
`seedFormState`) were DELETED from `progressGoal.ts`; `seedFields` stays.

**Rules that are not obvious from the names:**
- Four flags, each a past lost edit: `baseline` (unsaved = value differs from it), `edited`
  (since SENT: re-seed protection), `touched` (since SEEDED: EV-274 B4 body-fat key, survives a
  refused save), `abandoned` (403: stop guarding).
- A save that NAVIGATES passes it as `form.saved(stored, then)`. A `router.push` over the
  guard's sentinel entry leaves a dead Back press, and the guard's unmount cleanup then calls
  `history.back()` and steps the coach OFF the page they were sent to. `release` must run
  ONCE per save: two calls before the first popstate step back TWICE (why `release` is not
  on the hook's API).
- `saved()` releases synchronously when the form is clean (as the old editors do), and
  `useUnsavedChanges`' beforeunload now reads a layout-effect ref: the passive cleanup ran
  after "Saved." painted, and a reload in that window met the prompt, which Playwright
  dismisses = `net::ERR_ABORTED` (progress-goal :686, 4 of 6 runs). Specs that reload after
  a save whose notice was ALREADY on screen need `savedAndSettled` (guard gone + button back
  from « Saving… »).
- A 403 must `endAccess(() => router.refresh())`: with the sentinel current the refresh never
  reaches the layout's redirect to /clients/denied.
- Autosave transport is a `fetch` PUT with `redirect: "manual"` (ADR-0034 D34.10). Witnessed: a
  signed-out PUT through the real middleware is `opaqueredirect`/status 0 manual, and a 200
  HTML /login followed.
- Retry choice: status is `unsaved` from the FIRST failure (with `retrying`), 3 retries = 4
  attempts. That satisfies both O.1 ("three failures report « Non enregistré »") and the ADR's
  "retries up to 3 times". EN status words ("Saving…/Saved/Not saved") are mine, unconfirmed.
- `useAutosave` has NO production consumer until EV-341b (merge condition: "no unused hook").

**Test traps:**
- Sync on `history.state.evoliUnsavedGuard` (`armed`/`disarmed` in `qa/form-leave-guard.spec.ts`):
  a Back before the arm leaves for real, a Back before the disarm's own step goes two back.
- The shell renders TWO navs named "Portal"; one run had both in the a11y tree (strict-mode
  violation). Scope with `nav.shell-side-nav`.
- On base, every guard test times out in `armed` (60 s each): a red run of the file takes ~25 min.
- I broke a full run (606 red from test 596 on, `/api/auth/login` 404) by starting a SHORT
  targeted run on another port in the SAME checkout mid-run: both `next dev` share `.next`.
  The one-server-per-checkout rule covers a 20-second spec too; use a scratch worktree.
- Parallel branches all append to the configs' testIgnore/testMatch regex line, so a new
  roster-only spec file conflicts with every sibling that adds one. The challenge-dialog tests
  went INTO `qa/coach-challenges.spec.ts` (already roster-matched) to keep the configs untouched.

Sabotages that went red: engine allows a 2nd in-flight save; transport `redirect: "follow"`;
targets card without `{form.guard}`; re-seed ignoring `edited` (unit + the in-flight browser test).

Related: [[prehydration-adoption-hook-facts]], [[an-island-must-re-seed-from-props-not-from-its-own-save]],
[[progress-goal-absent-key-semantics]].
