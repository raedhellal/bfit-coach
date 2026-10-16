import "server-only";
import { catalogueHasName, type NameSearch } from "./catalogNameCheck";
import { coachApi } from "./coachApi";

/**
 * EV-341y2 — the two catalogue facts the interview page needs, read on the server with the
 * page's other reads (never from the island):
 *
 *   · YP1: the `muscles` facet of `GET /coach-portal/catalog/exercises`, the ONLY vocabulary of
 *     `GOALS.emphasis` (EV-341y1 Y1, ruling 1: "the interview uses that set, never its own").
 *     A stored value missing from it is a value the catalogue dropped (YP6b);
 *   · YP6: which stored exercise names the catalogue no longer returns.
 *
 * The api has no "is this name in the catalogue" read for the portal (`existingNames` is the
 * intake save's own check), so a name is looked up through the SAME search the picker uses
 * (`catalogNameCheck.ts`, which cites the api query that makes this sound). A name is reported
 * dropped ONLY when every match was received and none is exactly it. When the matches run past
 * the page limit, or a read fails, the answer is "not known", and the name is shown unmarked: the mark is a claim, and a claim needs a
 * witness (YP6 says the page never removes the name either way, so nothing is lost by not
 * marking it).
 */

/** The facet, or null when the catalogue could not be read (unavailable, or any failure). */
export async function readMuscleFacet(): Promise<string[] | null> {
  try {
    const page = await coachApi.searchCatalog("", "", "", { page: 0, size: 1 });
    return Array.isArray(page.muscles) ? page.muscles.filter((m): m is string => typeof m === "string") : null;
  } catch {
    return null;
  }
}

const search: NameSearch = (name, page, size) => coachApi.searchCatalog(name, "", "", { page, size });

/** The names among `names` the catalogue certainly no longer has, in the order given. */
export async function droppedExerciseNames(names: readonly string[]): Promise<string[]> {
  const unique = Array.from(new Set(names.filter((n) => typeof n === "string" && n.trim() !== "")));
  if (unique.length === 0) return [];
  const answers = await Promise.all(unique.map((name) => catalogueHasName(name, search)));
  return unique.filter((_, i) => answers[i] === false);
}
