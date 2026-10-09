---
name: project_coach-s3d-gate
description: 2026-10-09 coach train/coach-s3d 75d9688 (BUG-713 + BUG-714 nameless trainee) gate — PASS; live-mode null-name stub when Docker is down, probe timeout traps, ZWJ-only name gap proposed as BUG-717
metadata:
  type: project
---

**2026-10-09, b-fit-coach `train/coach-s3d` @ 75d9688** = 198a293 (s3a+s3b+s3c, merged locally) + `fix/bug-714-nameless-trainee`
51f7faa (holds BUG-713 60edded). **Verdict: PASS.** Default 1696/0, roster 285 + 1 skip. Live (9) on a real api was BLOCKED (Docker down).
Session log: scratchpad `coach-s3d-qa.md`; artefacts under scratchpad `s3d/` (rig/, logs/, shots/). Previous: [[project_coach-s3c-gate]].

**Why:** a coach merge is a production deploy ([[coach-portal-merge-is-release]]), and BUG-714 is a P1 (one nameless trainee takes the roster down).

**How to apply (reusable):**
- **When Docker is down, a live-mode stub still witnesses the wire shape.** `next start` with no COACH_API_MODE, `API_BASE_URL` at a node
  stub serving `/coach-portal/me` {coachId, displayName, tier:"STARTER", active, capacity}, `/coach-portal/clients` {items, page, size,
  totalElements, totalPages} and `/coach-portal/clients/{id}` (overview with `scopes: []` keeps the other reads away). The invited read may 404:
  the roster stands. File: `s3d/rig/stub-nullname.mjs`. Record it as a stand-in, never as the live-api AC.
- **`[data-nav-progress-ready]` is not visible.** `waitFor()` (state visible) burns its whole timeout on every open. Use `toHaveCount(1)` or
  `state: "attached"`.
- **Playwright's default `actionTimeout` is 0.** On a base where the page crashed, one `selectOption` waits for the TEST timeout (4 min).
  Set `actionTimeout` in the gate config before a red-first run.
- **A node probe script must run from a tree that has `node_modules`.** Run from `rig/` and you get ERR_MODULE_NOT_FOUND 'playwright'.
  Copy it into the archived tree.
- **Soft-assert probes give the whole red matrix on a base.** Write jsonl facts and use `expect.soft`, then attribute each mutant's reds by
  message. One tree can carry several mutants if their predicted red sets are disjoint.
- **Name edge cases outside "whitespace":** JS `trim()` covers NBSP, U+3000 and tab, but not ZWJ/ZWNJ. The api's `NAME_TEXT` admits
  ZWJ/ZWNJ, and `normalizeFullName` only Java-trims, so a "‍" name renders as an invisible name. Proposed as BUG-717 (P3).
