"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, EmptyState, MIN_TOUCH_TARGET, Modal } from "@/components/ui/kit";
import { firstName, formatDate, formatInstant } from "@/lib/format";
import { useCopy } from "@/lib/i18n/client";
import {
  applyTemplateTargetsAction,
  applyTemplateWeekAction,
  deleteNutritionTemplateAction,
  duplicateNutritionTemplateAction,
  readNutritionForUseAction,
  renameNutritionTemplateAction,
  type ApplyTargetsResult,
  type ApplyWeekResult,
  type ReadForUseResult,
  type UseReading,
} from "@/lib/nutritionTemplateActions";
import {
  FLOOR_WARNING_BELOW,
  NUTRITION_TEMPLATE_NAME_MAX,
  handOffOutcome,
  type UseOutcomeKind,
} from "@/lib/nutritionTemplateUse";
import { settled } from "@/lib/settled";
import type { NutritionTemplate, NutritionTemplateList } from "@/lib/coachApi";
import { startNavigationProgress } from "@/components/shell/NavigationProgress";

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

/** A trainee this coach may write nutrition to: ACTIVE, and the link carries NUTRITION. */
export interface NutritionTarget {
  id: string;
  traineeDisplayName: string;
}

type Dialog =
  | { kind: "rename"; template: NutritionTemplate }
  | { kind: "delete"; template: NutritionTemplate }
  | { kind: "pick"; template: NutritionTemplate }
  | { kind: "confirm"; template: NutritionTemplate; trainee: NutritionTarget };

