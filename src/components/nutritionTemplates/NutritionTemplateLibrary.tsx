"use client";

import { useState, useTransition } from "react";
import Link from "@/components/ui/Link";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, EmptyState, MIN_TOUCH_TARGET, Modal } from "@/components/ui/kit";
import { formatInstant } from "@/lib/format";
import { fullNameOf } from "@/lib/traineeName";
import { useCopy } from "@/lib/i18n/client";
import {
  deleteNutritionTemplateAction,
  duplicateNutritionTemplateAction,
  renameNutritionTemplateAction,
} from "@/lib/nutritionTemplateActions";
import { NUTRITION_TEMPLATE_NAME_MAX, handOffOutcome } from "@/lib/nutritionTemplateUse";
import { settled } from "@/lib/settled";
import type { NutritionTemplate, NutritionTemplateList } from "@/lib/coachApi";
import { startNavigationProgress } from "@/components/shell/NavigationProgress";
import { useRosterRead } from "@/lib/useRosterRead";
import { TemplateUseConfirmDialog, type NutritionTarget } from "./TemplateUseConfirmDialog";

// EV-356g's page (`/nutrition-templates`) types its roster read with this; EV-337g2 moved the
// type into the shared dialog, so it is re-exported from where the page imports it.
export type { NutritionTarget };

/**
 * EV-273b AC1-AC5 — the nutrition template library, its row controls, and "Use on a
 * trainee". The routine library's UX (EV-188b `TemplateLibrary`) for list, duplicate,
 * rename and delete; Edit is a LINK to the editor route.
 *
 * WHAT A ROW SHOWS (AC1): the name, kcal and P/C/F, and when it was updated. **No meal
 * structure**, even for a template that has one stored through the api (edge case 9):
 * the type this island receives has no field for it.
 *
 * Names WRAP, they are not cut (AC8): a coach tells two long names apart by their ends.
 */

type Dialog =
  | { kind: "rename"; template: NutritionTemplate }
  | { kind: "delete"; template: NutritionTemplate }
  | { kind: "pick"; template: NutritionTemplate }
  | { kind: "confirm"; template: NutritionTemplate; trainee: NutritionTarget };

