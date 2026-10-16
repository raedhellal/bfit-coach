import { notFound, redirect } from "next/navigation";
import { CoachShell } from "@/components/shell/CoachShell";
import { ClientHeader, headerHasName } from "@/components/client/ClientHeader";
import { ClientNotice } from "@/components/client/ClientNotice";
import { IntakeConsentCard } from "@/components/client/IntakeConsentCard";
import { ProfileFacts } from "@/components/client/ProfileFacts";
import { IntakeInterview } from "@/components/intake/IntakeInterview";
import {
  coachApi,
  hasScope,
  isForbidden,
  type CoachIntake,
  type CoachNutritionResponse,
  type CoachRoutineGuardrails,
} from "@/lib/coachApi";
import { isClientId, readClientOverview, readCoachMe } from "@/lib/clientOverview";
import { INTAKE_REQUEST_ENABLED } from "@/lib/env";
import { dietValueLabel } from "@/lib/dietValueLabel";
import { firstName, formatDate, formatKg } from "@/lib/format";
import { equipmentLabels, injuryLabels } from "@/lib/guardrailLabels";
import { getCopy } from "@/lib/i18n/server";
import { asIntakeStatus, type IntakeStatus } from "@/lib/intakeConsent";
import { droppedExerciseNames, readMuscleFacet } from "@/lib/intakeCatalog";
import { INTAKE_FORM_SECTIONS, formFromApi, type IntakeFormSection } from "@/lib/intakeForm";
import { sessionSubjectTag } from "@/lib/sessionSubject";

