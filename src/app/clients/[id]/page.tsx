import { CoachShell } from "@/components/shell/CoachShell";
import { ClientNotice } from "@/components/client/ClientNotice";
import { ClientHeader } from "@/components/client/ClientHeader";
import { RevokeMenu } from "@/components/client/RevokeMenu";
import { StatTile } from "@/components/client/StatTile";
import { AdherenceSeries } from "@/components/client/AdherenceSeries";
import { BlockNote, MonitoringBlock } from "@/components/client/MonitoringBlock";
import { SessionHistory } from "@/components/client/SessionHistory";
import { RedFlagEvidence } from "@/components/client/RedFlagEvidence";
import { TrendChart } from "@/components/ui/charts";
import { Card, CardHead } from "@/components/ui/kit";
import { UiIcon } from "@/components/ui/icons";
import { hasScope } from "@/lib/coachApi";
import { readClientOverview, readClientProgress, readCoachMe } from "@/lib/clientOverview";
import { copy } from "@/lib/copy";
import { formatDate, formatKg, formatShortDate } from "@/lib/format";
import { weightCaption } from "@/lib/weight";

/**
 * /clients/[id] — the read-only trainee overview (AC5, EV-083's slice).
 *
 * Read-only is a hard property, not a description: the only interactive elements on
 * this page are links, the back control and the revoke menu. No form, no input, no
 * message box, no AI action, no publish — MVE-3/MVE-4/MVE-5 are excluded by the story
 * and the footer says so to the person looking at the screen.
 *
 * `force-dynamic` for the same reason as the roster: a revoked link must 403 on the
 * next request, so nothing about this page may be cached.
 */
export const dynamic = "force-dynamic";

