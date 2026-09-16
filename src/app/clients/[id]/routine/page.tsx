import { redirect } from "next/navigation";
import { CoachShell } from "@/components/shell/CoachShell";
import { ClientHeader } from "@/components/client/ClientHeader";
import { ClientNotice } from "@/components/client/ClientNotice";
import { ProfileFacts } from "@/components/client/ProfileFacts";
import { RoutineEditor } from "@/components/routine/RoutineEditor";
import { coachApi, hasScope, isForbidden } from "@/lib/coachApi";
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
 *   · the link does not carry WORKOUTS → AC1's "has not shared their workouts"
 *     sentence, decided from `overview.scopes` BEFORE any call is made (ADR-0015 D5).
 *     There is no `COACH_SCOPE_MISSING` code and there never will be: the api's 403
 *     body is identical for a scope denial, a foreign id and an id that never existed,
 *     so a portal that read the reason off an error would be reading something the
 *     server does not send. Not calling at all is also the honest thing — the request
 *     would be refused, and asking for data a trainee withheld is not a no-op.
 *   · 403 from the read itself → the link was revoked between the layout's overview
 *     and this read, so the answer is the same as any other denial: /clients/denied.
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
  let denied = false;
  const [me, { overview }] = await Promise.all([
    readCoachMe(),
    // The layout has already awaited this; React `cache` makes it free here and gives
    // the header a name even when the routine read fails.
    readClientOverview(params.id),
  ]);

  // The layout has already proved the link is ACTIVE (the overview needs no data
  // scope), so a missing overview here means the api failed, not that access ended.
  const workoutsShared = overview ? hasScope(overview.scopes, "WORKOUTS") : true;

  let routine = null;
  let message: string | null = null;
  if (!workoutsShared) {
    message = copy.routine.scopeMissing;
  } else {
    try {
      routine = await coachApi.getRoutine(params.id);
    } catch (err) {
      // A revocation between the layout's read and this one. `redirect` throws, so it
      // cannot sit inside the `try`.
      if (isForbidden(err)) denied = true;
      else message = copy.routine.loadError;
    }
  }
  // `/clients/denied` is served 403 by middleware.ts. This page has a loading.tsx
  // above it, so the redirect degrades to a meta-refresh with a 200 on a cold load —
  // the coach still lands on the denial page, which is the statement that matters
  // here; the status that AC5 pins is the overview's, decided in layout.tsx.
  if (denied) redirect("/clients/denied");

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
