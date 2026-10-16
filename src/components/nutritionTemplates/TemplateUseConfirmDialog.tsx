"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Modal } from "@/components/ui/kit";
import { firstName, formatDate } from "@/lib/format";
import { useCopy } from "@/lib/i18n/client";
import {
  applyTemplateTargetsAction,
  applyTemplateWeekAction,
  readNutritionForUseAction,
  type ApplyTargetsResult,
  type ApplyWeekResult,
  type ReadForUseResult,
  type UseReading,
} from "@/lib/nutritionTemplateActions";
import { FLOOR_WARNING_BELOW, type UseOutcomeKind } from "@/lib/nutritionTemplateUse";
import { settled } from "@/lib/settled";
import type { NutritionTemplate } from "@/lib/coachApi";
import { startNavigationProgress } from "@/components/shell/NavigationProgress";

/**
 * EV-273b AC4 + AC5 — "Use on a trainee"'s confirm dialog and its targets → week chain, moved
 * out of `NutritionTemplateLibrary` unchanged (EV-337g2 G2.3) so the trainee's nutrition page
 * opens the SAME dialog for its own client, without the client picker. Only where the outcome
 * goes differs, and the caller decides it (`onLand`).
 */

/** A trainee this coach may write nutrition to: ACTIVE, and the link carries NUTRITION. */
export interface NutritionTarget {
  id: string;
  /** BUG-714: null or blank for a trainee with no name; printed through `fullNameOf`. */
  traineeDisplayName: string | null;
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
 * Every outcome goes to `onLand`, which shows it on the trainee's nutrition page above the
 * targets and week the api now holds (AC5). The library hands it off and navigates there
 * (`NutritionTemplateLibrary`); the trainee's own page, which the coach is already on, shows
 * it in place (EV-337g2 G2.3, `NutritionApplyCard`). Everything else (the read, the two
 * writes, their order, the table, the sentences, the labels) is this one component, so the
 * two places cannot drift apart.
 */
export function TemplateUseConfirmDialog({
  template,
  trainee,
  onClose,
  onLand,
}: {
  template: NutritionTemplate;
  trainee: NutritionTarget;
  onClose: () => void;
  /**
   * The chain has an outcome (AC5's kinds; `floorCalories` from the targets response, or null).
   * Called once per open, and never for a 403 (the dialog moves the coach to /clients/denied).
   */
  onLand: (kind: UseOutcomeKind, floorCalories: number | null) => void;
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

  function confirm() {
    if (read.state !== "ready") return;
    /**
     * The in-flight latch (staff review, should-fix 3). `disabled={pending}` is a
     * RENDER: two clicks in one JS task both run before React re-renders, and each started
     * its own targets → week chain. A ref is read synchronously, so the second click
     * returns here. It is never released: every path out of the chain either navigates away
     * or lands, and neither caller lets a landed dialog run again. The library's `onLand`
     * navigates to the trainee's nutrition page (the dialog goes with the library), and the
     * apply card's `onLand` closes (unmounts) it. So a new chain is always a new mount with a
     * new latch.
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
        onLand(targets.code === "NO_ANSWER" ? "TARGETS_UNKNOWN" : "TARGETS_FAILED", null);
        return;
      }
      const floor = targets.result.floorCalories;

      // ── step 2: the week, only now that step 1 has answered ─────────────────
      const week: ApplyWeekResult = await settled(applyTemplateWeekAction(trainee.id, weekStart), {
        ok: false,
        code: "NO_ANSWER",
      } as const);
      if (week.ok) {
        onLand("APPLIED", floor);
        return;
      }
      if (week.code === "ACCESS_DENIED") {
        // Edge case 4: the targets write stands (it was made while the link was active).
        startNavigationProgress("/clients/denied");
        router.push("/clients/denied");
        return;
      }
      onLand(
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
      dirty={false}
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
