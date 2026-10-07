"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startNavigationProgress } from "@/components/shell/NavigationProgress";
import { Button, Card, CardHead, MIN_TOUCH_TARGET } from "@/components/ui/kit";
import { useCopy } from "@/lib/i18n/client";
import {
  createNutritionTemplateAction,
  updateNutritionTemplateAction,
  type NutritionTemplateFailure,
} from "@/lib/nutritionTemplateActions";
import { NUTRITION_TEMPLATE_NAME_MAX } from "@/lib/nutritionTemplateUse";
import { parseTarget, targetRefusal } from "@/lib/numberInput";
import { settled } from "@/lib/settled";
import type { NutritionTemplateTargetsRequest } from "@/lib/coachApi";
import { useCoachForm } from "@/lib/useCoachForm";

/**
 * EV-273b AC2 — the nutrition template editor. A name and four targets, and nothing
 * else: **no meal-structure field and no pin grid** (N6; EV-273e and EV-273d add them).
 *
 * The four inputs follow the trainee targets form (`NutritionTargetsCard`): the same
 * labels, the same client-side rule — "Enter a number above 0." with NO request sent —
 * and the same standing line about what Evoli checks, worded for a template: the floor
 * is applied when the template is USED, because a template has no sex (EV-273 N4). The
 * api's own bounds (800-8000 kcal, P ≤ 500, C ≤ 1200, F ≤ 400, whole numbers) are its
 * to enforce; a 400 is rendered as one sentence naming all four.
 *
 * The body is assembled in the server action from named values, so the island cannot
 * add a key to it (AC2: top-level keys exactly `name` and `targets`).
 *
 * BUG-665 / EV-342o: built with `useCoachForm`, so it asks before a link, Back or a closed
 * tab drops unsaved work (the training-template editor's rules), and re-seeds from the
 * server's props after its own update's `revalidatePath` without touching a field typed
 * during the save.
 */
