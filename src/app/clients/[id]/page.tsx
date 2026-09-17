import { CoachShell } from "@/components/shell/CoachShell";
import { ClientNotice } from "@/components/client/ClientNotice";
import { ClientHeader } from "@/components/client/ClientHeader";
import { RevokeMenu } from "@/components/client/RevokeMenu";
import { StatTile } from "@/components/client/StatTile";
import { TrendChart } from "@/components/ui/charts";
import { Card, CardHead } from "@/components/ui/kit";
import { UiIcon } from "@/components/ui/icons";
import { hasScope } from "@/lib/coachApi";
import { readClientOverview, readCoachMe } from "@/lib/clientOverview";
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
  const [{ overview }, me] = await Promise.all([
    readClientOverview(params.id),
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
        ) : (
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
