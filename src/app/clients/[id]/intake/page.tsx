import { redirect } from "next/navigation";
import { CoachShell } from "@/components/shell/CoachShell";
import { ClientHeader, headerHasName } from "@/components/client/ClientHeader";
import { ClientNotice } from "@/components/client/ClientNotice";
import { IntakeConsentCard } from "@/components/client/IntakeConsentCard";
import { ProfileFacts } from "@/components/client/ProfileFacts";
import { IntakeInterview } from "@/components/intake/IntakeInterview";
import { coachApi, hasScope, isForbidden, type CoachIntake, type CoachRoutineGuardrails } from "@/lib/coachApi";
import { isClientId, readClientOverview, readCoachMe } from "@/lib/clientOverview";
import { INTAKE_REQUEST_ENABLED } from "@/lib/env";
import { firstName } from "@/lib/format";
import { equipmentLabels } from "@/lib/guardrailLabels";
import { getCopy } from "@/lib/i18n/server";
import { asIntakeStatus, type IntakeStatus } from "@/lib/intakeConsent";
import { INTAKE_FORM_SECTIONS, formFromApi, type IntakeFormSection } from "@/lib/intakeForm";
import { sessionSubjectTag } from "@/lib/sessionSubject";

/**
 * /clients/[id]/intake — EV-341b: the intake interview, sections 1–4, with autosave and resume.
 *
 * The frame is the other tabs' (EV-337f1/g1): one `h1`, the client's name, from `ClientHeader`;
 * the tab's `h2` « Entretien initial » in EVERY state (B1); B19's sentence under it.
 *
 * Reads, all on the server, none from the island:
 *   · the overview (the layout's 403 decision, repeated for a tab change, BUG-671) and the
 *     coach's name, in parallel with
 *   · `GET …/intake` — READY (every section's version and answers) or GRANT_MISSING. A 403 is
 *     the link ending: the denial page. Any other failure is the tab's load notice;
 *   · READY and WORKOUTS held: `GET …/routine` for section 3's read-only equipment (B10), the
 *     one read that carries the trainee's stored equipment. Its failure costs that line only;
 *   · GRANT_MISSING and the release hold on: `GET …/intake-consent`, the « Entretien » card's
 *     starting state (B11a: EV-341w's card, mounted here, unchanged).
 *
 * B10's other half, « Indiqué dans l'app : {goal} », is NOT drawn: no coach-portal read carries
 * the trainee's PROFILE goal (the routine's goal is the published plan's, and EV-359 is not
 * built). It is recorded on the branch's report as blocked on an api field.
 *
 * Nothing here is cached (`force-dynamic`): a revoked link must 403 on the next request.
 */
export const dynamic = "force-dynamic";

type Read<T> = { ok: true; value: T } | { ok: false; forbidden: boolean };

function settle<T>(read: Promise<T>): Promise<Read<T>> {
  return read.then(
    (value): Read<T> => ({ ok: true, value }),
    (err): Read<T> => ({ ok: false, forbidden: isForbidden(err) })
  );
}

const REASON_ID = "intake-grant-missing";

export default async function IntakePage({ params }: { params: { id: string } }) {
  const copy = getCopy();
  const c = copy.intakePage;
  // BUG-600: a segment that is not a UUID asks the api nothing (the layout denies it).
  const valid = isClientId(params.id);
  const intakeRead = valid ? settle(coachApi.getIntake(params.id)) : null;
  const [me, { overview, forbidden }] = await Promise.all([readCoachMe(), readClientOverview(params.id)]);
  // BUG-671: a tab change does not re-run the layout, so this page's own read is the witness.
  if (forbidden || !valid) redirect("/clients/denied");

  const intake = intakeRead ? await intakeRead : null;
  if (intake && !intake.ok && intake.forbidden) redirect("/clients/denied");

  const read: CoachIntake | null = intake?.ok ? intake.value : null;
  const ready = read?.state === "READY" && !!read.sections;
  const grantMissing = read?.state === "GRANT_MISSING";

  const [routineRead, consentRead] = await Promise.all([
    ready && overview && hasScope(overview.scopes, "WORKOUTS") ? settle(coachApi.getRoutine(params.id)) : null,
    grantMissing && INTAKE_REQUEST_ENABLED ? settle(coachApi.getIntakeConsent(params.id)) : null,
  ]);
  if ((routineRead && !routineRead.ok && routineRead.forbidden) || (consentRead && !consentRead.ok && consentRead.forbidden)) {
    redirect("/clients/denied");
  }

  const trainee = overview ? { traineeDisplayName: overview.traineeDisplayName } : null;
  const first = firstName(overview?.traineeDisplayName, copy.locale);

  let notice: string | null = null;
  if (!overview || !read || (!ready && !grantMissing)) notice = copy.intake.loadError;

  const initial = ready
    ? {
        versions: Object.fromEntries(
          INTAKE_FORM_SECTIONS.map((s) => [s, read!.sections![s]?.version ?? 0])
        ) as Record<IntakeFormSection, number>,
        values: formFromApi(read!.sections),
      }
    : null;

  const guardrails: CoachRoutineGuardrails | null = routineRead?.ok ? (routineRead.value.guardrails ?? null) : null;
  const equipment = guardrails ? (
    <ProfileFacts
      title={copy.routine.profileTitle}
      icon="shield"
      groups={[
        {
          label: copy.routine.equipment,
          values: equipmentLabels(guardrails.equipment, copy),
          // `equipmentChecked` separates "recorded none" from "never answered" (the routine tab's rule).
          empty: guardrails.equipmentChecked ? undefined : copy.routine.equipmentUnanswered,
        },
      ]}
    />
  ) : null;

  const consent: IntakeStatus | null = consentRead?.ok ? asIntakeStatus(consentRead.value) : null;

  return (
    <CoachShell coachName={me?.displayName} section="roster">
      <ClientHeader clientId={params.id} trainee={trainee} since={overview?.since} active="intake" />
      {/* B1 / ruling 16: the tab's title, in every state below. */}
      <h2 className="nut-title">{c.title}</h2>

      {notice ? (
        <ClientNotice message={notice} asHeading={!headerHasName(trainee)} />
      ) : (
        <>
          {/* B19: before any note is typed, the coach is told the client reads it. */}
          <p className="ov-note intake-reads" data-intake-reads="">
            {c.clientCanRead(first)}
          </p>
          {grantMissing && (
            <div className="intake-grant">
              {/* B11: the reason, wired to every disabled field with aria-describedby. */}
              <p id={REASON_ID} className="ov-note" data-intake-grant-missing="">
                {c.grantMissing(first)}
              </p>
              {/* B11a: EV-341w's card, under B11's sentence, behind the same release hold. */}
              {consentRead && (
                <div className="intake-consent">
                  <IntakeConsentCard clientId={params.id} firstName={first} initial={consent} />
                </div>
              )}
            </div>
          )}
          <IntakeInterview
            clientId={params.id}
            sessionSubject={sessionSubjectTag() ?? ""}
            initial={initial}
            disabledReasonId={grantMissing ? REASON_ID : undefined}
            equipment={equipment}
          />
        </>
      )}
    </CoachShell>
  );
}
