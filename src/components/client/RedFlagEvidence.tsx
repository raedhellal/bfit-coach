import { UiIcon } from "@/components/ui/icons";
import { copy } from "@/lib/copy";
import { formatDate } from "@/lib/format";
import type { FiredRedFlag } from "@/lib/coachApi";

/**
 * EV-187 AC4 — a red flag, with the evidence it fired on and how old that evidence is.
 *
 * A coach acts on evidence, not on a badge: "Missed 2 or more planned sessions this
 * week" tells them to open the trainee, and the two dates with the session names tell
 * them what to say. The evidence comes from the SAME computation that produced the flag
 * (api-side, `TraineeRedFlagRules`), which is why the flag and the chart on this page
 * cannot disagree about whether a weigh-in exists — the BUG-143/144 failure family.
 *
 * **Only flags that fired are in this list**, so there is no branch here for "a flag
 * with no evidence" and none for "evidence without a flag": both are unrepresentable
 * rather than guarded, which is the stronger version of AC4's clause.
 *
 * 🔴 Two rules are rendered here and there is no third. `PAIN_REPORTED` has never fired
 * and cannot — nothing writes `workout_completion.notes` — so it is absent from the
 * label map and from this component, and there is no "coming soon" either. The absence
 * is deliberate, it is release-blocking (AC4), and `qa/coach-red-flags-vocabulary.spec.ts`
 * holds it.
 */
export function RedFlagEvidence({ flags }: { flags: FiredRedFlag[] }) {
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 10 }}>
      {flags.map((fired) => (
        <li
          key={fired.flag}
          style={{
            padding: "12px 13px",
            borderRadius: "var(--r-lg)",
            background: "var(--err-bg)",
            color: "var(--err-ink)",
            fontSize: 13.5,
            lineHeight: 1.45,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 600 }}>
            <UiIcon name="flag" size={16} color="var(--err-ink)" />
            {/*
              A code with no sentence renders as the code. It cannot happen against this
              api — the two rules that can fire both have one — and the alternative
              (rendering nothing) would hide a flag from the coach on the strength of a
              missing translation.
            */}
            {copy.client.redFlagLabels[fired.flag] || fired.flag}
          </div>

          {fired.missedSessions && fired.missedSessions.length > 0 && (
            <div style={{ marginTop: 9 }}>
              <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 4 }}>
                {copy.client.missedSessionsEvidence}
              </div>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 3 }}>
                {fired.missedSessions.map((missed) => (
                  <li key={missed.date} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>
                      {formatDate(missed.date)}
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
            <div style={{ marginTop: 9 }}>
              {/*
                Both fields are null together and ONLY for a trainee who has never
                logged a weight in either weight table. A trainee who weighed in nine
                weeks ago has a real date here and an empty 8-week chart above: "nothing
                recently" and "nothing ever" are different facts, and only the second may
                read "Never weighed in".
              */}
              {fired.weighIn.lastWeighInDate !== null && fired.weighIn.daysSince !== null
                ? copy.client.lastWeighIn(
                    formatDate(fired.weighIn.lastWeighInDate),
                    fired.weighIn.daysSince
                  )
                : copy.client.neverWeighedIn}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
