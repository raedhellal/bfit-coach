import { redirect } from "next/navigation";
import { CoachShell } from "@/components/shell/CoachShell";
import { ClientHeader } from "@/components/client/ClientHeader";
import { ClientNotice } from "@/components/client/ClientNotice";
import { ProfileFacts } from "@/components/client/ProfileFacts";
import { NutritionTargetsCard } from "@/components/nutrition/NutritionTargetsCard";
import { NutritionWeekCard } from "@/components/nutrition/NutritionWeekCard";
import { FoodLogCard } from "@/components/nutrition/FoodLogCard";
import { TemplateUseOutcome } from "@/components/nutritionTemplates/TemplateUseOutcome";
import { Card, EmptyState } from "@/components/ui/kit";
import {
  coachApi,
  hasScope,
  isForbidden,
  type CoachFoodLogResponse,
  type CoachNutritionResponse,
} from "@/lib/coachApi";
import { readClientOverview, readCoachMe } from "@/lib/clientOverview";
import { getCopy } from "@/lib/i18n/server";
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
  const copy = getCopy();
  let denied = false;
  const [me, { overview }] = await Promise.all([readCoachMe(), readClientOverview(params.id)]);

  // Fail CLOSED: no overview means the api failed, and an api that failed cannot tell
  // us this trainee shared their nutrition. Asking anyway would request data we may
  // have no consent for and then explain a 403 we caused ourselves.
  let nutrition: CoachNutritionResponse | null = null;
  let message: string | null = null;
  /**
   * EV-284b — the food log is a SECOND read under the same NUTRITION scope, made in
   * parallel with the first (neither needs the other). Its failure is its own: the
   * targets and the week are still the coach's to work with, so a log that did not load
   * costs the section and nothing else. A 403 on EITHER read means the link ended
   * between the layout's overview and here, and moves the coach to /clients/denied.
   */
  let foodLog: CoachFoodLogResponse | null = null;
  let foodLogFailed = false;
  if (!overview) {
    message = copy.nutrition.loadError;
  } else if (!hasScope(overview.scopes, "NUTRITION")) {
    // Not called at all: asking for data the trainee withheld is not a no-op.
    message = copy.nutrition.scopeMissing;
  } else {
    const [nutritionRead, logRead] = await Promise.allSettled([
      coachApi.getNutrition(params.id),
      coachApi.getFoodLog(params.id),
    ]);
    if (nutritionRead.status === "fulfilled") nutrition = nutritionRead.value;
    else if (isForbidden(nutritionRead.reason)) denied = true;
    else message = copy.nutrition.loadError;

    if (logRead.status === "fulfilled") foodLog = logRead.value;
    else if (isForbidden(logRead.reason)) denied = true;
    else foodLogFailed = true;
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

      {/*
        EV-273b AC5 — what "Use on a trainee" observed, above what the api holds. ABOVE
        the load-error split (staff review, blocker 1): a landing on the scope sentence or
        the load error still shows and consumes it, rather than leaving it for a later visit.
      */}
      <TemplateUseOutcome clientId={params.id} traineeDisplayName={displayName} />

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
              {
                label: copy.nutrition.rules,
                values: nutrition.dietProfile.rules.map((rule) => copy.nutrition.ruleLabels[rule] ?? rule),
              },
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

          <FoodLogCard log={foodLog} failed={foodLogFailed || !foodLog} />
        </>
      )}
    </CoachShell>
  );
}
