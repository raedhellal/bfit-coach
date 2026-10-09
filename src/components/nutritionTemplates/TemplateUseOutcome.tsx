"use client";

import { useEffect, useState } from "react";
import { weekApplyLabel } from "@/components/nutrition/NutritionWeekCard";
import { firstName } from "@/lib/format";
import { useCopy } from "@/lib/i18n/client";
import { takeOutcome, type UseOutcome } from "@/lib/nutritionTemplateUse";

/**
 * EV-273b AC5 — the outcome of "Use on a trainee", shown on the trainee's nutrition page
 * it lands on, ABOVE the targets and the week the server just read.
 *
 * The sentence says what the browser observed of each write, and the page under it
 * shows what the api now holds; the two are never merged. Consumed by the first render
 * of THIS trainee's page within `OUTCOME_TTL_MS`, error branches included (the page
 * mounts this above its load-error split), so a reload shows the page alone. A landing
 * that was redirected away never shows it later: /clients/denied discards it and it
 * expires (`src/lib/nutritionTemplateUse.ts`).
 *
 * A success is a `status`; every partial and failure is an `alert`, because each of
 * them asks the coach to do something (check, retry, wait until tomorrow).
 */
export function TemplateUseOutcome({
  clientId,
  trainee,
}: {
  clientId: string;
  /** The read that carries the name, or null when it failed (`ClientHeader`'s input). */
  trainee: { traineeDisplayName: string | null } | null;
}) {
  const copy = useCopy();
  const first = firstName(trainee?.traineeDisplayName, copy.locale);
  // BUG-714: "Unnamed client" only when the read succeeded with no name. A failed read keeps
  // the label it always had (the name unknown, BUG-713), never the label.
  const applyLabel = trainee ? weekApplyLabel(copy, trainee.traineeDisplayName) : copy.nutrition.apply("");
  const [outcome, setOutcome] = useState<UseOutcome | null>(null);

  useEffect(() => {
    // Only ever SET: the read removes the hand-off, so a second run of this effect
    // (React's dev double-mount, a re-render) finds nothing — and must not erase the
    // sentence the first run found.
    const taken = takeOutcome(clientId);
    if (taken) setOutcome(taken);
  }, [clientId]);

  if (!outcome) return null;

  const t = copy.nutritionTemplates;
  const sentence = {
    APPLIED: t.applied(outcome.template, first),
    WEEK_RATE_LIMITED: t.weekRateLimited(first),
    // ADR-0030 — the week card's own in-progress sentence, after the fact this flow adds:
    // step 1 was RECEIVED as a 200, so the targets did change (as every WEEK_* lead says).
    WEEK_GENERATING: `${t.targetsUpdated(first)} ${copy.nutrition.weekGenerating(first)}`,
    // PB-5: the week card's button by its own label (the full name), never "Apply to {first}".
    WEEK_FAILED: t.weekFailed(first, applyLabel),
    WEEK_UNKNOWN: t.weekUnknown(first),
    TARGETS_FAILED: t.targetsFailed(first),
    TARGETS_UNKNOWN: t.targetsUnknown(first),
  }[outcome.kind];
  const ok = outcome.kind === "APPLIED";

  return (
    <div
      role={ok ? "status" : "alert"}
      data-testid="template-use-outcome"
      style={{
        marginBottom: 18,
        padding: "12px 14px",
        borderRadius: "var(--r-lg)",
        background: ok ? "var(--ok-bg)" : "var(--warn-bg)",
        color: ok ? "var(--ok-ink)" : "var(--warn-ink)",
        fontSize: 13.5,
        lineHeight: 1.5,
        overflowWrap: "anywhere",
      }}
    >
      <p style={{ margin: 0 }}>{sentence}</p>
      {outcome.floorCalories !== null && (
        // AC5 — the engine's own sentence, from the targets RESPONSE, never estimated.
        <p style={{ margin: "6px 0 0" }}>{copy.nutrition.floorApplied(outcome.floorCalories)}</p>
      )}
    </div>
  );
}