export function NutritionTemplateLibrary({
  library,
  trainees,
}: {
  library: NutritionTemplateList;
  /** `null` = the roster read failed. Never collapsed to `[]`: "nobody" would be false. */
  trainees: NutritionTarget[] | null;
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
        trainees={trainees}
        onClose={close}
        onPick={(template, trainee) => setDialog({ kind: "confirm", template, trainee })}
      />
      {dialog?.kind === "confirm" && (
        // Keyed: a new trainee or template is a new dialog, with a new read.
        <ConfirmDialog
          key={`${dialog.template.id}:${dialog.trainee.id}`}
          template={dialog.template}
          trainee={dialog.trainee}
          onClose={close}
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
  trainees,
  onClose,
  onPick,
}: {
  template: NutritionTemplate | null;
  trainees: NutritionTarget[] | null;
  onClose: () => void;
  onPick: (template: NutritionTemplate, trainee: NutritionTarget) => void;
}) {
  const copy = useCopy();
  const T = copy.nutritionTemplates;
  return (
    <Modal
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
      {trainees === null ? (
        <p role="alert" style={{ margin: 0, fontSize: 13.5, color: "var(--err-ink)" }}>{T.traineesLoadError}</p>
      ) : trainees.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13.5, color: "var(--ink-2)" }}>{T.noTrainees}</p>
      ) : (
        <ul aria-label={T.pickTitle} style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
          {trainees.map((trainee) => (
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
                {trainee.traineeDisplayName}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

type ReadState =
  | { state: "reading" }
  | { state: "ready"; reading: UseReading }
  | { state: "failed" };

/**
 * AC4 + AC5 — the confirm dialog, and the apply as ADR-0016b D16b.7 requires it.
 *
 *   rule 1 — the trainee's nutrition is read WHEN THIS DIALOG OPENS (a server action on
 *            mount), and its `currentWeekStart` is the `weekStart` the apply sends.
 *   rule 0 — targets and week are TWO server actions, awaited one after the other from
 *            here. The second is not started until the first has answered.
 *   rule 2 — "no answer" is not "failed": the `settled()` fallback of each step is
 *            `NO_ANSWER`, and on it NOTHING further is sent.
 *   rule 3 — strictly sequential; a 403 on either step stops and shows access-lost.
 *
 * Every outcome is handed to the trainee's nutrition page, which renders it above the
 * targets and week it has just read from the api (AC5, "shown on the trainee's
 * nutrition page it lands on").
 */
function ConfirmDialog({
  template,
  trainee,
  onClose,
}: {
  template: NutritionTemplate;
  trainee: NutritionTarget;
  onClose: () => void;
}) {
  const copy = useCopy();
  const T = copy.nutritionTemplates;
  const router = useRouter();
  const first = firstName(trainee.traineeDisplayName, copy.locale);
  const [read, setRead] = useState<ReadState>({ state: "reading" });
  const [pending, startTransition] = useTransition();
  const requested = useRef(false);
  const inFlight = useRef(false);

  /**
   * Rule 1 — ONE read per open (the dialog is keyed by template + trainee, so a new
   * choice is a new mount). The ref, not a cancel flag: React's dev double-mount would
   * otherwise either read twice or throw the first answer away.
   */
  useEffect(() => {
    if (requested.current) return;
    requested.current = true;
    void (async () => {
      const result: ReadForUseResult = await settled(readNutritionForUseAction(trainee.id), {
        ok: false,
        code: "NO_ANSWER",
      } as const);
      if (!result.ok) {
        if (result.code === "ACCESS_DENIED") {
          startNavigationProgress("/clients/denied");
          router.push("/clients/denied");
          return;
        }
        setRead({ state: "failed" });
        return;
      }
      setRead({ state: "ready", reading: result.reading });
    })();
  }, [router, trainee.id]);

  function land(kind: UseOutcomeKind, floorCalories: number | null) {
    handOffOutcome({ clientId: trainee.id, template: template.name, kind, floorCalories });
    startNavigationProgress(`/clients/${trainee.id}/nutrition`);
    router.push(`/clients/${trainee.id}/nutrition`);
  }

  function confirm() {
    if (read.state !== "ready") return;
    /**
     * The in-flight latch (staff review, should-fix 3). `disabled={pending}` is a
     * RENDER: two clicks in one JS task both run before React re-renders, and each started
     * its own targets → week chain. A ref is read synchronously, so the second click
     * returns here. It is never released: every path out of the chain navigates away.
     */
    if (inFlight.current) return;
    inFlight.current = true;
    const weekStart = read.reading.currentWeekStart;
    const { calories, proteinG, carbsG, fatG } = template.targets;
    startTransition(async () => {
      // ── step 1: targets ──────────────────────────────────────────────────────
      const targets: ApplyTargetsResult = await settled(
        applyTemplateTargetsAction(trainee.id, { calories, proteinG, carbsG, fatG }),
        { ok: false, code: "NO_ANSWER" } as const
      );
      if (!targets.ok) {
        if (targets.code === "ACCESS_DENIED") {
          startNavigationProgress("/clients/denied");
          router.push("/clients/denied");
          return;
        }
        // A lost answer may still have been saved, so "Nothing was changed" is only
        // said on a RECEIVED refusal (rule 2). Either way, no week request is sent.
        land(targets.code === "NO_ANSWER" ? "TARGETS_UNKNOWN" : "TARGETS_FAILED", null);
        return;
      }
      const floor = targets.result.floorCalories;

      // ── step 2: the week, only now that step 1 has answered ─────────────────
      const week: ApplyWeekResult = await settled(applyTemplateWeekAction(trainee.id, weekStart), {
        ok: false,
        code: "NO_ANSWER",
      } as const);
      if (week.ok) {
        land("APPLIED", floor);
        return;
      }
      if (week.code === "ACCESS_DENIED") {
        // Edge case 4: the targets write stands (it was made while the link was active).
        startNavigationProgress("/clients/denied");
        router.push("/clients/denied");
        return;
      }
      land(
        week.code === "RATE_LIMITED"
          ? "WEEK_RATE_LIMITED"
          : week.code === "WEEK_GENERATING"
            ? "WEEK_GENERATING"
            : week.code === "NO_ANSWER"
              ? "WEEK_UNKNOWN"
              : "WEEK_FAILED",
        floor
      );
    });
  }

  const ready = read.state === "ready" ? read.reading : null;
  const rows: { label: string; now: number | null; after: number; unit: string }[] = [
    { label: copy.nutrition.calories, now: ready?.targets?.calories ?? null, after: template.targets.calories, unit: copy.nutrition.kcal },
    { label: copy.nutrition.protein, now: ready?.targets?.proteinG ?? null, after: template.targets.proteinG, unit: copy.nutrition.grams },
    { label: copy.nutrition.carbs, now: ready?.targets?.carbsG ?? null, after: template.targets.carbsG, unit: copy.nutrition.grams },
    { label: copy.nutrition.fat, now: ready?.targets?.fatG ?? null, after: template.targets.fatG, unit: copy.nutrition.grams },
  ];

  return (
    <Modal
      open
      onClose={() => !pending && onClose()}
      title={T.confirmTitle(template.name, first)}
      icon="apple"
      width={500}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            {T.cancel}
          </Button>
          <Button onClick={confirm} disabled={pending || !ready}>
            {pending && ready ? T.applying : T.confirm}
          </Button>
        </>
      }
    >
      {read.state === "reading" && (
        <p role="status" style={{ margin: 0, fontSize: 13.5, color: "var(--ink-2)" }}>
          {T.reading(first)}
        </p>
      )}
      {read.state === "failed" && (
        <p role="alert" style={{ margin: 0, fontSize: 13.5, color: "var(--err-ink)" }}>
          {T.readFailed(first)}
        </p>
      )}
      {ready && (
        <div style={{ display: "grid", gap: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
            <thead>
              <tr>
                <th scope="col" style={{ textAlign: "left", padding: "6px 4px", color: "var(--ink-3)", fontWeight: 600 }}>
                  <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
                    {copy.nutrition.targetsTitle}
                  </span>
                </th>
                <th scope="col" style={{ textAlign: "right", padding: "6px 4px", color: "var(--ink-3)", fontWeight: 600 }}>
                  {T.now}
                </th>
                <th scope="col" style={{ textAlign: "right", padding: "6px 4px", color: "var(--ink-3)", fontWeight: 600 }}>
                  {T.after}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} style={{ borderTop: "1px solid var(--border)" }}>
                  <th scope="row" style={{ textAlign: "left", padding: "8px 4px", fontWeight: 600, color: "var(--ink-2)" }}>
                    {row.label}
                  </th>
                  <td style={{ textAlign: "right", padding: "8px 4px", color: "var(--ink-2)" }}>
                    {ready.targets === null || row.now === null ? T.notSet : T.amount(row.now, row.unit)}
                  </td>
                  <td style={{ textAlign: "right", padding: "8px 4px", color: "var(--ink)", fontWeight: 700 }}>
                    {T.amount(row.after, row.unit)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ margin: 0, fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.55, overflowWrap: "anywhere" }}>
            {T.confirmBody(first, formatDate(ready.currentWeekStart, copy.locale))}
          </p>
          {template.targets.calories < FLOOR_WARNING_BELOW && (
            <p style={{ margin: 0, fontSize: 13, color: "var(--warn-ink)", lineHeight: 1.5 }}>
              {T.floorWarning(first)}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
