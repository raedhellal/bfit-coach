/**
 * EV-272 — the Swap sheet's type-ahead over the coach's own recipes. Pure, with no
 * server import, so `qa/coach-swap-recipes.spec.ts` can pin the rules without a page.
 *
 * The library is capped at 100 (EV-256a AC5) and read once per sheet opening, so the
 * search runs in the browser (story NOT-list 1): no request per keystroke.
 */

/** Case- and accent-insensitive form: "Crêpes aux ÉPINARDS" → "crepes aux epinards". */
export function foldForSearch(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/**
 * AC3 — a recipe matches when its name CONTAINS the trimmed query, ignoring case and
 * accents. The query is one substring, not words: "bowl oats" matches nothing. A query
 * of only spaces is the empty query (edge case 7), which matches everything.
 */
export function matchesQuery(name: string, query: string): boolean {
  const needle = foldForSearch(query.trim());
  return needle === "" || foldForSearch(name).includes(needle);
}

/**
 * AC2 — ascending distance between the recipe's kcal and the meal being replaced, ties
 * broken by name A→Z. Returns a new array; the input (the api's alphabetical list) is
 * left as it is.
 */
export function orderByKcalDistance<T extends { name: string; kcal: number }>(
  recipes: readonly T[],
  mealKcal: number
): T[] {
  return [...recipes].sort((a, b) => {
    const d = Math.abs(a.kcal - mealKcal) - Math.abs(b.kcal - mealKcal);
    if (d !== 0) return d;
    const byName = a.name.localeCompare(b.name, "en", { sensitivity: "base" });
    return byName !== 0 ? byName : a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });
}

/** Both at once: the rows the sheet shows for this query, in AC2's order. */
export function recipesFor<T extends { name: string; kcal: number }>(
  recipes: readonly T[],
  mealKcal: number,
  query: string
): T[] {
  return orderByKcalDistance(recipes, mealKcal).filter((r) => matchesQuery(r.name, query));
}
