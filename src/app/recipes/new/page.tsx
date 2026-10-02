import { BackLink } from "@/components/ui/BackLink";
import { CoachShell } from "@/components/shell/CoachShell";
import { RecipeEditor } from "@/components/recipes/RecipeEditor";
import { PageHead } from "@/components/ui/kit";
import { readCoachMe } from "@/lib/clientOverview";
import { blankRecipe } from "@/lib/recipeDocument";
import { getCopy } from "@/lib/i18n/server";

/**
 * /recipes/new — AC1's "New recipe".
 *
 * A route, not a modal: it is a long form on a phone, and a reload or a shared URL
 * should land in the same place. Nothing is read from the api here — a blank recipe has
 * no server state. The first successful save POSTs and corrects the URL to
 * `/recipes/{id}` without a remount (see `RecipeEditor.save`).
 */
export const dynamic = "force-dynamic";

export default async function NewRecipePage() {
  const copy = getCopy();
  const me = await readCoachMe();
  return (
    <CoachShell coachName={me?.displayName} section="recipes">
      <PageHead
        title={copy.recipes.newTitle}
        sub={copy.recipes.private}
        actions={
          <BackLink href="/recipes" label={copy.recipes.backToLibrary} />
        }
      />
      <RecipeEditor recipeId={null} initial={blankRecipe()} />
    </CoachShell>
  );
}
