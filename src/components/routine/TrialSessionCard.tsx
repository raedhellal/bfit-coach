"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "@/components/ui/Link";
import { Button, Card, Modal } from "@/components/ui/kit";
import { UiIcon } from "@/components/ui/icons";
import { CatalogPicker } from "./CatalogPicker";
import { ExerciseRow } from "./RoutineDocumentEditor";
import { OptionalNumberField } from "./RoutineFields";
import { useCopy } from "@/lib/i18n/client";
import { formatDate, formatInstant, isoWeekdayLabel } from "@/lib/format";
import { newExercise } from "@/lib/routineDocument";
import { settled } from "@/lib/settled";
import {
  MAX_TRIAL_EXERCISES,
  trialCardView,
  trialHistoryHref,
  trialSessionBody,
  type TrialFailure,
  type TrialRead,
} from "@/lib/trialSession";
import {
  assignTrialSessionAction,
  previewTrialSessionAction,
  trialTemplateChoicesAction,
  trialTemplateDaysAction,
  withdrawTrialSessionAction,
} from "@/lib/trialSessionActions";
import type {
  CatalogExercise,
  CoachTrialSessionRequest,
  RoutineExercise,
  RoutineTrainingDay,
} from "@/lib/coachApi";

/**
 * EV-341j — the Programme tab's « Séance d'essai » card: prepare a trial session for a client
 * who has no programme yet, assign it through the injury policy's two phases, withdraw it,
 * and see it done.
 *
 *   J1  AWAITING_PROGRAMME: « Préparer une séance d'essai » opens the day editor, empty or
 *       filled from a template day (« Partir d'un modèle »).
 *   J2  « Assigner » previews (writes nothing); with repairs, EV-184's repair dialog, whose
 *       « Assigner » echoes the preview's digest with the SAME body; with none, the assign
 *       goes straight on. A 409 on the digest previews again: never a blind retry.
 *   J3  ASSIGNED: « Assignée le {date} » + « Retirer », and NO edit control (ADR-0034 Q7 (f)).
 *       DONE: « Faite le {date} », linked to the session in the overview's history.
 *   J3b « Retirer » asks first (the dialog's words are the story's).
 *   J3c is WITHDRAWN (2026-10-12 (d)): a TRIAL_DONE card offers no prepare path, no control.
 *
 * No write is optimistic (ADR-0033 D33.6): every state change follows the api's answer. The
 * assign and the withdraw revalidate the page, so the card re-seeds from the server's read.
 *
 * Not built, by the story's silence: a title, a planned date and a note to the client. J1
 * names no field and no words for them, so the api's defaults apply (« Séance d'essai », the
 * assign date's weekday, no note). A leave guard for the trial editor is not built either:
 * the routine editor below owns the page's one.
 */

export type TrialCardRead = { state: "absent" } | { state: "failed" } | { state: "ok"; read: TrialRead };

type Preview = { repairs: string[]; digest: string; body: CoachTrialSessionRequest };

