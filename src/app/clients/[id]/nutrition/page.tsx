import { redirect } from "next/navigation";
import { CoachShell } from "@/components/shell/CoachShell";
import { ClientHeader } from "@/components/client/ClientHeader";
import { ClientNotice } from "@/components/client/ClientNotice";
import { ProfileFacts } from "@/components/client/ProfileFacts";
import { NutritionTargetsCard } from "@/components/nutrition/NutritionTargetsCard";
import { NutritionWeekCard } from "@/components/nutrition/NutritionWeekCard";
import { Card, EmptyState } from "@/components/ui/kit";
import { coachApi, hasScope, isForbidden } from "@/lib/coachApi";
import { readClientOverview, readCoachMe } from "@/lib/clientOverview";
import { copy } from "@/lib/copy";
import { recipePlacementOn } from "@/lib/recipePlacement";

/**
 * /clients/[id]/nutrition — EV-185b.
 *
 * Same explicit states as the routine tab — the NUTRITION scope is read from the
 * overview's `scopes` (ADR-0015 D5; there is no scope error code, the 403 body is
 * undifferentiated), a real 403 goes to /clients/denied, anything else is the load
 * error — with AC1's empty state on top: a
 * trainee with no targets AND no week gets "No nutrition set up yet" **plus** both
 * controls, not instead of them. That is deliberate — the empty state is the place a
 * coach starts, so hiding the targets form behind it would make "Save targets as the
 * first ever write" (edge case 9) unreachable.
 *
 * Nothing on this page renders `null`, `NaN` or a blank card: every number comes from
 * a non-null `targets` object or is not rendered at all.
 *
 * The dietary block is read-only and outside both client components, so no state in
 * this tab can submit an allergy, HALAL/KOSHER or a dislike — EV-185's non-negotiable,
 * made structural rather than promised.
 */
export const dynamic = "force-dynamic";

export default async function NutritionPage({ params }: { params: { id: string } }) {
  let denied = false;
  const [me, { overview }] = await Promise.all([readCoachMe(), readClientOverview(params.id)]);

  // Fail CLOSED: no overview means the api failed, and an api that failed cannot tell
  // us this trainee shared their nutrition. Asking anyway would request data we may
  // have no consent for and then explain a 403 we caused ourselves.
  let nutrition = null;
  let message: string | null = null;
  if (!overview) {
    message = copy.nutrition.loadError;
  } else if (!hasScope(overview.scopes, "NUTRITION")) {
    message = copy.nutrition.scopeMissing;
  } else {
    try {
      nutrition = await coachApi.getNutrition(params.id);
    } catch (err) {
      if (isForbidden(err)) denied = true;
      else message = copy.nutrition.loadError;
    }
  }
  if (denied) redirect("/clients/denied");

  const displayName = nutrition?.traineeDisplayName ?? overview?.traineeDisplayName ?? "";
  const nothingSetUp = !!nutrition && nutrition.targets === null && nutrition.week === null;

  return (
    <CoachShell coachName={me?.displayName}>
      <ClientHeader
        clientId={params.id}
        traineeDisplayName={displayName}
        since={overview?.since}
        active="nutrition"
      />

      {message || !nutrition ? (
        <ClientNotice message={message ?? copy.nutrition.loadError} />
      ) : (
        <>
          {nothingSetUp && (
            <Card style={{ marginBottom: 18 }}>
              <EmptyState
                icon="apple"
                title={copy.nutrition.emptyTitle}
                sub={copy.nutrition.emptyBody}
              />
            </Card>
          )}

          <ProfileFacts
            title={copy.nutrition.title}
            icon="shield"
            groups={[
              { label: copy.nutrition.allergies, values: nutrition.dietProfile.allergies },
              { label: copy.nutrition.rules, values: nutrition.dietProfile.rules },
              { label: copy.nutrition.dislikes, values: nutrition.dietProfile.dislikes },
            ]}
            emptyAll={copy.nutrition.noRestrictions}
          />

          <NutritionTargetsCard
            clientId={params.id}
            traineeDisplayName={displayName}
            targets={nutrition.targets}
          />

          <NutritionWeekCard
            clientId={params.id}
            traineeDisplayName={displayName}
            week={nutrition.week}
            currentWeekStart={nutrition.currentWeekStart}
            // EV-256e AC1: only a literal `true` — an api that predates the field, or
            // sends anything else, hides the action (the production default).
            recipePlacementEnabled={recipePlacementOn(nutrition)}
          />
        </>
      )}
    </CoachShell>
  );
}
