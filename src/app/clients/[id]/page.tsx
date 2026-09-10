import Link from "next/link";
import { CoachShell } from "@/components/shell/CoachShell";
import { RevokeMenu } from "@/components/client/RevokeMenu";
import { StatTile } from "@/components/client/StatTile";
import { TrendChart } from "@/components/ui/charts";
import { Avatar, Badge, Button, Card, CardHead } from "@/components/ui/kit";
import { UiIcon } from "@/components/ui/icons";
import { coachApi, isForbidden, type ClientOverview } from "@/lib/coachApi";
import { copy } from "@/lib/copy";
import { formatDate, formatInstant, formatKg, formatShortDate } from "@/lib/format";
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
  let overview: ClientOverview | null = null;
  let forbidden = false;

  // The coach's own name is only needed for the header, so a failure there must not
  // take down the overview: it degrades to a header without a name.
  const mePromise = coachApi.getMe().catch(() => null);

  try {
    overview = await coachApi.getClient(params.id);
  } catch (err) {
    // ADR-0012 D4: the coach portal answers 403 for a foreign id AND for one that does
    // not exist, so there is no existence oracle. Both land here, and they must read
    // the same to the coach.
    forbidden = isForbidden(err);
  }

  const me = await mePromise;

  if (!overview) {
    return (
      <CoachShell coachName={me?.displayName}>
        <Card>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 14,
              padding: "32px 16px",
              textAlign: "center",
            }}
          >
            <UiIcon name="ban" size={26} color="var(--err-ink)" />
            <div style={{ fontSize: 14.5, color: "var(--ink-2)", maxWidth: 380, lineHeight: 1.5 }}>
              {forbidden ? copy.client.notFound : copy.client.loadError}
            </div>
            <Link href="/">
              <Button variant="secondary" icon="arrowL">
                {copy.shell.backToRoster}
              </Button>
            </Link>
          </div>
        </Card>
      </CoachShell>
    );
  }

  const { adherenceThisWeek: adherence, lastSession, weightSeries, redFlags } = overview;
  const latest = weightSeries.length > 0 ? weightSeries[weightSeries.length - 1] : null;

  return (
    <CoachShell coachName={me?.displayName}>
      <div style={{ marginBottom: 18 }}>
        <Link
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            color: "var(--ink-3)",
            marginBottom: 14,
          }}
        >
          <UiIcon name="arrowL" size={14} color="var(--ink-3)" />
          {copy.shell.backToRoster}
        </Link>

        <div style={{ display: "flex", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
          <Avatar name={overview.traineeDisplayName} size={48} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1
              className="dt"
              style={{
                margin: 0,
                fontWeight: 700,
                fontSize: 24,
                letterSpacing: -0.6,
                color: "var(--ink)",
                overflowWrap: "anywhere",
              }}
            >
              {overview.traineeDisplayName}
            </h1>
            {/*
              No plan badge: `TraineeOverviewResponse` carries no plan name — the plan
              is a roster-row field only. Rendering "No plan" here would state
              something about the trainee that this response does not say.
            */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 7 }}>
              <Badge tone="neutral">
                {copy.client.coachedSince(formatInstant(overview.since))}
              </Badge>
            </div>
          </div>
          <RevokeMenu clientId={overview.clientId} displayName={overview.traineeDisplayName} />
        </div>
      </div>

      <div className="stat-grid" style={{ marginBottom: 18 }}>
        <StatTile
          icon="check"
          tone="blue"
          label={copy.client.adherence}
          value={copy.client.adherenceValue(adherence.done, adherence.planned)}
          foot={copy.client.adherenceFoot}
        />
        <StatTile
          icon="flame"
          tone="amber"
          label={copy.client.streak}
          value={copy.client.streakUnit(overview.currentStreakDays)}
        />
        <StatTile
          icon="calendar"
          tone="purple"
          label={copy.client.lastSession}
          value={lastSession ? formatDate(lastSession.date) : copy.client.noSession}
          foot={
            lastSession ? (
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
          // (BUG-144) — see src/lib/weight.ts.
          foot={weightCaption(weightSeries)}
        />
      </div>

      <Card style={{ marginBottom: 18 }}>
        <CardHead title={copy.client.weightTrend} icon="chart" />
        {weightSeries.length > 0 ? (
          <TrendChart
            points={weightSeries.map((p) => ({ label: formatShortDate(p.date), value: p.weightKg }))}
            ariaLabel={`${copy.client.weightTrend}: ${weightSeries
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
        {redFlags.length === 0 ? (
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
