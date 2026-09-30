"use client";

import { MIN_TOUCH_TARGET } from "@/components/ui/kit";
import { useCopy } from "@/lib/i18n/client";
import { ISO_WEEKDAY_NUMBERS, isoWeekdayLabel } from "@/lib/format";

/**
 * The prescription controls, shared by the two editors that exist on this surface:
 * EV-184b's trainee routine editor (`RoutineEditor`) and EV-188b's template editor
 * (`TemplateEditor`).
 *
 * They were extracted rather than copied, and the reason is the second one's history.
 * `DayFocusField` carries a layout fix `senior-qa` measured on 2026-09-21 (EV-201 item
 * 4) — a wrapped `<input>` overflowing its own `<label>` by 84 px at 390 and scrolling
 * the page sideways at 320 and 360 — and a copied second version of that markup is a
 * second version of that bug, invisible until somebody sweeps widths on the new screen.
 * One definition means one fix.
 *
 * Nothing here holds state or talks to the server: every control is value + onChange,
 * and both editors keep their own working copy. That is deliberate — the two documents
 * are different shapes (a lossy plan projection on one side, a whole `Routine` on the
 * other) and sharing the model, rather than the controls, is what produced the 2026-09-18
 * envelope crash.
 */

export const FIELD_STYLE = {
  height: MIN_TOUCH_TARGET,
  width: 96,
  borderRadius: "var(--r-md)",
  border: "1px solid var(--border-2)",
  background: "var(--surface)",
  padding: "0 10px",
  fontFamily: "var(--font-body)",
  fontSize: 13.5,
  color: "var(--ink)",
} as const;

export function NumberField({
  label,
  value,
  onChange,
  min = 1,
  max = 20,
  width,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  width?: number;
}) {
  return (
    <label style={{ display: "block" }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-2)", marginBottom: 5 }}>
        {label}
      </div>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Math.max(min, Number(e.target.value) || min))}
        style={width ? { ...FIELD_STYLE, width } : FIELD_STYLE}
      />
    </label>
  );
}

export function TextField({
  label,
  value,
  onChange,
  width,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  width?: number | string;
  placeholder?: string;
}) {
  return (
    <label style={{ display: "block" }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-2)", marginBottom: 5 }}>
        {label}
      </div>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={width === undefined ? FIELD_STYLE : { ...FIELD_STYLE, width, minWidth: 0 }}
      />
    </label>
  );
}

/**
 * EV-190 R1 — the weekday a training day sits on.
 *
 * All seven are OFFERED, including ones already in the plan, and a duplicate is REFUSED
 * with its reason by the caller. Disabling the taken options instead would be a control
 * that does nothing when pressed and explains nothing.
 *
 * ⚠ `dayOfWeek` is not a badge. `RoutinePlanWriter` writes one `Workout` per day plus
 * the full 7-row `plan_schedule` from these numbers, and `TrainingDayScheduleFactory`
 * reads the same rows to pick training-day vs rest-day NUTRITION. Two days on one
 * weekday are silently collapsed by `workoutByDay.put(...)`, which is why the duplicate
 * must be refused in the UI rather than sorted out later.
 */
export function WeekdaySelect({
  dayIndex,
  value,
  onChange,
}: {
  dayIndex: number;
  value: number;
  onChange: (dayOfWeek: number) => void;
}) {
  const copy = useCopy();
  return (
    <select
      aria-label={copy.routine.weekdayLabel(dayIndex + 1)}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{
        height: MIN_TOUCH_TARGET,
        borderRadius: "var(--r-md)",
        border: "1px solid var(--border-2)",
        background: "var(--surface)",
        color: "var(--ink)",
        fontFamily: "var(--font-display)",
        fontSize: 14,
        fontWeight: 700,
        padding: "0 10px",
      }}
    >
      {ISO_WEEKDAY_NUMBERS.map((iso) => (
        <option key={iso} value={iso}>
          {isoWeekdayLabel(iso, copy.locale)}
        </option>
      ))}
    </select>
  );
}

