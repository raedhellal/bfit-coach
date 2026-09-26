"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Button, MIN_TOUCH_TARGET, Modal } from "@/components/ui/kit";
import {
  RecipePicker,
  refusalSentence,
  type LibraryState,
  type PlacementTarget,
} from "@/components/nutrition/RecipePicker";
import { copy } from "@/lib/copy";
import { truncateName } from "@/lib/format";
import {
  applySwapAction,
  placeRecipeAction,
  recipeChoicesAction,
  swapOptionsAction,
  type RecipeChoicesResult,
} from "@/lib/nutritionActions";
import { recipesFor } from "@/lib/recipeSearch";
import { settled } from "@/lib/settled";
import type { CoachRecipeSummary, MealWeekView, SwapCandidate } from "@/lib/coachApi";

/**
 * One suggestion row — the Swap dialog's candidate button exactly as it was before
 * EV-272 (AC5: "the candidates render exactly as they do today"). Used by BOTH sheets,
 * so the flag-off sheet renders the same DOM it always did (AC1).
 */
export function SuggestionRow({
  candidate,
  onChoose,
  pending,
}: {
  candidate: SwapCandidate;
  onChoose: (index: number) => void;
  pending: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onChoose(candidate.index)}
      disabled={pending}
      title={candidate.name}
      style={{
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
      }}
    >
      <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>
        {truncateName(candidate.name)}
      </span>
      <span className="tnum" style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
        {copy.nutrition.macros(candidate.kcal, candidate.proteinG, candidate.carbsG, candidate.fatG)}
      </span>
    </button>
  );
}

export interface SwapSheetTarget extends PlacementTarget {
  /** The meal's kcal: the recipes are ordered by their distance to it (AC2). */
  kcal: number;
  /** Locked by the trainee (AC6): the sheet says so and asks the api nothing. */
  locked: boolean;
  /**
   * The library read, STARTED BY THE CLICK that opened the sheet (null for a locked
   * meal). Not from an effect: React's dev StrictMode mounts twice, and an effect read
   * sent TWO requests per opening in `next dev`, where AC2 allows exactly one. A click
   * handler runs once in every mode.
   */
  library: Promise<RecipeChoicesResult> | null;
}

/** Start the one library read of an opening. Call from the event handler that opens it. */
export function readLibrary(): Promise<RecipeChoicesResult> {
  return settled(recipeChoicesAction(), { ok: false, code: "FAILED" } as const);
}

type Refusal = { text: string; retiredRecipeId: string | null; from: "placement" | "swap" };

/**
 * EV-272 — the Swap sheet while `recipePlacementEnabled` is true: the coach's own
 * recipes first, the suggestions only when asked.
 *
 * Mounted per opening (the card keys it on the meal id), so the library is read fresh
 * each time — it is the coach's and may have changed in another tab — and a refusal
 * about one meal can never be shown against the next.
 *
 * ⚠ What opening sends (QA checks the log): ONE library read, and NO
 * `GET …/meals/{M}/swap` — not even for an empty library (R5). A locked meal sends
 * nothing at all (AC6). The suggestions are read on "Show suggestions", once.
 *
 * Every refusal stays in the OPEN sheet, on the list, with the query kept, so the coach
 * can choose again (EV-256e AC3, EV-272 AC4). The exceptions: `MEAL_CHANGED` closes,
 * says so and re-reads the week (edge case 6), and a 403 on the suggestions leaves for
 * the access-lost page, as the Swap always did.
 */
