import { BackLink } from "@/components/ui/BackLink";
import { CoachShell } from "@/components/shell/CoachShell";
import { NutritionTemplateEditor } from "@/components/nutritionTemplates/NutritionTemplateEditor";
import { PageHead } from "@/components/ui/kit";
import { coachApi } from "@/lib/coachApi";
import { readCoachMe } from "@/lib/clientOverview";
import { getCopy } from "@/lib/i18n/server";

/**
 * /nutrition-templates/new — AC1's "New template". A route, like `/templates/new`: the
 * first save POSTs and REPLACES the URL with `/nutrition-templates/{id}`, so Back goes
 * to the library and never to a "new" route that would create a second template.
 * A blank template has no server state; the one read is the served cap.
 */
export const dynamic = "force-dynamic";

export default async function NewNutritionTemplatePage() {
  const copy = getCopy();
  // The library is read ONLY for the cap the api serves, so a 409 names the real number
  // (the refusal body carries none). A failed read leaves it unknown, never a guessed 50.
  const [me, limit] = await Promise.all([
    readCoachMe(),
    coachApi
      .listNutritionTemplates()
      .then((list): number | null => list.limit)
      .catch(() => null),
  ]);
  return (
    <CoachShell coachName={me?.displayName} section="nutrition-templates">
      <PageHead
        title={copy.nutritionTemplates.newTitle}
        sub={copy.nutritionTemplates.private}
        actions={
          <BackLink href="/nutrition-templates" label={copy.nutritionTemplates.backToLibrary} />
        }
      />
      <NutritionTemplateEditor templateId={null} initial={null} limit={limit} />
    </CoachShell>
  );
}
