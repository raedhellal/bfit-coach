---
name: project_coach-s3m-gate
description: 2026-10-11 coach train/coach-s3m b98d780 (BUG-743/744 invariant-N lint bans) gate PASS; lint-ban red/green recipe (plants at base vs train, build, census, train spec on base), directive-hidden plants, outside-src hole QA-S3M-1
metadata:
  type: project
---

**2026-10-11, b-fit-coach `train/coach-s3m` @ b98d780** = 1d655a4 + `fix/bug743-744-prefetch-lint-bans` @5b7cf9d (merge tree = 5b7cf9d).
Session log: scratchpad `coach-s3m-qa.md`; artefacts scratchpad `s3m/` (logs/, plants/, rig/). Previous: [[project_coach-s3l-gate]].
PASS: start 66/66, session start+dev 102/2/0 each, default 1932/0 (+56 = the new spec), roster 325/1/0, all per file = s3l.

**Why:** BUG-743/744 are [GUARD] rows from my s3i findings (QA-S3I-1/2); a guard fix needs a red-then-green witness, not a green suite.

**How to apply (reusable):**
- **Lint-ban recipe:** `git archive` base and train into scratch, plant each evasion under `src/components/zzprobe/`, then compare
  `npm run lint`, `npx eslint -f json` (per-file counts), `tsc` and **`next build`** (base exit 0 = the evasion ships; train exit 1).
  Plant the old flagged shapes as a positive control on BOTH, or a clean base proves nothing.
- **Run the train's new spec on the base tree** (copy the spec + its .d.ts): 40 red / 16 green there proved the spec witnesses the fix.
- **Inline-directive plants pass `npm run lint`** (ESLint honours them); only `qa/invariant-n-lint-bans.spec.ts`'s census (:513, default
  config) goes red. Its failure label says "hidden by an inline directive" for ANY ban, directive or not.
- **Hole left (QA-S3M-1, P3, pre-existing at 1d655a4):** a plain `import NextLink from "next/link"` in a file OUTSIDE `src/` (e.g. `shared/`),
  imported by a src component, passes tsc, `npm run lint` (`--dir src --dir qa`), the census (src-only) and `next build` (its lint dirs
  are app/pages/components/lib/src). Only the start-config runtime walk caught it (8 red when TabBar used it).
- `coach-mainmerge` has NO node_modules; symlink `b-fit-coach/node_modules` (same lock).
- The session config's only edit for a 339x run is its four port constants; `diff` it against the repo file in the log.