export function NutritionTemplateLibrary({
  library,
  roster,
}: {
  library: NutritionTemplateList;
  /**
   * EV-356g: the page's roster read, NOT awaited by the page, so the list paints without it.
   * Resolves to `null` when it failed. Never collapsed to `[]`: "nobody" would be false.
   */
  roster: Promise<NutritionTarget[] | null>;
}) {
  const copy = useCopy();
  const T = copy.nutritionTemplates;
  const router = useRouter();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const close = () => setDialog(null);
  // EV-342a: `/new` drew the list's `loading.tsx` until that file went; the bar covers it now.
  const create = () => {
    startNavigationProgress("/nutrition-templates/new");
    router.push("/nutrition-templates/new");
  };

  function duplicate(template: NutritionTemplate) {
    startTransition(async () => {
      const result = await settled(duplicateNutritionTemplateAction(template.id), {
        ok: false,
        code: "FAILED",
      } as const);
      if (!result.ok) {
        setNotice(null);
        setError(result.code === "LIMIT_REACHED" ? T.limitReached(library.limit) : T.duplicateFailed);
        return;
      }
      setError(null);
      setNotice(T.duplicated(result.template.name));
      // No `router.refresh()` (ADR-0033 branch 2a): every library write revalidates, so
      // the action's own response re-rendered this list. Same for rename and delete.
    });
  }

  return (
    <div>
      {/* AC1, verbatim, stated ONCE on the library page. */}
      <p style={{ margin: "0 0 14px", fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.55 }}>
        {T.private}
      </p>

      {library.templates.length === 0 ? (
        // AC1 — the empty state and ONE primary control, never a blank page.
        <Card>
          <EmptyState
            icon="apple"
            title={T.emptyTitle}
            sub={T.emptyBody}
            action={
              <Button icon="plus" onClick={create}>
                {T.create}
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
            <Button icon="plus" onClick={create}>
              {T.create}
            </Button>
            {/* The cap the api SERVES, shown before the 409 rather than only after it. */}
            {library.remaining === 0 ? (
              <span style={{ fontSize: 12.5, color: "var(--err-ink)" }}>{T.limitReached(library.limit)}</span>
            ) : (
              <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
                {T.remaining(library.remaining, library.limit)}
              </span>
            )}
          </div>

          {notice && (
            <p role="status" style={{ margin: "0 0 12px", fontSize: 13, color: "var(--ok-ink)", overflowWrap: "anywhere" }}>
              {notice}
            </p>
          )}
          {error && (
            <p role="alert" style={{ margin: "0 0 12px", fontSize: 13, color: "var(--err-ink)" }}>
              {error}
            </p>
          )}

          {/* `minmax(0, 1fr)`: BUG-243's lesson — an `auto` track grows to its widest item. */}
          <ul
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr)",
              gap: 12,
            }}
          >
            {library.templates.map((template) => (
              <li key={template.id}>
                <TemplateRow
                  template={template}
                  pending={pending}
                  onDuplicate={() => duplicate(template)}
                  onRename={() => setDialog({ kind: "rename", template })}
                  onDelete={() => setDialog({ kind: "delete", template })}
                  onUse={() => setDialog({ kind: "pick", template })}
                />
              </li>
            ))}
          </ul>
        </>
      )}

      <RenameDialog
        template={dialog?.kind === "rename" ? dialog.template : null}
        onClose={close}
        onDone={(name) => {
          setError(null);
          setNotice(T.renamed(name));
          close();
        }}
      />
      <DeleteDialog
        template={dialog?.kind === "delete" ? dialog.template : null}
        onClose={close}
        onDone={() => {
          setError(null);
          setNotice(null);
          close();
        }}
      />
      <PickDialog
        template={dialog?.kind === "pick" ? dialog.template : null}
        roster={roster}
        onClose={close}
        onPick={(template, trainee) => setDialog({ kind: "confirm", template, trainee })}
      />
      {dialog?.kind === "confirm" && (
        // Keyed: a new trainee or template is a new dialog, with a new read.
        <TemplateUseConfirmDialog
          key={`${dialog.template.id}:${dialog.trainee.id}`}
          template={dialog.template}
          trainee={dialog.trainee}
          onClose={close}
          // AC5 — the outcome is handed to the trainee's nutrition page, which shows it once
          // above what the api now holds (`TemplateUseOutcome`).
          onLand={(kind, floorCalories) => {
            const { template, trainee } = dialog;
            handOffOutcome({ clientId: trainee.id, template: template.name, kind, floorCalories });
            startNavigationProgress(`/clients/${trainee.id}/nutrition`);
            router.push(`/clients/${trainee.id}/nutrition`);
          }}
        />
      )}
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
  template: NutritionTemplate;
  pending: boolean;
  onDuplicate: () => void;
  onRename: () => void;
  onDelete: () => void;
  onUse: () => void;
}) {
  const copy = useCopy();
  const T = copy.nutritionTemplates;
  const { calories, proteinG, carbsG, fatG } = template.targets;
  return (
    <Card>
      {/* A named group per row, so each control is tied to the template it acts on. */}
      <div
        role="group"
        aria-label={template.name}
        style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}
      >
        <div style={{ minWidth: 0, flex: "1 1 220px" }}>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 16,
              fontWeight: 700,
              color: "var(--ink)",
              // AC8 — wrap, never cut.
              overflowWrap: "anywhere",
            }}
          >
            {template.name}
          </div>
          <div style={{ marginTop: 6, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
              {T.macroLine(calories, proteinG, carbsG, fatG)}
            </span>
            <Badge tone="neutral">{T.updatedAt(formatInstant(template.updatedAt, copy.locale))}</Badge>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link
            href={`/nutrition-templates/${template.id}`}
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
            {T.edit}
          </Link>
          <Button variant="ghost" size="sm" icon="refresh" onClick={onDuplicate} disabled={pending}>
            {T.duplicate}
          </Button>
          <Button variant="ghost" size="sm" onClick={onRename} disabled={pending}>
            {T.rename}
          </Button>
          <Button variant="ghost" size="sm" icon="trash" onClick={onDelete} disabled={pending}>
            {T.remove}
          </Button>
          <Button variant="soft" size="sm" icon="upload" onClick={onUse} disabled={pending}>
            {T.use}
          </Button>
        </div>
      </div>
    </Card>
  );
}

const inputStyle = {
  height: MIN_TOUCH_TARGET,
  width: "100%",
  minWidth: 0,
  borderRadius: "var(--r-md)",
  border: "1px solid var(--border-2)",
  background: "var(--surface)",
  padding: "0 12px",
  fontSize: 14,
  color: "var(--ink)",
} as const;

/**
 * Rename. The api has no rename mapping, so it is a whole PUT — built on the server from
 * the template as the api holds it NOW, never from this row's rendered targets (a stale
 * tab would revert another tab's edit). See `renameNutritionTemplateAction`.
 */
