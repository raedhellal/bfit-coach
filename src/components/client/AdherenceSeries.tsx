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
   * The whole-series empty state — EV-208 AC1/AC2, superseding EV-187 AC3's last
   * clause, and edge case 1.
   *
   * Still ONE branch and NO chart: eight bars of 0 % is a picture of a trainee failing,
   * drawn from the absence of a plan. What changed is the SENTENCE, and why:
   *
   * `planned === 0 && done === 0` is **not a statement about sessions**. Both the
   * numerator and the denominator are gated on `hadAPlanDuring`, so the branch is
   * reached whenever no week in the window had a plan — which is ordinary for anyone
   * who trains ad hoc without ever calling `POST /plans/select`. The single sentence
   * this used to print, "No sessions in the last 8 weeks", then sat directly above a
   * *Recent sessions* list of five real dated workouts (BUG-205): a false claim about a
   * person, inferred from a missing `user_plan` row, and a contradiction of the per-week
   * "No plan" state one line down.
   *
   * So the portal tells the two worlds apart itself, from `hasPlan` — which is already
   * on the wire, so this needed no api change. `weeks.some(w => w.hasPlan)` is the
   * whole discriminator:
   *
   *   - **no week had a plan** → "No plan on record for these 8 weeks". An absence is
   *     rendered as an absence. It is also the honest reading for a brand-new trainee
   *     (edge case 4) and for a `weeks: []` payload (edge case 1) — the one wording
   *     that is true in both of the worlds this condition cannot distinguish.
   *   - **a plan existed and scheduled nothing** → "No sessions scheduled in the last
   *     8 weeks". Reachable in the ordinary way once EV-209 lands (a rest-day-only week
   *     reads 0 / 0 with `hasPlan = true`); until then it is pinned by the fixture.
   *
   * Neither sentence says whether the trainee trained. The session-history block below
   * answers that, and is the only block on this page entitled to.
   *
   * ⚠️ This branch is also what BUG-197 produces for a freshly-published trainee, whose
   * `selected_at` was overwritten on the publish path and whose history therefore reads
   * 0/0 for every past week. That bug belongs to the api's write path; what the portal
   * owes is not to report it as "0 % adherent" — nor, now, as "no sessions".
   *
   * `done > 0` or `planned > 0` is untouched: a real 0-of-N week (edge case 2) still
   * renders the chart and the headline, because a trainee who missed everything must
   * still read as having missed everything.
   */
  if (series.planned === 0 && series.done === 0) {
    const hadAPlan = series.weeks.some((week) => week.hasPlan);
    return (
      <MonitoringBlock title={copy.client.adherenceSeries} icon="chart">
        <BlockNote>
          {hadAPlan ? copy.client.nothingScheduledIn8Weeks : copy.client.noPlanInWindow}
        </BlockNote>
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
           * **A BAR IS DRAWN ONLY FOR A WEEK THAT IS OVER AND HAD A PLAN, AND IT IS
           * ALWAYS `done / planned` — THE TWO NUMBERS PRINTED BESIDE IT.**
           *
           * The row is ONE fact or it is nothing. The first cut drew the current week
           * against `plannedSoFar` while the text printed `planned`, and the staff review
           * rendered the witness: LINA's current week was a **full** bar next to
           * "2 / 4 sessions". The mirror case is worse and is exactly the Monday ADR-0012
           * D6 is about — `plannedSoFar = 0` with `done > 0` gives an EMPTY bar next to
           * "1 / 3 sessions".
           *
           * The full-bar direction is the one that decided this. A picture that says
           * "on track" beside a number that says otherwise, on the one block built to
           * catch disengagement, is the same failure direction as EV-187a's blocking
           * defect (a no-plan week reading as perfect adherence) and BUG-198 (0 of 3
           * prescribed reading 50 %). Three mechanisms that all make a struggling client
           * look fine is not a coincidence to add a fourth to.
           *
           * So the in-progress week gets the treatment `hasPlan === false` already has:
           * **no bar**, and its figures stand on their own. A week that has not finished
           * has no proportion to draw — three of five days done is not 60 % of anything
           * yet — and drawing one against either denominator asserts something the week
           * cannot support. `plannedSoFar` is still on the wire and still typed; it is
           * simply not a number this component spends, and AC3's "identical to the
           * shipped block" clause is met by the LABEL, which is where it was always met.
           *
           * No percentage is rendered anywhere on this card, in any week — the other
           * half of "a Monday does not render a 0 % week".
           */
          const drawBar = week.hasPlan && !week.partial;
          const fillPercent =
            drawBar && week.planned > 0 ? Math.round(Math.min(1, week.done / week.planned) * 100) : 0;
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
              {/* The grid cell is always present so the three columns line up down the
                  card; the TRACK is not, because an empty track is still a picture of a
                  week and a week with no plan (or one still running) has none. */}
              {drawBar ? (
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
                    /**
                     * `data-fill` is the percentage the width is set from — the SAME
                     * expression, read once. It exists so a spec can compare the bar to
                     * the label beside it as numbers rather than by parsing an inline
                     * style, which is the assertion the suite did not have when it
                     * rendered a full bar next to "2 / 4 sessions" and stayed green.
                     */
                    data-fill={fillPercent}
                    style={{
                      display: "block",
                      height: "100%",
                      width: `${fillPercent}%`,
                      borderRadius: "var(--r-pill)",
                      background: "var(--blue-500)",
                    }}
                  />
                </span>
              ) : (
                <span aria-hidden="true" />
              )}
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