/**
 * EV-201 AC1 — the day's focus, with the label it never had.
 *
 * ⚠ `width: "100%"` on the input is LOAD-BEARING and is what the first cut of this
 * label got wrong (senior-qa 2026-09-21, item 4). The input used to be the flex item
 * itself, so `minWidth: 0` let it shrink with the row — 53 / 93 / 123 / 147 px at 320 /
 * 360 / 390 / 414. Wrapping it in a `<label>` moved that job to the label: measured at
 * 390 the label DOES shrink to 123 px, but an `<input>` has an intrinsic width from its
 * `size` attribute (207 px here) and nothing was asking it to follow its parent — so it
 * overflowed its own label by 84 px, was painted UNDER the exercise count, and the page
 * scrolled sideways at 320 and 360. `minWidth: 0` on a non-flex-item does nothing about
 * that; `width: 100%` does. Any future wrapper around this field needs the same pairing.
 */
export function DayFocusField({
  dayIndex,
  value,
  onChange,
}: {
  dayIndex: number;
  value: string;
  onChange: (focus: string) => void;
}) {
  const copy = useCopy();
  return (
    <label style={{ display: "block", minWidth: 0 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-2)", marginBottom: 5 }}>
        {copy.routine.dayFocusLabel}
      </div>
      <input
        aria-label={copy.routine.dayFocusName(dayIndex + 1)}
        value={value}
        title={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          // BUG-146's floor: a text input a coach taps at 390 px is a control, and 36 px
          // was below it. Only the tap area grows; nothing else about the field changes.
          height: MIN_TOUCH_TARGET,
          borderRadius: "var(--r-md)",
          border: "1px solid var(--border-2)",
          background: "var(--surface)",
          padding: "0 10px",
          fontFamily: "var(--font-display)",
          fontSize: 14.5,
          fontWeight: 600,
          color: "var(--ink)",
          // See the ⚠ above: the field follows the label box, which is the flex item
          // that shrinks. `box-sizing: border-box` is global, so the padding and the
          // hairline border are inside these 100%.
          width: "100%",
          minWidth: 0,
          maxWidth: 220,
        }}
      />
    </label>
  );
}

/**
 * A number the document may leave EMPTY — `TrainingDay.estimatedMinutes` and
 * `RoutineExercise.durationSeconds` are nullable on the wire, and null is "not
 * prescribed". An empty box is null, never a fabricated default: the template editor
 * used to DISPLAY 60 seconds for a null duration while storing null, which was a number
 * on screen that nothing had said (ADR-0018 D3: "durationSeconds: null rather than a
 * fabricated 60").
 */
export function OptionalNumberField({
  label,
  ariaLabel,
  value,
  onChange,
  min = 1,
  max,
  width,
}: {
  label: string;
  /** For a control repeated per day, so each one is addressable on its own. */
  ariaLabel?: string;
  value: number | null;
  onChange: (value: number | null) => void;
  min?: number;
  max?: number;
  width?: number;
}) {
  return (
    <label style={{ display: "block" }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-2)", marginBottom: 5 }}>
        {label}
      </div>
      <input
        type="number"
        aria-label={ariaLabel}
        min={min}
        max={max}
        value={value ?? ""}
        onChange={(e) => {
          const raw = e.target.value.trim();
          if (raw === "") return onChange(null);
          const n = Math.round(Number(raw));
          onChange(Number.isFinite(n) ? Math.max(min, max === undefined ? n : Math.min(max, n)) : null);
        }}
        style={width ? { ...FIELD_STYLE, width } : FIELD_STYLE}
      />
    </label>
  );
}

/** A closed vocabulary rendered as a select. `labels` maps a wire token to a word. */
export function SelectField<T extends string>({
  label,
  value,
  options,
  labels,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly T[];
  labels?: Record<string, string>;
  onChange: (value: string) => void;
}) {
  return (
    <label style={{ display: "block" }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-2)", marginBottom: 5 }}>
        {label}
      </div>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...FIELD_STYLE, width: "auto", minWidth: 120 }}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {labels?.[option] ?? option}
          </option>
        ))}
      </select>
    </label>
  );
}
