import Link from "next/link";
import { Badge, DataTable, Td } from "@/components/ui/kit";
import type { ActivitySource, CoachChallengeDetail, CoachChallengeParticipant } from "@/lib/coachApi";
import type { Copy } from "@/lib/copy";
import { formatSince, formatSteps } from "@/lib/format";
import { DayLegend, DayStrip } from "./DayStrip";

/**
 * EV-321b — the ranked progress table.
 *
 * Rows are rendered in the order the api SERVES them: it ranks (daysMet, then total, with
 * shared ranks) and puts INVITED after ACCEPTED. A client-side sort here would be a
 * second, disagreeing implementation of the one rule the demo is about.
 *
 * 🔴 `null` is never `0` on this table. `todayValue: null` renders "—" with no bar (an
 * empty bar is a picture of zero), a day with no data is an outlined square named "no
 * data", and an INVITED participant — who has not consented to share anything — gets no
 * number at all, just the status and one sentence saying why.
 */
export function ProgressTable({ detail, copy, now }: { detail: CoachChallengeDetail; copy: Copy; now: number }) {
  const c = copy.challenges;
  const steps = detail.challenge.metric === "STEPS";
  const columns = [
    { label: c.colRank, w: 56 },
    { label: c.colClient },
    { label: c.colStatus },
    { label: c.colToday },
    { label: c.colDaysMet, align: "right" as const },
    { label: c.colTotal, align: "right" as const },
    { label: c.colSynced },
    ...(steps ? [{ label: c.colDays }] : []),
  ];
  return (
    <section aria-label={c.progressLabel}>
      <DataTable columns={columns} minWidth={steps ? 1040 : 860}>
        {detail.participants.map((p) =>
          p.progress === null ? (
            <InvitedRow key={p.clientId} p={p} copy={copy} span={columns.length - 3} />
          ) : (
            <AcceptedRow key={p.clientId} p={p} copy={copy} now={now} steps={steps} />
          )
        )}
      </DataTable>
      {steps && <DayLegend copy={copy} />}
    </section>
  );
}

function nameOf(p: CoachChallengeParticipant, copy: Copy): string {
  return p.displayName?.trim() ? p.displayName : copy.challenges.unnamed;
}

function NameCell({ p, copy }: { p: CoachChallengeParticipant; copy: Copy }) {
  return (
    <Td style={{ fontWeight: 600, color: "var(--ink)", whiteSpace: "nowrap" }}>
      <Link href={`/clients/${encodeURIComponent(p.clientId)}`} style={{ color: "inherit" }}>
        {nameOf(p, copy)}
      </Link>
    </Td>
  );
}

function InvitedRow({ p, copy, span }: { p: CoachChallengeParticipant; copy: Copy; span: number }) {
  return (
    <tr data-participant={p.clientId} data-status="INVITED">
      <Td>{copy.common.dash}</Td>
      <NameCell p={p} copy={copy} />
      <Td>
        <Badge tone="amber">{copy.challenges.status.INVITED}</Badge>
      </Td>
      <td colSpan={span} style={{ padding: "13px 16px", fontSize: 12.5, color: "var(--ink-3)", borderTop: "1px solid var(--hairline)" }}>
        {copy.challenges.invitedNote}
      </td>
    </tr>
  );
}

/** The source of the latest day with a value — "where the number came from". */
function latestSource(p: CoachChallengeParticipant): ActivitySource | null {
  const progress = p.progress;
  if (!progress) return null;
  if (progress.todaySource) return progress.todaySource;
  const withValue = (progress.days ?? []).filter((d) => d.value !== null && d.source !== null);
  return withValue.length ? withValue[withValue.length - 1].source : null;
}

function AcceptedRow({
  p,
  copy,
  now,
  steps,
}: {
  p: CoachChallengeParticipant;
  copy: Copy;
  now: number;
  steps: boolean;
}) {
  const c = copy.challenges;
  const progress = p.progress!;
  const name = nameOf(p, copy);
  const n = (value: number) => formatSteps(value, copy.locale);
  const source = latestSource(p);
  const today = progress.todayValue;
  const pct = today === null || progress.target <= 0 ? 0 : Math.min(100, Math.round((today / progress.target) * 100));

  return (
    <tr data-participant={p.clientId} data-status="ACCEPTED" data-rank={p.rank ?? ""}>
      <Td style={{ fontWeight: 700, color: "var(--ink)" }}>{p.rank === null ? copy.common.dash : c.rank(p.rank)}</Td>
      <NameCell p={p} copy={copy} />
      <Td>
        <Badge tone="green">{c.status.ACCEPTED}</Badge>
      </Td>
      <Td>
        {steps ? (
          <div data-today={today === null ? "" : String(today)}>
            <div style={{ fontSize: 13, color: "var(--ink)", whiteSpace: "nowrap" }}>
              {c.todaySteps(today === null ? copy.common.dash : n(today), n(progress.target))}
            </div>
            {today !== null && (
              <div
                role="progressbar"
                aria-label={c.todayBar(name)}
                aria-valuemin={0}
                aria-valuemax={progress.target}
                aria-valuenow={today}
                aria-valuetext={c.todaySteps(n(today), n(progress.target))}
                data-pct={pct}
                style={{ marginTop: 6, height: 6, borderRadius: 3, background: "var(--surface-2)", overflow: "hidden", maxWidth: 160 }}
              >
                <div
                  style={{
                    width: `${pct}%`,
                    height: "100%",
                    borderRadius: 3,
                    background: pct >= 100 ? "var(--ok)" : "var(--blue-500)",
                  }}
                />
              </div>
            )}
          </div>
        ) : (
          c.todayWorkouts(today === null ? copy.common.dash : n(today))
        )}
      </Td>
      <Td align="right">
        {progress.daysMet === null ? (
          copy.common.dash
        ) : (
          <span aria-label={c.daysMetLabel(progress.daysMet, progress.daysElapsed)} title={c.daysMetLabel(progress.daysMet, progress.daysElapsed)}>
            {c.daysMet(progress.daysMet, progress.daysElapsed)}
          </span>
        )}
      </Td>
      <Td align="right" style={{ whiteSpace: "nowrap" }}>
        {steps ? c.totalSteps(n(progress.total)) : c.totalWorkouts(n(progress.total), n(progress.target))}
      </Td>
      {/* When, then where from — the source is the label of the number, not a column of its own. */}
      <Td style={{ whiteSpace: "nowrap" }}>
        <div data-synced>{formatSince(progress.syncedAt, now, copy.locale)}</div>
        {source && (
          <div data-source={source} style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>
            {c.source[source]}
          </div>
        )}
      </Td>
      {steps && <Td style={{ minWidth: 170 }}>{progress.days ? <DayStrip days={progress.days} name={name} copy={copy} /> : copy.common.dash}</Td>}
    </tr>
  );
}
