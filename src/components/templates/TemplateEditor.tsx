"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, MIN_TOUCH_TARGET, Modal } from "@/components/ui/kit";
import { RoutineDocumentEditor } from "@/components/routine/RoutineDocumentEditor";
import type { Copy } from "@/lib/copy";
import { useCopy } from "@/lib/i18n/client";
import { settled } from "@/lib/settled";
import { useUnsavedChanges } from "@/lib/useUnsavedChanges";
import {
  MAX_EXERCISES_PER_DAY,
  TEMPLATE_NAME_MAX,
  forSave,
  publishabilityReasons,
  type TemplateDraft,
} from "@/lib/templateDocument";
import {
  createTemplateAction,
  updateTemplateAction,
  type TemplateFailure,
} from "@/lib/templateActions";
import type { Routine } from "@/lib/coachApi";

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
 */

const failureCopy = (copy: Copy): Record<TemplateFailure, string> => ({
  NAME_TAKEN: copy.templates.nameTaken,
  LIMIT_REACHED: copy.templates.limitReached(50),
  TOO_LARGE: copy.templates.saveFailed,
  SOURCE_EMPTY: copy.templates.sourceEmpty,
  NOT_PUBLISHABLE: copy.templates.saveFailed,
  PLAN_EMPTY: copy.routine.planEmpty,
  CATALOG_UNAVAILABLE: copy.routine.catalogUnavailable,
  ACCESS_DENIED: copy.templates.notYours,
  FAILED: copy.templates.saveFailed,
});

export function TemplateEditor({
  templateId: initialTemplateId,
  initial,
}: {
  /** Null for "New template": the first successful save is a POST, then a navigation. */
  templateId: string | null;
  initial: TemplateDraft;
}) {
  const copy = useCopy();
  const router = useRouter();
  /**
   * Null until the first save on a NEW template, and the id from then on.
   *
   * It is state rather than a prop because the create does NOT navigate — see `save`.
   */
  const [templateId, setTemplateId] = useState<string | null>(initialTemplateId);
  const [draft, setDraft] = useState<TemplateDraft>(initial);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const leaving = useUnsavedChanges(dirty);

  // U6 — put the feedback where the coach is looking, and announce it.
  const feedbackRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!notice && !error) return;
    feedbackRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [notice, error]);

  function edit(next: TemplateDraft) {
    setDraft(next);
    setDirty(true);
    setNotice(null);
    setError(null);
  }
  function editDocument(document: Routine) {
    edit({ ...draft, document });
  }

  const reasons = publishabilityReasons(draft, copy);
  const saveable = reasons.length === 0;

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
      leaving.release(() => router.refresh());
    });
  }

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <label style={{ display: "block", minWidth: 0, flex: "1 1 260px" }}>
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
                maxWidth: 360,
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
          {dirty && <Badge tone="red">{copy.templates.unsavedBadge}</Badge>}
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
          <Button icon="check" onClick={save} disabled={pending || !saveable}>
            {pending ? copy.templates.saving : copy.templates.save}
          </Button>
        </div>

        {/*
          🔴 ADR-0016 §Amendment V1b's cost, stated on the screen that pays it.

          The server accepts only a publishable template, so there is no autosave and
          nothing here reaches it until Save is pressed. A coach who does not know that
          loses a tab and blames the product; a Save that looks pressable and then 400s
          is the failure AC2 forbids by name for the 13th exercise, applied to the
          document as a whole.
        */}
        <p style={{ margin: "10px 0 0", fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.55 }}>
          {copy.templates.localOnly}
        </p>
        {!saveable && (
          <div style={{ marginTop: 10 }}>
            <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: "var(--ink-2)" }}>
              {copy.templates.notSaveableYet}
            </p>
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              {reasons.map((reason) => (
                <li key={reason} style={{ fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.6 }}>
                  {reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div ref={feedbackRef}>
          {notice && (
            <p role="status" style={{ margin: "12px 0 0", fontSize: 13, color: "var(--ok-ink)" }}>
              {notice}
            </p>
          )}
          {error && (
            <p role="alert" style={{ margin: "12px 0 0", fontSize: 13, color: "var(--err-ink)" }}>
              {error}
            </p>
          )}
        </div>
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
