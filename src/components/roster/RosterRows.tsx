import Link from "next/link";
import { Avatar, Badge } from "@/components/ui/kit";
import { StatusPill } from "@/components/ui/StatusPill";
import { UiIcon } from "@/components/ui/icons";
import { getCopy } from "@/lib/i18n/server";
import { formatDate } from "@/lib/format";
import { hasScope, type RosterClient } from "@/lib/coachApi";
import { rosterPlanChanged } from "@/lib/routineChange";
import type { RosterRowView } from "@/lib/rosterView";
import type { Copy } from "@/lib/copy";

/**
 * One roster client (EV-337d, plan §5.1). ONE markup, two layouts: a five-cell row from
 * 768 px, a card below it — CSS decides (`globals.css`, "the roster"), so the narrow layout
 * is right on first paint and there is one copy of each client in the DOM (the old roster
 * rendered a table AND a card list and hid one).
 *
 * **The whole row is one link** — one tab stop per client. Its accessible NAME is the
 * client's name (`aria-labelledby`), and the cells are its description, so "Lina M." is
 * still how a screen reader, and a test, finds the row. The « Traiter » / « Ouvrir » at the
 * end is the row's label drawn as a button, not a second control to the same page.
 *
 * What the row does NOT draw, from the design: the weekly adherence ring (plan §7 G1 — the
 * row carries no adherence, and reading it per row is the N+1 the api refused), the flag
 * reason line (G3 — the row carries a count, not the codes), and any pain signal (G4 —
 * EV-187 AC4, it cannot fire). The streak sits where the ring was: it is on the row.
 *
 * The three nulls keep their two readings, decided by `scopes` (ADR-0015 D5/S1): "No plan"
 * and "No workouts yet" are said only when the scope is held; otherwise "Not shared".
 */

/**
 * `days` is nullable since ADR-0015 F1. `shared` first: an api not told to null the field
 * sends `0`, and "No streak" about a trainee whose sessions this coach may not see is a
 * claim made out of nothing.
 */
function StreakValue({ days, shared, copy }: { days: number | null; shared: boolean; copy: Copy }) {
  if (!shared || days === null) return <span style={{ color: "var(--ink-3)" }}>{copy.client.notShared}</span>;
  if (days <= 0) return <span style={{ color: "var(--ink-3)" }}>{copy.roster.noStreak}</span>;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span aria-hidden="true" style={{ display: "inline-flex", color: "var(--warn-ink)" }}>
        <UiIcon name="flame" size={13} />
      </span>
      {copy.roster.streak(days)}
    </span>
  );
}

/** "Today" / "Yesterday" / "4 days ago", with the api's UTC day as the tooltip and `dateTime`. */
function LastWorkout({ client, days, copy }: { client: RosterClient; days: number | null; copy: Copy }) {
  const date = client.lastCompletedWorkoutDate;
  if (date && days !== null) {
    const label = days === 0 ? copy.roster.today : days === 1 ? copy.roster.yesterday : copy.roster.daysAgo(days);
    return (
      <time dateTime={date} title={formatDate(date, copy.locale)}>
        {label}
      </time>
    );
  }
  // PROGRESS held: a fact about the trainee. Withheld: the date is unknown.
  return (
    <span style={{ color: "var(--ink-3)" }}>
      {hasScope(client.scopes, "PROGRESS") ? copy.roster.noWorkout : copy.client.notShared}
    </span>
  );
}

function Status({ view, copy, id }: { view: RosterRowView; copy: Copy; id: string }) {
  const s = view.status;
  switch (s.kind) {
    // Never "0 flags": a zero is not a status (EV-187 AC2), and the classifier only
    // returns `flags` for a count above zero.
    case "flags":
      return <StatusPill id={id} tone="red" icon="flag" label={copy.roster.flags(s.count)} />;
    case "inactive":
      return <StatusPill id={id} tone="neutral" icon="clock" label={copy.roster.inactiveFor(s.days)} />;
    case "upToDate":
      return <StatusPill id={id} tone="green" icon="check" label={copy.roster.upToDate} />;
    case "activityNotShared":
      return <StatusPill id={id} tone="neutral" label={copy.roster.activityNotShared} />;
    case "noWorkout":
      return <StatusPill id={id} tone="neutral" label={copy.roster.noWorkout} />;
    case "flagsNotShared":
      return <StatusPill id={id} tone="neutral" label={copy.roster.flagsUnavailable} />;
  }
}

