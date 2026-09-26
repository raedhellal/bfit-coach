import { CoachShell } from "@/components/shell/CoachShell";
import { ClientNotice } from "@/components/client/ClientNotice";
import { NutritionTemplateLibrary } from "@/components/nutritionTemplates/NutritionTemplateLibrary";
import { PageHead } from "@/components/ui/kit";
import {
  coachApi,
  hasScope,
  type NutritionTemplateList,
  type RosterClient,
} from "@/lib/coachApi";
import { readCoachMe } from "@/lib/clientOverview";
import { copy } from "@/lib/copy";

/**
 * /nutrition-templates — EV-273b AC1-AC3, the coach's own nutrition library.
 *
 * The routine library's shape (EV-188b, `/templates`), for the same reasons:
 * `force-dynamic` because ADR-0012 D3 forbids caching an authorization outcome; two
 * parallel reads; three explicit states (load error · empty library · the list).
 *
 * AC3 — "Use on a trainee" offers ONLY the coach's ACTIVE links that carry NUTRITION.
 * That is decided HERE, from `RosterClient.scopes`, so a trainee the coach may not write
 * to is never shipped to the browser, never offered, and never refused in front of the
 * coach. `hasScope` fails closed: an api that sends no `scopes` offers nobody.
 *
 * Nothing about any trainee's nutrition is read on this page. The dialog reads the
 * chosen trainee's current targets and week start WHEN IT OPENS (ADR-0016b D16b.7 rule
 * 1), so a page left open overnight cannot confirm with yesterday's numbers.
 */
export const dynamic = "force-dynamic";

export default async function NutritionTemplatesPage() {
  const [me, library, roster] = await Promise.all([
    readCoachMe(),
    coachApi
      .listNutritionTemplates()
      .then((value): NutritionTemplateList | null => value)
      .catch(() => null),
    // A roster failure must not take the library down: only "Use on a trainee" needs
    // a trainee, and an empty list renders AC3's own "no trainees" sentence.
    coachApi
      .listClients()
      .then((page) => page.items)
      .catch((): RosterClient[] => []),
  ]);

  const trainees = roster
    .filter((client) => client.status === "ACTIVE" && hasScope(client.scopes, "NUTRITION"))
    .map((client) => ({ id: client.id, traineeDisplayName: client.traineeDisplayName }));

  return (
    <CoachShell coachName={me?.displayName} section="nutrition-templates">
      <PageHead title={copy.nutritionTemplates.title} sub={copy.nutritionTemplates.subtitle} />
      {library === null ? (
        <ClientNotice message={copy.nutritionTemplates.loadError} />
      ) : (
        <NutritionTemplateLibrary library={library} trainees={trainees} />
      )}
    </CoachShell>
  );
}
