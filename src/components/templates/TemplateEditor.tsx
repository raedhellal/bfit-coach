"use client";

import { useState, useTransition } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { Button, Card, MIN_TOUCH_TARGET, Modal, PageHead } from "@/components/ui/kit";
import { UiIcon } from "@/components/ui/icons";
import { StatusPill } from "@/components/ui/StatusPill";
import { StickyActionBar } from "@/components/ui/StickyActionBar";
import { RoutineDocumentEditor } from "@/components/routine/RoutineDocumentEditor";
import type { Copy } from "@/lib/copy";
import { useCopy } from "@/lib/i18n/client";
import { settled } from "@/lib/settled";
import { useUnsavedChanges } from "@/lib/useUnsavedChanges";
import {
  MAX_EXERCISES_PER_DAY,
  TEMPLATE_NAME_MAX,
  forSave,
  templateChecklist,
  type TemplateDraft,
} from "@/lib/templateDocument";
import {
  createTemplateAction,
  updateTemplateAction,
  type TemplateFailure,
} from "@/lib/templateActions";
import type { Routine } from "@/lib/coachApi";
import { useAdoptPrehydrationInput } from "@/lib/useAdoptPrehydrationInput";

/**
 * AC1/AC2's template editor — the standalone one, on the coach's own resource.
 *
 * Since BUG-195c this is a SHELL: the document itself is edited by
 * `RoutineDocumentEditor`, the same component the trainee's routine editor uses
 * (ADR-0018 D7 — one editor, lifted, not copied). What stays here is what is the
 * template's own: the library name, the Save that POSTs or PUTs it, and the reasons the
 * server would refuse it.
 *
 * ═══ WHY THIS EDITS THE WHOLE `Routine` AND `RoutineEditor` DOES NOT ═══════════
 *
 * EV-184b's editor holds a LOSSY projection of a trainee's plan, and `coachApi.ts`'s ⛔
 * block explains why its write path has been broken against live since it shipped:
 * `tempo`, `notes`, `trackingType`, `durationSeconds`, `weight` and `estimatedMinutes`
 * are on the wire and on no coach control, so rebuilding the document from the editor
 * would silently delete them from a trainee's plan — and `goal` and `level` are
 * `@NotBlank` facts about a person the portal has no honest source for.
 *
 * Neither argument survives the move to a template. A template describes NOBODY, so
 * `goal` and `level` are the coach's own prescription and they author them here. And
 * AC4 requires the loss to be impossible from the other side: *"nothing travels in a
 * template that the coach cannot see and edit… text that cannot be shown must not be
 * stored"*. So the editor's state IS the document, every surviving field has a control,
 * and there is no projection to lose anything in.
 *
 * ═══ AND WHY THERE IS NO AUTOSAVE ═════════════════════════════════════════════
 *
 * ADR-0016 §Amendment 2026-09-21 withdrew the template validation group: the server
 * runs the FULL publish contract at the save boundary, so a document with fewer than
 * two training days, or a day with no exercises, is a 400 — b-fit-api's QA drove all
 * four shapes. The ADR names the cost rather than hiding it: *"the coach portal cannot
 * use the server as a scratchpad… EV-188b must hold transient invalid state locally."*
 *
 * This component is that. It keeps the work in React state, marks it unsaved, refuses
 * to POST a document `publishabilityReasons` can already see the server will refuse,
 * and lists what is outstanding — rather than offering a Save that fails with a 400 a
 * coach cannot act on. The unsaved-changes guard is the same one the routine editor
 * uses, for the same reason: losing a tab mid-edit is the failure mode this design
 * buys, so it is the one that is defended.
 *
 * ═══ THE REDESIGN (EV-337i, plan §5.7) ═══════════════════════════════════════════
 *
 * Layout only; the save path above is untouched (ADR-0033: the editor stays
 * server-rendered, no client cache, no extra `router.refresh()`). The page head is drawn
 * HERE so the « Modifications non enregistrées » pill can sit beside the title, but the
 * title itself is the SERVER's prop: on an existing template it is the stored name, which
 * only the update action's `revalidatePath` can change (qa/editor-save-no-refresh.spec.ts).
 * The outstanding reasons became the « Avant d'enregistrer » card (`templateChecklist`,
 * the same validation), and Save moved into a sticky action bar with the "nothing is
 * saved until…" sentence and the save's own feedback beside it, where the coach looks.
 */