/**
 * EV-283b's "Plan changed" marker, for a literal `true` only (`rosterPlanChanged`).
 * `data-plan-changed` is the test hook: "changed" can appear in a plan name.
 */
function PlanChangedMarker({ client, copy }: { client: RosterClient; copy: Copy }) {
  if (!rosterPlanChanged(client)) return null;
  return (
    <span data-plan-changed="" style={{ display: "inline-flex" }}>
      <Badge tone="amber">
        <UiIcon name="edit" size={12} />
        {copy.roster.planChanged}
      </Badge>
    </span>
  );
}

export function RosterRow({ client: c, view, idx }: { client: RosterClient; view: RosterRowView; idx: number }) {
  const copy = getCopy();
  const base = `roster-${c.id}`;
  const notes: string[] = [];
  // A flagged client who is also inactive is listed under "To review" (one row, one
  // place); R6's fact still shows, on the row.
  if (view.flagged && view.inactive && view.daysSinceLastWorkout !== null) {
    notes.push(copy.roster.inactiveFor(view.daysSinceLastWorkout));
  }
  // An unevaluable flag count is said, never left blank (blank would read as "no flags").
  if (typeof c.redFlagCount !== "number" && view.status.kind !== "flagsNotShared") {
    notes.push(copy.roster.flagsUnavailable);
  }

  return (
    <Link
      href={`/clients/${c.id}`}
      className="roster-row"
      data-group={view.group}
      aria-labelledby={`${base}-name`}
      aria-describedby={`${base}-plan ${base}-streak ${base}-last ${base}-status`}
    >
      <span className="roster-id">
        <Avatar name={c.traineeDisplayName} size={40} idx={idx} />
        <span style={{ minWidth: 0, display: "block" }}>
          <span id={`${base}-name`} className="roster-name" title={c.traineeDisplayName}>
            {c.traineeDisplayName}
          </span>
          <span id={`${base}-plan`} className="roster-plan" title={c.currentPlanName || undefined}>
            {c.currentPlanName || (
              <span style={{ color: "var(--ink-3)" }}>
                {hasScope(c.scopes, "WORKOUTS") ? copy.roster.noPlan : copy.client.notShared}
              </span>
            )}
          </span>
        </span>
      </span>

      <span className="roster-cell roster-streak" id={`${base}-streak`}>
        <span className="roster-cell-label">{copy.roster.colStreak}</span>
        <span className="roster-cell-value">
          <StreakValue days={c.currentStreakDays} shared={hasScope(c.scopes, "PROGRESS")} copy={copy} />
        </span>
      </span>

      <span className="roster-cell roster-last" id={`${base}-last`}>
        <span className="roster-cell-label">{copy.roster.colLastWorkout}</span>
        <span className="roster-cell-value">
          <LastWorkout client={c} days={view.daysSinceLastWorkout} copy={copy} />
        </span>
      </span>

      <span className="roster-status" id={`${base}-status`}>
        <Status view={view} copy={copy} id={`${base}-pill`} />
        {(notes.length > 0 || rosterPlanChanged(c)) && (
          <span className="roster-notes">
            {notes.map((n) => (
              <span key={n}>{n}</span>
            ))}
            <PlanChangedMarker client={c} copy={copy} />
          </span>
        )}
      </span>

      <span className="roster-action" data-primary={view.group === "attention" ? "" : undefined} aria-hidden="true">
        {view.group === "attention" ? copy.roster.actionReview : copy.roster.actionOpen}
        <UiIcon name="chevR" size={15} />
      </span>
    </Link>
  );
}
