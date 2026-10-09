import { redirect } from "next/navigation";
import { CoachShell } from "@/components/shell/CoachShell";
import { ClientNotice } from "@/components/client/ClientNotice";
import { ClientHeader, ClientInjuryChips } from "@/components/client/ClientHeader";
import { RevokeMenu } from "@/components/client/RevokeMenu";
import { StatTile } from "@/components/client/StatTile";
import { ProgressRing } from "@/components/client/ProgressRing";
import { AdherenceSeries } from "@/components/client/AdherenceSeries";
import { BlockNote, MonitoringBlock } from "@/components/client/MonitoringBlock";
import { ProgressGoalBlock } from "@/components/client/ProgressGoalBlock";
import { RedFlagEvidence } from "@/components/client/RedFlagEvidence";
import { RecentActivity } from "@/components/client/RecentActivity";
import { OverviewCard, OverviewNote } from "@/components/client/OverviewCard";
import {
  NutritionSummary,
  ProgrammeSummary,
  type SummaryRead,
} from "@/components/client/OverviewSummaries";
import { TrendChart } from "@/components/ui/charts";
import { Card, CardHead } from "@/components/ui/kit";
import {
  coachApi,
  hasScope,
  isForbidden,
  type CoachNutritionResponse,
  type CoachRoutineResponse,
  type FiredRedFlag,
} from "@/lib/coachApi";
import { readClientOverview, readClientProgress, readCoachMe } from "@/lib/clientOverview";
import { getCopy } from "@/lib/i18n/server";
import { firstName, formatDate, formatKg, formatShortDate } from "@/lib/format";
import { codedInjuryLabels } from "@/lib/guardrailLabels";
import { weightCaption } from "@/lib/weight";

/**
 * /clients/[id] — the trainee overview (AC5, EV-083's slice; redesigned by EV-337e, plan
 * §5.2: the header with its two buttons, « À traiter » alert cards, the stat cards,
 * « Activité récente » and the programme and nutrition summaries, then the detailed
 * monitoring blocks the earlier stories pinned).
 *
 * ⚠️ **It is no longer read-only, and this paragraph used to say it was.** EV-202b puts
 * ONE form on this page: the two values a coach writes about a trainee's body — a
 * coaching start date and a milestone weight — inside the progress block below. Every
 * other control here is a link, the back control or the revoke menu, and no block on
 * this page has an input for a number the trainee recorded: the four derived readings
 * have no write path and `CoachProgressGoalRequest` has no field for one (EV-202 Ruling
 * 1). Messaging and AI drafting remain absent and the footer says so.
 *
 * `force-dynamic` for the same reason as the roster: a revoked link must 403 on the
 * next request, so nothing about this page may be cached.
 */
export const dynamic = "force-dynamic";

type Settled<T> = { ok: true; value: T } | { ok: false; forbidden: boolean };

function settle<T>(read: Promise<T>): Promise<Settled<T>> {
  return read.then(
    (value): Settled<T> => ({ ok: true, value }),
    (err: unknown): Settled<T> => ({ ok: false, forbidden: isForbidden(err) })
  );
}

function summary<T>(shared: boolean, read: Settled<T> | null): SummaryRead<T> {
  if (!shared || !read) return { state: "notShared" };
  return read.ok ? { state: "ok", data: read.value } : { state: "unavailable" };
}