export default async function ClientPage({ params }: { params: { id: string } }) {
  /**
   * Both reads are the layout's, memoised for this request (src/lib/clientOverview.ts)
   * — this component does not call the api a second time.
   *
   * The 403 case never reaches here: `layout.tsx` has already redirected to
   * /clients/denied, which middleware serves with the status AC5 asks for. What is left
   * for this branch is the api being unreachable or answering 5xx, and that must not
   * tell the coach they are not linked to a trainee they may well be linked to.
   */
  /**
   * Three reads, in parallel. The monitoring read (EV-187b) is a second endpoint and
   * not a widening of the overview: it is the only one that requires the PROGRESS
   * scope, it is the expensive one (the 8-week range, the schedule and up to ten
   * session titles), and a link without PROGRESS is answered 403 for it while the rest
   * of this page is a legitimate 200.
   */
  const [{ overview }, progress, me] = await Promise.all([
    readClientOverview(params.id),
    readClientProgress(params.id),
    readCoachMe(),
  ]);

  if (!overview) {
    return (
      <CoachShell coachName={me?.displayName}>
        <ClientNotice message={copy.client.loadError} />
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
   * The nulls in the types are the api refusing to assert; the sentences here are the
   * portal explaining why. They are two different things and both are needed.
   *
   * **The scope flag comes FIRST in every block, and the null only after it.** That
   * ordering is what makes the page safe against an api that predates ADR-0015 B1 —
   * b-fit-api main, which is what the Vercel deployment talks to. There `scopes` is
   * absent, so `hasScope` fails closed to false, while `currentStreakDays` is a
   * primitive `int` and `redFlags` a non-null list: a block that asked the null first
   * would render "4 days" and "No red flags" for a trainee whose consent this portal
   * cannot establish. Reading the flag first turns the whole page into "Not shared",
   * which under-claims and is the only safe direction to be wrong in.
   */
  const { adherenceThisWeek: adherence, lastSession, weightSeries, redFlags } = overview;
  const progressShared = hasScope(overview.scopes, "PROGRESS");
  const weighInsShared = hasScope(overview.scopes, "WEIGH_INS");
  const series = weighInsShared ? (weightSeries ?? []) : [];
  const latest = weighInsShared && series.length > 0 ? series[series.length - 1] : null;
  /**
   * Block 5 spans two scopes. `redFlags === null` is the ADR's "neither is held", but
   * a legacy api sends `[]` and means "nothing fired" — which is a claim about a
   * trainee whose sessions and weigh-ins this coach may never have been allowed to
   * read. Requiring at least one of the two scopes says the same thing the null does
   * and keeps saying it when the null is not there.
   */
  const redFlagsShared = (progressShared || weighInsShared) && redFlags !== null;
  /** `0` is a real streak of zero days — but only if PROGRESS was actually shared. */
  const streak = progressShared ? overview.currentStreakDays : null;

  /**
   * EV-187b's two workout blocks (AC3's series, AC5's history) need TWO scopes, and
   * both checks are the portal reading `scopes` rather than reading a status code:
   *
   *   · PROGRESS, because the api names it at the monitoring endpoint's guard — a link
   *     without it is answered 403 there, and that 403 is undifferentiated (ADR-0012
   *     D4), so it is not evidence of anything and is never rendered as a consent
   *     statement.
   *   · WORKOUTS, because session names and weekly adherence are workout CONTENT and
   *     the api blanks them on that scope inside the response, exactly as the shipped
   *     overview blanks `adherenceThisWeek` and `lastSession`.
   *
   * AC1's trainee Q holds WORKOUTS and NUTRITION but not PROGRESS; trainee R holds
   * PROGRESS but not WEIGH_INS. Requiring both is what makes Q read the progress
   * sentence and R read the weigh-in one.
   */
  const workoutsShared = hasScope(overview.scopes, "WORKOUTS");
  const monitoringShared = progressShared && workoutsShared;
  /**
   * ⚠️ `readClientProgress` answers `TraineeProgress | null` and NOTHING about the
   * status it failed with. That is deliberate: the api's 403 is undifferentiated across
   * "no such id", "another coach's client", "revoked" and "scope missing" (ADR-0012 D4),
   * so branching on it would be the portal inferring consent from a status code — the
   * one thing ADR-0015 R2-2 forbids. A block says "not shared" from `scopes`; when the
   * scope IS held and the data still did not arrive, it says the api did not answer.
   */

  return (
    <CoachShell coachName={me?.displayName}>
      <ClientHeader
        clientId={overview.clientId}
        traineeDisplayName={overview.traineeDisplayName}
        since={overview.since}
        active="overview"
        action={
          <RevokeMenu clientId={overview.clientId} displayName={overview.traineeDisplayName} />
        }
      />

      <div className="stat-grid" style={{ marginBottom: 18 }}>
        <StatTile
          icon="check"
          tone="blue"
          label={copy.client.adherence}
          value={
            progressShared && adherence
              ? copy.client.adherenceValue(adherence.done, adherence.planned)
              : copy.common.dash
          }
          foot={
            progressShared && adherence ? copy.client.adherenceFoot : copy.client.notShared
          }
        />
        <StatTile
          icon="flame"
          tone="amber"
          label={copy.client.streak}
          // `0` is a real streak of zero days and reads as one; a link without PROGRESS
          // gets the dash instead (F1 change 1 is what makes the two distinguishable —
          // and `streak` above re-applies the scope, so an api that never nulls the
          // field cannot slip a number through here either).
          value={streak === null ? copy.common.dash : copy.client.streakUnit(streak)}
          foot={streak === null ? copy.client.notShared : undefined}
        />
        <StatTile
          icon="calendar"
          tone="purple"
          label={copy.client.lastSession}
          value={
            progressShared && lastSession
              ? formatDate(lastSession.date)
              : progressShared
                ? copy.client.noSession
                : copy.common.dash
          }
          foot={
            !progressShared ? (
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
          icon="trend"
          tone="green"
          label={copy.client.weight}
          value={latest ? formatKg(latest.weightKg) : copy.common.dash}
          // One caption, derived from the same series as the value and the sparkline
          // (BUG-144) — see src/lib/weight.ts. A link without WEIGH_INS has no series
          // to derive from and must not borrow block 4's empty-state sentence.
          foot={weighInsShared ? weightCaption(series) : copy.client.notShared}
        />
      </div>

      <Card style={{ marginBottom: 18 }}>
        <CardHead title={copy.client.weightTrend} icon="chart" />
        {!weighInsShared ? (
          <p style={{ margin: 0, fontSize: 13.5, color: "var(--ink-3)" }}>
            {copy.client.notSharedWeighIns}
          </p>
        ) : series.length > 0 ? (
          <TrendChart
            points={series.map((p) => ({ label: formatShortDate(p.date), value: p.weightKg }))}
            ariaLabel={`${copy.client.weightTrend}: ${series
              .map((p) => `${formatShortDate(p.date)} ${formatKg(p.weightKg)}`)
              .join(", ")}`}
          />
        ) : (
          <p style={{ margin: 0, fontSize: 13.5, color: "var(--ink-3)" }}>
            {copy.client.noWeighIns}
          </p>
        )}
      </Card>

      {/* ── EV-187 AC3: eight weeks of adherence ───────────────────────────── */}
      {!monitoringShared ? (
        <MonitoringBlock title={copy.client.adherenceSeries} icon="chart">
          <BlockNote>{copy.client.notSharedProgress}</BlockNote>
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

      {/* ── EV-187 AC5: the last ten sessions ──────────────────────────────── */}
      {!monitoringShared ? (
        <MonitoringBlock title={copy.client.sessionHistory} icon="calendar">
          <BlockNote>{copy.client.notSharedProgress}</BlockNote>
        </MonitoringBlock>
      ) : !progress?.sessions ? (
        <MonitoringBlock title={copy.client.sessionHistory} icon="calendar">
          <BlockNote>{copy.client.monitoringLoadError}</BlockNote>
        </MonitoringBlock>
      ) : (
        <SessionHistory history={progress.sessions} />
      )}

      <Card style={{ marginBottom: 18 }}>
        <CardHead title={copy.client.redFlags} icon="flag" />
        {/* null = neither PROGRESS nor WEIGH_INS; [] = at least one held and nothing
            fired. Collapsing the two would tell a coach "No red flags" about a trainee
            whose sessions and weigh-ins they have never been allowed to read — so the
            scope check stands in front of the null rather than behind it. */}
        {!redFlagsShared || redFlags === null ? (
          <p style={{ margin: 0, fontSize: 13.5, color: "var(--ink-3)" }}>
            {copy.client.notSharedRedFlags}
          </p>
        ) : redFlags.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13.5, color: "var(--ink-2)" }}>
            {copy.client.noRedFlags}
          </p>
        ) : progress?.redFlags && progress.redFlags.length > 0 ? (
          /**
           * EV-187 AC4 — the SAME flags, now carrying the evidence they fired on. It is
           * one evaluation projected twice (the overview's codes and this list), so the
           * badge on the roster, the codes here and the evidence cannot disagree.
           */
          <RedFlagEvidence flags={progress.redFlags} />
        ) : (
          /**
           * The shipped EV-183 rendering, and the one case that still reaches it: a link
           * that carries WEIGH_INS but NOT PROGRESS. The overview evaluates the weigh-in
           * rule on `WEIGH_INS` alone, while the evidence endpoint names PROGRESS at its
           * guard — so the flag is real and this coach may see it, and the evidence
           * behind it is not theirs to read. A degraded api answer lands here too.
           *
           * It is a flag WITHOUT an evidence block, never a flag with an EMPTY one:
           * AC4's clause is about the latter, and `RedFlagEvidence` cannot produce it.
           */
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 10 }}>
            {redFlags.map((code) => (
              <li
                key={code}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "11px 13px",
                  borderRadius: "var(--r-lg)",
                  background: "var(--err-bg)",
                  color: "var(--err-ink)",
                  fontSize: 13.5,
                  fontWeight: 600,
                  lineHeight: 1.4,
                }}
              >
                <UiIcon name="flag" size={16} color="var(--err-ink)" />
                {copy.client.redFlagLabels[code] || code}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p style={{ margin: 0, fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.55 }}>
        {copy.client.footNote}
      </p>
    </CoachShell>
  );
}
