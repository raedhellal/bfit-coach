import { redirect } from "next/navigation";
import { CoachShell } from "@/components/shell/CoachShell";
import { ClientHeader } from "@/components/client/ClientHeader";
import { ClientNotice } from "@/components/client/ClientNotice";
import { ProfileFacts } from "@/components/client/ProfileFacts";
import {
  RoutineEditor,
  type PublishedRoutine,
  type SavedRoutineDraft,
} from "@/components/routine/RoutineEditor";
import { TraineeChangedBanner } from "@/components/routine/TraineeChangedBanner";
import { SaveAsTemplateButton } from "@/components/templates/SaveAsTemplateButton";
import { coachApi, hasScope, isForbidden, type CoachRoutineResponse } from "@/lib/coachApi";
import { equipmentLabels, injuryLabels } from "@/lib/guardrailLabels";
import { editableDocument } from "@/lib/routineDocument";
import { traineeChangeNotice } from "@/lib/routineChange";
import { readClientOverview, readCoachMe } from "@/lib/clientOverview";
import { getCopy } from "@/lib/i18n/server";

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
  const copy = getCopy();
  let denied = false;
  const [me, { overview }] = await Promise.all([
    readCoachMe(),
    // The layout has already awaited this; React `cache` makes it free here and gives
    // the header a name even when the routine read fails.
    readClientOverview(params.id),
  ]);

  /**
   * Fail CLOSED when the overview did not arrive.
   *
   * The layout has already proved the link is ACTIVE (the overview needs no data
   * scope), so a missing overview here means the api failed — and an api that failed
   * cannot tell us the trainee shared their workouts. Calling anyway on the optimistic
   * reading would ask for data this coach may have no consent to read, and would then
   * have to explain a 403 it caused itself. The load error is the honest answer: it
   * says the routine could not be loaded, which is exactly what happened.
   */
  let routine: CoachRoutineResponse | null = null;
  let draft: SavedRoutineDraft | null = null;
  let message: string | null = null;
  /** EV-188 AC5 — advisory, re-derived by the api on every read, never stored here. */
  let unbindableExercises: string[] = [];
  /** EV-188 AC3's "Started from {name}", resolved from the draft's template id. */
  let sourceTemplateName: string | null = null;
  if (!overview) {
    message = copy.routine.loadError;
  } else if (!hasScope(overview.scopes, "WORKOUTS")) {
    message = copy.routine.scopeMissing;
  } else {
    try {
      routine = await coachApi.getRoutine(params.id);
      /**
       * The draft DOCUMENT is a second read — `GET …/routine` reports only that a draft
       * EXISTS. Sequential and not `Promise.all`, because `hasDraft` is what decides
       * whether the second call happens at all: asking for a draft the envelope has
       * already said is absent can only ever be told the same thing again.
       *
       * A draft read that THROWS (a 500 or any other status `apiFetch` throws on, a lost
       * connection) IS a load error for the whole tab: it is inside this `try`, so the
       * `catch` below sets `copy.routine.loadError` — or redirects to the denial page on
       * a 403 — even though the published plan was read successfully just above. Only a
       * draft read that ANSWERS with a document this surface cannot use (no `document`,
       * or no `updatedAt`: BUG-195c below) opens the editor on the published plan, the
       * same state a discard produces.
       */
      if (routine.hasDraft) {
        const saved = await coachApi.getRoutineDraft(params.id);
        /**
         * BUG-195c — the draft is the WHOLE document plus the token it was read at. A
         * draft document with no `updatedAt` is a response this surface cannot save
         * over safely (it would have no token to echo), so it is treated as unreadable:
         * the editor opens the published plan, and a save from there is a 409 the coach
         * is asked about rather than an overwrite of a draft they never saw.
         */
        draft =
          saved?.document && saved.updatedAt
            ? { document: editableDocument(null, saved.document), updatedAt: saved.updatedAt }
            : null;
        /**
         * Guarded, not dereferenced. These three fields are EV-188a's and EV-188a has
         * not merged, so an api that predates it sends none of them — which is exactly
         * the shape of the 2026-09-18 crash, where an unguarded read of a field nobody
         * served threw inside this render and served a 200 with nothing on it.
         * Absent reads as "no marks", which under-claims: the coach is shown no
         * warning rather than a warning about a check that never ran.
         */
        unbindableExercises = Array.isArray(saved?.unbindableExercises)
          ? saved.unbindableExercises
          : [];
        /**
         * AC3's line costs a lookup: the draft carries the template ID, and the name
         * lives on the library list. A failure here loses the LINE and nothing else —
         * the draft is in hand and is what the coach came for, so the tab must not
         * refuse to render because a decorative sentence could not be resolved. A
         * template deleted since the apply is simply not in the list, and the line
         * disappears, which is AC2's delete rule arriving through the read.
         */
        if (saved?.sourceTemplateId) {
          const library = await coachApi.listTemplates().catch(() => null);
          sourceTemplateName =
            library?.templates.find((t) => t.id === saved.sourceTemplateId)?.name ?? null;
        }
      }
    } catch (err) {
      // A revocation between the layout's read and this one. `redirect` throws, so it
      // cannot sit inside the `try`.
      if (isForbidden(err)) denied = true;
      else message = copy.routine.loadError;
    }
  }
  // `/clients/denied` is served 403 by middleware.ts. The status that AC5 pins is the
  // overview's, decided in layout.tsx; here the statement that matters is that the
  // coach lands on the denial page. (Until perf/coach-fast-routes-no-skeleton a
  // loading.tsx above this page turned a cold-load redirect into a 200 meta-refresh;
  // there is none now.)
  if (denied) redirect("/clients/denied");

  const displayName = overview?.traineeDisplayName ?? "";
  /**
   * The live plan as the editor holds it: the WHOLE document (BUG-195c), named by the
   * `plans` row. Null when there is no routine document, whatever `planId` says — a plan
   * id with nothing to edit is AC1's "No active plan".
   */
  const activePlan: PublishedRoutine | null =
    routine?.routine
      ? { planId: routine.planId, document: editableDocument(routine.planName, routine.routine) }
      : null;

  /**
   * The guardrail panel is rendered only when the api actually sent the guardrails.
   *
   * `CoachRoutineResponse.guardrails` is a non-nullable record component, so a response
   * without it is an api that predates EV-184a — and this is the field whose unguarded
   * dereference threw inside this render on 2026-09-18 and served a 200 with nothing on
   * it. Omitting the panel is the fail-closed answer: an empty "None recorded." panel
   * would tell a coach that a trainee has no injuries on the strength of a field we did
   * not receive, and "we do not know" must stay indistinguishable from absent.
   */
  const guardrails = routine?.guardrails;

  /**
   * EV-283b — the trainee changed the live plan. Null (no banner) unless the api says
   * `TRAINEE` in so many words; see `src/lib/routineChange.ts` for why it fails closed.
   */
  const changedByTrainee = traineeChangeNotice(routine, displayName, copy);

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
          {changedByTrainee && <TraineeChangedBanner sentence={changedByTrainee} />}
          {guardrails && (
            <ProfileFacts
              title={copy.routine.title}
              icon="shield"
              groups={[
                { label: copy.routine.injuries, values: injuryLabels(guardrails.injuries, copy) },
                {
                  label: copy.routine.equipment,
                  values: equipmentLabels(guardrails.equipment, copy),
                  // `equipmentChecked` is the api's own derivation of "a non-empty
                  // equipment list reached the policy", and it is the only thing that
                  // separates a trainee who recorded no equipment from one who never
                  // answered. It is read here and nowhere else: it authorises no
                  // equipment-safety sentence, because BUG-053 is undeployed and
                  // AC3's warning box already says the plan is checked against
                  // injuries and not equipment.
                  empty: guardrails.equipmentChecked ? undefined : copy.routine.equipmentUnanswered,
                },
              ]}
            />
          )}
          {/*
            AC1's two other entry points into the library. Rendered ABOVE the editor and
            outside it: it writes to the COACH's library, not to this trainee's plan, and
            nothing it does can reach the editor's working copy. It renders nothing at
            all when there is neither a plan document nor a draft (edge case 12).
          */}
          <SaveAsTemplateButton
            clientId={params.id}
            planName={activePlan ? activePlan.document.name : null}
            hasDraft={draft !== null}
          />
          <RoutineEditor
            clientId={params.id}
            traineeName={displayName}
            activePlan={activePlan}
            initialDraft={draft}
            sourceTemplateName={sourceTemplateName}
            unbindableExercises={unbindableExercises}
          />
        </>
      )}
    </CoachShell>
  );
}