export default async function ClientPage({ params }: { params: { id: string } }) {
  const copy = getCopy();
  /**
   * The reads, and the order they are allowed to run in (page-read-budget: depth 2).
   *
   * Step 1, together: the overview (the layout's read, memoised for this request by
   * src/lib/clientOverview.ts — this component does not call the api a second time), the
   * monitoring read and the coach's name. The monitoring read is a second endpoint and not
   * a widening of the overview: it is the only one that requires PROGRESS, it is the
   * expensive one, and a link without PROGRESS is answered 403 there while the rest of
   * this page is a legitimate 200 — so it is asked for without waiting, and its failure is
   * a value (`null`), never the denial page.
   *
   * Step 2, after the overview: the two summary reads (EV-337e, plan G11/G12), each ONLY if
   * `scopes` holds its scope. Asking for a scope before `scopes` is known is exactly what
   * ADR-0015 D5 / C4 forbids (`routine/page.tsx` waits the same way), so these cost one
   * more round trip and never a request for withheld data.
   *
   * On a document load the 403 case for the overview never reaches here: `layout.tsx` has
   * already redirected to /clients/denied, which middleware serves with the status AC5 asks
   * for. On a tab change that renders on the server it does (the layout is not rendered
   * again): BUG-671, below, with its router-cache limit.
   */
  const progressRead = readClientProgress(params.id);
  const meRead = readCoachMe();
  const { overview, forbidden } = await readClientOverview(params.id);
  // BUG-671 — a TAB CHANGE does not render `layout.tsx` again (its segment is unchanged), so
  // the layout's 403 decision never runs on one; when the tab change renders this page on the
  // server, its own read is the only witness that the link ended. Same answer as the layout:
  // the denial page.
  // LIMIT (staff S1, witnessed on a production build): this runs only when the tab change
  // reaches the server. Next's client router cache keeps a dynamic page for 30 s
  // (`staleTimes.dynamic`, next.config.mjs, ADR-0033), so a tab visited in the last 30 s is
  // shown from the cache with NO server render, and still shows the stale page after the
  // link ended, until the cache entry expires or the page is reloaded. Changing the cache is
  // the architect's call against ADR-0012 D3, not this fix's.
  if (forbidden) redirect("/clients/denied");

  if (!overview) {
    // The notice is this page's only content, so its sentence is the h1. Without
    // `asHeading` the load error had no heading at all, the same gap /clients/denied had.
    const me = await meRead;
    return (
      <CoachShell coachName={me?.displayName} section="roster">
        <ClientNotice message={copy.client.loadError} asHeading />
      </CoachShell>
    );
  }

  /**
   * The per-block "not shared" states (ADR-0015 D5 R2-2 + sign-off edit F1).
   *
   * Two rules, and they are the whole of the decision:
   *   · WHETHER a block is shared is read from `overview.scopes` — never inferred from
   *     a null and never from a 403, because the api's 403 body is undifferentiated
   *     across every denial and says nothing about consent.
   *   · a block that is not shared renders a DASH and the words "Not shared". It never
   *     renders `0`, never "No streak", never "No weigh-ins in the last 8 weeks" — each
   *     of those is a statement about the trainee, and the trainee has not let this
   *     coach make it.
   *
   * **The scope flag comes FIRST in every block, and the null only after it.** That
   * ordering is what makes the page safe against an api that predates ADR-0015 B1, where
   * `scopes` is absent, so `hasScope` fails closed to false, while `currentStreakDays` is
   * a primitive `int` and `redFlags` a non-null list: a block that asked the null first
   * would render "4 days" and "No red flags" for a trainee whose consent this portal
   * cannot establish. Reading the flag first turns the whole page into "Not shared",
   * which under-claims and is the only safe direction to be wrong in.
   */
  const { adherenceThisWeek: adherence, lastSession, weightSeries, redFlags } = overview;
  const progressShared = hasScope(overview.scopes, "PROGRESS");
  const weighInsShared = hasScope(overview.scopes, "WEIGH_INS");
  const workoutsShared = hasScope(overview.scopes, "WORKOUTS");
  const nutritionShared = hasScope(overview.scopes, "NUTRITION");
  const nothingShared = !progressShared && !weighInsShared && !workoutsShared && !nutritionShared;

  const [progress, me, routineRead, nutritionRead] = await Promise.all([
    progressRead,
    meRead,
    workoutsShared ? settle<CoachRoutineResponse>(coachApi.getRoutine(params.id)) : null,
    nutritionShared ? settle<CoachNutritionResponse>(coachApi.getNutrition(params.id)) : null,
  ]);
  /**
   * A 403 on a summary read, with its scope held, means the link ended between the
   * layout's overview and this read: the same answer as every other denial. (This page
   * has a loading.tsx above it, so on a cold load the redirect degrades to a meta-refresh
   * with a 200 — the coach still lands on the denial page; the status AC5 pins is the
   * layout's.)
   */
  if ((routineRead && !routineRead.ok && routineRead.forbidden) || (nutritionRead && !nutritionRead.ok && nutritionRead.forbidden)) {
    redirect("/clients/denied");
  }
  const programme = summary(workoutsShared, routineRead);
  const nutrition = summary(nutritionShared, nutritionRead);

  const series = weighInsShared ? (weightSeries ?? []) : [];
  const latest = weighInsShared && series.length > 0 ? series[series.length - 1] : null;
  /**
   * Block 5 spans two scopes. `redFlags === null` is the ADR's "neither is held", but
   * a legacy api sends `[]` and means "nothing fired" — which is a claim about a
   * trainee whose sessions and weigh-ins this coach may never have been allowed to
   * read. Requiring at least one of the two scopes says the same thing the null does
   * and keeps saying it when the null is not there.
   *
   * The two scopes are the ones the api EVALUATES the rules on: WORKOUTS (missed
   * sessions) and WEIGH_INS (no weigh-in). `TraineeRedFlagRules.evaluate` returns `null`
   * only when neither is held (b-fit-api c82e55b). This line used to ask for PROGRESS
   * instead of WORKOUTS, which hid a WORKOUTS-only link's missed-sessions flag behind
   * "not shared" while the roster counted it (BUG-674, EV-337m M3).
   */
  const redFlagsShared = (workoutsShared || weighInsShared) && redFlags !== null;
  /** `0` is a real streak of zero days — but only if PROGRESS was actually shared. */
  const streak = progressShared ? overview.currentStreakDays : null;

  /**
   * EV-187b's two workout blocks (AC3's series, AC5's history — in « Recent activity »
   * since EV-342j) need TWO scopes, and
   * both checks are the portal reading `scopes` rather than reading a status code:
   * PROGRESS, because the api names it at the monitoring endpoint's guard; WORKOUTS,
   * because session names and weekly adherence are workout CONTENT and the api blanks
   * them on that scope inside the response. `readClientProgress` answers
   * `TraineeProgress | null` and nothing about the status it failed with: a block says
   * "not shared" from `scopes`; when the scope IS held and the data still did not arrive,
   * it says the api did not answer.
   */
  const monitoringShared = progressShared && workoutsShared;

  /**
   * The alert cards (« À traiter »). The evidence read (`progress.redFlags`) is preferred;
   * a link that carries WORKOUTS or WEIGH_INS but NOT PROGRESS gets its flags from the
   * overview (each rule is evaluated on its own scope) without the evidence the
   * PROGRESS-guarded read holds — a flag WITHOUT an evidence block, never one with an EMPTY
   * block. A degraded api answer lands there too.
   */
  const returned: FiredRedFlag[] =
    redFlagsShared && redFlags && redFlags.length > 0
      ? progress?.redFlags && progress.redFlags.length > 0
        ? progress.redFlags
        : redFlags.map((flag) => ({ flag, missedSessions: null, weighIn: null }))
      : [];
  /**
   * EV-337m M4 — only a flag this portal has a SENTENCE for becomes a card. `RedFlagCode`
   * keeps `PAIN_REPORTED` because it is the api's published enum (a type is a statement about
   * the wire); this filter is where "no pain signal renders" holds by construction (EV-187
   * AC4), and an unknown code from a newer api is not printed raw either.
   */
  const fired = returned.filter((f) => Object.hasOwn(copy.client.redFlagLabels, f.flag));
  const routineHref = workoutsShared ? `/clients/${overview.clientId}/routine` : null;

  /** The injury chips (under the tab bar since BUG-701): the CODED injuries the trainee recorded (G5), from the routine read only. */
  const injuries =
    programme.state === "ok" ? codedInjuryLabels(programme.data.guardrails?.injuries, copy).map(copy.client.injuryChip) : [];

  /** « Séances · N semaines »: the monitoring read's own sums over its own window. */
  const span = monitoringShared ? progress?.adherence ?? null : null;
  const spanHasPlan = span ? span.weeks.some((w) => w.hasPlan) : false;

  return (
    <CoachShell coachName={me?.displayName} section="roster">
      <ClientHeader
        clientId={overview.clientId}
        traineeDisplayName={overview.traineeDisplayName}
        since={overview.since}
        active="overview"
        action={<RevokeMenu clientId={overview.clientId} displayName={overview.traineeDisplayName} />}
      />

      {/* BUG-701 (senior-po ruling): the injury chips sit under the tab bar, above the first
          card, so the header and the bar are the same block on all three client pages. */}
      <ClientInjuryChips chips={injuries} />

      {nothingShared && (
        // The design's « Vide » state: the link shares no data scope at all. Said once, up
        // front, in words — every block below still says "not shared" in its own place.
        <div className="ov-section">
          <OverviewCard id="ov-nodata" title={copy.client.noData.title}>
            <OverviewNote>{copy.client.noData.body(overview.traineeDisplayName)}</OverviewNote>
          </OverviewCard>
        </div>
      )}

      {/* ── « À traiter »: the flags the api returned, and only those ───────────── */}
      <div className="ov-section">
        <OverviewCard
          id="ov-review"
          title={copy.client.toReview}
          aside={
            fired.length > 0 ? (
              <span className="count-chip" data-tone="red">
                <span aria-hidden="true">{fired.length}</span>
                <span className="sr-only">{copy.client.alertCount(fired.length)}</span>
              </span>
            ) : undefined
          }
        >
          {/* null = neither WORKOUTS nor WEIGH_INS; [] = at least one held and nothing
              fired. Collapsing the two would tell a coach "No red flags" about a trainee
              whose sessions and weigh-ins they have never been allowed to read — so the
              scope check stands in front of the null rather than behind it. */}
          {!redFlagsShared || redFlags === null ? (
            <OverviewNote>{copy.client.notSharedRedFlags}</OverviewNote>
          ) : returned.length > 0 && fired.length === 0 ? (
            // The api returned flags and none is one this page labels: never "No red flags".
            <OverviewNote>{copy.client.noRedFlagsShown}</OverviewNote>
          ) : fired.length === 0 ? (
            <OverviewNote>{copy.client.noRedFlags}</OverviewNote>
          ) : (
            <RedFlagEvidence flags={fired} routineHref={routineHref} />
          )}
        </OverviewCard>
      </div>

      <div className="stat-grid overview-stats ov-section">
        <StatTile
          label={copy.client.adherence}
          // WORKOUTS, the scope the api computes this week's adherence under (`if (workouts)`
          // in CoachPortalQueryService at c82e55b; BUG-674). Held and still absent is an api
          // that did not answer, never "not shared".
          value={
            workoutsShared && adherence
              ? copy.client.adherenceValue(adherence.done, adherence.planned)
              : copy.common.dash
          }
          foot={
            !workoutsShared
              ? copy.client.notShared
              : adherence
                ? copy.client.adherenceFoot
                : copy.client.unavailable
          }
          visual={
            workoutsShared && adherence && adherence.planned > 0 ? (
              <ProgressRing
                done={adherence.done}
                planned={adherence.planned}
                label={copy.client.adherenceRing(adherence.done, adherence.planned)}
              />
            ) : undefined
          }
        />
        <StatTile
          // The window is the api's own (`weeks`); with no monitoring read there is no
          // window to name, so the label does not guess one.
          label={progress ? copy.client.sessionsWindow(progress.weeks) : copy.client.sessionsLabel}
          value={span && spanHasPlan ? String(span.done) : copy.common.dash}
          foot={
            !monitoringShared
              ? copy.client.notShared
              : !span
                ? copy.client.unavailable
                : spanHasPlan
                  ? copy.client.sessionsOfPlanned(span.planned)
                  : copy.client.sessionsNoPlan
          }
        />
        <StatTile
          label={copy.client.streak}
          // `0` is a real streak of zero days and reads as one; a link without PROGRESS
          // gets the dash instead (F1 change 1 is what makes the two distinguishable —
          // and `streak` above re-applies the scope, so an api that never nulls the
          // field cannot slip a number through here either).
          value={streak === null ? copy.common.dash : copy.client.streakUnit(streak)}
          foot={streak === null ? copy.client.notShared : undefined}
        />
        <StatTile
          label={copy.client.lastSession}
          // WORKOUTS, the scope the api sends it under (`workouts ? lastSession(...) : null`
          // at c82e55b). Gated on PROGRESS, a link without WORKOUTS read "No sessions yet"
          // about sessions the coach was never given (ADR-0015 F1), and a WORKOUTS-only link
          // hid the session the api sent (staff nit 1 on EV-337m).
          value={
            workoutsShared && lastSession
              ? formatDate(lastSession.date, copy.locale)
              : workoutsShared
                ? copy.client.noSession
                : copy.common.dash
          }
          foot={
            !workoutsShared ? (
              copy.client.notShared
            ) : lastSession ? (
              <span>
                {/* `name` is null when the workout row has since gone — then the
                    feedback stands alone rather than reading "— · Hard". */}
                {lastSession.name ? `${lastSession.name} · ` : ""}
                {lastSession.difficulty
                  ? copy.client.feedback[lastSession.difficulty]
                  : copy.client.noFeedback}
              </span>
            ) : undefined
          }
        />
        <StatTile
          label={copy.client.weight}
          value={latest ? formatKg(latest.weightKg, copy.locale) : copy.common.dash}
          // One caption, derived from the same series as the value and the sparkline
          // (BUG-144) — see src/lib/weight.ts. A link without WEIGH_INS has no series
          // to derive from and must not borrow block 4's empty-state sentence.
          foot={weighInsShared ? weightCaption(series, copy) : copy.client.notShared}
        />
      </div>

      {/* Two columns from a 1280 px viewport (plan §3), one below: the activity, then the
          programme and nutrition summaries. */}
      <div className="layout-split ov-section">
        {/* EV-342j: the overview's one session list. EV-187 AC5's history block below
            folded into it (the last ten, five shown, the rest opened in place). The same
            two scopes the history block needed: PROGRESS for the read, WORKOUTS for
            the session content inside it. */}
        <RecentActivity
          history={monitoringShared ? progress?.sessions ?? null : null}
          state={
            !progressShared
              ? "notSharedProgress"
              : !workoutsShared
                ? "notSharedWorkouts"
                : progress?.sessions
                  ? "shared"
                  : "unavailable"
          }
        />
        <div className="ov-stack">
          <ProgrammeSummary clientId={overview.clientId} read={programme} />
          <NutritionSummary clientId={overview.clientId} read={nutrition} />
        </div>
      </div>

      <Card style={{ marginBottom: 18 }}>
        <CardHead title={copy.client.weightTrend} icon="chart" />
        {!weighInsShared ? (
          <p style={{ margin: 0, fontSize: 13.5, color: "var(--ink-3)" }}>
            {copy.client.notSharedWeighIns}
          </p>
        ) : series.length > 0 ? (
          <TrendChart
            points={series.map((p) => ({ label: formatShortDate(p.date, copy.locale), value: p.weightKg }))}
            ariaLabel={copy.common.labelled(
              copy.client.weightTrend,
              series.map((p) => `${formatShortDate(p.date, copy.locale)} ${formatKg(p.weightKg, copy.locale)}`).join(", ")
            )}
          />
        ) : (
          <p style={{ margin: 0, fontSize: 13.5, color: "var(--ink-3)" }}>
            {copy.client.noWeighIns}
          </p>
        )}
      </Card>

      {/* ── EV-202b: where they started, where they are, where they are going ─
          The WEIGH_INS block, so it sits with the weight trend and nowhere near the
          plan or the calorie targets — G-GOAL is a layout constraint as well as an
          api one. The scope flag is asked FIRST and the null only after it, the same
          ordering every other block on this page uses. */}
      {!weighInsShared ? (
        <MonitoringBlock title={copy.progressGoal.title} icon="trend">
          {/* AC6, verbatim, and decided from `scopes` — never inferred from the 403
              that `PUT …/progress-goal` would answer, which is undifferentiated
              across five denials and says nothing about consent. */}
          <BlockNote>
            {copy.progressGoal.notShared(firstName(overview.traineeDisplayName, copy.locale))}
          </BlockNote>
        </MonitoringBlock>
      ) : !overview.progressGoal ? (
        <MonitoringBlock title={copy.progressGoal.title} icon="trend">
          {/* WEIGH_INS IS held, so the api owed a block: `progressGoal` is non-null
              even for a trainee who has never recorded anything (every reading inside
              is then null). Its absence is therefore an api that did not answer — an
              older deployment, or a degraded one — and never a consent statement. */}
          <BlockNote>{copy.progressGoal.loadError}</BlockNote>
        </MonitoringBlock>
      ) : (
        <ProgressGoalBlock
          clientId={overview.clientId}
          coachId={me?.coachId ?? null}
          traineeDisplayName={overview.traineeDisplayName}
          goal={overview.progressGoal}
        />
      )}

      {/* ── EV-187 AC3: eight weeks of adherence ───────────────────────────── */}
      {!monitoringShared ? (
        <MonitoringBlock title={copy.client.adherenceSeries} icon="chart">
          {/* BUG-700: name the scope that is actually missing. PROGRESS held without
              WORKOUTS (Sara) is the workouts sentence — "has not shared their progress"
              would be false about a trainee who shared it. */}
          <BlockNote>{progressShared ? copy.routine.scopeMissing : copy.client.notSharedProgress}</BlockNote>
        </MonitoringBlock>
      ) : !progress?.adherence ? (
        <MonitoringBlock title={copy.client.adherenceSeries} icon="chart">
          {/* `monitoringShared` says the api should have sent a series, so a missing one
              is the api not answering — never "not shared", which would be this page
              inventing a consent fact from an outage. */}
          <BlockNote>{copy.client.monitoringLoadError}</BlockNote>
        </MonitoringBlock>
      ) : (
        <AdherenceSeries series={progress.adherence} />
      )}

      <p style={{ margin: 0, fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.55 }}>
        {copy.client.footNote}
      </p>
    </CoachShell>
  );
}