export function TrialSessionCard({
  clientId,
  firstName,
  read,
}: {
  clientId: string;
  /** `firstName(traineeDisplayName, locale)`, computed by the page. */
  firstName: string;
  read: TrialCardRead;
}) {
  const copy = useCopy();
  const t = copy.trial;
  const router = useRouter();
  const titleId = useId();
  const needsId = useId();
  const fullId = useId();

  const [current, setCurrent] = useState<TrialRead | null>(read.state === "ok" ? read.read : null);
  /** The server re-rendered this page (an action revalidated it): its read is the truth now. */
  const seeded = useRef(read);
  useEffect(() => {
    if (seeded.current === read) return;
    seeded.current = read;
    if (read.state === "ok") setCurrent(read.read);
  }, [read]);

  const [editing, setEditing] = useState(false);
  const [exercises, setExercises] = useState<RoutineExercise[]>([]);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [picked, setPicked] = useState<Record<string, CatalogExercise>>({});
  const [structure, setStructure] = useState(0);
  const [picker, setPicker] = useState<{ mode: "add" } | { mode: "replace"; index: number } | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [busy, setBusy] = useState<null | "assign" | "withdraw">(null);
  const [error, setError] = useState<string | null>(null);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);

  /**
   * Keyboard-only use (EV-341 common rules): every action here REPLACES the control that was
   * pressed (« Préparer » becomes the editor, « Assigner » becomes « Retirer »…), so the focus
   * would fall to the document. After a press, it goes to the card's first control instead,
   * or to its heading when the card holds none.
   */
  const cardRef = useRef<HTMLElement>(null);
  const refocus = useRef(false);
  const view = current ? trialCardView(current) : null;
  const viewKind = view?.kind ?? null;
  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    const root = cardRef.current;
    const target = root?.querySelector<HTMLElement>("button:not([disabled]), a[href]") ?? root?.querySelector<HTMLElement>("h3");
    target?.focus();
  }, [viewKind, editing]);

  if (read.state === "absent") return null;

  /** A 403: the link ended or no longer carries WORKOUTS. The page's own read redirects. */
  function accessEnded(): void {
    setPreview(null);
    setConfirmWithdraw(false);
    router.refresh();
  }

  function sentenceFor(failure: TrialFailure): string {
    return failure === "CATALOG_UNAVAILABLE" ? copy.routine.catalogUnavailable : t.assignFailed;
  }

  function openEditor(): void {
    refocus.current = true;
    setExercises([]);
    setMinutes(null);
    setPicked({});
    setStructure((n) => n + 1);
    setError(null);
    setEditing(true);
  }

  function closeEditor(): void {
    refocus.current = true;
    setEditing(false);
    setPicker(null);
    setError(null);
  }

  function edit(next: RoutineExercise[]): void {
    setExercises(next);
    setError(null);
  }

  function onPick(exercise: CatalogExercise): void {
    const target = picker;
    if (!target) return;
    setPicked((p) => ({ ...p, [exercise.name.toLowerCase()]: exercise }));
    if (target.mode === "replace") {
      setPicker(null);
      setStructure((n) => n + 1);
      edit(exercises.map((ex, i) => (i === target.index ? { ...ex, name: exercise.name } : ex)));
      return;
    }
    if (exercises.length >= MAX_TRIAL_EXERCISES) return;
    edit([...exercises, newExercise(exercise)]);
  }

  function fromTemplateDay(day: RoutineTrainingDay): void {
    setTemplatesOpen(false);
    setStructure((n) => n + 1);
    setMinutes(day.estimatedMinutes ?? null);
    edit(day.exercises.slice(0, MAX_TRIAL_EXERCISES).map((ex) => ({ ...ex })));
  }

  async function assign(body: CoachTrialSessionRequest, digest: string, retried = false): Promise<void> {
    setBusy("assign");
    const result = await settled(assignTrialSessionAction(clientId, body, digest), {
      ok: false,
      failure: "FAILED" as const,
    });
    if (result.ok) {
      setBusy(null);
      setPreview(null);
      if (result.read) setCurrent(result.read);
      closeEditor();
      return;
    }
    if (result.failure === "ACCESS_DENIED") {
      setBusy(null);
      return accessEnded();
    }
    if (result.failure === "REPAIRS_UNACKNOWLEDGED" && !retried) {
      // The preview the coach saw is not this body's any more: show the new one. Never a blind retry.
      setPreview(null);
      return void startAssign(body, true);
    }
    if (result.failure === "ALREADY_OPEN") {
      // Another tab assigned one: the action revalidated the page, whose read now shows it.
      setBusy(null);
      setPreview(null);
      closeEditor();
      return;
    }
    setBusy(null);
    setPreview(null);
    setError(sentenceFor(result.failure));
  }

  async function startAssign(body: CoachTrialSessionRequest, afterConflict = false): Promise<void> {
    setBusy("assign");
    setError(null);
    const result = await settled(previewTrialSessionAction(clientId, body), { ok: false, failure: "FAILED" as const });
    if (!result.ok) {
      setBusy(null);
      if (result.failure === "ACCESS_DENIED") return accessEnded();
      setError(sentenceFor(result.failure));
      return;
    }
    if (result.repairs.length > 0) {
      setBusy(null);
      setPreview({ repairs: result.repairs, digest: result.digest, body });
      return;
    }
    await assign(body, result.digest, afterConflict);
  }

  async function withdraw(): Promise<void> {
    setBusy("withdraw");
    setWithdrawError(null);
    const result = await settled(withdrawTrialSessionAction(clientId), { ok: false, failure: "FAILED" as const });
    setBusy(null);
    if (result.ok) {
      refocus.current = true;
      setConfirmWithdraw(false);
      if (result.read) setCurrent(result.read);
      return;
    }
    if (result.failure === "ACCESS_DENIED") return accessEnded();
    setWithdrawError(t.withdrawFailed);
  }

  if (view?.kind === "none" && !editing) return null;

  const full = exercises.length >= MAX_TRIAL_EXERCISES;
  const empty = exercises.length === 0;

  return (
    <section ref={cardRef} aria-labelledby={titleId} className="trial-card" data-trial-state={view?.kind ?? "failed"}>
      <Card style={{ marginBottom: 16 }}>
        <h3 id={titleId} tabIndex={-1} style={{ margin: "0 0 10px", fontSize: 15.5, fontWeight: 600, color: "var(--ink)" }}>
          {t.title}
        </h3>

        {!view && <p className="ov-note">{t.loadError}</p>}

        {view?.kind === "assigned" && (
          <div className="trial-row">
            <p className="ov-note">{t.assignedOn(formatInstant(view.assignedAt, copy.locale))}</p>
            <Button variant="secondary" onClick={() => setConfirmWithdraw(true)} disabled={busy !== null}>
              {t.withdraw}
            </Button>
          </div>
        )}

        {view?.kind === "done" && (
          <div className="trial-row">
            <p className="ov-note">
              <Link href={trialHistoryHref(clientId)} style={{ color: "var(--link)", fontWeight: 600 }}>
                {t.doneOn(formatDate(view.completedOn, copy.locale))}
              </Link>
            </p>
          </div>
        )}

        {view?.kind === "prepare" && !editing && (
          <Button icon="plus" onClick={openEditor} disabled={busy !== null}>
            {t.prepare}
          </Button>
        )}

        {editing && (
          <div className="trial-editor" style={{ display: "grid", gap: 12 }}>
            <div>
              <Button variant="secondary" icon="file" onClick={() => setTemplatesOpen(true)} disabled={busy !== null}>
                {t.fromTemplate}
              </Button>
            </div>
            {exercises.length > 0 && (
              <div style={{ display: "grid", gap: 10 }}>
                {exercises.map((exercise, index) => (
                  <ExerciseRow
                    key={`${structure}-${exercise.name}-${index}`}
                    exercise={exercise}
                    first={index === 0}
                    last={index === exercises.length - 1}
                    unbindable={false}
                    picked={picked[exercise.name.toLowerCase()] ?? null}
                    onChange={(mutate) => edit(exercises.map((ex, i) => (i === index ? mutate(ex) : ex)))}
                    onMove={(delta) => {
                      const to = index + delta;
                      if (to < 0 || to >= exercises.length) return;
                      const next = [...exercises];
                      const [moved] = next.splice(index, 1);
                      next.splice(to, 0, moved);
                      setStructure((n) => n + 1);
                      edit(next);
                    }}
                    onReplace={() => setPicker({ mode: "replace", index })}
                    onRemove={() => {
                      setStructure((n) => n + 1);
                      edit(exercises.filter((_, i) => i !== index));
                    }}
                  />
                ))}
              </div>
            )}
            <div>
              <Button
                variant="soft"
                icon="plus"
                disabled={full || busy !== null}
                ariaDescribedBy={full ? fullId : undefined}
                onClick={() => setPicker({ mode: "add" })}
              >
                {copy.routine.addExercise}
              </Button>
              {full && (
                <p id={fullId} className="ov-note" style={{ marginTop: 8 }}>
                  {t.full}
                </p>
              )}
            </div>
            <OptionalNumberField
              label={copy.routine.estimatedMinutesLabel}
              value={minutes}
              min={1}
              max={600}
              onChange={setMinutes}
            />
            {empty && (
              <p id={needsId} className="ov-note">
                {t.needsExercise}
              </p>
            )}
            {error && (
              <p className="ov-note" role="alert" style={{ color: "var(--err-ink)" }}>
                {error}
              </p>
            )}
            <div className="ov-card-actions" style={{ marginTop: 0 }}>
              <Button variant="secondary" onClick={closeEditor} disabled={busy !== null}>
                {copy.routine.cancel}
              </Button>
              <Button
                // Not disabled while busy: a focused button that becomes disabled loses the focus
                // (a failure would leave a keyboard user nowhere). A press while one is out is ignored.
                onClick={() => busy === null && void startAssign(trialSessionBody(exercises, minutes))}
                disabled={empty}
                ariaDescribedBy={empty ? needsId : undefined}
              >
                {t.assign}
              </Button>
            </div>
          </div>
        )}

        {!editing && error && (
          <p className="ov-note" role="alert" style={{ color: "var(--err-ink)", marginTop: 10 }}>
            {error}
          </p>
        )}
      </Card>

      <CatalogPicker
        open={picker !== null}
        keepOpen={picker?.mode === "add"}
        title={picker?.mode === "replace" ? copy.routine.catalogReplaceTitle : copy.routine.catalogTitle}
        onClose={() => setPicker(null)}
        onPick={onPick}
      />

      <TemplateDayPicker open={templatesOpen} onClose={() => setTemplatesOpen(false)} onPick={fromTemplateDay} />

      {/* J2 — EV-184's repair dialog, with the assign's own words on its confirm. */}
      <Modal
        dirty={false}
        open={preview !== null}
        onClose={() => busy === null && setPreview(null)}
        title={copy.routine.repairsTitle(preview?.repairs.length ?? 0)}
        icon="shield"
        iconTone="amber"
        width={520}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPreview(null)} disabled={busy !== null}>
              {copy.routine.cancel}
            </Button>
            <Button onClick={() => preview && void assign(preview.body, preview.digest)} disabled={busy !== null}>
              {t.assign}
            </Button>
          </>
        }
      >
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 10 }}>
          {(preview?.repairs ?? []).map((repair, i) => (
            <li
              key={`${repair}-${i}`}
              title={repair}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 9,
                padding: "10px 12px",
                borderRadius: "var(--r-lg)",
                background: "var(--warn-bg)",
                color: "var(--warn-ink)",
                fontSize: 13.5,
                lineHeight: 1.45,
              }}
            >
              <UiIcon name="shield" size={16} color="var(--warn-ink)" />
              {/* The api's whole sentence (English, api content), verbatim as on a publish. */}
              <span>{repair}</span>
            </li>
          ))}
        </ul>
      </Modal>

      {/* J3b, verbatim. */}
      <Modal
        dirty={false}
        open={confirmWithdraw}
        onClose={() => busy === null && setConfirmWithdraw(false)}
        title={t.withdrawTitle}
        icon="alert"
        iconTone="amber"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmWithdraw(false)} disabled={busy !== null}>
              {copy.routine.cancel}
            </Button>
            <Button variant="danger" onClick={() => void withdraw()} disabled={busy !== null}>
              {t.withdraw}
            </Button>
          </>
        }
      >
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: "var(--ink-2)" }}>{t.withdrawBody(firstName)}</p>
        {withdrawError && (
          <p role="alert" style={{ margin: "10px 0 0", fontSize: 13, color: "var(--err-ink)" }}>
            {withdrawError}
          </p>
        )}
      </Modal>
    </section>
  );
}

