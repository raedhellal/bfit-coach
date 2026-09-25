"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, EmptyState, MIN_TOUCH_TARGET, Modal } from "@/components/ui/kit";
import { copy } from "@/lib/copy";
import { formatInstant, truncateName } from "@/lib/format";
import { settled } from "@/lib/settled";
import {
  applyTemplateAction,
  deleteTemplateAction,
  duplicateTemplateAction,
  renameTemplateAction,
  type TemplateFailure,
} from "@/lib/templateActions";
import { TEMPLATE_NAME_MAX } from "@/lib/templateDocument";
import type { CoachTemplateList, CoachTemplateSummary } from "@/lib/coachApi";

/**
 * AC2's library list and its five row controls, plus AC3's "Use on a trainee".
 *
 * A client island because every control here is a dialog: the alternative — a route per
 * rename and per delete — would put a coach through a navigation to change one string.
 * Nothing is fetched here; the two lists arrive from the server component above, and
 * every write goes back through a server action.
 *
 * WHAT THE ROW MAY SHOW: name, day count, exercise count, last-updated — AC2's
 * "and nothing else", which is not a style note. A row that could render an exercise
 * would grow one, and then the library list is a second, worse view of a template.
 */

/** A trainee this coach may WRITE to: ACTIVE, and the link carries WORKOUTS. */
export interface ApplyTarget {
  id: string;
  traineeDisplayName: string;
}

const FAILURE_COPY: Record<TemplateFailure, string> = {
  NAME_TAKEN: copy.templates.nameTaken,
  // The cap is served by the api; 50 is the shipped value and the sentence uses it
  // only as the fallback for a refusal that arrived without the list beside it.
  LIMIT_REACHED: copy.templates.limitReached(50),
  TOO_LARGE: copy.templates.saveFailed,
  SOURCE_EMPTY: copy.templates.sourceEmpty,
  NOT_PUBLISHABLE: copy.templates.saveFailed,
  PLAN_EMPTY: copy.routine.planEmpty,
  CATALOG_UNAVAILABLE: copy.routine.catalogUnavailable,
  ACCESS_DENIED: copy.templates.notYours,
  FAILED: copy.templates.saveFailed,
};

type Dialog =
  | { kind: "rename"; template: CoachTemplateSummary }
  | { kind: "delete"; template: CoachTemplateSummary }
  | { kind: "use"; template: CoachTemplateSummary };

export function TemplateLibrary({
  library,
  trainees,
}: {
  library: CoachTemplateList;
  trainees: ApplyTarget[];
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function close() {
    setDialog(null);
  }

  function duplicate(template: CoachTemplateSummary) {
    startTransition(async () => {
      const result = await settled(duplicateTemplateAction(template.id), {
        ok: false,
        code: "FAILED",
      } as const);
      if (!result.ok) {
        setNotice(null);
        setError(
          result.code === "LIMIT_REACHED"
            ? copy.templates.limitReached(library.limit)
            : copy.templates.duplicateFailed
        );
        return;
      }
      setError(null);
      setNotice(copy.templates.saveAsTemplateDone(result.template.name));
      router.refresh();
    });
  }

  return (
    <div>
      {/* AC4, verbatim, stated ONCE on the library page. */}
      <p style={{ margin: "0 0 14px", fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.55 }}>
        {copy.templates.private}
      </p>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
          marginBottom: 14,
        }}
      >
        <Button icon="plus" onClick={() => router.push("/templates/new")}>
          {copy.templates.create}
        </Button>
        {/*
          AC2's cap, shown BEFORE the 409 rather than only after it — which is what the
          api serves `remaining` for. At zero it is the refusal sentence itself, so a
          coach reads why "New template" will not work before pressing it.
        */}
        {library.remaining === 0 ? (
          <span style={{ fontSize: 12.5, color: "var(--err-ink)" }}>
            {copy.templates.limitReached(library.limit)}
          </span>
        ) : (
          <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
            {copy.templates.remaining(library.remaining, library.limit)}
          </span>
        )}
      </div>

      {notice && (
        <p role="status" style={{ margin: "0 0 12px", fontSize: 13, color: "var(--ok-ink)" }}>
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" style={{ margin: "0 0 12px", fontSize: 13, color: "var(--err-ink)" }}>
          {error}
        </p>
      )}

      {library.templates.length === 0 ? (
        // AC1 — an empty library renders the empty state and ONE primary control,
        // never a blank page.
        <Card>
          <EmptyState
            icon="file"
            title={copy.templates.emptyTitle}
            sub={copy.templates.emptyBody}
            action={
              <Button icon="plus" onClick={() => router.push("/templates/new")}>
                {copy.templates.create}
              </Button>
            }
          />
        </Card>
      ) : (
        /*
          BUG-243: `minmax(0, 1fr)`, not the implicit `auto` track. An auto track sizes to
          its widest item's min-content, which for a `nowrap` title is the WHOLE title: a
          66-character name pushed the page 62 px sideways at 320 px and clipped every
          card. A 0 minimum lets the track follow the viewport and the title ellipsise.
        */
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 12 }}>
          {library.templates.map((template) => (
            <TemplateRow
              key={template.id}
              template={template}
              pending={pending}
              onDuplicate={() => duplicate(template)}
              onRename={() => setDialog({ kind: "rename", template })}
              onDelete={() => setDialog({ kind: "delete", template })}
              onUse={() => setDialog({ kind: "use", template })}
            />
          ))}
        </div>
      )}

      <RenameDialog
        open={dialog?.kind === "rename"}
        template={dialog?.kind === "rename" ? dialog.template : null}
        onClose={close}
        onDone={(message) => {
          setError(null);
          setNotice(message);
          close();
          router.refresh();
        }}
      />
      <DeleteDialog
        open={dialog?.kind === "delete"}
        template={dialog?.kind === "delete" ? dialog.template : null}
        onClose={close}
        onDone={() => {
          setError(null);
          setNotice(null);
          close();
          router.refresh();
        }}
      />
      <UseDialog
        open={dialog?.kind === "use"}
        template={dialog?.kind === "use" ? dialog.template : null}
        trainees={trainees}
        onClose={close}
      />
    </div>
  );
}

