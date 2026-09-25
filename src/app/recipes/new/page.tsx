import Link from "next/link";
import { CoachShell } from "@/components/shell/CoachShell";
import { RecipeEditor } from "@/components/recipes/RecipeEditor";
import { PageHead } from "@/components/ui/kit";
import { readCoachMe } from "@/lib/clientOverview";
import { blankRecipe } from "@/lib/recipeDocument";
import { copy } from "@/lib/copy";

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
  const me = await readCoachMe();
  return (
    <CoachShell coachName={me?.displayName} section="recipes">
      <PageHead
        title={copy.recipes.newTitle}
        sub={copy.recipes.private}
        actions={
          <Link href="/recipes" style={{ fontSize: 13, color: "var(--ink-2)" }}>
            {copy.recipes.backToLibrary}
          </Link>
        }
      />
      <RecipeEditor recipeId={null} initial={blankRecipe()} />
    </CoachShell>
  );
}
