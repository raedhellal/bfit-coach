import { BackLink } from "@/components/ui/BackLink";
import { CoachShell } from "@/components/shell/CoachShell";
import { ClientNotice } from "@/components/client/ClientNotice";
import { RecipeEditor } from "@/components/recipes/RecipeEditor";
import { PageHead } from "@/components/ui/kit";
import { ApiError, coachApi, isForbidden, type CoachRecipe } from "@/lib/coachApi";
import { readCoachMe } from "@/lib/clientOverview";
import { blankRecipe, fromRecipe } from "@/lib/recipeDocument";
import { getCopy } from "@/lib/i18n/server";

/**
 * The recipe editor: the ONE route behind `/recipes/new` and `/recipes/{id}` (BUG-739; the
 * rewrites in `next.config.mjs` say why). The id arrives in the query: empty is « New recipe »
 * (AC1), anything else is an existing recipe (AC2, AC6). EV-362 merged the two page modules this
 * route used to render into this file and deleted them; there is no `new/` or `[id]/` folder.
 *
 * One return for both branches: `CoachShell > [PageHead, RecipeEditor | ClientNotice]`. The
 * editor sits at the same element position whatever the id, so an id that changes (a create,
 * then its first update) reaches the SAME editor instance. A different record is a fresh editor
 * all the same: the editor re-keys itself on a new record (`useEditorIdentity`).
 *
 * A route, not a modal: it is a long form on a phone, and a reload or a shared URL should land in
 * the same place. A new recipe reads nothing from the api: a blank recipe has no server state.
 * The first successful save POSTs and corrects the URL to `/recipes/{id}` without a remount (see
 * `RecipeEditor.save`).
 *
 * An existing recipe has two failure states, NOT one sentence:
 *   · 403 → `notYours`. The api answers ONE body for a foreign recipe, an id that never
 *     existed and one deleted in another tab (EV-256a AC6), so the portal renders one
 *     sentence — three would turn the page into the existence oracle the api refuses
 *     to be.
 *   · anything else → the load error. The api being down says nothing about ownership.
 *
 * Never `notFound()`: a 404 page would say "this does not exist", which is the fact the
 * 403 exists to withhold.
 *
 * `String(…)`: a repeated `?id=a&id=b` is an array, which becomes "a,b" and so reaches the
 * existing-record branch (not-yours, by the UUID check), never the new one.
 */
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Loaded = { recipe: CoachRecipe | null; forbidden: boolean };

function loadRecipe(id: string): Promise<Loaded> {
  /**
   * An id that is not a UUID is not the id of any recipe, so it is answered with the AC6
   * sentence WITHOUT an api call. Sent on, the live api's UUID conversion refuses it with a
   * 400 and the coach would read "could not be loaded" for a URL that was simply never a
   * recipe.
   */
  return (
    UUID.test(id)
      ? coachApi.getRecipe(id)
      : Promise.reject(new ApiError(403, "Not a recipe id", "COACH_ACCESS_DENIED"))
  )
    .then((recipe): Loaded => ({ recipe, forbidden: false }))
    .catch((err: unknown): Loaded => ({ recipe: null, forbidden: isForbidden(err) }));
}

export default async function RecipeEditorPage({ searchParams }: { searchParams: { id?: string | string[] } }) {
  const copy = getCopy();
  const id = String(searchParams.id ?? "");
  /** `null`: a new recipe, nothing to load. */
  const [me, loaded] = await Promise.all([readCoachMe(), id === "" ? null : loadRecipe(id)]);

  const title = loaded === null ? copy.recipes.newTitle : loaded.recipe ? loaded.recipe.name : copy.recipes.editTitle;
  return (
    <CoachShell coachName={me?.displayName} section="recipes">
      <PageHead
        title={title}
        sub={copy.recipes.private}
        actions={<BackLink href="/recipes" label={copy.recipes.backToLibrary} />}
      />
      {loaded === null ? (
        <RecipeEditor recipeId={null} initial={blankRecipe()} />
      ) : loaded.recipe ? (
        <RecipeEditor
          recipeId={loaded.recipe.id}
          initial={fromRecipe(loaded.recipe, copy.locale)}
          unknownKeys={loaded.recipe.unknownKeys}
          storedMealSlots={loaded.recipe.mealSlots}
        />
      ) : (
        <ClientNotice
          message={loaded.forbidden ? copy.recipes.notYours : copy.recipes.recipeLoadError}
          back={{ href: "/recipes", label: copy.recipes.backToLibrary }}
        />
      )}
    </CoachShell>
  );
}
