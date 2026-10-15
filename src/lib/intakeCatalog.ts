import "server-only";
import { coachApi, type CatalogPage } from "./coachApi";

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
 * intake save's own check), so a name is looked up through the SAME search the picker uses:
 * `q=<name>` is a case-insensitive substring match, sorted by name, so the exact row is among the
 * matches if it exists. A name is reported dropped ONLY when every match was read and none is
 * exactly it. When the matches run past `MAX_PAGES` pages, or a read fails, the answer is "not
 * known", and the name is shown as it is, unmarked: the mark is a claim, and a claim needs a
 * witness (YP6 says the page never removes the name either way, so nothing is lost by not
 * marking it).
 */

/** The api's page-size clamp (`MAX_CATALOG_PAGE_SIZE`). */
const PAGE_SIZE = 50;
/** 200 matching rows per name at most; a name that common is not worth more reads to mark. */
const MAX_PAGES = 4;

/** The facet, or null when the catalogue could not be read (unavailable, or any failure). */
export async function readMuscleFacet(): Promise<string[] | null> {
  try {
    const page = await coachApi.searchCatalog("", "", "", { page: 0, size: 1 });
    return Array.isArray(page.muscles) ? page.muscles.filter((m): m is string => typeof m === "string") : null;
  } catch {
    return null;
  }
}

/** True: the catalogue has a row named exactly `name`; false: it has none; null: not known. */
async function catalogueHasName(name: string): Promise<boolean | null> {
  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      const result: CatalogPage = await coachApi.searchCatalog(name, "", "", { page, size: PAGE_SIZE });
      if (result.items.some((item) => item.name === name)) return true;
      const read = page * PAGE_SIZE + result.items.length;
      if (result.items.length === 0 || read >= result.totalElements) return false;
    }
    return null;
  } catch {
    return null;
  }
}

/** The names among `names` the catalogue certainly no longer has, in the order given. */
export async function droppedExerciseNames(names: readonly string[]): Promise<string[]> {
  const unique = Array.from(new Set(names.filter((n) => typeof n === "string" && n.trim() !== "")));
  if (unique.length === 0) return [];
  const answers = await Promise.all(unique.map(catalogueHasName));
  return unique.filter((_, i) => answers[i] === false);
}
