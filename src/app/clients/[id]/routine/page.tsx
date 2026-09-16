import { CoachShell } from "@/components/shell/CoachShell";
import { ClientHeader } from "@/components/client/ClientHeader";
import { ClientNotice } from "@/components/client/ClientNotice";
import { ProfileFacts } from "@/components/client/ProfileFacts";
import { RoutineEditor } from "@/components/routine/RoutineEditor";
import { coachApi, isForbidden, isScopeMissing } from "@/lib/coachApi";
import { readClientOverview, readCoachMe } from "@/lib/clientOverview";
import { copy } from "@/lib/copy";

/**
 * /clients/[id]/routine — EV-184b.
 *
 * `force-dynamic` for the same reason as every other coach screen: AC6 says a revoked
 * link must 403 on the coach's very next request, and a cached routine would pass
 * every test and hand a revoked coach their trainee's plan.
 *
 * Three states, all explicit, none of them a blank page:
 *   · 403 with `COACH_SCOPE_MISSING` → AC1's "has not shared their workouts" sentence.
 *     A plain 403 (revoked between the layout's read and this one) falls back to the
 *     roster sentence, because "they did not share workouts" would be the wrong reason.
 *   · any other failure → the load-error card. It must NOT claim a scope problem: the
 *     api being down is not the trainee withholding anything.
 *   · success → the editor, which owns AC1's "No active plan" empty state itself.
 *
 * The trainee's injuries and equipment are rendered HERE, outside the editor, and are
 * never passed into it — CS-22's "the coach may display them, may not submit them",
 * made structural.
 */
export const dynamic = "force-dynamic";

export default async function RoutinePage({ params }: { params: { id: string } }) {
  const [me, { overview }] = await Promise.all([
    readCoachMe(),
    // The layout has already awaited this; React `cache` makes it free here and gives
    // the header a name even when the routine read fails.
    readClientOverview(params.id),
  ]);

  let routine = null;
  let message: string | null = null;
  try {
    routine = await coachApi.getRoutine(params.id);
  } catch (err) {
    if (isScopeMissing(err)) message = copy.routine.scopeMissing;
    else if (isForbidden(err)) message = copy.client.notFound;
    else message = copy.routine.loadError;
  }

  const displayName = routine?.traineeDisplayName ?? overview?.traineeDisplayName ?? "";

  return (
    <CoachShell coachName={me?.displayName}>
      <ClientHeader
        clientId={params.id}
        traineeDisplayName={displayName}
        since={overview?.since}
        active="routine"
      />

      {message || !routine ? (
        <ClientNotice message={message ?? copy.routine.loadError} />
      ) : (
        <>
          <ProfileFacts
            title={copy.routine.title}
            icon="shield"
            groups={[
              { label: copy.routine.injuries, values: routine.trainingProfile.injuries },
              { label: copy.routine.equipment, values: routine.trainingProfile.equipment },
            ]}
          />
          <RoutineEditor
            clientId={params.id}
            activePlan={routine.activePlan}
            initialDraft={routine.draft}
          />
        </>
      )}
    </CoachShell>
  );
}
