import Link from "next/link";
import { UiIcon } from "@/components/ui/icons";
import { getCopy } from "@/lib/i18n/server";
import { formatDate } from "@/lib/format";
import type { FiredRedFlag } from "@/lib/coachApi";

/**
 * EV-187 AC4 — a red flag, with the evidence it fired on and how old that evidence is,
 * drawn as the redesign's alert card (EV-337e, plan §5.2: « À traiter »).
 *
 * A coach acts on evidence, not on a badge: "Missed 2 or more planned sessions this
 * week" tells them to open the trainee, and the two dates with the session names tell
 * them what to say. The evidence comes from the SAME computation that produced the flag
 * (api-side, `TraineeRedFlagRules`), which is why the flag and the chart on this page
 * cannot disagree about whether a weigh-in exists — the BUG-143/144 failure family.
 *
 * **Only flags that fired are in this list**, so there is no branch here for "a flag
 * with no evidence" and none for "evidence without a flag": both are unrepresentable
 * rather than guarded, which is the stronger version of AC4's clause. The one caller that
 * has codes and no evidence (a link with WEIGH_INS but not PROGRESS) passes both evidence
 * fields as null, and the card is the flag alone — never a flag with an EMPTY block.
 *
 * 🔴 Two rules are rendered here and there is no third. `PAIN_REPORTED` has never fired
 * and cannot — nothing writes `workout_completion.notes` — so it is absent from the
 * label map and from this component, and there is no "coming soon" either. The absence
 * is deliberate, it is release-blocking (AC4), and `qa/coach-red-flags-vocabulary.spec.ts`
 * holds it. The design's first card (screen 02) is exactly that rule, and is not built.
 *
 * Each card: the word « Alerte » with its icon (a status is never colour alone), the
 * flag's sentence as an `h3` under the section's `h2`, the evidence, and — for missed
 * sessions, when the coach may open the plan — a link to the routine tab. The cards are
 * `li`s of one list: the suite reads a flag's evidence from its own `li`.
 */
export function RedFlagEvidence({
  flags,
  routineHref,
}: {
  flags: FiredRedFlag[];
  /** The routine tab, when this link shares WORKOUTS; null hides the card's action. */
  routineHref: string | null;
}) {
  const copy = getCopy();
  return (
    <ul className="alert-list">
      {flags.map((fired) => {
        const titleId = `alert-${fired.flag}`;
        return (
          <li key={fired.flag} className="alert-card" data-flag={fired.flag}>
            <div role="group" aria-labelledby={titleId} className="alert-card-body">
              <span className="alert-word">
                <span aria-hidden="true" style={{ display: "inline-flex" }}>
                  <UiIcon name="flag" size={14} />
                </span>
                {copy.client.alertWord}
              </span>
              <h3 id={titleId} className="alert-card-title">
                {/*
                  A code with no sentence renders as the code. It cannot happen against this
                  api — the two rules that can fire both have one — and the alternative
                  (rendering nothing) would hide a flag from the coach on the strength of a
                  missing translation.
                */}
                {copy.client.redFlagLabels[fired.flag] || fired.flag}
              </h3>

              {fired.missedSessions && fired.missedSessions.length > 0 && (
                <div>
                  <div className="alert-card-meta">{copy.client.missedSessionsEvidence}</div>
                  <ul className="alert-evidence">
                    {fired.missedSessions.map((missed) => (
                      <li key={missed.date}>
                        <span style={{ fontWeight: 700, whiteSpace: "nowrap" }}>
                          {formatDate(missed.date, copy.locale)}
                        </span>
                        {/* The plan's schedule does not always name a workout for a day.
                            Then the date stands alone — the portal does not invent one. */}
                        {missed.sessionName && <span>{missed.sessionName}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {fired.weighIn && (
                <div>
                  {/*
                    Both fields are null together and ONLY for a trainee who has never
                    logged a weight in either weight table. A trainee who weighed in nine
                    weeks ago has a real date here and an empty 8-week chart below:
                    "nothing recently" and "nothing ever" are different facts, and only the
                    second may read "Never weighed in".
                  */}
                  {fired.weighIn.lastWeighInDate !== null && fired.weighIn.daysSince !== null
                    ? copy.client.lastWeighIn(
                        formatDate(fired.weighIn.lastWeighInDate, copy.locale),
                        fired.weighIn.daysSince
                      )
                    : copy.client.neverWeighedIn}
                </div>
              )}

              {fired.flag === "MISSED_TWO_OR_MORE_SESSIONS" && routineHref && (
                <div>
                  <Link href={routineHref} className="link-button" data-variant="on-tint">
                    {copy.client.adjustPlan}
                  </Link>
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
