import { CoachShell } from "@/components/shell/CoachShell";
import { ClientNotice } from "@/components/client/ClientNotice";
import { RecipeLibrary } from "@/components/recipes/RecipeLibrary";
import { PageHead } from "@/components/ui/kit";
import { coachApi, type CoachRecipeList } from "@/lib/coachApi";
import { readCoachMe } from "@/lib/clientOverview";
import { copy } from "@/lib/copy";

/**
 * /recipes — EV-256b AC1, the coach's own recipe library.
 *
 * `force-dynamic` for the reason every screen here has it: ADR-0012 D3 forbids caching
 * an authorization outcome, and a cached library would survive a sign-out.
 *
 * One read, and three explicit states: load error · empty library · the list. It reads
 * no trainee — a recipe belongs to none (EV-256a AC9), and putting one on a trainee's
 * meal is EV-256e, which is not in this row.
 */
export const dynamic = "force-dynamic";

export default async function RecipesPage() {
  const [me, library] = await Promise.all([
    readCoachMe(),
    coachApi
      .listRecipes()
      .then((value): CoachRecipeList | null => value)
      .catch(() => null),
  ]);

  return (
    <CoachShell coachName={me?.displayName} section="recipes">
      <PageHead title={copy.recipes.title} sub={copy.recipes.subtitle} />
      {library === null ? (
        <ClientNotice message={copy.recipes.loadError} />
      ) : (
        <RecipeLibrary library={library} />
      )}
    </CoachShell>
  );
}
