import type { ChallengeDay, ChallengeDayStatus } from "@/lib/coachApi";
import type { Copy } from "@/lib/copy";
import { formatDayLabel, formatSteps } from "@/lib/format";

/**
 * One participant's window, a square per day (EV-321b).
 *
 * A picture with no text is unassertable and unreadable, so every square is an `img`
 * with its date and status as its NAME ("mar. 29 sept. : 12 400 pas, objectif atteint"),
 * and carries `data-status` / `data-value` for the spec. A NO_DATA day has NO number in
 * its name and an EMPTY `data-value` — never "0" — because the api's null is "the phone
 * sent nothing", and a zero is a claim about the trainee.
 */
export function DayStrip({ days, name, copy }: { days: ChallengeDay[]; name: string; copy: Copy }) {
  const c = copy.challenges;
  return (
    <ul className="challenge-days" aria-label={c.daysList(name)}>
      {days.map((d) => {
        const day = formatDayLabel(d.day, copy.locale);
        const status = c.dayStatus[d.status];
        const label =
          d.value === null ? c.dayLabel(day, status) : c.dayLabelSteps(day, formatSteps(d.value, copy.locale), status);
        return (
          <li key={d.day}>
            <span
              role="img"
              aria-label={label}
              title={label}
              className="challenge-day"
              data-day={d.day}
              data-status={d.status}
              data-value={d.value === null ? "" : String(d.value)}
            />
          </li>
        );
      })}
    </ul>
  );
}

const LEGEND: ChallengeDayStatus[] = ["MET", "IN_PROGRESS", "MISSED", "NO_DATA", "FUTURE"];

/** The key under the table: the same five squares, with their words beside them. */
export function DayLegend({ copy }: { copy: Copy }) {
  const c = copy.challenges;
  return (
    <div
      role="group"
      aria-label={c.legend}
      style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", fontSize: 12, color: "var(--ink-3)", marginTop: 12 }}
    >
      <span style={{ fontWeight: 600 }}>{c.legend}</span>
      {LEGEND.map((status) => (
        <span key={status} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span className="challenge-day" data-status={status} aria-hidden="true" />
          {c.dayStatus[status]}
        </span>
      ))}
    </div>
  );
}
