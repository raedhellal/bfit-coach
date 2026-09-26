import Link from "next/link";
import { CoachShell } from "@/components/shell/CoachShell";
import { NutritionTemplateEditor } from "@/components/nutritionTemplates/NutritionTemplateEditor";
import { PageHead } from "@/components/ui/kit";
import { readCoachMe } from "@/lib/clientOverview";
import { copy } from "@/lib/copy";

/**
 * /nutrition-templates/new — AC1's "New template". A route, like `/templates/new`: the
 * first save POSTs and REPLACES the URL with `/nutrition-templates/{id}`, so Back goes
 * to the library and never to a "new" route that would create a second template.
 * Nothing is read from the api: a blank template has no server state.
 */
export const dynamic = "force-dynamic";

export default async function NewNutritionTemplatePage() {
  const me = await readCoachMe();
  return (
    <CoachShell coachName={me?.displayName} section="nutrition-templates">
      <PageHead
        title={copy.nutritionTemplates.newTitle}
        sub={copy.nutritionTemplates.private}
        actions={
          <Link href="/nutrition-templates" style={{ fontSize: 13, color: "var(--ink-2)" }}>
            {copy.nutritionTemplates.backToLibrary}
          </Link>
        }
      />
      <NutritionTemplateEditor templateId={null} initial={null} />
    </CoachShell>
  );
}
