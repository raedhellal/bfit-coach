import { OverviewCard, OverviewNote } from "./OverviewCard";
import { SessionHistory, type SessionRow } from "./SessionHistory";
import { getCopy } from "@/lib/i18n/server";
import { formatDate } from "@/lib/format";
import type { SessionHistory as History } from "@/lib/coachApi";

/**
 * « Activité récente » — EV-342j: the overview's ONE session list (audit A16).
 *
 * Until EV-342j the sessions were listed twice: here (the five newest, mixed with
 * weigh-ins) and in EV-187's « Séances récentes » block further down (the last ten). The
 * PO's ruling folds the history into this card: one list, the latest 5 sessions, and
 * « Voir les 10 dernières » / "Show the last 10" opening the rest in place.
 *
 * What moved here from the history block, so nothing it showed is lost (J.2): the AC5
 * summary line, every row field (date, session name, what the trainee said), the AC5
 * empty sentence, and AC1's not-shared sentence. The rows are the history's rows, from
 * the monitoring read (`progress.sessions`, at most ten, newest first, capped server-side).
 *
 * The weigh-in rows this card used to interleave (EV-337e) are not in it any more: the
 * ruling's list is "the latest 5 sessions", and a weigh-in row is not a session row. Each
 * weigh-in is still on the page, in the weight trend card's chart (date and kg) and in the
 * weight tile.
 *
 * The four states, decided from `scopes` first and the data only after (ADR-0015 D5):
 *   · notShared — PROGRESS and WORKOUTS are not both held: AC1's sentence, no number;
 *   · unavailable — both held and the read did not answer: said, never "not shared";
 *   · no completed session — AC5's sentence, never an empty list;
 *   · the summary line and the list.
 */
export function RecentActivity({
  history,
  state,
}: {
  /** The monitoring read's session history, or null when not shared or not answered. */
  history: History | null;
  /** Why `history` may be null: the scopes are not held, or the read did not answer. */
  state: "shared" | "notShared" | "unavailable";
}) {
  const copy = getCopy();
  const c = copy.client.activity;

  if (state === "notShared") {
    return (
      <OverviewCard id="ov-activity" title={c.title}>
        <OverviewNote>{copy.client.notSharedProgress}</OverviewNote>
      </OverviewCard>
    );
  }
  if (state === "unavailable" || !history) {
    return (
      <OverviewCard id="ov-activity" title={c.title}>
        <OverviewNote>{c.sessionsUnavailable}</OverviewNote>
      </OverviewCard>
    );
  }
  if (history.returned === 0 || history.items.length === 0) {
    return (
      <OverviewCard id="ov-activity" title={c.title}>
        <OverviewNote>{copy.client.noCompletedSessions}</OverviewNote>
      </OverviewCard>
    );
  }

  const rows: SessionRow[] = history.items.map((item, i) => ({
    key: `${item.date}-${i}`,
    date: formatDate(item.date, copy.locale),
    // A null name is a workout row that has since gone: the dash, never an invented name.
    title: item.name || copy.common.dash,
    meta: item.difficulty ? copy.client.feedback[item.difficulty] : copy.client.noFeedback,
  }));

  return (
    <OverviewCard id="ov-activity" title={c.title}>
      {/* AC5: the api's own four numbers, over its REAL count (`returned`), not the rows shown. */}
      <p className="activity-summary">
        {copy.client.sessionSummary(history.returned, history.easy, history.ok, history.hard, history.noFeedback)}
      </p>
      <SessionHistory rows={rows} showAll={c.showLast(rows.length)} />
    </OverviewCard>
  );
}
