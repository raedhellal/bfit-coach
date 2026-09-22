import { BlockNote, MonitoringBlock } from "@/components/client/MonitoringBlock";
import { copy } from "@/lib/copy";
import { formatDate } from "@/lib/format";
import type { AdherenceSeries as Series } from "@/lib/coachApi";

/**
 * EV-187 AC3 — eight weeks of adherence, one bar per ISO week, oldest first.
 *
 * **Rows, not columns.** Eight vertical bars at the 320 px width this portal is swept
 * at cannot carry both a week-commencing date and "<done> / <planned> sessions", and AC3
 * requires BOTH on every week. A horizontal bar per row reads at every width, needs no
 * SVG and no client JavaScript, and puts the numbers in the DOM as text rather than in a
 * tooltip QA would have to hover to find.
 *
 * **The portal does no arithmetic on the api's numbers.** The headline is the api's own
 * `done` / `planned`; the bar's width is a ratio used for drawing only. This is not
 * fastidiousness: BUG-198 means a workout on a declared rest day already counts as a
 * planned session, and portal-side maths on top of that produces two numbers that
 * disagree with each other as well as with the trainee.
 *
 * Server component. Nothing here is interactive — AC6's closed list has no room for it.
 */
export function AdherenceSeries({ series }: { series: Series }) {
  /**
   * The whole-series empty state (AC3's last clause, and edge case 1).
   *
   * `planned === 0 && done === 0` over eight weeks means nothing was ever scheduled and
   * nothing was ever done — a brand-new trainee, or one whose plan post-dates the
   * window. It renders one sentence and NO chart: eight bars of 0 % is a picture of a
   * trainee failing, drawn from the absence of a plan.
   *
   * ⚠️ It is also what BUG-197 produces for a freshly-published trainee, whose
   * `selected_at` was overwritten on the publish path and whose history therefore reads
   * 0/0 for every past week. That bug belongs to the api's write path; what the portal
   * owes is not to report it as "0 % adherent".
   */
  if (series.planned === 0 && series.done === 0) {
    return (
      <MonitoringBlock title={copy.client.adherenceSeries} icon="chart">
        <BlockNote>{copy.client.noSessionsIn8Weeks}</BlockNote>
      </MonitoringBlock>
    );
  }

  return (
    <MonitoringBlock title={copy.client.adherenceSeries} icon="chart">
      <p
        style={{
          margin: "0 0 14px",
          fontSize: 14,
          fontWeight: 600,
          color: "var(--ink)",
          lineHeight: 1.45,
        }}
      >
        {copy.client.adherenceSeriesHeadline(series.done, series.planned)}
      </p>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 10 }}>
        {series.weeks.map((week) => {
          /**
           * A week with no plan is drawn as no bar at all and reads "No plan". A 0 %
           * bar would be the same picture as a week the trainee missed everything, and
           * they are not the same fact — this is `hasPlan` applied per week, which is
           * the rule that stopped a brand-new account being flagged on its first day.
           */
          /**
           * **Which of the two `planned` numbers draws the bar, and why there are two.**
           *
           * AC3 asks for two things that cannot be one number: the current week must
           * count only days STRICTLY BEFORE today (ADR-0012 D6 — a Monday is not a 0 %
           * week), and the current week must be IDENTICAL to the shipped "adherence
           * this week" block, which on a Monday reads 0 / 3. So the api sends both and
           * this component spends them differently: `plannedSoFar` is what the bar is
           * measured against (nothing that has not happened yet can have been missed),
           * and `planned` is what the row READS, because that is the number the block
           * above it shows for the same week at the same moment.
           *
           * No percentage is rendered anywhere on this card, in any week — which is the
           * other half of "a Monday does not render a 0 % week".
           */
          const measuredAgainst = week.partial ? week.plannedSoFar : week.planned;
          const ratio =
            week.hasPlan && measuredAgainst > 0 ? Math.min(1, week.done / measuredAgainst) : 0;
          return (
            <li
              key={week.weekCommencing}
              style={{
                display: "grid",
                // 320 px safe: the date column is fixed, the bar takes what is left and
                // the figure is allowed to size itself, so "7 / 7 sessions" (edge case
                // 2) neither wraps nor pushes the row sideways.
                gridTemplateColumns: "76px 1fr auto",
                alignItems: "center",
                gap: 10,
                fontSize: 12.5,
                color: "var(--ink-2)",
              }}
            >
              <span style={{ color: "var(--ink-3)", whiteSpace: "nowrap" }}>
                {formatDate(week.weekCommencing)}
              </span>
              <span
                aria-hidden="true"
                style={{
                  height: 10,
                  borderRadius: "var(--r-pill)",
                  background: "var(--surface-3)",
                  overflow: "hidden",
                  display: "block",
                }}
              >
                <span
                  style={{
                    display: "block",
                    height: "100%",
                    width: `${Math.round(ratio * 100)}%`,
                    borderRadius: "var(--r-pill)",
                    background: "var(--blue-500)",
                  }}
                />
              </span>
              <span style={{ whiteSpace: "nowrap", fontWeight: 600 }}>
                {week.hasPlan
                  ? copy.client.weekSessions(week.done, week.planned)
                  : copy.client.weekNoPlan}
              </span>
            </li>
          );
        })}
      </ul>
    </MonitoringBlock>
  );
}
