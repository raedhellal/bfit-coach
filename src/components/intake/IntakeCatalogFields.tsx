"use client";

import { useEffect, useRef, useState, type FocusEvent } from "react";
import { Button } from "@/components/ui/kit";
import { CatalogPicker } from "@/components/routine/CatalogPicker";
import { filterOptions, muscleLabel } from "@/lib/catalogLabels";
import { useCopy } from "@/lib/i18n/client";
import type { CatalogExercise } from "@/lib/coachApi";

/**
 * EV-341y2 — the interview's two catalogue controls: section 1's muscle groups (YP1, YP6b) and
 * section 2's liked / avoided exercises (YP2, YP3, YP6). Both PICK from Evoli's catalogue; nothing
 * the coach types is ever sent as a value.
 *
 * Both hold their list in the coach's order and show it as chips, each with a remove button named
 * « Retirer {…} » / "Remove {…}". A stored value the catalogue no longer has is a chip like the
 * others, marked « (plus dans le catalogue) »: it counts toward the limit, it can be removed, and
 * the page never removes it on its own (the api accepts it again on a re-save, EV-341y1 Y1b / Y2).
 *
 * Neither saves anything itself: a change goes through `onChange`, the interview's `update`, so
 * it is in the section's next `PUT` within B3's 1.5 s (YP5), and a blur out of the control saves
 * at once (`onLeave`, B3).
 */

type Change = (key: string, value: readonly string[]) => void;

/**
 * After a chip's remove button removes its own chip, the focus goes to the next chip's remove
 * button, else the previous one, else the control's first focusable element: a keyboard user is
 * never dropped on `<body>` (YP8).
 */
function useFocusAfterRemove(count: number) {
  const scope = useRef<HTMLElement | null>(null);
  const pending = useRef<number | null>(null);
  useEffect(() => {
    const at = pending.current;
    if (at === null || !scope.current) return;
    pending.current = null;
    const buttons = Array.from(scope.current.querySelectorAll<HTMLButtonElement>("[data-intake-chip-remove]"));
    const target =
      buttons[Math.min(at, buttons.length - 1)] ??
      scope.current.querySelector<HTMLElement>("input:not(:disabled), button:not(:disabled)");
    target?.focus();
  }, [count]);
  return {
    scope,
    removing: (index: number) => {
      pending.current = index;
    },
  };
}

