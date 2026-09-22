---
name: a-fixture-without-the-shape-cannot-guard-it
description: A regression guard is only as real as the fixture row that exercises it — sabotage the branch and watch the guard go red, or it is decoration
metadata:
  type: feedback
---

Before trusting a new assertion, **break the code it guards and watch it fail**. If no
fixture row carries the data shape the guard is about, the guard passes for the wrong
reason and will pass forever.

**Why:** EV-208. I wrote an "edge case 2 — a real 0-of-N is still a chart" guard against
Lina, who has a 0/4 *week*. I sabotaged the branch to `!weeks.some(w => w.hasPlan)` and
the guard stayed **green**: Lina has weeks with a plan, so the empty branch was never
reached, and the whole-series shape `done = 0, planned > 0` existed nowhere in
`coachApi.fixture.ts`. I added a trainee for it (24 prescribed, 0 done); with the shape
present, sabotaging to `if (series.done === 0)` turned it red as intended. Same family as
the round's other findings: BUG-210 pinned an AC's sentence with the changed token
wildcarded as `(.+)` and 242 tests never saw it.

**How to apply:**
- For a fix, run the new assertions against the **base commit** first. Restore just the
  spec + fixture (not the src fix) with `git checkout <stash-sha> -- <paths>` — that
  makes the red a real product red rather than a 403 for an unknown trainee id.
- For a *regression* guard, the base commit cannot make it red by construction. Sabotage
  the plausible wrong implementation instead and report that as the witness.
- Assert changed copy **literally**, with `{ exact: true }`, scoped to the block's region
  — never a regex that would also match the string being deleted. See
  [[playwright-gettext-is-case-insensitive-substring]].
- A new fixture trainee needs entries in `BASE_OVERVIEWS`, `PROGRESS` and `READINGS`;
  the roster is a separate list of functions, so an overview-only trainee does not change
  the roster count. `COACH_PORT=<free port>` — :3300 is often held by another session.
- Related: [[a-notice-already-on-screen-is-not-a-sync-point]],
  [[an-empty-state-must-name-what-was-absent]].