export function SwapSheet({
  clientId,
  firstName,
  target,
  onClose,
  onWeek,
  onMealChanged,
  onAccessEnded,
  onSwapFailed,
  onRefresh,
}: {
  clientId: string;
  firstName: string;
  target: SwapSheetTarget;
  onClose: () => void;
  /** A placement or a swap was written: the week the api answered with. */
  onWeek: (week: MealWeekView) => void;
  onMealChanged: () => void;
  onAccessEnded: () => void;
  /** A swap failed for a reason that is not the trainee's (today's `swapFailed`). */
  onSwapFailed: () => void;
  /** `router.refresh()` — an ended link redirects; a switched-off flag is re-read. */
  onRefresh: () => void;
}) {
  const [library, setLibrary] = useState<LibraryState>({ status: "loading" });
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<CoachRecipeSummary | null>(null);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  /** `null` until the coach asks (AC5); then loading; then the candidates. */
  const [suggestions, setSuggestions] = useState<"loading" | SwapCandidate[] | null>(null);
  const [pending, startTransition] = useTransition();
  const headingId = useId();
  /**
   * The refusal sits at the TOP of the sheet's scrolling body; a coach who chose a
   * suggestion at the bottom of a long list at 320 px would not see it. So it is
   * scrolled into view whenever a new one appears (staff review, EV-272).
   */
  const refusalRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (refusal) refusalRef.current?.scrollIntoView({ block: "nearest" });
  }, [refusal]);

  useEffect(() => {
    const read = target.library;
    if (!read) return; // AC6 — a locked meal: no request at all.
    let live = true;
    // Subscribing twice (StrictMode) is harmless: it is the same, single request.
    read.then((result) => {
      if (!live) return;
      setLibrary(result.ok ? { status: "ready", recipes: result.recipes } : { status: "failed" });
    });
    return () => {
      live = false;
    };
  }, [target.library]);

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
        onWeek(result.week);
        return;
      }
      const failure = result.failure;
      if (failure.code === "MEAL_CHANGED") {
        onMealChanged();
        return;
      }
      setChosen(null);
      if (failure.code === "ACCESS_DENIED") {
        /**
         * ONE 403 body covers "that recipe is not yours any more" (deleted in another
         * tab) and "the link ended" (the trainee revoked). So: refresh the page — an
         * ended link redirects to /clients/denied — and re-read the library, which is
         * the coach's own and answers regardless of the link. Only a list that no longer
         * holds the recipe earns `recipeGone` (edge case 1); otherwise the neutral one.
         */
        onRefresh();
        const fresh = await settled(recipeChoicesAction(), { ok: false, code: "FAILED" } as const);
        const gone = fresh.ok && !fresh.recipes.some((r) => r.id === recipe.id);
        if (fresh.ok) setLibrary({ status: "ready", recipes: fresh.recipes });
        setRefusal({
          text: gone ? copy.placement.recipeGone : copy.placement.accessDenied(firstName),
          retiredRecipeId: null,
          from: "placement",
        });
        return;
      }
      setRefusal({
        text: refusalSentence(failure, recipe.name, firstName, target.weekday),
        retiredRecipeId: failure.code === "RETIRED_INGREDIENT" ? recipe.id : null,
        from: "placement",
      });
      // Edge case 2: the flag was switched off after the page loaded. The refresh
      // re-reads it, so the NEXT opening is the flag-off sheet (AC1).
      if (failure.code === "PLACEMENT_OFF") onRefresh();
    });
  }

  async function showSuggestions() {
    setSuggestions("loading");
    const result = await settled(swapOptionsAction(clientId, target.mealId), {
      ok: false,
      code: "FAILED",
    } as const);
    if (!result.ok && result.code === "ACCESS_DENIED") {
      onAccessEnded();
      return;
    }
    setSuggestions(result.ok ? result.options.candidates : []);
  }

  function chooseSuggestion(candidateIndex: number) {
    startTransition(async () => {
      const result = await settled(applySwapAction(clientId, target.mealId, candidateIndex), {
        ok: false,
        code: "FAILED",
      } as const);
      if (!result.ok && (result.code === "MEAL_EATEN" || result.code === "MEAL_LOCKED")) {
        // EV-256e AC7 (BUG-245): the trainee owns this meal. Nothing was written.
        setRefusal({
          text:
            result.code === "MEAL_EATEN"
              ? copy.placement.mealEaten(firstName)
              : copy.placement.mealLocked(firstName),
          retiredRecipeId: null,
          from: "swap",
        });
        return;
      }
      if (!result.ok) {
        if (result.code === "ACCESS_DENIED") return void onAccessEnded();
        onSwapFailed();
        return;
      }
      onWeek(result.week);
    });
  }

  const shown = library.status === "ready" ? recipesFor(library.recipes, target.kcal, query) : [];

  const footer = chosen ? (
    <>
      <Button variant="secondary" onClick={() => setChosen(null)} disabled={pending}>
        {copy.swapSheet.cancel}
      </Button>
      <Button onClick={place} disabled={pending}>
        {pending ? copy.placement.placing : copy.swapSheet.confirm}
      </Button>
    </>
  ) : undefined;

  return (
    <Modal
      open
      onClose={() => !pending && onClose()}
      title={copy.nutrition.swapTitle}
      sub={<span title={target.mealName}>{truncateName(target.mealName)}</span>}
      icon="apple"
      width={520}
      footer={footer}
    >
      {target.locked ? (
        // AC6 — only the sentence: no search, no list, no suggestions, no request.
        <p
          data-testid="swap-locked"
          style={{ margin: 0, fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.55 }}
        >
          {copy.placement.mealLocked(firstName)}
        </p>
      ) : (
        <>
          {refusal && (
            <div
              ref={refusalRef}
              role="alert"
              data-testid={refusal.from === "swap" ? "swap-refusal" : "placement-refusal"}
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
            // AC4 — EV-256e's confirm, verbatim, naming the meal, the recipe and its day.
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
          ) : (
            <div style={{ display: "grid", gap: 18, minWidth: 0 }}>
              <RecipePicker
                library={library}
                shown={shown}
                query={query}
                onQuery={setQuery}
                onChoose={choose}
                disabled={pending}
              />
              <section
                aria-labelledby={headingId}
                data-testid="swap-suggestions-region"
                style={{
                  display: "grid",
                  gap: 10,
                  minWidth: 0,
                  paddingTop: 14,
                  borderTop: "1px solid var(--border)",
                }}
              >
                <h3
                  id={headingId}
                  style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--ink-2)" }}
                >
                  {copy.swapSheet.suggestions}
                </h3>
                {suggestions === null ? (
                  <div>
                    <Button variant="secondary" icon="refresh" onClick={showSuggestions} disabled={pending}>
                      {copy.swapSheet.showSuggestions}
                    </Button>
                  </div>
                ) : suggestions === "loading" ? (
                  <p role="status" style={{ margin: 0, fontSize: 13.5, color: "var(--ink-3)" }}>
                    {copy.nutrition.swapLoading}
                  </p>
                ) : suggestions.length === 0 ? (
                  <p style={{ margin: 0, fontSize: 13.5, color: "var(--ink-3)" }}>
                    {copy.nutrition.swapNone}
                  </p>
                ) : (
                  <div style={{ display: "grid", gap: 8 }}>
                    {suggestions.map((candidate) => (
                      <SuggestionRow
                        key={candidate.index}
                        candidate={candidate}
                        onChoose={chooseSuggestion}
                        pending={pending}
                      />
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
