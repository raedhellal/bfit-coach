---
name: feedback-reread-the-id-counter-before-allocating
description: Re-read BACKLOG.md's top counter and the live board immediately before allocating an EV id; other passes allocate in parallel
metadata:
  type: feedback
---

**Immediately before allocating an EV id, re-read the counter at the top of `BACKLOG.md` and check the
board.** Never take "next free" from my own previous pass.

**Why:** on 2026-09-23 I wrote a new story as `EV-221` using the "next free" from my last pass. A
separate coach-MVE planning pass had already allocated `EV-221` to `EV-247` (commit `7c7ac98`) and
put them on the board. It was caught only because my sync script asserts the key doesn't already
exist, and the dry-run showed the real `EV-221` as `EVO-69`. It's the same failure I'd been noting in
others that day: a count carried forward from memory instead of measured again.

**How to apply:**
- `sed -n '1,6p' docs/product/BACKLOG.md`, and `grep` `issues.json` for the candidate key, before
  writing the story file.
- Keep the `assert not any(i["key"]==NEW)` check in every script that adds a card. It's what caught
  this.
- If a collision is found after files are written, renumber **only my own references**. The real
  holder of the id is referenced elsewhere, so a blanket replace would corrupt it. Note the renumber
  in the story header.
- Update the live counters I own (`BACKLOG.md` top, `ROADMAP.md`); leave dated scoping docs as the
  record they are.
