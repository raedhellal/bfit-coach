import Link from "next/link";
import { Badge, DataTable, Td } from "@/components/ui/kit";
import type { ActivitySource, ChallengeMetric, CoachChallengeDetail, CoachChallengeParticipant } from "@/lib/coachApi";
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
      {/*
        Redesign branch 1: the shell's 240 px sidebar leaves 974 px inside this card at a
        1280 px viewport (it was 1114), so the steps floor came down from 1040 to 940 and the
        headers may wrap — in French "JOURS RÉUSSIS" and "DERNIÈRE SYNCHRO" set two columns'
        widths on one line (min-content 1017 px). Measured: EN and FR both fit at 1280.
        Branch 7 replaces this table with participant rows.
      */}
      <DataTable columns={columns} minWidth={steps ? 940 : 860} wrapHeaders>
        {detail.participants.map((p) =>
          p.progress === null ? (
            <InvitedRow key={p.clientId} p={p} copy={copy} metric={detail.challenge.metric} span={columns.length - 3} />
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

function InvitedRow({
  p,
  copy,
  metric,
  span,
}: {
  p: CoachChallengeParticipant;
  copy: Copy;
  metric: ChallengeMetric;
  span: number;
}) {
  const c = copy.challenges;
  // By metric, like the consent line: an unknown metric says nothing rather than claim steps.
  const note = metric === "STEPS" ? c.invitedNote : metric === "WORKOUTS" ? c.invitedNoteWorkouts : null;
  return (
    <tr data-participant={p.clientId} data-status="INVITED">
      <Td>{copy.common.dash}</Td>
      <NameCell p={p} copy={copy} />
      <Td>
        <Badge tone="amber">{copy.challenges.status.INVITED}</Badge>
      </Td>
      <td colSpan={span} style={{ padding: "13px 16px", fontSize: 12.5, color: "var(--ink-3)", borderTop: "1px solid var(--hairline)" }}>
        {note}
      </td>
    </tr>
  );
}

/**
 * Where TODAY's number came from — the day the row shows — and nothing else.
 *
 * BUG-473: this used to fall back to the latest earlier day with a source when today had
 * none, so a client who typed Tuesday by hand and sent nothing today read "Manual entry"
 * beside today's "—" — the label named a day the row does not show. No row today means
 * no source label at all (the strip's squares carry no source either: nothing on the row
 * attributes an earlier day).
 */
function todaySource(p: CoachChallengeParticipant): ActivitySource | null {
  const progress = p.progress;
  if (!progress || progress.todayValue === null) return null;
  return progress.todaySource ?? null;
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
  const source = todaySource(p);
  const today = progress.todayValue;
  /**
   * The bar's width FLOORS and its colour follows the goal, not the width. With
   * `Math.round`, 9,950–9,999 of 10,000 drew a full green bar on a day the api still
   * calls IN_PROGRESS: the picture said "done" before the number did. Floor keeps
   * anything short of the goal visibly short (99 %), and green means `today >= target`,
   * the same comparison the api's calculator makes for MET.
   */
  const met = today !== null && progress.target > 0 && today >= progress.target;
  const pct = today === null || progress.target <= 0 ? 0 : Math.min(100, Math.floor((today / progress.target) * 100));

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
                data-met={met ? "true" : "false"}
                style={{ marginTop: 6, height: 6, borderRadius: 3, background: "var(--surface-2)", overflow: "hidden", maxWidth: 160 }}
              >
                <div
                  style={{
                    width: `${pct}%`,
                    height: "100%",
                    borderRadius: 3,
                    background: met ? "var(--ok)" : "var(--blue-500)",
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
