---
name: project_ev218-gate
description: EV-218 gate 2026-09-23 — PASS at ab3e134 (inline denylist deleted, Lina [3,4,2]); BUG-227 glyph bar + BUG-228 zero-height outline [GUARD]; weekday-sim method; next-lint-creates-.next trap
metadata:
  type: project
---

**EV-218 gated PASS at `ab3e134`, 2026-09-23** (base `969519c`). Worktree
`/Users/raedhelal/Desktop/b-fit/qa-ev218-wt` (detached). First row in this family that changes `src/`
(`src/lib/coachApi.fixture.ts`), so the push is not byte-equivalent — see [[coach-portal-merge-is-release]].

## Log (appended as it happens)
- worktree created at ab3e134.
- package.json/lock identical to 969519c (diff --quiet exit 0); node_modules symlinked from main checkout.
- `npx tsc --noEmit` exit=0; `npm run lint` exit=0.
- 🔴 TRAP: `next lint` CREATES `.next` (eslint cache + more). A build run after lint is NOT cold. Removed `.next`, confirmed absent, `npm run build` exit=0 (cold).
- Client bundle: grep `.next/static` for Lina's name / UUID → nothing; only hit for `adherenceSeries` is the copy.ts key "Adherence, last 8 weeks". Server chunks 340.js/125.js carry the fixture.
- Ports 3371–3376 lsof-free at start.
- `COACH_PORT=3371 npx playwright test` → **262 passed (2.5m), exit=0** (log /private/tmp/claude-501/ev218-gate.log).
- `qa/coach-monitoring.spec.ts` alone (port 3372) → **22 passed, exit=0** (tile test :108 green at 3 / 4).
- roster config (3373) → **18 passed, exit=0**. `--list` tip exit=0 **262 in 16 files**; base 969519c `--list` exit=0 **261 in 16 files**.
- Roster diff (line nos stripped): 5 titles renamed (describe "+ / EV-218"; Lina's world name "partial current week (2 / 4)" → "done > plannedSoFar >= 1 current week (3 / 4, plannedSoFar 2)"), +1 "P-ADH C2 (EV-218): the done > plannedSoFar >= 1 world is still read…". Nothing removed.
- Text findings: (a) 4th stale weekday copy — web-engineer/done-can-exceed-plannedsofar.md:27 "stops discriminating by Friday" (branch-touched file; [1,3] stops from Tuesday). (b) fixture Lina comment says "ADR-0024 also bounds the reachable ratios" present tense — corrected ADR withdraws that. (c) banner "This FILE still matches one spelling" — the /NaN|Infinity/i matcher occurs TWICE (:303 geometry loop, :408 "the 1 / 0 week" test); the EV-218 record itself says "both text matchers". (d) fixture elapsedThisWeek uses getUTCDay → "Monday" = UTC Monday.
- Deleted-constant mentions: all in past tense / "deleted since, by EV-218". None present-tense.
- Probe (.probe/probe.cjs in mutant worktree qa-ev218-mut, dev server :3374): viewport clip + 24px pad, scanlines y=3/7/11/14, pad band = 4px just outside the row (a 24px band caught neighbour rows' honest bars — first-cut trap). CONTROL clean code: every world's current row 0.000 all scanlines, pad 0.000.
- C3 (`linear-gradi\65 nt`, R=done/plannedSoFar, React style on current li): PROBE Lina current 0.962/0.943/0.922/1.000 (= implementer's numbers), computed linear-gradient(…150%…); Ines 0.000 / none. File run: **3 failed (Lina, Tobias, Noor), Ines green, exit=1**, 3× `[background-image on its own box]`. Claim reproduced.
- W1 GLYPH BAR (current week's empty middle cell gets `"█".repeat(round(min(1, done/plannedSoFar)*100)||0)` in blue text): PROBE Lina current **0.706/0.706/0.706** beside "3 / 4 sessions" (control 0.000); Ines current 0.706 beside "1 / 3 sessions"; Tobias/Noor 0.000 (0 glyphs). Screenshots W1-*-current.png in b-fit-mobile/docs/qa/evidence/2026-09-23-EV-218-gate/. Whole gate running…
- **W1 whole gate (port 3375): 262 passed, exit=0** with the glyph bar painting on Lina + Ines. NEW axis, not carded: the geometry limb defines a picture as a TEXT-FREE leaf (spec :156/:170), so a bar written in glyphs has a full-width box (894x10, ratio NOT in the box → not EV-220) and paints via `color` (no channel). Grep of spec/stories/BUGS/ADR for glyph/█/text-bar: only EV-219's ::marker \2588 dud. → file as [GUARD].
- W2 OUTLINE on the current week's ZERO-HEIGHT placeholder cell (`height:0; width:min(100,R)%; outline:5px solid blue`). First plant used `outline-offset:-5px` → **DUD**, 0.000 everywhere (negative offset collapses the ring on a 0-high box) — excluded. Rebuilt with offset 0: PROBE Lina current **0.842×3** beside "3 / 4 sessions"; Ines 0.845 (Infinity% dropped → width auto = full); Tobias/Noor 0.009 (10px square). midBox 894x0 → geometry's `paints: height>0.5` filter drops it. Whole gate running…
- **W2 whole gate: 262 passed, exit=0.** Falsifies the geometry filter comment at spec :182 ("It has a width but no height, so it paints nothing") — pre-existing EV-210b text, not EV-218's. Closest card is EV-220 (ratio in the box) but its AC1 probe (ordinary coloured div WITH height) would come back "caught" and miss this; hand to senior-po.
- Pre-existence: renderer byte-identical base vs tip. At 969519c (base worktree, port 3376) adherence+monitoring with W2 → 38 passed exit=0; with W1 → 38 passed exit=0. Both holes PRE-DATE EV-218 → not conditions on it.
- ExpA (override code broken `plannedSoFar: derivedSoFar`, tuple text intact, NO mutant, real Wed 2026-09-23 UTC): **whole gate 262 passed, exit=0** — "nothing notices the override being ignored" WITNESSED.
- ExpC (broken + C3, real Wed): PROBE Ines current computes `…50%…` (stated 1/0 → derived 1/2, breakage fired), Lina still 150% (derived Wed = 2 = stated). File: **4 failed (all four worlds), exit=1** = file's "4 failed".
- Weekday sim = fixture `elapsedThisWeek = Number(process.env.QA_ELAPSED ?? real)` (self-witnessing: env not reaching webServer ⇒ Wednesday ⇒ 4 failed).
- ExpB (QA_ELAPSED=0 Monday, broken + C3): PROBE every world's current row 0.000, computed none. **Whole gate 262 passed, exit=0.** File says "263" — this tip has 262 tests; the number in the disclosure is wrong by one (substance right).
- ExpD (broken + C3): Tue (elapsed 1) **4 failed**; Sun (elapsed 6) **4 failed** → exposure is Monday ONLY (UTC Monday, getUTCDay).
- ExpE (override INTACT, Mon, C3): **1 failed — Lina alone**, `[background-image on its own box]` linear-gradient(…150%…). Guard as shipped holds on Monday. Clean Monday adherence+monitoring: **39 passed, exit=0** (no Monday false positive).
- Base witness (969519c, QA_ELAPSED=0, override broken, PLAIN B3 `linear-gradient`): **4 failed, all `DECLARES a background image`** → the inline read DID cover Monday before; "what is new is that the paint limb now depends on it" is TRUE. (First attempt void: my own :3376 probe server held the port — killed it, re-ran on :3377.)
- Clause 4 WHOLE GATE (real Wed, C3 planted & previously probed painting, `background-image on its own box` removed, pin 18): **262 passed, exit=0** (3.6m) — matches the file.
- Witness map verified vs file: Ines keeps AC3 geometry loop (:370), "the 1 / 0 week" (:389), source pin (:426) — all in the EV-210b AC3/C2 describe; C3 describe = Ruben/Elif/Noor(real 0%)/Kaia, no Ines.
- AC1 constructions 1 (var hop), 2 (--é-paint), 4 (`/*;*/` in value — attribute verified to carry it): each PROBED Lina current 0.962/0.943/0.922/1.000 computed linear-gradient(…150%…), Ines 0.000/none; each file run **3 failed (Lina, Tobias, Noor), Ines green, exit=1**. With C3 above: all four red, all via Lina.
- "Nothing in the portal renders plannedSoFar" (fixture) TRUE in code; stale pre-existing comment src/lib/coachApi.ts:458 says "the portal renders plannedSoFar in the bar".
- Filed on hub branch `qa/ev218-gate-guard-rows` `1e741ae` (NOT merged — BUG-226 was claimed first on another agent's unmerged branch `b2ae641`, merge that first): **BUG-227** (W1 glyph bar) and **BUG-228** (W2 zero-height outline), both [GUARD] P2, pre-existing. Evidence docs/qa/evidence/2026-09-23-EV-218-gate/.
- Worktrees removed; probe servers killed.

## Verdict: PASS. Non-blocking corrections handed back
- S1 says the Monday whole gate was "263"; this tip has 262 tests (substance witnessed: 262 green). "blind on Mondays" is really blind to a renderer whose value the parser DISCARDS (parseable paint is still read), and the Monday is a UTC Monday.
- 4th stale weekday copy: web-engineer/done-can-exceed-plannedsofar.md "by Friday".
- "ADR-0024 also bounds / adds a bound" (fixture + spec EV-218 block) is present tense, but the corrected ADR withdrew the bound.
- Banner "This FILE still matches one spelling": the same regex appears in TWO tests (:303, :408), and the record itself says "both text matchers".
- Map "Ines LOSES her C2 paint witness" under-claims: she loses it only for a done/plannedSoFar renderer, and her rows are still read.
- Story AC1 When/Then bullets and the DoD still say "construction 3 total form on Ines's row", which is green by design under (d). Card wording, senior-po's.
- ADR/DoD "No production behaviour changes": true in live mode only. The fixture ships in server chunks, and whether Vercel runs fixture mode is unwitnessed.

**How to apply / traps:** (1) `next lint` CREATES `.next`, so for a cold build run lint first, then `rm -rf .next`, then build. (2) A weekday sim via env on the fixture's `elapsedThisWeek` is self-witnessing (if the env is lost, it is Wednesday and red). (3) Before binding a port for a Playwright run, make sure my own probe server is not on it; a collision gives a "void" run with no pass/fail line. (4) Before taking a BUG id, grep other agents' scratchpads under the SAME session dir too. (5) The geometry limb's "picture" = a text-free leaf with height > 0.5: text and zero-height boxes are outside it (BUG-227/228). Related: [[project_ev216-gate]], [[project_ev214-gate]], [[coach-portal-merge-is-release]].