function Chips({
  items,
  label,
  dropped,
  disabled,
  onRemove,
}: {
  items: readonly string[];
  label: (value: string) => string;
  dropped: (value: string) => boolean;
  disabled: boolean;
  onRemove: (index: number) => void;
}) {
  const copy = useCopy();
  const c = copy.intakePage;
  if (items.length === 0) return null;
  return (
    <ul className="intake-chips">
      {items.map((value, index) => {
        const gone = dropped(value);
        // YP6b: a dropped muscle has no facet label; it is named by its raw stored value.
        const name = gone ? value : label(value);
        return (
          <li key={value} className="intake-chip" data-intake-chip={value} data-dropped={gone ? "true" : undefined}>
            <span className="intake-chip-text">
              {name}
              {gone && (
                <>
                  {" "}
                  <span className="intake-chip-dropped">{c.droppedFromCatalogue}</span>
                </>
              )}
            </span>
            <button
              type="button"
              className="intake-chip-remove"
              data-intake-chip-remove=""
              aria-label={c.removeChip(name)}
              disabled={disabled}
              onClick={() => onRemove(index)}
            >
              <span aria-hidden="true">×</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * YP1 / YP6b — « Groupes musculaires à privilégier »: the `muscles` facet as a group of checkboxes
 * (B8), labelled as the day editor's muscle filter labels them (`muscleLabel`, in the same
 * label order, `filterOptions`), and the chosen ones as chips in the coach's order. With 5 chosen
 * the unticked boxes rest. A value the facet no longer has is a chip only: it is not among the
 * options, so it cannot be added back once removed.
 *
 * `facet` null: the catalogue could not be read. The stored values are still shown, kept and
 * removable; nothing can be added, and the routine page's catalogue sentence says why.
 */
export function EmphasisControl({
  id,
  fieldKey,
  label,
  max,
  value,
  facet,
  disabled,
  readOnly = false,
  describedBy,
  onChange,
  onLeave,
}: {
  id: string;
  fieldKey: string;
  label: string;
  max: number;
  value: readonly string[];
  facet: readonly string[] | null;
  disabled: boolean;
  /** BUG-1073: « Recharger » is replacing this section; the change is refused by the interview's `update`. */
  readOnly?: boolean;
  describedBy?: string;
  onChange: Change;
  onLeave(event: FocusEvent<HTMLElement>): void;
}) {
  const copy = useCopy();
  const c = copy.intakePage;
  const hintId = `${id}-hint`;
  const unavailableId = `${id}-unavailable`;
  const full = value.length >= max;
  const { scope, removing } = useFocusAfterRemove(value.length);
  // Unknown (`facet` null) is not "dropped": a mark is only drawn against a facet that was read.
  const dropped = (v: string) => facet !== null && !facet.includes(v);
  const describe = [hintId, facet === null && !disabled ? unavailableId : null, describedBy].filter(Boolean).join(" ");

  return (
    <fieldset
      ref={(el) => {
        scope.current = el;
      }}
      className="intake-field"
      data-intake-field={fieldKey}
      onBlur={onLeave}
      aria-describedby={describe || undefined}
    >
      <legend className="intake-label">{label}</legend>
      <p id={hintId} className="intake-hint" data-intake-hint="emphasis">
        {c.emphasisHint}
      </p>
      <Chips
        items={value}
        label={(v) => muscleLabel(v, copy)}
        dropped={dropped}
        disabled={disabled}
        onRemove={(index) => {
          removing(index);
          onChange(fieldKey, value.filter((_, i) => i !== index));
        }}
      />
      {facet === null ? (
        disabled ? null : (
          <p id={unavailableId} className="intake-hint" data-intake-catalogue="unavailable">
            {copy.routine.catalogUnavailable}
          </p>
        )
      ) : (
        <div className="intake-choices">
          {filterOptions(facet, muscleLabel, copy).map((option) => {
            const checked = value.includes(option.value);
            return (
              <label key={option.value} className="intake-choice">
                <input
                  type="checkbox"
                  value={option.value}
                  checked={checked}
                  // YP1: with 5 chosen (dropped values included, YP6b), the others rest.
                  disabled={disabled || (full && !checked)}
                  aria-readonly={readOnly || undefined}
                  aria-describedby={[hintId, describedBy].filter(Boolean).join(" ")}
                  onChange={(e) =>
                    onChange(fieldKey, e.target.checked ? [...value, option.value] : value.filter((v) => v !== option.value))
                  }
                />
                <span>{option.label}</span>
              </label>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}

/**
 * YP2 / YP3 / YP6 — « Exercices appréciés » / « Exercices à éviter »: the picked names as chips,
 * and the day editor's own catalogue search (`CatalogPicker`, `GET /coach-portal/catalog/exercises`)
 * to add more. The search stays open while adding (as the day editor's « Ajouter un exercice »),
 * takes the focus when it opens, closes on Escape, and hands the focus back to its opener (YP8).
 *
 * In the search: a name already in the other list rests, with « Déjà dans l'autre liste »; a name
 * already in this list rests too (picking it again would change nothing). With 10 picked, the
 * opener and every row rest and « 10 exercices au maximum. » shows, beside the opener and in the
 * search.
 */
export function ExerciseListControl({
  id,
  fieldKey,
  label,
  max,
  value,
  other,
  droppedNames,
  helper,
  disabled,
  describedBy,
  onChange,
  onLeave,
}: {
  id: string;
  fieldKey: string;
  label: string;
  max: number;
  value: readonly string[];
  /** The other list's names (YP2's cross-list rule). */
  other: readonly string[];
  /** Stored names the catalogue certainly no longer has (YP6), from the page's read. */
  droppedNames: readonly string[];
  /** YP3: the injury line, under « Exercices à éviter » only. */
  helper?: string;
  disabled: boolean;
  describedBy?: string;
  onChange: Change;
  onLeave(event: FocusEvent<HTMLElement>): void;
}) {
  const copy = useCopy();
  const c = copy.intakePage;
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLSpanElement | null>(null);
  const full = value.length >= max;
  const helperId = `${id}-helper`;
  const maxId = `${id}-max`;
  const { scope, removing } = useFocusAfterRemove(value.length);

  function close() {
    setOpen(false);
    // YP8: back to the control that opened the search (Escape, × or « Terminé »). At 10 that
    // control is disabled and cannot take the focus (staff y2 r1 S1: it fell to <body>), so the
    // focus goes to the line that says why, « 10 exercices au maximum. », which is read out.
    requestAnimationFrame(() => {
      const button = opener.current?.querySelector<HTMLButtonElement>("button");
      if (button && !button.disabled) button.focus();
      else scope.current?.querySelector<HTMLElement>("[data-intake-limit]")?.focus();
    });
  }

  function pick(exercise: CatalogExercise) {
    // The rows that would break a rule rest (`rowBlock`, `limitNote`); this is the same rule again.
    if (value.length >= max || value.includes(exercise.name) || other.includes(exercise.name)) return;
    onChange(fieldKey, [...value, exercise.name]);
  }

  return (
    // One container for the list, its opener AND the search, so moving the focus between them is
    // not "leaving the field" (B3's blur save happens once the focus is outside all three).
    <div
      ref={(el) => {
        scope.current = el;
      }}
      data-intake-field={fieldKey}
      onBlur={onLeave}
    >
      <fieldset className="intake-field" aria-describedby={[helper ? helperId : null, describedBy].filter(Boolean).join(" ") || undefined}>
        <legend className="intake-label">{label}</legend>
        {helper && (
          <p id={helperId} className="intake-hint" data-intake-hint={fieldKey}>
            {helper}
          </p>
        )}
        <Chips
          items={value}
          label={(name) => name}
          dropped={(name) => droppedNames.includes(name)}
          disabled={disabled}
          onRemove={(index) => {
            removing(index);
            onChange(fieldKey, value.filter((_, i) => i !== index));
          }}
        />
        <span ref={opener} className="intake-picker-open" data-intake-picker-open={fieldKey}>
          <Button
            variant="soft"
            icon="plus"
            disabled={disabled || full}
            ariaDescribedBy={full ? maxId : undefined}
            onClick={() => setOpen(true)}
          >
            {copy.routine.addExercise}
          </Button>
        </span>
        {full && (
          <p id={maxId} className="intake-hint intake-limit" data-intake-limit={fieldKey} tabIndex={-1}>
            {c.exercisesMax}
          </p>
        )}
      </fieldset>
      <CatalogPicker
        open={open}
        keepOpen
        focusSearch
        title={label}
        onClose={close}
        onPick={pick}
        limitNote={full ? c.exercisesMax : null}
        rowBlock={(exercise) =>
          other.includes(exercise.name) ? { note: c.inOtherList } : value.includes(exercise.name) ? { note: null } : null
        }
      />
    </div>
  );
}
