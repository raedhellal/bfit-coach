import { copy } from "./copy";
import { firstName, formatInstant } from "./format";

/**
 * EV-283b — the two reads behind "the trainee changed this plan".
 *
 * Both FAIL CLOSED. The values cross an untyped JSON boundary, the fixture always sends
 * them, and an api that predates EV-283a sends neither — so a page that read them with
 * `!== false` or `!= null` would pass every browser test and put a claim on screen that
 * nobody made. `qa/routine-change-predicates.spec.ts` pins absent, null and malformed.
 */

/**
 * The banner's sentence, or null for no banner.
 *
 * Only a literal `TRAINEE` with a readable `lastChangedAt` makes a sentence. The api
 * says the instant is null exactly when the author is, so a TRAINEE without one is a
 * response this surface does not understand, and "changed this plan on —" would be a
 * broken sentence rather than a warning. The name is `firstName` — the portal's one rule
 * ("Lina M." → "Lina"; an empty name reads "This trainee"), shared with EV-202/EV-256e.
 *
 * Keyed on `lastChangedBy`, NOT on `changedSinceYourPublish` — the story's rule. A
 * trainee this coach never published to who edited their own plan still gets the
 * banner: the coach is still about to publish over their version.
 */
export function traineeChangeNotice(
  routine: { lastChangedBy?: unknown; lastChangedAt?: unknown } | null | undefined,
  traineeDisplayName: string | null | undefined
): string | null {
  if (!routine || routine.lastChangedBy !== "TRAINEE") return null;
  const at = routine.lastChangedAt;
  if (typeof at !== "string" || Number.isNaN(new Date(at).getTime())) return null;
  return copy.routine.traineeChanged(firstName(traineeDisplayName ?? ""), formatInstant(at));
}

/** The roster's "Plan changed" marker: a literal `true` only. */
export function rosterPlanChanged(
  row: { routineChangedSinceYourPublish?: unknown } | null | undefined
): boolean {
  return row?.routineChangedSinceYourPublish === true;
}
