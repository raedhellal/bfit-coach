---
name: project_coach-s3b-gate
description: 2026-10-09 coach train/coach-s3b fa23b84 (ten bug branches on a57868b) gate — rig facts: forged-token live probe with a recording stub, 629-alone merge-order witness, pro-roster-states runs in the DEFAULT config, WebKit/DPR traps in the 602 and 688 specs
metadata:
  type: project
---

**2026-10-09, b-fit-coach `train/coach-s3b` @ fa23b84** = a57868b (coach-s3a) + BUG-600, 629, 671, 667 (roster half), 688, 683, 707,
602, 536, 523. The session log is the scratchpad `coach-s3b-qa.md`; artefacts are under the scratchpad `s3b/`.

**Why:** a coach merge is a production deploy ([[coach-portal-merge-is-release]]), so the train needs base-red, train-green and a mutant
per bug before it ships.

**How to apply (reusable rig facts):**
- **Live mode needs no real api and no sign-in.** Middleware only DECODES the JWT. Forge an unsigned token
  (`{roles:["COACH"], exp:+1h}`) into the `evoli_pro_at` cookie. Point `API_BASE_URL` at a ~15-line node stub that journals every call and
  answers 400 INVALID_REQUEST for a non-UUID client id and 500 for everything else, or at a dead port for "api unreachable". One
  `next build` serves fixture and live, because the mode is read at runtime.
- **Merge-order claims get a single-branch build.** `git archive <tip-alone>`, build it, and probe it with the same stub. BUG-629
  alone turned a malformed id into a 500; the train (600 first) gives a 403 with 0 api calls.
- **`qa/pro-roster-states.spec.ts` is in the DEFAULT config**, not the roster config. The roster testMatch `pro-roster\.spec\.ts`
  does not match `pro-roster-states`. A roster-config run of it silently runs nothing.
- **A base without the branch's fixture switch is red for the WRONG reason.** BUG-523's `gateway_50x` cookie made the apply succeed on
  base. The meaningful red is the src-only revert mutant on the train tree.
- **WebKit traps:**
  - `button-label-contrast.spec.ts` refuses DPR 2. Desktop Safari is DPR 2, so set `deviceScaleFactor: 1`.
  - Its dialog-button focus step never reaches `:focus-visible` in WebKit. Witness the fill with computed style instead.
  - `field-focus-ring.spec.ts -g "swap sheet recipe search"` also selects the in-test "(webkit)" describe, which fails sign-in on a
    prod build (the Secure cookie). Filter with `-g "\(chromium\).*swap sheet"`.
- **Pre-existing, proposed at this gate:** `/clients/<id>/routine` and `/nutrition` with the overview read failing answer 200 and draw
  an EMPTY h1 (the header's name slot) plus an avatar with no initials. Base 6caecb8 behaves identically.