function TemplateRow({
  template,
  pending,
  onDuplicate,
  onRename,
  onDelete,
  onUse,
}: {
  template: CoachTemplateSummary;
  pending: boolean;
  onDuplicate: () => void;
  onRename: () => void;
  onDelete: () => void;
  onUse: () => void;
}) {
  return (
    <Card>
      {/*
        A named group per row. Without it a screen reader reads five identical control
        labels per template with nothing tying them to the template they act on — and a
        test asserting "the Delete on THIS row" has nothing to address either.
      */}
      <div
        role="group"
        aria-label={template.name}
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            title={template.name}
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 16,
              fontWeight: 700,
              color: "var(--ink)",
              // Edge case 8: an 80-character name, and an Arabic one, truncate rather
              // than pushing the controls off the row.
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: "min(100%, 420px)",
            }}
          >
            {truncateName(template.name)}
          </div>
          <div style={{ marginTop: 6, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
              {copy.templates.rowSummary(template.dayCount, template.exerciseCount)}
            </span>
            <Badge tone="neutral">{updatedLabel(template.updatedAt)}</Badge>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {/*
            Edit is a LINK and not a button: it is a navigation to the editor route, so
            it must be middle-clickable, openable in a tab, and visible to the browser's
            own history. The other four are dialogs and stay buttons.
          */}
          <Link
            href={`/templates/${template.id}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              height: MIN_TOUCH_TARGET,
              padding: "0 12px",
              borderRadius: "var(--r-md)",
              border: "1px solid var(--border-2)",
              background: "var(--surface)",
              color: "var(--ink)",
              fontSize: 13,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            {copy.templates.edit}
          </Link>
          <Button variant="ghost" size="sm" icon="refresh" onClick={onDuplicate} disabled={pending}>
            {copy.templates.duplicate}
          </Button>
          <Button variant="ghost" size="sm" onClick={onRename} disabled={pending}>
            {copy.templates.rename}
          </Button>
          <Button variant="ghost" size="sm" icon="trash" onClick={onDelete} disabled={pending}>
            {copy.templates.remove}
          </Button>
          <Button variant="soft" size="sm" icon="upload" onClick={onUse} disabled={pending}>
            {copy.templates.use}
          </Button>
        </div>
      </div>
    </Card>
  );
}

/**
 * AC1's "Updated just now" — verbatim — for a template saved moments ago, and the
 * instant otherwise.
 *
 * The threshold is a minute, and it is computed in the BROWSER against the api's
 * timestamp. A server-rendered "just now" would be wrong the moment the page was
 * cached, which is exactly the kind of small lie this surface has been bitten by.
 */
function updatedLabel(updatedAt: string): string {
  const age = Date.now() - new Date(updatedAt).getTime();
  if (age >= 0 && age < 60_000) return copy.templates.updatedJustNow;
  return copy.templates.updatedAt(formatInstant(updatedAt));
}

function RenameDialog({
  open,
  template,
  onClose,
  onDone,
}: {
  open: boolean;
  template: CoachTemplateSummary | null;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [seeded, setSeeded] = useState<string | null>(null);

  // Seed from the row the dialog was opened on, once per open.
  if (open && template && seeded !== template.id) {
    setSeeded(template.id);
    setName(template.name);
    setError(null);
  }
  if (!open && seeded !== null) setSeeded(null);

  const trimmed = name.trim();
  /**
   * AC2 — over 80 characters is refused CLIENT-side and server-side with the same
   * bound, and empty or whitespace-only is refused. The control is disabled with the
   * reason on screen rather than pressable-and-then-failing.
   */
  const localRefusal =
    trimmed === ""
      ? copy.templates.nameRequired
      : trimmed.length > TEMPLATE_NAME_MAX
        ? copy.templates.nameTooLong
        : null;

  function submit() {
    if (!template || localRefusal) return;
    startTransition(async () => {
      const result = await settled(renameTemplateAction(template.id, trimmed), {
        ok: false,
        code: "FAILED",
      } as const);
      if (!result.ok) {
        // AC2 — the collision sentence, verbatim, and BOTH templates are unchanged.
        setError(result.code === "NAME_TAKEN" ? copy.templates.nameTaken : copy.templates.renameFailed);
        return;
      }
      onDone(copy.templates.saveAsTemplateDone(result.template.name));
    });
  }

  return (
    <Modal
      open={open}
      onClose={() => !pending && onClose()}
      title={copy.templates.renameTitle}
      width={440}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            {copy.templates.cancel}
          </Button>
          <Button onClick={submit} disabled={pending || localRefusal !== null}>
            {copy.templates.rename}
          </Button>
        </>
      }
    >
      <label style={{ display: "block" }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-2)", marginBottom: 6 }}>
          {copy.templates.renameLabel}
        </div>
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          style={{
            height: MIN_TOUCH_TARGET,
            width: "100%",
            minWidth: 0,
            borderRadius: "var(--r-md)",
            border: "1px solid var(--border-2)",
            background: "var(--surface)",
            padding: "0 12px",
            fontSize: 14,
            color: "var(--ink)",
          }}
        />
      </label>
      {localRefusal && (
        <p style={{ margin: "10px 0 0", fontSize: 12.5, color: "var(--ink-3)" }}>{localRefusal}</p>
      )}
      {error && (
        <p role="alert" style={{ margin: "10px 0 0", fontSize: 13, color: "var(--err-ink)" }}>
          {error}
        </p>
      )}
    </Modal>
  );
}

function DeleteDialog({
  open,
  template,
  onClose,
  onDone,
}: {
  open: boolean;
  template: CoachTemplateSummary | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!template) return;
    startTransition(async () => {
      const result = await settled(deleteTemplateAction(template.id), {
        ok: false,
        code: "FAILED",
      } as const);
      if (!result.ok) {
        setError(copy.templates.deleteFailed);
        return;
      }
      onDone();
    });
  }

  return (
    <Modal
      open={open}
      onClose={() => !pending && onClose()}
      title={copy.templates.deleteTitle}
      icon="trash"
      iconTone="red"
      width={460}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            {copy.templates.cancel}
          </Button>
          <Button variant="danger" onClick={submit} disabled={pending}>
            {copy.templates.remove}
          </Button>
        </>
      }
    >
      {/*
        AC2 — the confirm NAMES the template, and states Ruling 2's guarantee in the
        same breath: every draft and every published plan made from it is unchanged.
      */}
      <p style={{ margin: 0, fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.55 }}>
        {template ? copy.templates.deleteBody(template.name) : ""}
      </p>
      {error && (
        <p role="alert" style={{ margin: "10px 0 0", fontSize: 13, color: "var(--err-ink)" }}>
          {error}
        </p>
      )}
    </Modal>
  );
}

/**
 * AC3 — "Use on a trainee", and the 409 retry that makes its second sentence true.
 *
 * The flow, and why it has the shape it has (ADR-0016 D9.1):
 *
 *   1. The coach picks a trainee from THEIR OWN ACTIVE, WORKOUTS-scoped links. A
 *      trainee the coach may not write to is never offered, so the picker cannot lead
 *      to a 403.
 *   2. The confirm names the template and the trainee, and states that the trainee's
 *      injuries and equipment are applied WHEN YOU PUBLISH — because apply runs no
 *      policy and reads nothing about them.
 *   3. Confirm POSTs with NO `replacesDraftUpdatedAt`. Absent means "only if there is
 *      no draft", so an existing draft comes back 409 with its timestamp.
 *   4. THEN, and only then, the overwrite sentence is shown — about a draft the server
 *      has just confirmed exists — and the retry echoes that exact timestamp. A second
 *      tab that saved in between is refused AGAIN, with a new timestamp, and the coach
 *      is asked again about the draft that is actually there.
 *
 * The rejected alternative was to read the draft first and show the dialog. It is
 * check-then-act across two tabs, and it makes the sentence a lie in the one case it
 * exists for.
 */
function UseDialog({
  open,
  template,
  trainees,
  onClose,
}: {
  open: boolean;
  template: CoachTemplateSummary | null;
  trainees: ApplyTarget[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [clientId, setClientId] = useState("");
  const [conflict, setConflict] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [seeded, setSeeded] = useState(false);

  if (open && !seeded) {
    setSeeded(true);
    setClientId(trainees[0]?.id ?? "");
    setConflict(null);
    setError(null);
  }
  if (!open && seeded) setSeeded(false);

  const trainee = trainees.find((t) => t.id === clientId) ?? null;

  function run(replaces?: string) {
    if (!template || !trainee) return;
    startTransition(async () => {
      const result = await settled(applyTemplateAction(template.id, trainee.id, replaces), {
        ok: false,
        code: "FAILED",
      } as const);
      if (!result.ok) {
        if (result.code === "DRAFT_EXISTS") {
          const existing = result.existingUpdatedAt;
          if (!existing) {
            /**
             * A 409 with no `details.existingUpdatedAt`. The portal does NOT retry
             * blind: the assertion is the only thing that makes the overwrite sentence
             * true, and an apply without it would destroy a draft on a guess.
             */
            setConflict(null);
            setError(copy.templates.applyConflictUnreadable);
            return;
          }
          // The SECOND time round this re-arms with the NEW timestamp, which is the
          // two-tab case: the coach is asked again, about the draft that is there now.
          setError(null);
          setConflict(existing);
          return;
        }
        setConflict(null);
        setError(FAILURE_COPY[result.code]);
        return;
      }
      /**
       * AC3 — the coach lands on the trainee's routine editor, which renders the
       * "Draft — not yet published" badge and the "Started from {name}" line from the
       * server's own read. Navigating rather than reporting success here is deliberate:
       * the draft is the thing to check, and the editor is where it is.
       */
      onClose();
      router.push(`/clients/${trainee.id}/routine`);
    });
  }

  const noTrainees = trainees.length === 0;

  return (
    <Modal
      open={open}
      onClose={() => !pending && onClose()}
      title={copy.templates.useTitle}
      icon="upload"
      iconTone="blue"
      width={480}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            {copy.templates.cancel}
          </Button>
          {conflict ? (
            <Button variant="danger" onClick={() => run(conflict)} disabled={pending}>
              {copy.templates.replaceAndUse}
            </Button>
          ) : (
            <Button onClick={() => run()} disabled={pending || noTrainees || !trainee}>
              {copy.templates.useIt}
            </Button>
          )}
        </>
      }
    >
      {noTrainees ? (
        <p style={{ margin: 0, fontSize: 13.5, color: "var(--ink-2)" }}>
          {copy.templates.noTrainees}
        </p>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          <label style={{ display: "block" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-2)", marginBottom: 6 }}>
              {copy.templates.pickTrainee}
            </div>
            <select
              value={clientId}
              onChange={(e) => {
                setClientId(e.target.value);
                // A different trainee means a different draft, so the overwrite
                // assertion the coach was shown no longer describes anything.
                setConflict(null);
                setError(null);
              }}
              style={{
                height: MIN_TOUCH_TARGET,
                width: "100%",
                minWidth: 0,
                borderRadius: "var(--r-md)",
                border: "1px solid var(--border-2)",
                background: "var(--surface)",
                color: "var(--ink)",
                fontSize: 14,
                padding: "0 10px",
              }}
            >
              {trainees.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.traineeDisplayName}
                </option>
              ))}
            </select>
          </label>

          {template && trainee && (
            <p style={{ margin: 0, fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.55 }}>
              {copy.templates.useConfirm(template.name, trainee.traineeDisplayName)}
            </p>
          )}
          {trainee && (
            // AC3, verbatim.
            <p style={{ margin: 0, fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.55 }}>
              {copy.templates.guardrailsAtPublish(trainee.traineeDisplayName)}
            </p>
          )}
          {/*
            🔴 Apply does not publish, said BEFORE the coach confirms. EV-201 is one row
            back and its whole finding was a control that did not do what its label
            implied, with nothing on the screen to say so.
          */}
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.55 }}>
            {copy.templates.applyNotPublished}
          </p>

          {conflict && trainee && (
            // AC3, verbatim — shown ONLY after the server answered 409, about a draft
            // it has just told us exists.
            <p
              role="alert"
              style={{
                margin: 0,
                padding: "10px 12px",
                borderRadius: "var(--r-lg)",
                background: "var(--warn-bg)",
                color: "var(--warn-ink)",
                fontSize: 13.5,
                lineHeight: 1.5,
              }}
            >
              {copy.templates.replacesDraft(trainee.traineeDisplayName)}
            </p>
          )}
          {error && (
            <p role="alert" style={{ margin: 0, fontSize: 13, color: "var(--err-ink)" }}>
              {error}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
