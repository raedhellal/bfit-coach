"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, CardHead, MIN_TOUCH_TARGET, Modal } from "@/components/ui/kit";
import { copy } from "@/lib/copy";
import { formatInstant, formatKcal, truncateName } from "@/lib/format";
import { logPortalEvent } from "@/lib/portalEvents";
import { saveTargetsAction } from "@/lib/nutritionActions";
import type { NutritionTargets } from "@/lib/coachApi";

/**
 * EV-185b AC2 — the coach's macro targets.
 *
 * Three sentences on this card are the story's, verbatim, and each says something the
 * code cannot:
 *   · the SOURCE line names who set the targets. `COACH` reads "Set by you on {date}"
 *     because a trainee has one coach and this portal only ever shows that coach their
 *     own attribution; if the api ever returns another coach's write, the sentence is
 *     wrong and the contract needs a name, not a rewording here.
 *   · the FLOOR flag is rendered only from `floorCalories` in the api's response. This
 *     component never decides that a floor applied — the floor is 1500 kcal male /
 *     1200 kcal female inside `NutritionService.setTarget`, and this surface does not
 *     know the trainee's sex and must not infer one.
 *   · the STANDING line ("…does not yet check protein or fat.") renders whether or not
 *     a floor fired, because what it states is the limit of the check itself. There is
 *     no protein or fat bound anywhere in the engine; EV-185 says so and refuses to
 *     invent one, so the coach is told rather than left to assume.
 *
 * "Enter a number above 0." is client-side and sends NO request, which is AC2's
 * wording. `saveTargetsAction` repeats the check because a server action is a public
 * endpoint, not because the coach can reach it.
 */
