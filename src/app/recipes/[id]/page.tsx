import Link from "next/link";
import { CoachShell } from "@/components/shell/CoachShell";
import { ClientNotice } from "@/components/client/ClientNotice";
import { RecipeEditor } from "@/components/recipes/RecipeEditor";
import { PageHead } from "@/components/ui/kit";
import { coachApi, isForbidden, type CoachRecipe } from "@/lib/coachApi";
import { readCoachMe } from "@/lib/clientOverview";
import { fromRecipe } from "@/lib/recipeDocument";
import { copy } from "@/lib/copy";

/**
 * /recipes/[id] — the editor on an existing recipe (AC2, AC6).
 *
 * Two failure states, NOT one sentence:
 *   · 403 → `notYours`. The api answers ONE body for a foreign recipe, an id that never
 *     existed and one deleted in another tab (EV-256a AC6), so the portal renders one
 *     sentence — three would turn the page into the existence oracle the api refuses
 *     to be.
 *   · anything else → the load error. The api being down says nothing about ownership.
 *
 * Never `notFound()`: a 404 page would say "this does not exist", which is the fact the
 * 403 exists to withhold.
 */
export const dynamic = "force-dynamic";

export default async function RecipePage({ params }: { params: { id: string } }) {
  const [me, loaded] = await Promise.all([
    readCoachMe(),
    coachApi
      .getRecipe(params.id)
      .then((recipe): { recipe: CoachRecipe | null; forbidden: boolean } => ({
        recipe,
        forbidden: false,
      }))
      .catch((err: unknown) => ({ recipe: null, forbidden: isForbidden(err) })),
  ]);

  return (
    <CoachShell coachName={me?.displayName} section="recipes">
      <PageHead
        title={loaded.recipe ? loaded.recipe.name : copy.recipes.editTitle}
        sub={copy.recipes.private}
        actions={
          <Link href="/recipes" style={{ fontSize: 13, color: "var(--ink-2)" }}>
            {copy.recipes.backToLibrary}
          </Link>
        }
      />
      {loaded.recipe ? (
        <RecipeEditor
          recipeId={loaded.recipe.id}
          initial={fromRecipe(loaded.recipe)}
          unknownKeys={loaded.recipe.unknownKeys}
        />
      ) : (
        <ClientNotice message={loaded.forbidden ? copy.recipes.notYours : copy.recipes.loadError} />
      )}
    </CoachShell>
  );
}