const failureCopy = (copy: Copy): Record<TemplateFailure, string> => ({
  NAME_TAKEN: copy.templates.nameTaken,
  LIMIT_REACHED: copy.templates.limitReached(50),
  TOO_LARGE: copy.templates.saveFailed,
  SOURCE_EMPTY: copy.templates.sourceEmpty,
  NOT_PUBLISHABLE: copy.templates.saveFailed,
  PLAN_EMPTY: copy.routine.planEmpty,
  CATALOG_UNAVAILABLE: copy.routine.catalogUnavailable,
  REPS_ON_DURATION: copy.templates.repsOnDuration,
  ACCESS_DENIED: copy.templates.notYours,
  FAILED: copy.templates.saveFailed,
});

export function TemplateEditor({
  templateId: initialTemplateId,
  initial,
  title,
  sub,
  back,
}: {
  /** Null for "New template": the first successful save is a POST, then a navigation. */
  templateId: string | null;
  initial: TemplateDraft;
  /** The page's h1, from the server render (the stored name, or « Nouveau modèle »). */
  title: string;
  sub?: ReactNode;
  /** The page's `BackLink`, rendered by the server page. */
  back: ReactNode;
}) {
  const copy = useCopy();
  /**
   * Null until the first save on a NEW template, and the id from then on.
   *
   * It is state rather than a prop because the create does NOT navigate — see `save`.
   */
  const [templateId, setTemplateId] = useState<string | null>(initialTemplateId);
  const [draft, setDraft] = useState<TemplateDraft>(initial);
  // BUG-686 follow-up: what was typed into the server HTML before hydration reaches state.
  const scope = useAdoptPrehydrationInput<HTMLDivElement>();
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const leaving = useUnsavedChanges(dirty);

  function edit(next: TemplateDraft) {
    setDraft(next);
    setDirty(true);
    setNotice(null);
    setError(null);
  }
  function editDocument(document: Routine) {
    edit({ ...draft, document });
  }

  // The card IS the validation: Save is enabled exactly when every line is met.
  const checklist = templateChecklist(draft, copy);
  const saveable = checklist.every((item) => item.ok);

  function save() {
    if (!saveable) return;
    startTransition(async () => {
      const body = forSave(draft);
      const result = await settled(
        templateId ? updateTemplateAction(templateId, body) : createTemplateAction(body),
        { ok: false, code: "FAILED" } as const
      );
      if (!result.ok) {
        // A FAILED save leaves the unsaved flag standing: the coach is still holding
        // work the server has not got.
        setError(failureCopy(copy)[result.code]);
        return;
      }
      setError(null);
      setNotice(copy.templates.saved);
      setDirty(false);
      if (templateId === null) {
        /**
         * A create becomes an edit — WITHOUT a router navigation.
         *
         * `router.replace("/templates/{id}")` is the obvious move and it is wrong here:
         * it unmounts this island, so the "Template saved" confirmation the coach just
         * earned is destroyed by the navigation that follows it, and they are left on a
         * new URL with no sign that anything happened. Measured, not assumed — it is
         * what the first cut of this did.
         *
         * `history.replaceState` corrects the URL without a remount, so a reload or a
         * shared link lands on `/templates/{id}` and cannot create a second template,
         * and the Back button still goes to the library. The unsaved-changes guard's
         * sentinel is released FIRST — a `replaceState` over the sentinel entry would
         * leave the guard holding a history entry that no longer points where it thinks.
         */
        const id = result.template.id;
        leaving.release(() => {
          setTemplateId(id);
          window.history.replaceState(window.history.state, "", `/templates/${id}`);
        });
        return;
      }
      // No `router.refresh()` (ADR-0033 branch 2a): `updateTemplateAction` revalidates.
      leaving.release();
    });
  }

  return (
    <div className="tpl-editor" ref={scope}>
      {back}
      <PageHead
        title={title}
        sub={sub}
        actions={
          // The slot is always there, so the first keystroke does not push the form down
          // by the pill's height where the head wraps (< 768).
          <span className="tpl-dirty-slot">
            {dirty && <StatusPill tone="amber" icon="edit" label={copy.templates.unsavedBadge} />}
          </span>
        }
      />

      <div className="layout-split tpl-editor-split">
        {/*
          The « Avant d'enregistrer » aside. FIRST in the document: above the form in one
          column (< 1280, plan §3), beside it from 1280 by grid placement. Nothing in it is
          interactive, so the keyboard order is the form's.
        */}
        <aside className="tpl-editor-aside" aria-labelledby="tpl-checklist-title">
          <Card>
            <h2 id="tpl-checklist-title" className="tpl-checklist-title">
              {copy.templateEditor.checklist.title}
            </h2>
            <ul
              className="tpl-checklist"
              aria-label={
                saveable ? copy.templateEditor.checklist.listLabelReady : copy.templateEditor.checklist.listLabel
              }
            >
              {checklist.map((item) => (
                <li key={item.key} className="tpl-check" data-ok={item.ok ? "" : undefined}>
                  <span className="tpl-check-icon" aria-hidden="true">
                    <UiIcon name={item.ok ? "checkCircle" : "alert"} size={16} />
                  </span>
                  {/* The state in words for a screen reader: the icon beside it is aria-hidden. */}
                  <span className="sr-only">
                    {item.ok ? copy.templateEditor.checklist.done : copy.templateEditor.checklist.todo}{" "}
                  </span>
                  <span>{item.label}</span>
                </li>
              ))}
            </ul>
            {templateId !== null && <p className="tpl-keeps">{copy.templateEditor.keepsVersions}</p>}
          </Card>
        </aside>

        <div className="tpl-editor-main">
          <Card style={{ marginBottom: 16 }}>
            <label style={{ display: "block", minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-2)", marginBottom: 6 }}>
                {copy.templates.nameLabel}
              </div>
              <input
                value={draft.name}
                title={draft.name}
                maxLength={TEMPLATE_NAME_MAX}
                onChange={(e) => edit({ ...draft, name: e.target.value })}
                style={{
                  height: MIN_TOUCH_TARGET,
                  // See RoutineFields' DayFocusField: the label is the flex item that
                  // shrinks, so the input must be told to follow it.
                  width: "100%",
                  minWidth: 0,
                  borderRadius: "var(--r-md)",
                  border: "1px solid var(--border-2)",
                  background: "var(--surface)",
                  padding: "0 12px",
                  fontFamily: "var(--font-display)",
                  fontSize: 17,
                  fontWeight: 700,
                  color: "var(--ink)",
                }}
              />
            </label>
          </Card>

          {/*
            AC4's other half: every field the document CARRIES is on screen and editable —
            now through the ONE routine editor both coach surfaces share. A template
            describes nobody, so `goal` and `level` are the coach's own and are selects here.
          */}
          <RoutineDocumentEditor
            document={draft.document}
            onChange={editDocument}
            subject={{ kind: "template" }}
            dayCountBound={copy.templates.dayCountBound}
            maxExercisesPerDay={MAX_EXERCISES_PER_DAY}
            showDocumentName
            showRowSummary
          />
        </div>
      </div>

      <StickyActionBar label={copy.templateEditor.actionsLabel}>
        {/* A link out, so the unsaved-changes guard asks before it leaves (EV-190 AC2). */}
        <Link href="/templates" className="link-button" data-variant="secondary">
          {copy.templateEditor.cancel}
        </Link>
        {/*
          🔴 ADR-0016 §Amendment V1b's cost, stated on the bar that saves: the server
          accepts only a publishable template, so there is no autosave and nothing here
          reaches it until Save is pressed. The live region is always present (an empty one
          inserted later is not announced); the save's confirmation REPLACES the sentence
          in it. A refusal is its own alert, beside it.
        */}
        <p className="action-bar-note" role="status" data-tone={notice ? "ok" : undefined}>
          {notice ?? copy.templates.localOnly}
        </p>
        {error && (
          <p className="action-bar-note" role="alert" data-tone="err">
            {error}
          </p>
        )}
        <div className="action-bar-end">
          <Button icon="check" onClick={save} disabled={pending || !saveable}>
            {pending ? copy.templates.saving : copy.templates.save}
          </Button>
        </div>
      </StickyActionBar>

      <Modal
        open={leaving.prompted}
        onClose={leaving.stay}
        title={copy.routine.leaveTitle}
        icon="shield"
        iconTone="amber"
        width={420}
        footer={
          <>
            <Button variant="secondary" onClick={leaving.stay}>
              {copy.routine.leaveStay}
            </Button>
            <Button variant="danger" onClick={leaving.leave}>
              {copy.routine.leaveConfirm}
            </Button>
          </>
        }
      >
        <p style={{ margin: 0, fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.55 }}>
          {copy.routine.leaveBody}
        </p>
      </Modal>
    </div>
  );
}
