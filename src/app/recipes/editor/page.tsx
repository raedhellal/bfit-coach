import NewRecipePage from "../new/page";
import RecipePage from "../[id]/page";

/**
 * BUG-739 — the ONE route behind `/recipes/new` and `/recipes/{id}` (the rewrites in
 * `next.config.mjs` say why). The id arrives in the query: empty is « New recipe ».
 *
 * It renders the two page modules it replaces as routes, so their reads, the UUID check, the
 * 403/load-error branch and the copy stay where they were. Server components leave no level in
 * the client tree, so the editor sits at the same element position under either branch, and an
 * id that changes (a create, then its first update) reaches the same editor instance.
 *
 * `String(…)`: a repeated `?id=a&id=b` is an array, which becomes "a,b" and so reaches the
 * existing-record branch (not-yours / load error), never the new one.
 *
 * Its own `dynamic`: an imported module's route config is not read.
 */
export const dynamic = "force-dynamic";

export default function RecipeEditorPage({ searchParams }: { searchParams: { id?: string | string[] } }) {
  const id = String(searchParams.id ?? "");
  return id === "" ? <NewRecipePage /> : <RecipePage params={{ id }} />;
}