export function NutritionTargetsCard({
  clientId,
  traineeDisplayName,
  targets,
}: {
  clientId: string;
  traineeDisplayName: string;
  targets: NutritionTargets | null;
}) {
  const router = useRouter();
  const [calories, setCalories] = useState(targets ? String(targets.calories) : "");
  const [protein, setProtein] = useState(targets ? String(targets.proteinG) : "");
  const [carbs, setCarbs] = useState(targets ? String(targets.carbsG) : "");
  const [fat, setFat] = useState(targets ? String(targets.fatG) : "");
  const [invalid, setInvalid] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [floorCalories, setFloorCalories] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const fields = [
    { key: "calories", label: copy.nutrition.calories, unit: copy.nutrition.kcal, value: calories, set: setCalories },
    { key: "protein", label: copy.nutrition.protein, unit: copy.nutrition.grams, value: protein, set: setProtein },
    { key: "carbs", label: copy.nutrition.carbs, unit: copy.nutrition.grams, value: carbs, set: setCarbs },
    { key: "fat", label: copy.nutrition.fat, unit: copy.nutrition.grams, value: fat, set: setFat },
  ];

  function parsed(): number[] {
    return [calories, protein, carbs, fat].map((v) => Number(v.trim()));
  }

  /**
   * EV-190 U3 / AC3 — the arithmetic the card never did.
   *
   * Four independent numbers with one rule between them ("above 0") meant 2200 kcal
   * could be saved next to macros summing to 2560, and the prompt was handed both. The
   * line below states the sum and the signed difference, live, as the coach types.
   *
   * It is ADVISORY and blocks nothing: "Save targets" is never disabled by it, nothing
   * is auto-corrected, and no request is withheld. A coach may have a reason for a
   * deliberate mismatch, and a tool that refuses a professional's number teaches them
   * to work around it. 4/4/9 kcal per gram and a ±25 kcal tolerance are the story's
   * own figures, so QA computes the expected sentence rather than reading it off.
   *
   * `null` whenever any field is empty or not a positive number: there is no honest
   * arithmetic over a missing value, and "0 kcal" or "NaN" would be an invented one
   * (edge case 5).
   */
  const MATCH_TOLERANCE_KCAL = 25;

  function reconciliation(): { line: string; delta: number } | null {
    const [kcal, proteinG, carbsG, fatG] = parsed();
    const values = [kcal, proteinG, carbsG, fatG];
    if (values.some((v) => !Number.isFinite(v) || v <= 0)) return null;
    const macroKcal = Math.round(proteinG * 4 + carbsG * 4 + fatG * 9);
    const delta = macroKcal - Math.round(kcal);
    const sum = formatKcal(macroKcal);
    if (Math.abs(delta) <= MATCH_TOLERANCE_KCAL) {
      return { line: copy.nutrition.macrosMatch(sum), delta };
    }
    return {
      line:
        delta > 0
          ? copy.nutrition.macrosAbove(sum, formatKcal(delta))
          : copy.nutrition.macrosBelow(sum, formatKcal(-delta)),
      delta,
    };
  }

  const macros = reconciliation();

  function requestSave() {
    const values = parsed();
    // A non-numeric or non-positive value is rejected HERE and nothing is sent.
    if (values.some((v) => !Number.isFinite(v) || v <= 0)) {
      setInvalid(true);
      setNotice(null);
      setError(null);
      return;
    }
    setInvalid(false);
    setConfirming(true);
  }

  function save() {
    const [kcal, proteinG, carbsG, fatG] = parsed();
    if (macros && Math.abs(macros.delta) > MATCH_TOLERANCE_KCAL) {
      // EV-190's own measurement of whether this line is worth keeping: if coaches
      // always save straight through it, it is decorative and it comes out.
      logPortalEvent({
        event: "coach_targets_macro_mismatch",
        delta_kcal: macros.delta,
        saved: true,
      });
    }
    startTransition(async () => {
      const result = await saveTargetsAction(clientId, { calories: kcal, proteinG, carbsG, fatG });
      setConfirming(false);
      if (!result.ok) {
        if (result.code === "ACCESS_DENIED") {
          // The link ended mid-session. Refreshing re-runs `[id]/layout.tsx`, whose
          // overview read now 403s, and the layout redirects to /clients/denied — the
          // coach leaves a screen of a revoked trainee's data instead of reading a
          // sentence beneath it.
          router.refresh();
          return;
        }
        setError(copy.nutrition.targetsFailed);
        return;
      }
      setError(null);
      setNotice(copy.nutrition.targetsSaved);
      setFloorCalories(result.result.floorCalories);
      /**
       * The server may have clamped the calories; show what was actually stored — and
       * because the reconciliation line is derived from this state, it recomputes
       * against the STORED calories (AC3's last clause). A coach is never shown
       * arithmetic about a number that was not saved.
       */
      setCalories(String(result.result.targets.calories));
      router.refresh();
    });
  }

  /**
   * AC1's source line, in the four cases ADR-0015's 2026-09-16 amendment (ruling (b))
   * settles.
   *
   * `source === "COACH"` alone does NOT mean "you": `nutrition_targets` survives a
   * revoke-and-re-link and `set_by` is NULL once an erased account has been forgotten,
   * so a coach can legitimately be reading a target written by the trainee's previous
   * one. The gate is `setByYou`, a boolean the API computes — this component performs
   * no comparison and holds no id to compare, which is the point: the portal is never
   * served another person's user id (ADR-0012 D4's rule, applied to attribution).
   *
   * The not-you line never names the other coach. It has nothing to name them with.
   */
  function sourceLine(): string | null {
    if (!targets) return null;
    if (targets.source === "AUTO") return copy.nutrition.sourceAuto;
    if (targets.source === "MANUAL") return copy.nutrition.sourceManual;
    return targets.setByYou
      ? copy.nutrition.sourceCoach(formatInstant(targets.updatedAt))
      : copy.nutrition.sourceCoachOther(formatInstant(targets.updatedAt));
  }

  const source = sourceLine();

  return (
    <Card style={{ marginBottom: 18 }}>
      <CardHead
        title={copy.nutrition.targetsTitle}
        icon="apple"
        sub={source ?? undefined}
        action={
          targets?.activity ? (
            <Badge tone="purple">
              {`${copy.nutrition.activity}: ${
                copy.nutrition.activityLabels[targets.activity] ?? targets.activity
              }`}
            </Badge>
          ) : undefined
        }
      />

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {fields.map((field) => (
          <label key={field.key} style={{ display: "block" }}>
            <div
              style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-2)", marginBottom: 6 }}
            >
              {`${field.label} (${field.unit})`}
            </div>
            <input
              aria-label={field.label}
              inputMode="numeric"
              value={field.value}
              onChange={(e) => field.set(e.target.value)}
              style={{
                height: MIN_TOUCH_TARGET,
                width: 120,
                borderRadius: "var(--r-md)",
                border: `1px solid ${invalid ? "var(--err)" : "var(--border-2)"}`,
                background: "var(--surface)",
                padding: "0 12px",
                fontFamily: "var(--font-body)",
                fontSize: 14,
                color: "var(--ink)",
              }}
            />
          </label>
        ))}
      </div>

      {/*
        Beneath the four fields, above the control — the coach reads the arithmetic
        before they press Save, and it is a `status`, not an `alert`: nothing is wrong,
        and a screen reader should not be interrupted mid-field by a running total.
      */}
      {macros && (
        <p
          role="status"
          style={{ margin: "12px 0 0", fontSize: 13, color: "var(--ink-2)" }}
        >
          {macros.line}
        </p>
      )}

      {invalid && (
        // AC2, verbatim. No request was sent.
        <p role="alert" style={{ margin: "12px 0 0", fontSize: 13, color: "var(--err-ink)" }}>
          {copy.nutrition.invalidNumber}
        </p>
      )}

      <div style={{ marginTop: 16 }}>
        <Button icon="check" onClick={requestSave} disabled={pending}>
          {pending ? copy.nutrition.saving : copy.nutrition.saveTargets}
        </Button>
      </div>

      {floorCalories !== null && (
        <p style={{ margin: "12px 0 0", fontSize: 13, color: "var(--warn-ink)" }}>
          {copy.nutrition.floorApplied(floorCalories)}
        </p>
      )}
      {notice && (
        <p style={{ margin: "10px 0 0", fontSize: 13, color: "var(--ok-ink)" }}>{notice}</p>
      )}
      {error && (
        <p role="alert" style={{ margin: "10px 0 0", fontSize: 13, color: "var(--err-ink)" }}>
          {error}
        </p>
      )}

      <p style={{ margin: "14px 0 0", fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.55 }}>
        {copy.nutrition.floorStanding}
      </p>

      <Modal
        open={confirming}
        onClose={() => !pending && setConfirming(false)}
        title={copy.nutrition.saveTargetsTitle}
        icon="apple"
        width={420}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)} disabled={pending}>
              {copy.nutrition.cancel}
            </Button>
            <Button onClick={save} disabled={pending}>
              {copy.nutrition.saveTargets}
            </Button>
          </>
        }
      >
        <p style={{ margin: 0, fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.55 }}>
          {/* Slice 1 has no draft: the write is immediate, and the dialog says so. */}
          {copy.nutrition.seesStraightAway(truncateName(traineeDisplayName))}
        </p>
      </Modal>
    </Card>
  );
}
