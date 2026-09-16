"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, CardHead, MIN_TOUCH_TARGET, Modal } from "@/components/ui/kit";
import { copy } from "@/lib/copy";
import { formatInstant, truncateName } from "@/lib/format";
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
  coachId,
}: {
  clientId: string;
  traineeDisplayName: string;
  targets: NutritionTargets | null;
  /**
   * The SIGNED-IN coach's id, from `GET /coach-portal/me`, resolved on the server and
   * passed in — it is what `targets.setBy` is compared against. Null when that read
   * failed, and then "you" is simply not claimed (see `sourceLine`).
   */
  coachId: string | null;
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
      // The server may have clamped the calories; show what was actually stored.
      setCalories(String(result.result.targets.calories));
      router.refresh();
    });
  }

  /**
   * AC1's three source sentences, with ADR-0015 B2's fourth case.
   *
   * `source === "COACH"` alone does NOT mean "you". `set_by` is null on a COACH row
   * whose author was erased, and `nutrition_targets` survives a revoke-and-re-link, so
   * a coach can legitimately be looking at a target written by the trainee's previous
   * coach. "Set by you on {date}" is therefore gated on `setBy === coachId` — an
   * equality, not an inference — and every other COACH row reads "Set by a coach",
   * which is true in all three of the cases that are not this coach and discloses no
   * other coach's identity.
   *
   * `coachId !== null &&` is not a defensive habit, it is the null-null collision:
   * `readCoachMe` degrades to null when `GET /coach-portal/me` fails (a failed header
   * read must never take down the screen it decorates), and `setBy` is null on every
   * target the trainee wrote themselves. Without the guard those two nulls compare
   * equal and a trainee's own COACH-less row would be attributed to a coach whose
   * identity this render could not even establish. When "you" is unknown, "you" is not
   * claimed.
   */
  function sourceLine(): string | null {
    if (!targets) return null;
    if (targets.source === "AUTO") return copy.nutrition.sourceAuto;
    if (targets.source === "MANUAL") return copy.nutrition.sourceManual;
    const setByYou = coachId !== null && targets.setBy === coachId;
    return setByYou
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