export function NutritionTemplateEditor({
  templateId,
  initial,
  limit,
}: {
  templateId: string | null;
  initial: { name: string; targets: NutritionTemplateTargetsRequest } | null;
  /** The cap the api SERVES (`/new` reads the list for it); null when unknown. */
  limit: number | null;
}) {
  const router = useRouter();
  const copy = useCopy();
  const t = copy.nutritionTemplates;
  const form = useCoachForm({
    server: {
      name: initial?.name ?? "",
      calories: initial ? String(initial.targets.calories) : "",
      protein: initial ? String(initial.targets.proteinG) : "",
      carbs: initial ? String(initial.targets.carbsG) : "",
      fat: initial ? String(initial.targets.fatG) : "",
    },
  });
  const { name, calories, protein, carbs, fat } = form.values;
  /** The refusal on screen (AC2 or PB-2's sentence), or null. No request was sent. */
  const [refusal, setRefusal] = useState<string | null>(null);
  const invalid = refusal !== null;
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const fields = [
    { key: "calories", label: copy.nutrition.calories, unit: copy.nutrition.kcal },
    { key: "protein", label: copy.nutrition.protein, unit: copy.nutrition.grams },
    { key: "carbs", label: copy.nutrition.carbs, unit: copy.nutrition.grams },
    { key: "fat", label: copy.nutrition.fat, unit: copy.nutrition.grams },
  ] as const;

  const trimmed = name.trim();
  const nameRefusal =
    trimmed === ""
      ? t.nameRequired
      : trimmed.length > NUTRITION_TEMPLATE_NAME_MAX
        ? t.nameTooLong
        : null;

  const FAILURE: Record<NutritionTemplateFailure, string> = {
    NAME_TAKEN: t.nameTaken,
    LIMIT_REACHED: limit === null ? t.limitReachedUnknown : t.limitReached(limit),
    OUT_OF_BOUNDS: t.outOfBounds,
    ACCESS_DENIED: t.notYours,
    FAILED: t.saveFailed,
  };

  function save() {
    setNotice(null);
    setError(null);
    // AC2 — refused HERE, and nothing is sent. PB-2: "1 800" is 1800, and a decimal part
    // ("1800,5", or "1,000", never a thousands separator) is told "a whole number" — the
    // same reader and the same sentences as the trainee's targets card. BUG-552: digits
    // that cannot be read ("18 00") are shown the format, never "above 0".
    const read = [calories, protein, carbs, fat].map(parseTarget);
    const values: number[] = [];
    for (const field of read) if (field.kind === "whole") values.push(field.value);
    const refused = targetRefusal(read);
    if (refused !== null) {
      setRefusal(refused === "malformed" ? t.numberFormat : refused === "notWhole" ? t.wholeNumber : t.invalidNumber);
      return;
    }
    setRefusal(null);
    if (nameRefusal) return;
    const [kcal, proteinG, carbsG, fatG] = values;
    const targets = { calories: kcal, proteinG, carbsG, fatG };
    form.markSent();
    startTransition(async () => {
      const result = await settled(
        templateId === null
          ? createNutritionTemplateAction(trimmed, targets)
          : updateNutritionTemplateAction(templateId, trimmed, targets),
        { ok: false, code: "FAILED" } as const
      );
      if (!result.ok) {
        // The work stays unsaved, so the guard stays armed.
        setError(FAILURE[result.code]);
        return;
      }
      if (templateId === null) {
        // `replace`: Back from the library must not land on a "new" route that would
        // create a second template. EV-342a: the list has no `loading.tsx` any more, so
        // the progress bar is what covers a slow list read. Handed to `saved`, so the
        // guard's history entry is gone first (a `replace` over it would leave a dead Back
        // press behind), and the bar starts after that entry's popstate, which would stop a
        // bar started before it.
        form.saved(undefined, () => {
          startNavigationProgress("/nutrition-templates");
          router.replace("/nutrition-templates");
        });
        return;
      }
      form.saved();
      setNotice(t.saved);
      // No `router.refresh()` (ADR-0033 branch 2a): the update action revalidates.
    });
  }

  return (
    <Card rootRef={form.scope}>
      <label style={{ display: "block", marginBottom: 16 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-2)", marginBottom: 6 }}>
          {t.nameLabel}
        </div>
        <input
          value={name}
          onChange={(e) => {
            form.set("name", e.target.value);
            setError(null);
          }}
          style={{
            height: MIN_TOUCH_TARGET,
            width: "100%",
            maxWidth: 420,
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
      {/*
        The reason Save is disabled, always on screen while it is (staff review nit): an
        empty form is the commonest case, and a greyed button with no sentence is a guess.
      */}
      {nameRefusal && (
        <p style={{ margin: "-8px 0 14px", fontSize: 12.5, color: "var(--ink-3)" }}>
          {nameRefusal}
        </p>
      )}

      <CardHead title={t.targetsLabel} icon="apple" />
      <div className="recipe-macros" style={{ display: "grid", gap: 12 }}>
        {fields.map((field) => (
          <label key={field.key} style={{ display: "block", minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-2)", marginBottom: 6 }}>
              {`${field.label} (${field.unit})`}
            </div>
            <input
              aria-label={field.label}
              inputMode="numeric"
              value={form.values[field.key]}
              onChange={(e) => {
                form.set(field.key, e.target.value);
                setRefusal(null);
              }}
              style={{
                height: MIN_TOUCH_TARGET,
                width: "100%",
                minWidth: 0,
                borderRadius: "var(--r-md)",
                border: `1px solid ${invalid ? "var(--err)" : "var(--border-2)"}`,
                background: "var(--surface)",
                padding: "0 12px",
                fontSize: 14,
                color: "var(--ink)",
              }}
            />
          </label>
        ))}
      </div>

      {refusal && (
        // AC2, verbatim (or PB-2's whole-number sentence). No request was sent.
        <p role="alert" style={{ margin: "12px 0 0", fontSize: 13, color: "var(--err-ink)" }}>
          {refusal}
        </p>
      )}

      {/* AC2, verbatim — a standing line: what it states is the limit of the check itself. */}
      <p style={{ margin: "14px 0 0", fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.55 }}>
        {t.floorStanding}
      </p>

      <div style={{ marginTop: 16 }}>
        <Button
          icon="check"
          onClick={save}
          disabled={pending || nameRefusal !== null}
          // `Button` passes `title` through (a hyphenated aria-* prop would be dropped
          // silently: TypeScript does not check hyphenated JSX attributes).
          title={nameRefusal ?? undefined}
        >
          {pending ? t.saving : t.save}
        </Button>
      </div>
      {notice && (
        <p role="status" style={{ margin: "10px 0 0", fontSize: 13, color: "var(--ok-ink)" }}>
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" style={{ margin: "10px 0 0", fontSize: 13, color: "var(--err-ink)", overflowWrap: "anywhere" }}>
          {error}
        </p>
      )}
      {form.guard}
    </Card>
  );
}
