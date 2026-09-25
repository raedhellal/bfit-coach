"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Button, Input, MIN_TOUCH_TARGET, Modal } from "@/components/ui/kit";
import { copy } from "@/lib/copy";
import { truncateName } from "@/lib/format";
import {
  placeRecipeAction,
  recipeChoicesAction,
  type PlacementFailure,
} from "@/lib/nutritionActions";
import { settled } from "@/lib/settled";
import type { CoachRecipeSummary, MealWeekView } from "@/lib/coachApi";

/** The meal the dialog was opened on. Everything it says is about THIS meal. */
export interface PlacementTarget {
  mealId: string;
  mealName: string;
  /** "Wednesday" — from the meal's own day, never from today's date. */
  weekday: string;
}

/**
 * The refusal sentence for one failure, in the story's words (EV-256e AC3 + edge case
 * 6). `recipe` is the recipe the coach CONFIRMED, not the one currently highlighted.
 */
function refusalSentence(
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
      return t.recipeGone;
    case "FAILED":
      return t.failed;
  }
}

/**
 * EV-256e AC2/AC3 — the picker and its confirm, one dialog.
 *
 * Mounted per opening (the card keys it on the meal id), so a refusal from the last
 * meal can never be shown against this one, and the list is read fresh each time: the
 * library is the coach's and may have changed in another tab.
 *
 * ⚠ A refusal leaves the dialog OPEN (AC3), back on the list with the sentence above
 * it, so the coach can choose another recipe — BELOW_FLOOR literally tells them to. The
 * one outcome that closes it is `MEAL_CHANGED`: the meal it was opened on no longer
 * exists, so the card re-reads the week and says so (edge case 6).
 */
export function RecipePickerDialog({
  clientId,
  firstName,
  target,
  onClose,
  onPlaced,
  onMealChanged,
  onRefresh,
}: {
  clientId: string;
  firstName: string;
  target: PlacementTarget;
  onClose: () => void;
  onPlaced: (week: MealWeekView) => void;
  onMealChanged: () => void;
  /** `router.refresh()` — an ended link redirects; a switched-off flag hides the action. */
  onRefresh: () => void;
}) {
  const [recipes, setRecipes] = useState<CoachRecipeSummary[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [filter, setFilter] = useState("");
  const [chosen, setChosen] = useState<CoachRecipeSummary | null>(null);
  const [refusal, setRefusal] = useState<{ text: string; retiredRecipeId: string | null } | null>(
    null
  );
  const [pending, startTransition] = useTransition();
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    let live = true;
    settled(recipeChoicesAction(), { ok: false, code: "FAILED" } as const).then((result) => {
      if (!live) return;
      if (result.ok) {
        setRecipes(result.recipes);
        setLoadFailed(false);
      } else {
        setRecipes([]);
        setLoadFailed(true);
      }
    });
    return () => {
      live = false;
    };
  }, [reloads]);

  function choose(recipe: CoachRecipeSummary) {
    setRefusal(null);
    setChosen(recipe);
  }

  function place() {
    const recipe = chosen;
    if (!recipe) return;
    startTransition(async () => {
      const result = await settled(placeRecipeAction(clientId, target.mealId, recipe.id), {
        ok: false,
        failure: { code: "FAILED" },
      } as const);
      if (result.ok) {
        onPlaced(result.week);
        return;
      }
      const failure = result.failure;
      if (failure.code === "MEAL_CHANGED") {
        onMealChanged();
        return;
      }
      setChosen(null);
      setRefusal({
        text: refusalSentence(failure, recipe.name, firstName, target.weekday),
        retiredRecipeId: failure.code === "RETIRED_INGREDIENT" ? recipe.id : null,
      });
      if (failure.code === "ACCESS_DENIED") {
        // One 403 body for "that recipe is gone" and "the link ended". Re-read the list
        // (the first case) and refresh the page (the second: the layout redirects).
        setRecipes(null);
        setReloads((n) => n + 1);
        onRefresh();
      }
      if (failure.code === "PLACEMENT_OFF") onRefresh();
    });
  }

  const needle = filter.trim().toLowerCase();
  const shown =
    recipes === null
      ? null
      : needle === ""
        ? recipes
        : recipes.filter((r) => r.name.toLowerCase().includes(needle));

  const footer = chosen ? (
    <>
      <Button variant="secondary" onClick={() => setChosen(null)} disabled={pending}>
        {copy.placement.back}
      </Button>
      <Button onClick={place} disabled={pending}>
        {pending ? copy.placement.placing : copy.placement.confirmButton}
      </Button>
    </>
  ) : (
    <Button variant="secondary" onClick={onClose} disabled={pending}>
      {copy.placement.cancel}
    </Button>
  );

  return (
    <Modal
      open
      onClose={() => !pending && onClose()}
      title={copy.placement.title}
      sub={<span title={target.mealName}>{truncateName(target.mealName)}</span>}
      icon="file"
      width={520}
      footer={footer}
    >
      {refusal && (
        <div
          role="alert"
          data-testid="placement-refusal"
          style={{
            margin: "0 0 12px",
            padding: "10px 12px",
            borderRadius: "var(--r-md)",
            background: "var(--err-bg)",
            color: "var(--err-ink)",
            fontSize: 13,
            lineHeight: 1.5,
            overflowWrap: "anywhere",
          }}
        >
          {refusal.text}
          {refusal.retiredRecipeId && (
            <>
              {" "}
              <Link
                href={`/recipes/${refusal.retiredRecipeId}`}
                style={{ color: "inherit", fontWeight: 600 }}
              >
                {copy.placement.openRecipe}
              </Link>
            </>
          )}
        </div>
      )}

      {chosen ? (
        // AC2 — the confirm, verbatim, naming the meal, the recipe and the meal's day.
        <p
          style={{
            margin: 0,
            fontSize: 13.5,
            color: "var(--ink-2)",
            lineHeight: 1.55,
            overflowWrap: "anywhere",
          }}
        >
          {copy.placement.confirm(target.mealName, chosen.name, target.weekday)}
        </p>
      ) : shown === null ? (
        <p role="status" style={{ margin: 0, fontSize: 13.5, color: "var(--ink-3)" }}>
          {copy.placement.loading}
        </p>
      ) : loadFailed ? (
        <p role="alert" style={{ margin: 0, fontSize: 13.5, color: "var(--err-ink)" }}>
          {copy.placement.loadFailed}
        </p>
      ) : recipes !== null && recipes.length === 0 ? (
        // AC2 — the empty library: the sentence and the way to fix it.
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
      ) : (
        <div style={{ display: "grid", gap: 10, minWidth: 0 }}>
          <Input
            label={copy.placement.filterLabel}
            placeholder={copy.placement.filterPlaceholder}
            icon="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            full
          />
          {shown.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: "var(--ink-3)", overflowWrap: "anywhere" }}>
              {copy.placement.noMatch(filter.trim())}
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
                    onClick={() => choose(recipe)}
                    disabled={pending}
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
                      cursor: pending ? "not-allowed" : "pointer",
                      textAlign: "left",
                      minWidth: 0,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 13.5,
                        fontWeight: 600,
                        color: "var(--ink)",
                        overflowWrap: "anywhere",
                        maxWidth: "100%",
                      }}
                    >
                      {recipe.name}
                    </span>
                    <span className="tnum" style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
                      {copy.placement.macroLine(
                        recipe.kcal,
                        recipe.proteinG,
                        recipe.carbsG,
                        recipe.fatG
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}