function RenameDialog({
  template,
  onClose,
  onDone,
}: {
  template: NutritionTemplate | null;
  onClose: () => void;
  onDone: (name: string) => void;
}) {
  const copy = useCopy();
  const T = copy.nutritionTemplates;
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [seeded, setSeeded] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (template && seeded !== template.id) {
    setSeeded(template.id);
    setName(template.name);
    setError(null);
  }
  if (!template && seeded !== null) setSeeded(null);

  const trimmed = name.trim();
  const refusal =
    trimmed === "" ? T.nameRequired : trimmed.length > NUTRITION_TEMPLATE_NAME_MAX ? T.nameTooLong : null;

  function submit() {
    if (!template || refusal) return;
    startTransition(async () => {
      const result = await settled(
        renameNutritionTemplateAction(template.id, trimmed),
        { ok: false, code: "FAILED" } as const
      );
      if (!result.ok) {
        setError(result.code === "NAME_TAKEN" ? T.nameTaken : T.renameFailed);
        return;
      }
      onDone(result.template.name);
    });
  }

  return (
    <Modal
      open={template !== null}
      onClose={() => !pending && onClose()}
      // BUG-699 — the field opens holding the template's name.
      dirty={template !== null && name !== template.name}
      title={T.renameTitle}
      width={440}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            {T.cancel}
          </Button>
          <Button onClick={submit} disabled={pending || refusal !== null}>
            {T.rename}
          </Button>
        </>
      }
    >
      <label style={{ display: "block" }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-2)", marginBottom: 6 }}>{T.nameLabel}</div>
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          style={inputStyle}
        />
      </label>
      {refusal && <p style={{ margin: "10px 0 0", fontSize: 12.5, color: "var(--ink-3)" }}>{refusal}</p>}
      {error && (
        <p role="alert" style={{ margin: "10px 0 0", fontSize: 13, color: "var(--err-ink)" }}>
          {error}
        </p>
      )}
    </Modal>
  );
}

function DeleteDialog({
  template,
  onClose,
  onDone,
}: {
  template: NutritionTemplate | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const copy = useCopy();
  const T = copy.nutritionTemplates;
  const [error, setError] = useState<string | null>(null);
  const [seeded, setSeeded] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (template && seeded !== template.id) {
    setSeeded(template.id);
    setError(null);
  }
  if (!template && seeded !== null) setSeeded(null);

  function submit() {
    if (!template) return;
    startTransition(async () => {
      const result = await settled(deleteNutritionTemplateAction(template.id), {
        ok: false,
        code: "FAILED",
      } as const);
      if (!result.ok) {
        setError(result.code === "ACCESS_DENIED" ? T.notYours : T.deleteFailed);
        return;
      }
      onDone();
    });
  }

  return (
    <Modal
      dirty={false}
      open={template !== null}
      onClose={() => !pending && onClose()}
      title={T.deleteTitle}
      icon="trash"
      iconTone="red"
      width={460}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            {T.cancel}
          </Button>
          <Button variant="danger" onClick={submit} disabled={pending}>
            {T.remove}
          </Button>
        </>
      }
    >
      {/* AC2, verbatim — names the template and states the snapshot rule (N5). */}
      <p style={{ margin: 0, fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.55, overflowWrap: "anywhere" }}>
        {template ? T.deleteBody(template.name) : ""}
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
 * AC3 — who the template can be used on: the list the SERVER filtered to ACTIVE links
 * with NUTRITION. One template, one trainee (N5: never bulk). Choosing a trainee opens
 * the confirm dialog, and that is when the trainee's nutrition is read (AC4).
 */
function PickDialog({
  template,
  roster,
  onClose,
  onPick,
}: {
  template: NutritionTemplate | null;
  /** EV-356g: still in flight when the dialog may already be open; `null` = it failed. */
  roster: Promise<NutritionTarget[] | null>;
  onClose: () => void;
  onPick: (template: NutritionTemplate, trainee: NutritionTarget) => void;
}) {
  const copy = useCopy();
  const T = copy.nutritionTemplates;
  const read = useRosterRead(roster);
  return (
    <Modal
      dirty={false}
      open={template !== null}
      onClose={onClose}
      title={T.pickTitle}
      sub={template ? T.pickSub(template.name) : undefined}
      icon="upload"
      width={460}
      footer={
        <Button variant="secondary" onClick={onClose}>
          {T.cancel}
        </Button>
      }
    >
      {read.state === "loading" ? (
        // EV-356g — the page did not wait for the roster; this dialog does, and says so.
        <p role="status" style={{ margin: 0, fontSize: 13.5, color: "var(--ink-2)" }}>
          {copy.challenges.clientsLoading}
        </p>
      ) : read.state === "failed" ? (
        // EV-356g — BUG-738's sentence: closing this dialog re-reads nothing, so the old "Close this
        // and try again." was untrue. A reload is what reads the roster again.
        <p role="alert" style={{ margin: 0, fontSize: 13.5, color: "var(--err-ink)" }}>
          {copy.challenges.clientsLoadError}
        </p>
      ) : read.targets.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13.5, color: "var(--ink-2)" }}>{T.noTrainees}</p>
      ) : (
        <ul aria-label={T.pickTitle} style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
          {read.targets.map((trainee) => (
            <li key={trainee.id}>
              <button
                type="button"
                onClick={() => template && onPick(template, trainee)}
                style={{
                  width: "100%",
                  minHeight: MIN_TOUCH_TARGET,
                  textAlign: "left",
                  padding: "8px 12px",
                  borderRadius: "var(--r-md)",
                  border: "1px solid var(--border-2)",
                  background: "var(--surface)",
                  color: "var(--ink)",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                  overflowWrap: "anywhere",
                }}
              >
                {fullNameOf(trainee.traineeDisplayName, copy)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
