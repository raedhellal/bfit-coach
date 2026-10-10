import NewTemplatePage from "../new/page";
import TemplatePage from "../[id]/page";

/**
 * BUG-739 — the ONE route behind `/templates/new` and `/templates/{id}` (the rewrites in
 * `next.config.mjs` say why). The id arrives in the query: empty is « New template ».
 *
 * It renders the two page modules it replaces as routes, so their reads, the 403/load-error
 * branch and the copy stay where they were. Server components leave no level in the client tree,
 * so the editor sits at the same element position under either branch, and an id that changes
 * (a create, then its first update) reaches the same editor instance.
 *
 * `String(…)`: a repeated `?id=a&id=b` is an array, which becomes "a,b" and so reaches the
 * existing-record branch (the api refuses it: load error), never the new one.
 *
 * Its own `dynamic`: an imported module's route config is not read.
 */
export const dynamic = "force-dynamic";

export default function TemplateEditorPage({ searchParams }: { searchParams: { id?: string | string[] } }) {
  const id = String(searchParams.id ?? "");
  return id === "" ? <NewTemplatePage /> : <TemplatePage params={{ id }} />;
}
