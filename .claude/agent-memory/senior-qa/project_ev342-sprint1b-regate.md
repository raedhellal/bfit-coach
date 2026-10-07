---
name: project_ev342-sprint1b-regate
description: 2026-10-07 re-gate of train 3242f16 — BUG-699 (dialog backdrop) PASS 58/58; EV-342e chip fix rejected by senior-po mid-gate; how to probe a backdrop rule without false positives
metadata:
  type: project
---

**2026-10-07, b-fit-coach `train/ev342-sprint1b` @ 3242f16.** This is ba0ca15 plus two branches:
- EV-342e 4546e08: the chip fix for my tab-bar-jump row. I proposed that row as BUG-699; the hub filed it as **BUG-701**. Proposed IDs
  drift, so cite the hub's ID.
- BUG-699 a39bd6b: the dialog backdrop fix. This branch was cut FROM the train (ba0ca15), not from d7ab381.

What happened to each:
- **EV-342e:** senior-po rejected the fix while I was gating it. The ruling: no injury chip in any client header; on the overview the
  chips go below the tab bar. The tree was superseded, so the full suites and the 6 EV-342e asks were not run. The EV-342e verdict waits
  for the rebuilt train.
- **BUG-699: PASS.**
  - Run: FR+EN × Chromium+WebKit, 58 runs, 0 failed.
  - Q-1 covered 10 dialog/field cases; Q-3 the stages; Q-4 a touch tap at 390; Q-5 five field-less dialogs.

The session log is in the scratchpad `sprint1b-qa.md`, "Re-gate" section. Before this: [[project_ev342-sprint1-gate]].

**Why:** a coach merge is a production deploy ([[coach-portal-merge-is-release]]). A mid-gate ruling can void half a gate; stop at once
and log the tree as superseded.

**How to apply (rig facts for "the backdrop must not close a changed dialog"):**
- **Click point:** use (6 px, mid-height). Hit-test it first: it must be the `[data-modal-backdrop]` element, not the dialog.
- **"Nothing sent" check:** count POSTs that carry a `next-action` header. Settle about 800 ms after typing BEFORE you start counting.
  The CatalogPicker's 180 ms debounced search otherwise lands in the window and looks like the backdrop sent something.
- **CatalogPicker's filter selects are empty until the first search returns.** Poll the option count before you select.
- **Reopen check:** read the reopened value twice, at once and after 500 ms.
  - CatalogPicker's `useEffect([open])` reset shows the previous query for exactly 1 frame in Chromium (0 in WebKit). It is pre-existing
    and not reachable by a human.
  - A frame recorder (rAF loop on `input.value`) measures this; a Playwright read cannot.
- **Touch at 390:** launch with `hasTouch` + `isMobile` and tap with `page.touchscreen.tap`.
  - Body scroll: CDP `Input.synthesizeScrollGesture` with `gestureSourceType: "touch"`.
  - Chromium only. Focus staying in the field stands in for "the keyboard stays up".
- **Labels:** in a scratch probe, import `src/lib/copy` and `copy.fr`, and typecheck with a tsconfig that includes `qa-probes/`. This
  cost one run instead of five label-guessing runs.
