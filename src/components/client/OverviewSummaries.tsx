import Link from "next/link";
import { OverviewCard, OverviewNote } from "./OverviewCard";
import { StatusPill } from "@/components/ui/StatusPill";
import { getCopy } from "@/lib/i18n/server";
import { formatDate, formatGrams, formatInstant, formatKcal } from "@/lib/format";
import type { CoachNutritionResponse, CoachRoutineResponse } from "@/lib/coachApi";

/**
 * The overview's two summary cards (plan §5.2, G11/G12): what the trainee's programme and
 * nutrition are, in two lines each, with a link to the tab that edits them.
 *
 * Each card is fed by ONE read the page makes only after the overview's `scopes` show the
 * matching scope (ADR-0015 D5: a scope the trainee withheld is never asked for). So each
 * card has three states and no fourth: not shared (decided from `scopes`), unavailable (the
 * read failed), or the data. Nothing here counts the draft's changes: that needs the draft
 * document, a third read, and the plan reads only `hasDraft` (plan §5.2).
 */
export type SummaryRead<T> = { state: "notShared" } | { state: "unavailable" } | { state: "ok"; data: T };

export function ProgrammeSummary({
  clientId,
  read,
}: {
  clientId: string;
  read: SummaryRead<CoachRoutineResponse>;
}) {
  const copy = getCopy();
  const c = copy.client.programmeCard;
  const href = `/clients/${clientId}/routine`;
  if (read.state !== "ok") {
    return (
      <OverviewCard id="ov-programme" title={copy.tabs.routine}>
        <OverviewNote>{read.state === "notShared" ? copy.routine.scopeMissing : copy.routine.loadError}</OverviewNote>
      </OverviewCard>
    );
  }
  const routine = read.data;
  const doc = routine.routine;
  /**
   * Who made the live plan live, and when — only what the api recorded. `lastChangedBy` is
   * optional on the type (an api older than EV-283a omits it): absent reads as nothing.
   */
  const changed =
    doc && routine.lastChangedAt
      ? routine.lastChangedBy === "COACH"
        ? c.published(formatInstant(routine.lastChangedAt, copy.locale))
        : routine.lastChangedBy === "TRAINEE"
          ? c.changedByTrainee(formatInstant(routine.lastChangedAt, copy.locale))
          : null
      : null;
  const facts = doc
    ? [routine.planName ?? doc.name, c.days(doc.trainingDays.length), changed].filter(Boolean).join(" · ")
    : null;
  return (
    <OverviewCard
      id="ov-programme"
      title={copy.tabs.routine}
      aside={routine.hasDraft ? <StatusPill tone="amber" icon="edit" label={c.draft} /> : undefined}
    >
      <OverviewNote>{facts ?? c.noPlan}</OverviewNote>
      {routine.hasDraft && routine.draftUpdatedAt && (
        <OverviewNote>{c.draftSaved(formatInstant(routine.draftUpdatedAt, copy.locale))}</OverviewNote>
      )}
      <div className="ov-card-actions">
        <Link href={href} className="link-button" data-variant="soft">
          {routine.hasDraft ? c.resume : doc ? c.open : c.create}
        </Link>
      </div>
    </OverviewCard>
  );
}

export function NutritionSummary({
  clientId,
  read,
}: {
  clientId: string;
  read: SummaryRead<CoachNutritionResponse>;
}) {
  const copy = getCopy();
  const c = copy.client.nutritionCard;
  if (read.state !== "ok") {
    return (
      <OverviewCard id="ov-nutrition" title={copy.tabs.nutrition}>
        <OverviewNote>
          {read.state === "notShared" ? copy.nutrition.scopeMissing : copy.nutrition.loadError}
        </OverviewNote>
      </OverviewCard>
    );
  }
  const { targets, week } = read.data;
  /** Read as `=== "ACTIVE"` / `=== "GENERATING"`: any other status (or none) draws no pill. */
  const pill =
    week?.status === "ACTIVE" ? (
      <StatusPill tone="green" icon="check" label={c.weekPlanned} />
    ) : week?.status === "GENERATING" ? (
      <StatusPill tone="blue" icon="clock" label={c.weekPreparing} />
    ) : undefined;
  return (
    <OverviewCard id="ov-nutrition" title={copy.tabs.nutrition} aside={pill}>
      <OverviewNote>
        {targets
          ? c.targets(formatKcal(targets.calories, copy.locale), formatGrams(targets.proteinG, copy.locale))
          : c.noTargets}
      </OverviewNote>
      <OverviewNote>{week ? c.weekOf(formatDate(week.weekStart, copy.locale)) : c.noWeek}</OverviewNote>
      <div className="ov-card-actions">
        <Link href={`/clients/${clientId}/nutrition`} className="link-button" data-variant="secondary">
          {c.open}
        </Link>
      </div>
    </OverviewCard>
  );
}
