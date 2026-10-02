import { OverviewCard, OverviewNote } from "./OverviewCard";
import { getCopy } from "@/lib/i18n/server";
import { formatDate, formatKg, formatKgDelta } from "@/lib/format";
import type { SessionHistoryItem, WeightPoint } from "@/lib/coachApi";

/** How many rows the card shows. The full lists stay in their own blocks below. */
const ROWS = 5;

/**
 * « Activité récente » (plan §5.2): the trainee's last sessions and weigh-ins, newest first,
 * in one short list. Two api reads feed it and nothing else: the monitoring read's session
 * history (date, name, difficulty) and the overview's 8-week weight series (date, kg). A
 * weigh-in's delta is the difference from the point before it in that same series; the
 * oldest point in the window has none, and none is invented.
 *
 * Each source is passed as `null` when the coach may not read it or it did not arrive, and
 * the card then says which part is missing under whatever the other part holds. When
 * neither is shared it is one sentence, never an empty list.
 */
export function RecentActivity({
  sessions,
  weights,
  sessionsState,
  weighInsShared,
}: {
  sessions: SessionHistoryItem[] | null;
  weights: WeightPoint[] | null;
  /** Why `sessions` may be null: the scope is not held, or the read did not answer. */
  sessionsState: "shared" | "notShared" | "unavailable";
  weighInsShared: boolean;
}) {
  const copy = getCopy();
  const c = copy.client.activity;

  if (sessionsState === "notShared" && !weighInsShared) {
    return (
      <OverviewCard id="ov-activity" title={c.title}>
        <OverviewNote>{c.notShared}</OverviewNote>
      </OverviewCard>
    );
  }

  type Row = { key: string; date: string; title: string; meta: string; order: number };
  const rows: Row[] = [];
  (sessions ?? []).forEach((item, i) => {
    rows.push({
      key: `s-${item.date}-${i}`,
      date: item.date,
      // A null name is a workout row that has since gone: the dash, never an invented name.
      title: item.name || copy.common.dash,
      meta: item.difficulty ? copy.client.feedback[item.difficulty] : copy.client.noFeedback,
      order: 0,
    });
  });
  const series = weighInsShared ? (weights ?? []) : [];
  series.forEach((point, i) => {
    const before = i > 0 ? series[i - 1] : null;
    rows.push({
      key: `w-${point.date}-${i}`,
      date: point.date,
      title: c.weighIn(formatKg(point.weightKg, copy.locale)),
      meta: before ? formatKgDelta(point.weightKg - before.weightKg, copy.locale) : "",
      order: 1,
    });
  });
  // Newest first; on one day, the session before the weigh-in. ISO dates sort as strings.
  rows.sort((a, b) => (a.date === b.date ? a.order - b.order : a.date < b.date ? 1 : -1));
  const shown = rows.slice(0, ROWS);

  /**
   * An empty list says what it is empty OF: both sources read and empty is "no activity";
   * one source read and empty names that one; a source that did not answer claims nothing.
   */
  const sessionsRead = sessionsState === "shared";
  const empty =
    sessionsState === "unavailable"
      ? null
      : sessionsRead && weighInsShared
        ? c.none
        : sessionsRead
          ? c.noSessions
          : weighInsShared
            ? c.noWeighIns
            : null;

  const notes: string[] = [];
  if (sessionsState === "notShared") notes.push(c.sessionsNotShared);
  if (sessionsState === "unavailable") notes.push(c.sessionsUnavailable);
  if (!weighInsShared) notes.push(c.weighInsNotShared);

  return (
    <OverviewCard id="ov-activity" title={c.title}>
      {shown.length === 0 ? (
        empty && <OverviewNote>{empty}</OverviewNote>
      ) : (
        <ul className="activity-list">
          {shown.map((row) => (
            <li key={row.key} className="activity-row">
              <span className="activity-date">{formatDate(row.date, copy.locale)}</span>
              <span className="activity-title">{row.title}</span>
              <span className="activity-meta">{row.meta}</span>
            </li>
          ))}
        </ul>
      )}
      {notes.map((note) => (
        <OverviewNote key={note}>{note}</OverviewNote>
      ))}
    </OverviewCard>
  );
}
