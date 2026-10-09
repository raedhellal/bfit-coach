import { redirect } from "next/navigation";
import { CoachShell } from "@/components/shell/CoachShell";
import { ClientHeader, headerHasName } from "@/components/client/ClientHeader";
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
import { dietValueLabel } from "@/lib/dietValueLabel";
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
  const [me, { overview, forbidden }] = await Promise.all([readCoachMe(), readClientOverview(params.id)]);
  // BUG-671 — on a tab change the layout is not rendered again, so its 403 decision does
  // not run: when the tab change renders this page on the server, a link that ended since
  // the last page is seen here, and gets the same answer.
  // LIMIT (staff S1, witnessed on a production build): this runs only when the tab change
  // reaches the server. Next's client router cache keeps a dynamic page for 30 s
  // (`staleTimes.dynamic`, next.config.mjs, ADR-0033), so a tab visited in the last 30 s is
  // shown from the cache with NO server render, and still shows the stale page after the
  // link ended, until the cache entry expires or the page is reloaded. Changing the cache is
  // the architect's call against ADR-0012 D3, not this fix's.
  if (forbidden) redirect("/clients/denied");

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

  /**
   * The name as the reads that carry it returned it. Null when the overview read FAILED: the
   * name is then unknown and the header draws BUG-713's state. Otherwise the nutrition read's
   * name, or the overview's when that read was not made or failed; null or blank there is a
   * trainee with no name (BUG-714), printed as the label.
   */
  const trainee = overview
    ? { traineeDisplayName: nutrition?.traineeDisplayName ?? overview.traineeDisplayName }
    : null;
  const nothingSetUp = !!nutrition && nutrition.targets === null && nutrition.week === null;
  /**
   * The read the page draws its cards from, or null when it draws the notice instead. One
   * value decides both, so the week card (the only « Apply to … » button) and the outcome's
   * WEEK_FAILED instruction that names it cannot disagree (BUG-718, ruling 718-R1).
   */
  const shown: CoachNutritionResponse | null = message ? null : nutrition;

  return (
    <CoachShell coachName={me?.displayName} section="roster">
      <ClientHeader
        clientId={params.id}
        trainee={trainee}
        since={overview?.since}
        active="nutrition"
      />

      {/*
        EV-273b AC5 — what "Use on a trainee" observed, above what the api holds. ABOVE
        the load-error split (staff review, blocker 1): a landing on the scope sentence or
        the load error still shows and consumes it, rather than leaving it for a later visit.
      */}
      <TemplateUseOutcome clientId={params.id} trainee={trainee} weekCardDrawn={shown !== null} />

      {shown === null ? (
        <ClientNotice
          message={message ?? copy.nutrition.loadError}
          // BUG-713: with no overview the header draws no name and no h1 (no avatar either), so
          // the sentence is the page's one h1. Same predicate as the header's.
          asHeading={!headerHasName(trainee)}
        />
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
              // BUG-694: the app stores its presets' English labels; show them in the page's language.
              // BUG-706: the rules are the api's enum, labelled as the app labels them.
              {
                label: copy.nutrition.allergies,
                values: shown.dietProfile.allergies.map((v) => dietValueLabel(copy.nutrition.allergyPresetLabels, v)),
              },
              {
                label: copy.nutrition.rules,
                values: shown.dietProfile.rules.map((rule) => dietValueLabel(copy.nutrition.ruleLabels, rule)),
              },
              {
                label: copy.nutrition.dislikes,
                values: shown.dietProfile.dislikes.map((v) => dietValueLabel(copy.nutrition.dislikePresetLabels, v)),
              },
            ]}
            emptyAll={copy.nutrition.noRestrictions}
          />

          <NutritionTargetsCard
            clientId={params.id}
            traineeDisplayName={trainee?.traineeDisplayName ?? null}
            targets={shown.targets}
          />

          <NutritionWeekCard
            clientId={params.id}
            traineeDisplayName={trainee?.traineeDisplayName ?? null}
            week={shown.week}
            currentWeekStart={shown.currentWeekStart}
            // EV-256e AC1: only a literal `true` — an api that predates the field, or
            // sends anything else, hides the action (the production default).
            recipePlacementEnabled={recipePlacementOn(shown)}
          />

          <FoodLogCard log={foodLog} failed={foodLogFailed || !foodLog} />
        </>
      )}
    </CoachShell>
  );
}