/**
 * /clients/[id]/intake — EV-341b / EV-341c: the intake interview, its eight sections, autosave,
 * resume and « Terminer l'entretien ».
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
 *     starting state (B11a: EV-341w's card, mounted here, unchanged);
 *   · READY (EV-341y2): the catalogue's `muscles` facet, section 1's emphasis options (YP1), and
 *     which stored liked / avoided exercise names the catalogue no longer has (YP6),
 *     `src/lib/intakeCatalog.ts`. A failure there costs the marks and the options only; the
 *     stored values are still shown, kept and sent back unchanged.
 *
 * B10's other half, « Indiqué dans l'app : {goal} », is NOT drawn: no coach-portal read carries
 * the trainee's PROFILE goal (the routine's goal is the published plan's, and EV-359 is not
 * built). It is recorded on the branch's report as blocked on an api field.
 *
 * EV-341c — sections 5–8 and « Terminer ». Sections 5–7's read-only parts are drawn here, each
 * from its OWN scope (C1: "each block checks its own scope"), never from a 403:
 *   · section 5 (C1): the injuries, from the same routine read as B10's equipment (WORKOUTS);
 *   · section 6 (C2): the latest weight and its date, `progressGoal.currentWeight` on the overview
 *     this page already reads (WEIGH_INS): "the trainee's latest weight reading, of any age"
 *     (b-fit-api `TraineeProgressGoalResponse`), so it costs no request, and an old weigh-in is not
 *     "no measurements" (the 8-week `weightSeries` would have said so);
 *   · section 7 (C3): the allergies, food rules and dislikes, `GET …/nutrition` (NUTRITION), with
 *     EV-185 AC1's sentence (`ProfileFacts`, as the nutrition tab draws them).
 * A failed read costs its block only (`intake.loadError`); a 403 is the link ending (denial page).
 * The finished date is the read's `completedAt` (C5).
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
  // EV-341b G3: dark behind the release hold. Off, the page does not exist (404) and reads nothing.
  if (!INTAKE_REQUEST_ENABLED) notFound();
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

  const history = ready ? read!.sections!.HISTORY?.values : undefined;
  const storedNames = [history?.likedExercises, history?.avoidedExercises].flatMap((list) =>
    Array.isArray(list) ? list.filter((n): n is string => typeof n === "string") : []
  );
  const workouts = !!overview && hasScope(overview.scopes, "WORKOUTS");
  const weighIns = !!overview && hasScope(overview.scopes, "WEIGH_INS");
  const nutritionShared = !!overview && hasScope(overview.scopes, "NUTRITION");
  const [routineRead, consentRead, muscleFacet, droppedNames, nutritionRead] = await Promise.all([
    ready && workouts ? settle(coachApi.getRoutine(params.id)) : null,
    grantMissing && INTAKE_REQUEST_ENABLED ? settle(coachApi.getIntakeConsent(params.id)) : null,
    ready ? readMuscleFacet() : null,
    ready ? droppedExerciseNames(storedNames) : [],
    // C3: asked only when the overview shows NUTRITION (ADR-0015 D5: never ask for withheld data).
    ready && nutritionShared ? settle<CoachNutritionResponse>(coachApi.getNutrition(params.id)) : null,
  ]);
  if (
    (routineRead && !routineRead.ok && routineRead.forbidden) ||
    (consentRead && !consentRead.ok && consentRead.forbidden) ||
    (nutritionRead && !nutritionRead.ok && nutritionRead.forbidden)
  ) {
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
        // Every key the api stored, so a save never clears one this build does not know (S3).
        raw: Object.fromEntries(
          INTAKE_FORM_SECTIONS.map((s) => {
            const values = read!.sections![s]?.values;
            return [s, values && typeof values === "object" && !Array.isArray(values) ? values : {}];
          })
        ) as Record<IntakeFormSection, Record<string, unknown>>,
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

  /** A block's own sentence (not shared, nothing yet, or its read failed), in the page's note style. */
  const note = (state: string, text: string) => (
    <p className="ov-note intake-readonly-note" data-intake-readonly-state={state}>
      {text}
    </p>
  );

  // C1 — section 5: the trainee's stored injuries, read-only, with `fromProfile` under them.
  const health = !overview
    ? null
    : !workouts
      ? note("notShared", c.trainingNotShared(first))
      : !guardrails
        ? note("loadError", copy.intake.loadError)
        : (
            <ProfileFacts
              title={copy.routine.profileTitle}
              icon="shield"
              groups={[{ label: copy.routine.injuries, values: injuryLabels(guardrails.injuries, copy), empty: c.noInjuries }]}
            />
          );

  // C2 — section 6: the latest weight and its date (WEIGH_INS).
  const latestWeight = overview?.progressGoal?.currentWeight ?? null;
  const measurements = !overview
    ? null
    : !weighIns
      ? note("notShared", c.measurementsNotShared(first))
      : !overview.progressGoal
        ? // WEIGH_INS held, so the api owed the block: its absence is an api that did not answer.
          note("loadError", copy.intake.loadError)
        : !latestWeight
          ? note("empty", c.noMeasurements)
          : (
              <p className="ov-note intake-weight" data-intake-weight="" data-intake-readonly-state="value">
                {copy.common.labelled(
                  copy.client.weight,
                  `${formatKg(latestWeight.value, copy.locale)} · ${formatDate(latestWeight.date, copy.locale)}`
                )}
              </p>
            );

  // C3 — section 7: the allergies, food rules and dislikes, read-only, with EV-185 AC1's sentence.
  const diet = nutritionRead?.ok ? nutritionRead.value.dietProfile : null;
  const food = !overview
    ? null
    : !nutritionShared
      ? note("notShared", c.nutritionNotShared(first))
      : !diet
        ? note("loadError", copy.intake.loadError)
        : (
            <ProfileFacts
              title={copy.routine.profileTitle}
              icon="shield"
              groups={[
                { label: copy.nutrition.allergies, values: diet.allergies.map((v) => dietValueLabel(copy.nutrition.allergyPresetLabels, v)) },
                { label: copy.nutrition.rules, values: diet.rules.map((rule) => dietValueLabel(copy.nutrition.ruleLabels, rule)) },
                { label: copy.nutrition.dislikes, values: diet.dislikes.map((v) => dietValueLabel(copy.nutrition.dislikePresetLabels, v)) },
              ]}
              emptyAll={copy.nutrition.noRestrictions}
            />
          );
  const readOnly = ready ? { HEALTH: health, MEASUREMENTS: measurements, NUTRITION: food } : undefined;

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
            readOnly={readOnly}
            completedAt={ready ? (read!.completedAt ?? null) : null}
            firstName={first}
            catalogue={ready ? { muscles: muscleFacet, droppedExercises: droppedNames } : null}
          />
        </>
      )}
    </CoachShell>
  );
}
