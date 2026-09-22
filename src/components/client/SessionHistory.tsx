import { BlockNote, MonitoringBlock } from "@/components/client/MonitoringBlock";
import { copy } from "@/lib/copy";
import { formatDate } from "@/lib/format";
import type { SessionHistory as History } from "@/lib/coachApi";

/**
 * EV-187 AC5 — the last ten completed sessions, newest first.
 *
 * **Three fields on a row and nothing else**: the date, the session or plan name, and
 * the difficulty the trainee reported. AC5 says "and nothing else on the row" in those
 * words, so there is no duration here, no volume, no exercise count and no link — the
 * per-exercise analytics suite is explicitly NOT in this story.
 *
 * The summary line's four numbers are the api's, not a count of the rows: `returned` is
 * the real count, which is what lets a trainee with six sessions read "Of the last 6
 * sessions: …" instead of the "of the last 10" that AC5 forbids.
 *
 * The cap is server-side. There is no "show more": a client asking for more receives
 * ten, and this component has no control that could ask.
 */
export function SessionHistory({ history }: { history: History }) {
  if (history.returned === 0 || history.items.length === 0) {
    return (
      <MonitoringBlock title={copy.client.sessionHistory} icon="calendar">
        {/* An empty state, not an empty table: a table head over no rows is a page
            that looks broken rather than a trainee who has not started. */}
        <BlockNote>{copy.client.noCompletedSessions}</BlockNote>
      </MonitoringBlock>
    );
  }

  return (
    <MonitoringBlock title={copy.client.sessionHistory} icon="calendar">
      <p style={{ margin: "0 0 12px", fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.5 }}>
        {copy.client.sessionSummary(
          history.returned,
          history.easy,
          history.ok,
          history.hard,
          history.noFeedback
        )}
      </p>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 2 }}>
        {history.items.map((item, i) => (
          <li
            key={`${item.date}-${i}`}
            style={{
              display: "grid",
              // 320 px safe: the date is fixed, the name takes the slack and truncates,
              // the difficulty word sizes itself (edge case 9, long session names).
              gridTemplateColumns: "96px minmax(0, 1fr) auto",
              alignItems: "center",
              gap: 10,
              padding: "9px 0",
              borderTop: i === 0 ? "none" : "1px solid var(--hairline)",
              fontSize: 13.5,
            }}
          >
            <span style={{ color: "var(--ink-3)", whiteSpace: "nowrap" }}>
              {formatDate(item.date)}
            </span>
            <span
              title={item.name ?? undefined}
              style={{
                color: "var(--ink)",
                fontWeight: 600,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {/* A null name is a workout row that has since gone. The dash is the
                  surface's one absence glyph; inventing a name would be worse. */}
              {item.name || copy.common.dash}
            </span>
            <span style={{ color: "var(--ink-2)", whiteSpace: "nowrap" }}>
              {item.difficulty
                ? copy.client.feedback[item.difficulty]
                : copy.client.noFeedback}
            </span>
          </li>
        ))}
      </ul>
    </MonitoringBlock>
  );
}
