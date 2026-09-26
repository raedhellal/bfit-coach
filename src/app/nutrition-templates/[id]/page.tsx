import Link from "next/link";
import { CoachShell } from "@/components/shell/CoachShell";
import { ClientNotice } from "@/components/client/ClientNotice";
import { NutritionTemplateEditor } from "@/components/nutritionTemplates/NutritionTemplateEditor";
import { PageHead } from "@/components/ui/kit";
import { coachApi, isForbidden, type NutritionTemplate } from "@/lib/coachApi";
import { readCoachMe } from "@/lib/clientOverview";
import { copy } from "@/lib/copy";

/**
 * /nutrition-templates/[id] — AC2's Edit.
 *
 * Two failure states, as `/templates/[id]`: a 403 is ONE sentence for a foreign, an
 * unknown and a deleted template (EV-273a AC4 serves one body for all three), and any
 * other failure is the load error. Never `notFound()`: "this does not exist" is exactly
 * the fact the 403 withholds.
 *
 * Only `name` and `targets` reach the editor. A structure stored through the api
 * (edge case 9) is served, and dropped here, unread: the editor has no field for it.
 */
export const dynamic = "force-dynamic";

export default async function NutritionTemplatePage({ params }: { params: { id: string } }) {
  const [me, loaded] = await Promise.all([
    readCoachMe(),
    coachApi
      .getNutritionTemplate(params.id)
      .then((template): { template: NutritionTemplate | null; forbidden: boolean } => ({
        template,
        forbidden: false,
      }))
      .catch((err: unknown) => ({ template: null, forbidden: isForbidden(err) })),
  ]);

  return (
    <CoachShell coachName={me?.displayName} section="nutrition-templates">
      <PageHead
        title={loaded.template ? loaded.template.name : copy.nutritionTemplates.editTitle}
        sub={copy.nutritionTemplates.private}
        actions={
          <Link href="/nutrition-templates" style={{ fontSize: 13, color: "var(--ink-2)" }}>
            {copy.nutritionTemplates.backToLibrary}
          </Link>
        }
      />
      {loaded.template ? (
        <NutritionTemplateEditor
          templateId={loaded.template.id}
          initial={{
            name: loaded.template.name,
            targets: {
              calories: loaded.template.targets.calories,
              proteinG: loaded.template.targets.proteinG,
              carbsG: loaded.template.targets.carbsG,
              fatG: loaded.template.targets.fatG,
            },
          }}
        />
      ) : (
        <ClientNotice
          message={
            loaded.forbidden ? copy.nutritionTemplates.notYours : copy.nutritionTemplates.loadError
          }
        />
      )}
    </CoachShell>
  );
}
