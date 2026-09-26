"use client";

import Link from "next/link";
import { Input, MIN_TOUCH_TARGET } from "@/components/ui/kit";
import { copy } from "@/lib/copy";
import type { PlacementFailure } from "@/lib/nutritionActions";
import type { CoachRecipeSummary } from "@/lib/coachApi";

/**
 * EV-256e's recipe picker — since EV-272 the RECIPE HALF of the Swap sheet
 * (`SwapSheet.tsx`), no longer a dialog of its own (it was `RecipePickerDialog.tsx`;
 * EV-272 R1 removed the separate "Use one of my recipes" button that opened it).
 *
 * Presentational: the sheet owns the library, the query and the choice, because the
 * query must survive the confirm's Cancel (EV-272 AC4) and a refusal (the sheet stays
 * open on the list).
 */

/** The meal the sheet was opened on. Everything it says is about THIS meal. */
export interface PlacementTarget {
  mealId: string;
  mealName: string;
  /** "Wednesday" — from the meal's own day, never from today's date. */
  weekday: string;
}

/**
 * The refusal sentence for one failure, in the story's words (EV-256e AC3 + edge case
 * 6, re-used verbatim by EV-272 AC4). `recipe` is the recipe the coach CONFIRMED.
 */
export function refusalSentence(
  failure: PlacementFailure,
  recipe: string,
  first: string,
  weekday: string
): string {
  const t = copy.placement;
  switch (failure.code) {
    case "EXCLUDED_INGREDIENT":
      return t.excludedIngredient(recipe, first, failure.value);
    case "EXCLUDED_NAME":
      return t.excludedName(recipe, first);
    case "RULE_UNCHECKABLE":
      return t.ruleUncheckable(first);
    case "ALLERGIES_UNCHECKABLE":
      return t.allergiesUncheckable(first);
    case "BELOW_FLOOR":
      return t.belowFloor(first, weekday, failure.dayKcalAfter, failure.floorKcal);
    case "MEAL_EATEN":
      return t.mealEaten(first);
    case "MEAL_LOCKED":
      return t.mealLocked(first);
    case "RETIRED_INGREDIENT":
      return t.retiredIngredient(recipe);
    case "MEAL_CHANGED":
      return t.mealChanged;
    case "PLACEMENT_OFF":
      return t.placementOff;
    case "ACCESS_DENIED":
      // Never `recipeGone` from the 403 alone — see `SwapSheet`'s `place()`.
      return t.accessDenied(first);
    case "FAILED":
      return t.failed;
  }
}

export type LibraryState =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "ready"; recipes: CoachRecipeSummary[] };

/**
 * The library's four states, in the sheet: loading, could not be loaded (AC7), empty
 * (AC7 — the sentence and the way to fix it), and the search over the rows (AC2/AC3).
 * `shown` is already filtered and ordered (`recipeSearch.ts`).
 */
export function RecipePicker({
  library,
  shown,
  query,
  onQuery,
  onChoose,
  disabled,
}: {
  library: LibraryState;
  shown: CoachRecipeSummary[];
  query: string;
  onQuery: (query: string) => void;
  onChoose: (recipe: CoachRecipeSummary) => void;
  disabled: boolean;
}) {
  if (library.status === "loading") {
    return (
      <p role="status" style={{ margin: 0, fontSize: 13.5, color: "var(--ink-3)" }}>
        {copy.placement.loading}
      </p>
    );
  }
  if (library.status === "failed") {
    return (
      <p role="alert" style={{ margin: 0, fontSize: 13.5, color: "var(--err-ink)" }}>
        {copy.placement.loadFailed}
      </p>
    );
  }
  if (library.recipes.length === 0) {
    return (
      <div style={{ display: "grid", gap: 10, justifyItems: "start" }}>
        <p style={{ margin: 0, fontSize: 13.5, color: "var(--ink-2)" }}>{copy.placement.empty}</p>
        <Link
          href="/recipes/new"
          style={{
            display: "inline-flex",
            alignItems: "center",
            height: MIN_TOUCH_TARGET,
            padding: "0 14px",
            borderRadius: "var(--r-md)",
            border: "1px solid var(--border-2)",
            background: "var(--surface)",
            color: "var(--ink)",
            fontSize: 13,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          {copy.placement.emptyLink}
        </Link>
      </div>
    );
  }
  return (
    <div style={{ display: "grid", gap: 10, minWidth: 0 }}>
      <Input
        label={copy.swapSheet.searchLabel}
        placeholder={copy.swapSheet.searchPlaceholder}
        icon="search"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        autoFocus
        full
      />
      {shown.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: "var(--ink-3)", overflowWrap: "anywhere" }}>
          {copy.swapSheet.noMatch(query.trim())}
        </p>
      ) : (
        <ul
          data-testid="recipe-choices"
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "grid",
            // BUG-244: a 0 minimum, so a long name wraps inside the track instead of
            // widening it past a 320 px viewport.
            gridTemplateColumns: "minmax(0, 1fr)",
            gap: 8,
          }}
        >
          {shown.map((recipe) => (
            <li key={recipe.id} style={{ minWidth: 0 }}>
              <button
                type="button"
                onClick={() => onChoose(recipe)}
                disabled={disabled}
                title={recipe.name}
                aria-label={copy.placement.chooseNamed(recipe.name)}
                style={{
                  width: "100%",
                  minHeight: MIN_TOUCH_TARGET,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: 3,
                  padding: "9px 12px",
                  borderRadius: "var(--r-md)",
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                  cursor: disabled ? "not-allowed" : "pointer",
                  textAlign: "left",
                  minWidth: 0,
                }}
              >
                {/* EV-272 AC8: the WHOLE name, wrapping — never truncated or clipped. */}
                <span
                  style={{
                    fontSize: 13.5,
                    lineHeight: 1.35,
                    fontWeight: 600,
                    color: "var(--ink)",
                    overflowWrap: "anywhere",
                    maxWidth: "100%",
                  }}
                >
                  {recipe.name}
                </span>
                <span className="tnum" style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
                  {copy.nutrition.macros(recipe.kcal, recipe.proteinG, recipe.carbsG, recipe.fatG)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
