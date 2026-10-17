"use client";

import type { CSSProperties } from "react";
import { useCopy } from "@/lib/i18n/client";
import { isoWeekdayLabel } from "@/lib/format";
import {
  repairMarkFor,
  repairMarkSentence,
  type DayDiff,
  type ExerciseChange,
  type RoutineDiff,
} from "@/lib/routineAi";
import type { CoachRoutineAiRepairMark, RoutineExercise } from "@/lib/coachApi";

/**
 * EV-186n N1/N2 — the READY proposal as a per-day comparison against `baseDocument`, drawn from
 * `routineDiff` (pure, unit-tested) and NEVER from the model's prose.
 *
 *   · A day that changed, was added or was removed is open, row by row.
 *   · Unchanged days collapse into one line (« N sessions unchanged ») — EXCEPT a day carrying a
 *     repair mark: N2 says each exercise in the api's read-only repair list carries the mark, and
 *     a mark inside a closed fold is a mark nobody reads.
 *   · Each proposal row the api's `repairMarks` locates (weekday + index) carries « Will be
 *     swapped at publish: … ». A preview: the publish modal stays the only binding list.
 *
 * Rows carry `data-row-kind` and days `data-day-kind`, so a spec asserts the kind, not a colour.
 */
export function RoutineAiDiff({
  diff,
  marks,
  baseSource,
  firstName,
}: {
  diff: RoutineDiff;
  marks: readonly CoachRoutineAiRepairMark[];
  baseSource: "DRAFT" | "LIVE" | "NONE" | null | undefined;
  firstName: string;
}) {
  const copy = useCopy();
  const t = copy.routineAi;
  const hasMark = (day: DayDiff) => marks.some((mark) => mark.dayOfWeek === day.dayOfWeek);
  const shown = diff.days.filter((day) => day.kind !== "unchanged" || hasMark(day));
  const folded = diff.days.filter((day) => day.kind === "unchanged" && !hasMark(day));

  const against =
    baseSource === "DRAFT" ? t.diffAgainstDraft : baseSource === "NONE" ? t.diffAgainstNone : t.diffAgainstLive;

  return (
    <div data-testid="routine-ai-diff">
      <h4 style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>{t.diffTitle}</h4>
      <p style={muted}>{against}</p>
      {diff.identical && marks.length === 0 && <p style={{ ...muted, marginTop: 8 }}>{t.diffIdentical}</p>}

      {diff.settings.length > 0 && (
        <ul data-testid="routine-ai-settings" style={{ margin: "8px 0 0", paddingLeft: 18 }}>
          {diff.settings.map((change) => (
            <li key={change.field} data-setting={change.field} style={rowText}>
              {t.fieldChange(t.settingLabels[change.field], settingValue(change.field, change.before, copy), settingValue(change.field, change.after, copy))}
            </li>
          ))}
        </ul>
      )}

      <ol style={{ listStyle: "none", margin: "10px 0 0", padding: 0, display: "grid", gap: 12 }}>
        {shown.map((day) => (
          <li key={day.dayOfWeek} data-day-kind={day.kind} data-weekday={day.dayOfWeek}>
            <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>
              {t.dayHeading(isoWeekdayLabel(day.dayOfWeek, copy.locale), day.focusAfter ?? day.focusBefore ?? "")}
              {" · "}
              <span style={{ fontWeight: 500, color: "var(--ink-2)" }}>
                {day.kind === "added" ? t.dayAdded : day.kind === "removed" ? t.dayRemoved : day.kind === "unchanged" ? t.dayUnchanged : t.rowChanged}
              </span>
            </p>
            {day.kind === "changed" && day.focusBefore !== null && day.focusAfter !== null && day.focusBefore.trim() !== day.focusAfter.trim() && (
              <p style={muted}>{t.focusChanged(day.focusBefore, day.focusAfter)}</p>
            )}
            <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
              {day.rows.map((row, index) => (
                <Row key={index} row={row} dayOfWeek={day.dayOfWeek} marks={marks} firstName={firstName} />
              ))}
            </ul>
          </li>
        ))}
      </ol>

      {folded.length > 0 && (
        <details data-testid="routine-ai-unchanged" style={{ marginTop: 10 }}>
          <summary style={{ ...rowText, cursor: "pointer" }}>{t.unchangedDays(folded.length)}</summary>
          <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
            {folded.map((day) => (
              <li key={day.dayOfWeek} data-day-kind="unchanged" data-weekday={day.dayOfWeek} style={rowText}>
                {t.dayHeading(isoWeekdayLabel(day.dayOfWeek, copy.locale), day.focusAfter ?? "")}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Row({
  row,
  dayOfWeek,
  marks,
  firstName,
}: {
  row: ExerciseChange;
  dayOfWeek: number;
  marks: readonly CoachRoutineAiRepairMark[];
  firstName: string;
}) {
  const copy = useCopy();
  const t = copy.routineAi;
  const mark = row.kind === "removed" ? null : repairMarkFor(marks, dayOfWeek, row.afterIndex);
  const label =
    row.kind === "added"
      ? t.rowAdded
      : row.kind === "removed"
        ? t.rowRemoved
        : row.kind === "replaced"
          ? t.rowReplaced
          : row.kind === "prescription"
            ? t.rowChanged
            : null;
  const prescription = (ex: RoutineExercise): string =>
    ex.trackingType === "DURATION" && ex.durationSeconds !== null
      ? `${ex.sets} × ${ex.durationSeconds}\u00a0s`
      : t.prescription(ex.sets, ex.reps ?? copy.common.dash);
  return (
    <li data-row-kind={row.kind} style={rowText}>
      {label && <strong style={{ fontWeight: 600 }}>{copy.common.labelled(label, "")}</strong>}
      {row.kind === "replaced"
        ? t.replacedLine(row.before.name, row.after.name)
        : row.kind === "removed"
          ? row.before.name
          : row.after.name}
      {(row.kind === "added" || row.kind === "replaced") && (
        <span style={{ color: "var(--ink-3)" }}>{` · ${prescription(row.after)}`}</span>
      )}
      {row.kind === "prescription" && (
        <span style={{ color: "var(--ink-3)" }}>
          {` · ${row.fields
            .map((field) =>
              t.fieldChange(
                t.fieldLabels[field],
                fieldValue(row.before[field], copy.common.dash),
                fieldValue(row.after[field], copy.common.dash)
              )
            )
            .join(" · ")}`}
        </span>
      )}
      {mark && (
        <p data-testid="routine-ai-repair-mark" style={{ margin: "2px 0 0", fontSize: 12.5, color: "var(--warn-ink)" }}>
          {repairMarkSentence(mark, firstName, copy)}
        </p>
      )}
    </li>
  );
}

function fieldValue(value: unknown, dash: string): string {
  return value === null || value === undefined || value === "" ? dash : String(value);
}

function settingValue(
  field: "name" | "minutesPerSession" | "goal" | "level",
  value: string | number,
  copy: ReturnType<typeof useCopy>
): string {
  if (field === "goal") return copy.templates.goalLabels[String(value)] ?? String(value);
  if (field === "level") return copy.templates.levelLabels[String(value)] ?? String(value);
  return String(value);
}

const muted: CSSProperties = { margin: "2px 0 0", fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.5 };
const rowText: CSSProperties = { fontSize: 13, color: "var(--ink-2)", lineHeight: 1.6 };