/**
 * « Partir d'un modèle » (J1): the coach's library, then one template's days; picking a day
 * copies its rows into the trial editor. Two reads, each made only when the coach opens the
 * step (nothing is read on the page's load: the Programme tab's read budget is unchanged).
 */
function TemplateDayPicker({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (day: RoutineTrainingDay) => void;
}) {
  const copy = useCopy();
  type Step =
    | { kind: "loading" }
    | { kind: "failed" }
    | { kind: "templates"; templates: { id: string; name: string }[] }
    | { kind: "days"; name: string; days: RoutineTrainingDay[]; templates: { id: string; name: string }[] };
  const [step, setStep] = useState<Step>({ kind: "loading" });

  useEffect(() => {
    if (!open) return;
    let live = true;
    setStep({ kind: "loading" });
    void settled(trialTemplateChoicesAction(), { ok: false as const }).then((result) => {
      if (!live) return;
      setStep(result.ok ? { kind: "templates", templates: result.templates } : { kind: "failed" });
    });
    return () => {
      live = false;
    };
  }, [open]);

  async function openTemplate(id: string, name: string, templates: { id: string; name: string }[]) {
    setStep({ kind: "loading" });
    const result = await settled(trialTemplateDaysAction(id), { ok: false as const });
    setStep(result.ok ? { kind: "days", name, days: result.days, templates } : { kind: "failed" });
  }

  const choice = { justifyContent: "flex-start", whiteSpace: "normal", textAlign: "left", height: "auto", minHeight: 44, padding: "8px 12px" } as const;

  return (
    <Modal dirty={false} open={open} onClose={onClose} title={copy.trial.fromTemplate} icon="file" width={480}>
      {step.kind === "loading" && <p className="ov-note">{copy.common.loading}</p>}
      {step.kind === "failed" && <p className="ov-note">{copy.templates.loadError}</p>}
      {step.kind === "templates" &&
        (step.templates.length === 0 ? (
          <p className="ov-note">{copy.templates.emptyTitle}</p>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
            {step.templates.map((tpl) => (
              <li key={tpl.id}>
                <Button variant="secondary" full style={choice} onClick={() => void openTemplate(tpl.id, tpl.name, step.templates)}>
                  {tpl.name}
                </Button>
              </li>
            ))}
          </ul>
        ))}
      {step.kind === "days" && (
        <div style={{ display: "grid", gap: 10 }}>
          <div>
            <Button variant="ghost" size="sm" icon="chevL" onClick={() => setStep({ kind: "templates", templates: step.templates })}>
              {copy.templates.backToLibrary}
            </Button>
          </div>
          <p className="ov-note" style={{ fontWeight: 600, color: "var(--ink)" }}>
            {step.name}
          </p>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
            {step.days.map((day, i) => (
              <li key={`${day.dayOfWeek}-${i}`}>
                <Button variant="secondary" full style={choice} onClick={() => onPick(day)}>
                  {[
                    copy.routine.dayHead(i + 1, isoWeekdayLabel(day.dayOfWeek, copy.locale)),
                    day.focus.trim(),
                    copy.routine.exercises(day.exercises.length),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
}
