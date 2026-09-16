---
name: defect-pattern-cited-seam-does-not-exist
description: Recurring ADR defect — a decision is justified by a field, test or overload that is cited with a file:line but does not exist there; always open the cited line
metadata:
  type: feedback
---

When reviewing an ADR or story on Evoli, **open every cited `file:line` before accepting the
decision that rests on it.** The recurring failure is not bad reasoning — it is a correct-looking
citation pointing at something that is not there.

**Why:** ADR-0015 round 1 produced four of these in one document, each load-bearing:
- D5 claimed the coach-portal roster/overview responses "already carry the link's `scopes`,
  the same list `CoachPortalQueryService:375` echoes". `:375` is `myCoach(UUID traineeId)` —
  the *trainee's* `/me/my-coach`. Neither coach-portal response record has a `scopes` component.
  The decision's whole resolution mechanism did not exist.
- The test-strategy table called the `/me/**` byte-identity assertion "the negative suite's
  **existing** case" and "the one assertion that covers every decision at once".
  `OwnershipAuthzSuiteTest` asserts status codes and no-leak; it has no body-identity case at all.
- D4 said BUG-053 makes equipment "a parameter of the same call". On that branch the 1-arg and
  2-arg `RoutinePolicy.apply` overloads are **deleted**, leaving one 3-arg form — a compile break,
  not an addition.
- The ADR named EV-040c's migration "V47" throughout. `V47__refresh_token_rotation.sql` belongs to
  a different branch; EV-040c's branch carries no migration yet.

**How to apply:** for every ADR decision, list the facts it is standing on, then verify each one
with `git show <branch>:<path>` / `grep` before writing the verdict. A citation with a line number
reads as verified and usually is not. Report "I verified X by running Y" per fact, and say plainly
which ones could not be verified (e.g. deployed env-var values that live outside the repo).

Related: [[defect-pattern-bound-that-does-not-bound]]
