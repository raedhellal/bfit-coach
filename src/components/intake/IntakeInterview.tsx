"use client";

import { useId, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/kit";
import { useCopy } from "@/lib/i18n/client";
import { useCoachForm, type CoachForm } from "@/lib/useCoachForm";
import { useAutosave } from "@/lib/useAutosave";
import type { SectionStatus } from "@/lib/autosave";
import { intakeReadPath, putIntakeSection } from "@/lib/autosaveTransport";
import {
  INTAKE_CATALOGUE,
  INTAKE_FORM_SECTIONS,
  NOTES_MAX_CODE_POINTS,
  codePoints,
  firstUnanswered,
  formKey,
  sectionAnswered,
  sectionFromApi,
  sectionSlice,
  sectionToApi,
  type IntakeField,
  type IntakeFieldProblem,
  type IntakeFormSection,
  type IntakeFormValue,
  type IntakeFormValues,
} from "@/lib/intakeForm";

/**
 * EV-341b — the interview page's island: the section list, sections 1–4 and their notes, and
 * the autosave (B2–B9, B11, B14–B16).
 *
 * ONE form for the four sections (`useCoachForm`: one guarded form per page). Each section is
 * saved on its own (`useAutosave`, one queue per section), through the portal's route handler
 * (`putIntakeSection`): never a server action, never a `router.refresh()` after a save (B3).
 *
 * What the server holds is `acked`: the page's read, then each section as its last save
 * landed. It is the form's `server` prop, so a field differs from it exactly when that
 * field's latest value is not stored yet; the autosave's own `dirty` (a save waiting, in
 * flight, failed, refused, or a section in conflict) comes in as `extraDirty` (B7, B7a).
 *
 * Every section is MOUNTED and only the chosen one is shown (`hidden`): choosing a section
 * makes no request and changes no URL (B2), and a value typed in a section the coach has left
 * is still on its field when they come back.
 *
 * A save is started from a field's own handler, never from an effect on the values: « Recharger »
 * writes the stored values into the fields, and that must send nothing (B5a).
 */

export interface IntakeInterviewProps {
  clientId: string;
  /** The account this page was rendered for (`sessionSubjectTag`), sent with every save. */
  sessionSubject: string;
  /** The page's read: each section's version and answers. Null when the grant is missing (B11). */
  initial: { versions: Record<IntakeFormSection, number>; values: IntakeFormValues } | null;
  /** B11: the id of the sentence that says why every field is disabled. */
  disabledReasonId?: string;
  /** B10: section 3's read-only equipment, rendered by the page. */
  equipment?: ReactNode;
}

type Payload = { values: Record<string, unknown>; form: IntakeFormValues };

const EMPTY_VERSIONS: Record<IntakeFormSection, number> = { GOALS: 0, HISTORY: 0, AVAILABILITY: 0, LIFESTYLE: 0 };

function emptyValues(): IntakeFormValues {
  const out: IntakeFormValues = {};
  for (const section of INTAKE_FORM_SECTIONS) Object.assign(out, sectionFromApi(section, null));
  return out;
}

function sectionOf(key: string): IntakeFormSection {
  return key.slice(0, key.indexOf(".")) as IntakeFormSection;
}

/** The page's one status line: the most serious state of any section. */
type Aggregate = "signedOut" | "failed" | "retrying" | "saving" | "saved" | null;
function aggregate(statuses: Record<IntakeFormSection, SectionStatus>, signedOut: boolean): Aggregate {
  const all = INTAKE_FORM_SECTIONS.map((s) => statuses[s]);
  if (signedOut || all.includes("signedOut")) return "signedOut";
  // A refused request (a 4xx) is not retried (B4): it is shown as the terminal failure, with « Réessayer ».
  if (all.includes("failed") || all.includes("invalid")) return "failed";
  if (all.includes("retrying")) return "retrying";
  if (all.includes("saving") || all.includes("pending")) return "saving";
  if (all.includes("saved")) return "saved";
  return null;
}

export function IntakeInterview({ clientId, sessionSubject, initial, disabledReasonId, equipment }: IntakeInterviewProps) {
  const copy = useCopy();
  const c = copy.intakePage;
  const router = useRouter();
  const uid = useId();
  const disabled = initial === null;

  const [acked, setAcked] = useState<IntakeFormValues>(() => initial?.values ?? emptyValues());
  const [open, setOpen] = useState<IntakeFormSection>(() => (initial ? firstUnanswered(initial.values) : "GOALS"));

  // `form` is read inside the autosave's callbacks, which the engine calls after an await.
  const formRef = useRef<CoachForm<IntakeFormValues> | null>(null);
  /**
   * B14 / staff H2: access ended (a 403 on a save or on « Recharger »). Through the form, so the
   * guard's history entry is gone before the refresh reaches the layout's redirect to
   * /clients/denied, and leaving it asks nothing. The one refresh of this island: a refused write
   * revalidates nothing.
   */
  const accessEnded = () => formRef.current?.endAccess(() => router.refresh(), "leaves");

  const autosave = useAutosave<IntakeFormSection, Payload>({
    versions: initial?.versions ?? EMPTY_VERSIONS,
    send: (section, version, payload) => putIntakeSection(clientId, section, version, payload.values, sessionSubject),
    onSaved: (_section, payload) => setAcked((prev) => ({ ...prev, ...payload.form })),
    onAccessEnded: accessEnded,
  });

  const form = useCoachForm<IntakeFormValues>({ server: acked, enabled: !disabled, extraDirty: autosave.dirty });
  formRef.current = form;

  /** The values as of the last change, ahead of the render that will show them. */
  const valuesRef = useRef(form.values);
  valuesRef.current = form.values;

  function update(key: string, value: IntakeFormValue) {
    if (disabled) return;
    const next = { ...valuesRef.current, [key]: value };
    valuesRef.current = next;
    form.set(key, value);
    const section = sectionOf(key);
    const { values, problems } = sectionToApi(section, next);
    // B16: nothing of this section is sent while a field would be refused.
    if (problems.length > 0) autosave.block(section);
    else autosave.change(section, { values, form: sectionSlice(section, next) });
  }

  /** B3: a field (or a group of choices) lost focus to something outside it — save now. */
  const flushOnLeave = (section: IntakeFormSection) => (event: FocusEvent<HTMLElement>) => {
    const next = event.relatedTarget as Node | null;
    if (next && event.currentTarget.contains(next)) return;
    autosave.flush(section);
  };

  const [reloading, setReloading] = useState(false);
  /** B5 « Recharger »: the stored values replace the conflicted sections', with no navigation. */
  async function reload() {
    if (reloading) return;
    setReloading(true);
    try {
      const res = await fetch(intakeReadPath(clientId), {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
        redirect: "manual",
        headers: { Accept: "application/json" },
      });
      if (res.status === 403) {
        accessEnded();
        return;
      }
      if (res.status !== 200) return; // the conflict stays on screen; « Recharger » again
      const body = (await res.json().catch(() => null)) as {
        state?: string;
        sections?: Partial<Record<IntakeFormSection, { version?: unknown; values?: Record<string, unknown> }>>;
      } | null;
      if (body?.state !== "READY" || !body.sections) return;
      const stored: IntakeFormValues = {};
      const versions: Partial<Record<IntakeFormSection, number>> = {};
      for (const section of INTAKE_FORM_SECTIONS) {
        if (autosave.statuses[section] !== "conflict") continue;
        const read = body.sections[section];
        if (!read || typeof read.version !== "number") return;
        Object.assign(stored, sectionFromApi(section, read.values));
        versions[section] = read.version;
      }
      const next = { ...valuesRef.current, ...stored };
      valuesRef.current = next;
      for (const [key, value] of Object.entries(stored)) form.set(key, value);
      setAcked((prev) => ({ ...prev, ...stored }));
      for (const [section, version] of Object.entries(versions) as [IntakeFormSection, number][]) {
        autosave.reload(section, version);
      }
    } catch {
      // A lost answer: the conflict stays, and « Recharger » can be pressed again.
    } finally {
      setReloading(false);
    }
  }

  const values = form.values;
  const status = aggregate(autosave.statuses, autosave.signedOut);
  const conflicted = INTAKE_FORM_SECTIONS.some((s) => autosave.statuses[s] === "conflict");

  /** The section list's roving focus: arrow keys move between sections (one Tab stop). */
  const tabRefs = useRef<Partial<Record<IntakeFormSection, HTMLButtonElement | null>>>({});
  function onTabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const keys: Record<string, number> = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
    let target: number | null = null;
    if (event.key in keys) target = (index + keys[event.key] + INTAKE_FORM_SECTIONS.length) % INTAKE_FORM_SECTIONS.length;
    else if (event.key === "Home") target = 0;
    else if (event.key === "End") target = INTAKE_FORM_SECTIONS.length - 1;
    if (target === null) return;
    event.preventDefault();
    const section = INTAKE_FORM_SECTIONS[target];
    setOpen(section);
    tabRefs.current[section]?.focus();
  }

  const statusWord = (section: IntakeFormSection) => (sectionAnswered(section, values) ? c.started : c.notStarted);

  return (
    <div ref={form.scope} className="intake" data-intake-ready={disabled ? "disabled" : "ready"}>
      {/* B3 / B4 / B15: one line for the whole page; a failure and a session end are alerts with « Réessayer ». */}
      <div className="intake-status-row">
        <p className="intake-status" role="status" data-intake-status={status ?? "idle"}>
          {status === "saving" ? c.saving : status === "saved" ? c.saved : status === "retrying" ? c.retrying : ""}
        </p>
        {(status === "failed" || status === "signedOut") && (
          <div className="intake-alert" role="alert" data-intake-alert={status}>
            <p className="intake-alert-text">{status === "failed" ? c.failed : c.sessionEnded}</p>
            {/*
              `sessionSafe`: after a sign-in in another tab, `SessionEpochGuard` stops every click
              that is not marked (ADR-0033 D33.14), and B15 asks this one to save. It cannot write
              under another account: the handler checks the page's account on every save.
            */}
            <Button variant="secondary" onClick={() => autosave.retry()} sessionSafe>
              {c.tryAgain}
            </Button>
          </div>
        )}
        {conflicted && (
          <div className="intake-alert" role="alert" data-intake-alert="conflict">
            <p className="intake-alert-text">{c.conflict}</p>
            <Button variant="secondary" onClick={reload}>
              {c.reload}
            </Button>
          </div>
        )}
      </div>

      <div className="intake-layout">
        {/* B2: at 390 px the list is a <select>; above, a list of sections. Neither navigates. */}
        <div className="intake-picker">
          <select
            className="intake-select"
            aria-label={c.title}
            value={open}
            onChange={(e) => setOpen(e.target.value as IntakeFormSection)}
            data-adopt="never"
          >
            {INTAKE_FORM_SECTIONS.map((section) => (
              <option key={section} value={section}>
                {copy.common.labelled(c.sections[section], statusWord(section))}
              </option>
            ))}
          </select>
          <div className="intake-sections" role="tablist" aria-label={c.title} aria-orientation="vertical">
            {INTAKE_FORM_SECTIONS.map((section, index) => {
              const on = section === open;
              const answered = sectionAnswered(section, values);
              return (
                <button
                  key={section}
                  ref={(el) => {
                    tabRefs.current[section] = el;
                  }}
                  type="button"
                  role="tab"
                  id={`${uid}-tab-${section}`}
                  aria-selected={on}
                  aria-controls={`${uid}-panel-${section}`}
                  tabIndex={on ? 0 : -1}
                  className="intake-section-tab"
                  data-intake-section={section}
                  data-intake-answered={answered ? "true" : "false"}
                  onClick={() => setOpen(section)}
                  onKeyDown={(e) => onTabKey(e, index)}
                >
                  <span className="intake-section-name">{c.sections[section]}</span>
                  <span className="intake-section-status" data-tone={answered ? "started" : "todo"}>
                    {answered ? c.started : c.notStarted}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="intake-panels">
          {INTAKE_FORM_SECTIONS.map((section) => {
            const problems = sectionToApi(section, values).problems;
            return (
              <section
                key={section}
                id={`${uid}-panel-${section}`}
                role="tabpanel"
                aria-labelledby={`${uid}-heading-${section}`}
                hidden={section !== open}
                className="ov-card intake-panel"
                data-intake-panel={section}
              >
                <h3 id={`${uid}-heading-${section}`} className="ov-card-title intake-panel-title">
                  {c.sections[section]}
                </h3>
                {INTAKE_CATALOGUE[section].map((field) => (
                  <FieldControl
                    key={field.field}
                    uid={uid}
                    section={section}
                    field={field}
                    value={values[formKey(section, field.field)]}
                    problem={problems.find((p) => p.field === field.field) ?? null}
                    disabled={disabled}
                    describedBy={disabledReasonId}
                    onChange={update}
                    onLeave={flushOnLeave(section)}
                  />
                ))}
                {section === "AVAILABILITY" && equipment ? <div className="intake-readonly">{equipment}</div> : null}
              </section>
            );
          })}
        </div>
      </div>
      {form.guard}
    </div>
  );
}

function FieldControl({
  uid,
  section,
  field,
  value,
  problem,
  disabled,
  describedBy,
  onChange,
  onLeave,
}: {
  uid: string;
  section: IntakeFormSection;
  field: IntakeField;
  value: IntakeFormValue | undefined;
  problem: IntakeFieldProblem | null;
  disabled: boolean;
  describedBy?: string;
  onChange(key: string, value: IntakeFormValue): void;
  onLeave(event: FocusEvent<HTMLElement>): void;
}) {
  const copy = useCopy();
  const c = copy.intakePage;
  const key = formKey(section, field.field);
  const id = `${uid}-${section}-${field.field}`;
  const label = c.fields[field.field] ?? field.field;
  const errorId = `${id}-error`;
  const text = typeof value === "string" ? value : "";
  const list = Array.isArray(value) ? value : [];

  const describe = (...ids: (string | null | undefined | false)[]) => ids.filter(Boolean).join(" ") || undefined;

  if (field.kind === "single" || field.kind === "singleInt") {
    const options = field.kind === "single" ? field.options : field.options.map(String);
    const optionLabel = (option: string) =>
      field.kind === "single"
        ? (c.values[field.field]?.[option] ?? option)
        : field.field === "sessionMinutes"
          ? c.minutes(Number(option))
          : option;
    return (
      <fieldset className="intake-field" data-intake-field={key} onBlur={onLeave}>
        <legend className="intake-label">{label}</legend>
        <div className="intake-choices">
          {options.map((option) => (
            <label key={option} className="intake-choice">
              <input
                type="radio"
                name={id}
                value={option}
                checked={text === option}
                disabled={disabled}
                aria-describedby={describe(describedBy)}
                onChange={() => onChange(key, option)}
              />
              <span>{optionLabel(option)}</span>
            </label>
          ))}
        </div>
      </fieldset>
    );
  }

  if (field.kind === "multi") {
    const full = field.max !== undefined && list.length >= field.max;
    return (
      <fieldset className="intake-field" data-intake-field={key} onBlur={onLeave}>
        <legend className="intake-label">{label}</legend>
        <div className="intake-choices">
          {field.options.map((option) => {
            const checked = list.includes(option);
            return (
              <label key={option} className="intake-choice">
                <input
                  type="checkbox"
                  value={option}
                  checked={checked}
                  // At the api's bound (3 motivations), the unticked boxes rest until one is unticked.
                  disabled={disabled || (full && !checked)}
                  aria-describedby={describe(describedBy)}
                  onChange={(e) =>
                    onChange(
                      key,
                      e.target.checked
                        ? field.options.filter((o) => o === option || list.includes(o))
                        : list.filter((o) => o !== option)
                    )
                  }
                />
                <span>{c.values[field.field]?.[option] ?? option}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
    );
  }

  if (field.kind === "notes") {
    const count = codePoints(text);
    const over = count > NOTES_MAX_CODE_POINTS;
    const counterId = `${id}-counter`;
    return (
      <div className="intake-field" data-intake-field={key}>
        <label className="intake-label" htmlFor={id}>
          {label}
        </label>
        {/* B16: no `maxLength` (it counts UTF-16 units, not code points); the counter and the block do the work. */}
        <textarea
          id={id}
          className="intake-textarea"
          value={text}
          rows={4}
          disabled={disabled}
          aria-describedby={describe(counterId, over && errorId, describedBy)}
          aria-invalid={over ? true : undefined}
          onChange={(e) => onChange(key, e.target.value)}
          onBlur={onLeave}
        />
        <div className="intake-counter-row">
          {over && (
            <p id={errorId} className="intake-error" data-intake-error="notes">
              {c.notesTooLong}
            </p>
          )}
          <p id={counterId} className="intake-counter" data-over={over ? "true" : "false"}>
            {c.notesCounter(count)}
          </p>
        </div>
      </div>
    );
  }

  const error =
    problem?.kind === "range" ? copy.recipes.numberRange(label, problem.min, problem.max) : null;
  return (
    <div className="intake-field" data-intake-field={key}>
      <label className="intake-label" htmlFor={id}>
        {label}
      </label>
      <div className="kit-field intake-input-box" data-invalid={error ? "true" : undefined}>
        <input
          id={id}
          className="kit-field-input intake-input"
          type={field.kind === "date" ? "date" : "text"}
          inputMode={field.kind === "integer" ? "numeric" : undefined}
          autoComplete="off"
          value={text}
          maxLength={field.kind === "text" ? field.maxCodePoints : undefined}
          disabled={disabled}
          aria-describedby={describe(error && errorId, describedBy)}
          aria-invalid={error ? true : undefined}
          onChange={(e) => onChange(key, e.target.value)}
          onBlur={onLeave}
        />
      </div>
      {error && (
        <p id={errorId} className="intake-error" data-intake-error={field.field}>
          {error}
        </p>
      )}
    </div>
  );
}
