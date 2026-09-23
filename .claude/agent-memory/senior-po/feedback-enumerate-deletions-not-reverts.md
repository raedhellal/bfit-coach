---
name: feedback-enumerate-deletions-not-reverts
description: A drop-path or rollback offer must be enumerated as discrete deletions, never as commit reverts — a revert silently carries test methods with it
metadata:
  type: feedback
---

**When offering Raed a drop-path or rollback, enumerate it as DISCRETE DELETIONS, never as COMMIT
REVERTS.** A revert **silently carries test methods with it**, so the leg count and the resulting tree
disagree.

**Why:** on BUG-211 the count was wrong **three times** — two legs, then three, then four; the answer
was **five**. The cause was not sloppy measurement: `senior-qa` corrected the record *in its own
disfavour* and showed leg E had hidden **inside its own enumeration** — its first leg read *"revert
`2cac05f` and `6f2f427`"*, and reverting the test commit took a test method with it. **Both parties'
terminal trees were identical; only the intermediate rows differed. The count stayed wrong through
three tellings while the trees were being measured correctly** — the measurement was right and the
*description* of it was wrong.

**How to apply:**
- Every leg = one concrete file/method deletion, named.
- The arithmetic check (*"179 − 176 = 3 test methods"*) checks **methods removed** and is **only
  decisive once each leg is a single concrete deletion**; against a revert-shaped leg it proves
  nothing.
- Confirm a terminal tree with a **full-suite** run, not a package run — *"is there a sixth leg"*
  cannot be settled inside one package.
- 🔴 **Impact analysis: grep for everything that READS an artefact, not only for what tests its
  behaviour.** Leg E was `theV58Backfill…`, not a test of the read boundary at all — it loads the
  migration **off the classpath** to run the statement verbatim. A behaviour-shaped grep never finds
  that, and that is exactly why the count came up short.
