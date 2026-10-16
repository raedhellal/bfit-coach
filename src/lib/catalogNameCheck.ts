/**
 * EV-341y2 YP6 — does the catalogue still have an exercise named EXACTLY `name`? Pure (the search
 * is injected), so `qa/intake-autosave-unit.spec.ts` runs it in node; `intakeCatalog.ts` (server
 * only) calls it with `coachApi.searchCatalog`.
 *
 * Why a search can answer it: b-fit-api's `GET /coach-portal/catalog/exercises` is
 * `SpringDataExerciseCatalogRepository.search` (api 443ac5d8): `lower(e.name) LIKE
 * lower('%'||q||'%') OR slug LIKE …`, `ORDER BY e.name`, over the active provider's rows (the
 * population `ExerciseSearchService.existingNames`, the intake save's check, reads), with `q`
 * only trimmed (`ExerciseSearchService.normalize`). So the matches are always a superset of the
 * exact row: "every match read, none exact" means absent.
 *
 * `false` (dropped) is answered ONLY when every match was received (staff y2 r1 S3: rows are
 * COUNTED as they arrive, never inferred from a page size the api may clamp lower). More than
 * `maxPages` pages, or a failed read, is `null`: not known, and the name stays unmarked.
 */
export interface NameSearchPage {
  items: { name: string }[];
  totalElements: number;
}

export type NameSearch = (name: string, page: number, size: number) => Promise<NameSearchPage>;

export const NAME_CHECK_PAGE_SIZE = 50;
export const NAME_CHECK_MAX_PAGES = 4;

export async function catalogueHasName(
  name: string,
  search: NameSearch,
  { size = NAME_CHECK_PAGE_SIZE, maxPages = NAME_CHECK_MAX_PAGES }: { size?: number; maxPages?: number } = {}
): Promise<boolean | null> {
  try {
    let seen = 0;
    for (let page = 0; page < maxPages; page++) {
      const result = await search(name, page, size);
      if (result.items.some((item) => item.name === name)) return true;
      seen += result.items.length;
      if (result.items.length === 0 || seen >= result.totalElements) return false;
    }
    return null;
  } catch {
    return null;
  }
}
