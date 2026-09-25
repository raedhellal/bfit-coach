"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, CardHead, MIN_TOUCH_TARGET, Modal } from "@/components/ui/kit";
import { RecipePickerDialog, type PlacementTarget } from "@/components/nutrition/RecipePickerDialog";
import { copy } from "@/lib/copy";
import { firstName, formatDate, formatWeekday, truncateName } from "@/lib/format";
import {
  applySwapAction,
  applyWeekAction,
  regenerateDayAction,
  swapOptionsAction,
} from "@/lib/nutritionActions";
import { settled } from "@/lib/settled";
import type { MealWeekView, PlannedMealView, SwapCandidate } from "@/lib/coachApi";

/**
 * EV-256e AC5's n: this week's meals placed from a coach recipe that the trainee has
 * NOT locked — the ones an apply can replace. Eaten ones are kept too, but the coach
 * wire has no `eaten`, which is why the sentence says "up to".
 */
export function replaceableRecipeMeals(week: MealWeekView | null): number {
  if (!week) return 0;
  return week.days
    .flatMap((d) => d.meals)
    .filter((m) => m.provenance === "COACH_RECIPE" && !m.locked).length;
}

/** EV-256e AC4 — the marker, from the two served fields and nothing else. */
function RecipeMarker({ meal }: { meal: PlannedMealView }) {
  if (meal.provenance !== "COACH_RECIPE") return null;
  return meal.placedByYou === true ? (
    <Badge tone="blue" title={copy.placement.yourRecipeTitle}>
      {copy.placement.yourRecipe}
    </Badge>
  ) : (
    <Badge tone="purple" title={copy.placement.coachRecipeTitle}>
      {copy.placement.coachRecipe}
    </Badge>
  );
}

/**
 * EV-185b AC3 — the meal week.
 *
 * There is no "Publish" here and no disabled control pretending to be one. EV-185's
 * ruling is that slice 1 writes the trainee's LIVE week: `WeeklyMealPlanService`
 * generates straight into `weekly_meal_plan` and forking that five-table aggregate into
 * a staging copy is EV-092's work. So the control is "Apply to {trainee}", the confirm
 * dialog names the trainee and the week start, and it says — in the story's words —
 * that the trainee sees it straight away. Because they do.
 *
 * `weekStart` is always the api's `currentWeekStart`, echoed, never computed in the
 * browser: a Monday derived here would disagree with the server's for anyone whose
 * zone crosses the boundary, and the coach would meet COACH_WEEK_OUT_OF_RANGE with no
 * way to understand it (edge cases 3 and 5).
 *
 * The standing English-only line renders once, always: EV-015 locks the locale out of
 * meal generation and the exclusion policy runs on lowercased English ingredient
 * strings. A coach planning for a non-English-speaking trainee is entitled to know
 * that before they trust the allergy handling (this is EV-071/072's hole, stated
 * rather than hidden).
 */
export function NutritionWeekCard({
  clientId,
  traineeDisplayName,
  week: initialWeek,
  currentWeekStart,
  recipePlacementEnabled,
}: {
  clientId: string;
  traineeDisplayName: string;
  week: MealWeekView | null;
  currentWeekStart: string;
  /**
   * EV-256e AC1 — `CoachNutritionResponse.recipePlacementEnabled`, passed as
   * `=== true` by the page. False in production until EV-256f ships: then NO meal has
   * the action — hidden, not disabled, because a disabled control would advertise a
   * feature the trainee's app cannot yet show honestly.
   */
  recipePlacementEnabled: boolean;
}) {
  const router = useRouter();
  const [week, setWeek] = useState<MealWeekView | null>(initialWeek);
  /**
   * The server's week wins when it changes. `router.refresh()` re-renders the page with
   * a fresh `week` prop, and without this the card kept showing the week it was first
   * given — which is what edge case 6 needs NOT to happen: after a 404 the portal
   * "re-fetches the week", and a re-fetch the card ignores is no re-fetch.
   */
  const [seenInitial, setSeenInitial] = useState<MealWeekView | null>(initialWeek);
  if (initialWeek !== seenInitial) {
    setSeenInitial(initialWeek);
    setWeek(initialWeek);
  }
  const [confirming, setConfirming] = useState(false);
  const [swapping, setSwapping] = useState<{ mealId: string; mealName: string } | null>(null);
  const [candidates, setCandidates] = useState<SwapCandidate[] | null>(null);
  /** AC7 — a Swap refusal is shown IN the swap dialog, which stays open. */
  const [swapError, setSwapError] = useState<string | null>(null);
  const [placing, setPlacing] = useState<PlacementTarget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const trainee = truncateName(traineeDisplayName);
  const first = firstName(traineeDisplayName);
  const recipeMeals = replaceableRecipeMeals(week);

  /**
   * A write answered 403 — the link ended under the coach (the trainee revoked, in
   * their app, mid-session). ADR-0012 AC6 says the next request must be refused, and
   * `router.refresh()` makes one: the refresh re-runs `[id]/layout.tsx`, whose own
   * overview read now 403s, and the layout redirects to /clients/denied.
   *
   * Without it the card set an error sentence and the coach sat on a screen full of a
   * revoked trainee's meals — data they are no longer allowed to see — with every
   * control still offering to write to it. An in-card message cannot fix that, because
   * the fix is not a sentence, it is leaving the page.
   */
  function handleAccessEnded(): boolean {
    router.refresh();
    return true;
  }

  function applyWeek() {
    startTransition(async () => {
      // `settled` on every action in this card: a failed request resolves with
      // `undefined`, and an unguarded `result.ok` replaces the whole tab with the
      // error boundary instead of showing the sentence written for the failure.
      const result = await settled(applyWeekAction(clientId, currentWeekStart), {
        ok: false,
        code: "FAILED",
      } as const);
      setConfirming(false);
      if (!result.ok) {
        if (result.code === "ACCESS_DENIED") return void handleAccessEnded();
        setError(
          result.code === "WEEK_OUT_OF_RANGE"
            ? copy.nutrition.weekOutOfRange
            : result.code === "WEEK_RATE_LIMITED"
              ? copy.nutrition.weekRateLimited
              : copy.nutrition.applyFailed
        );
        return;
      }
      setError(null);
      setWeek(result.week);
      router.refresh();
    });
  }

  function regenerate(index: number) {
    startTransition(async () => {
      const result = await settled(regenerateDayAction(clientId, index), {
        ok: false,
        code: "FAILED",
      } as const);
      if (!result.ok) {
        if (result.code === "ACCESS_DENIED") return void handleAccessEnded();
        setError(copy.nutrition.regenerateFailed);
        return;
      }
      setError(null);
      setWeek(result.week);
      router.refresh();
    });
  }

  function openSwap(mealId: string, mealName: string) {
    setSwapping({ mealId, mealName });
    setCandidates(null);
    setSwapError(null);
    startTransition(async () => {
      const result = await settled(swapOptionsAction(clientId, mealId), {
        ok: false,
        code: "FAILED",
      } as const);
      if (!result.ok && result.code === "ACCESS_DENIED") {
        setSwapping(null);
        return void handleAccessEnded();
      }
      setCandidates(result.ok ? result.options.candidates : []);
    });
  }

  function chooseSwap(candidateIndex: number) {
    const target = swapping;
    if (!target) return;
    startTransition(async () => {
      const result = await settled(
        applySwapAction(clientId, target.mealId, candidateIndex),
        { ok: false, code: "FAILED" } as const
      );
      if (!result.ok && (result.code === "MEAL_EATEN" || result.code === "MEAL_LOCKED")) {
        // EV-256e AC7 (BUG-245): the trainee owns this meal. Nothing was written, so
        // the week on screen is left exactly as it is, and the sentence goes in the
        // dialog the coach is looking at.
        setSwapError(
          result.code === "MEAL_EATEN"
            ? copy.placement.mealEaten(first)
            : copy.placement.mealLocked(first)
        );
        return;
      }
      setSwapping(null);
      setCandidates(null);
      if (!result.ok) {
        if (result.code === "ACCESS_DENIED") return void handleAccessEnded();
        setError(copy.nutrition.swapFailed);
        return;
      }
      setError(null);
      setWeek(result.week);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHead
        title={copy.nutrition.weekTitle}
        icon="calendar"
        sub={copy.nutrition.weekOf(formatDate(week?.weekStart ?? currentWeekStart))}
        action={
          <Button icon="refresh" onClick={() => setConfirming(true)} disabled={pending}>
            {pending ? copy.nutrition.applying : copy.nutrition.apply(trainee)}
          </Button>
        }
      />

      {error && (
        <p role="alert" style={{ margin: "0 0 12px", fontSize: 13, color: "var(--err-ink)" }}>
          {error}
        </p>
      )}

      {!week ? (
        <p style={{ margin: 0, fontSize: 13.5, color: "var(--ink-3)" }}>
          {copy.nutrition.emptyBody}
        </p>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {week.days.map((day) => (
            <div
              key={day.index}
              style={{
                border: "1px solid var(--border)",
                borderRadius: "var(--r-lg)",
                padding: 12,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  marginBottom: 10,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <span
                    className="dt"
                    style={{ fontWeight: 700, fontSize: 14.5, color: "var(--ink)" }}
                  >
                    {formatWeekday(day.date)}
                  </span>
                  <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
                    {formatDate(day.date)}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  icon="refresh"
                  ariaLabel={`${copy.nutrition.regenerate}: ${formatWeekday(day.date)}`}
                  onClick={() => regenerate(day.index)}
                  disabled={pending}
                >
                  {copy.nutrition.regenerate}
                </Button>
              </div>

              {day.meals.length === 0 ? (
                <p style={{ margin: 0, fontSize: 13, color: "var(--ink-3)" }}>
                  {copy.nutrition.noMeals}
                </p>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {day.meals.map((meal) => (
                    <div
                      key={meal.mealId}
                      data-meal-id={meal.mealId}
                      role="group"
                      aria-label={`${formatWeekday(day.date)} ${
                        copy.nutrition.mealSlots[meal.slot] ?? meal.slot
                      }`}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 10,
                        flexWrap: "wrap",
                      }}
                    >
                      <div style={{ minWidth: 0, flex: "1 1 200px" }}>
                        {/* flex-wrap: a slot badge, a 40-character name and TWO markers
                            do not fit one line at 320 px (BUG-243's shape). */}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            flexWrap: "wrap",
                            minWidth: 0,
                          }}
                        >
                          <Badge tone="neutral">
                            {copy.nutrition.mealSlots[meal.slot] ?? meal.slot}
                          </Badge>
                          <span
                            title={meal.name}
                            style={{
                              fontSize: 13.5,
                              fontWeight: 600,
                              color: "var(--ink)",
                              overflowWrap: "anywhere",
                              minWidth: 0,
                            }}
                          >
                            {truncateName(meal.name)}
                          </span>
                          {/* D6.7: the trainee locked this one, so an apply kept it.
                              The confirm dialog promises exactly this; the marker is
                              what lets the coach check the promise against the week. */}
                          {meal.locked && (
                            <Badge tone="amber" title={copy.nutrition.mealKeptTitle}>
                              {copy.nutrition.mealKept}
                            </Badge>
                          )}
                          <RecipeMarker meal={meal} />
                        </div>
                        <div
                          className="tnum"
                          style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 3 }}
                        >
                          {copy.nutrition.macros(
                            meal.kcal,
                            meal.proteinG,
                            meal.carbsG,
                            meal.fatG
                          )}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <Button
                          variant="ghost"
                          size="sm"
                          icon="refresh"
                          ariaLabel={`${copy.nutrition.swap}: ${meal.name}`}
                          onClick={() => openSwap(meal.mealId, meal.name)}
                          disabled={pending}
                        >
                          {copy.nutrition.swap}
                        </Button>
                        {/* EV-256e AC1: only while the flag is on, and never on a meal
                            the trainee LOCKED — that one is theirs. An eaten meal DOES
                            get it: the coach wire has no `eaten`, so the api's 409 is
                            what tells the coach (AC3). */}
                        {recipePlacementEnabled && !meal.locked && (
                          <Button
                            variant="ghost"
                            size="sm"
                            icon="file"
                            ariaLabel={copy.placement.actionNamed(meal.name)}
                            onClick={() => {
                              setError(null);
                              setPlacing({
                                mealId: meal.mealId,
                                mealName: meal.name,
                                weekday: formatWeekday(day.date),
                              });
                            }}
                            disabled={pending}
                          >
                            {copy.placement.action}
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <p style={{ margin: "16px 0 0", fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.55 }}>
        {copy.nutrition.englishOnly}
      </p>
      {/* ADR-0015 D6: "Regenerate day" is free to the coach and capped on the
          TRAINEE's plan row, so the coach is spending someone else's allowance. The
          ADR's accept-and-disclose — the sentence is only shown where the control is. */}
      {week !== null && (
        <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.55 }}>
          {copy.nutrition.regenerateSharesLimit(trainee)}
        </p>
      )}
      {/*
        EV-201 AC5 — in the same region as the regeneration limit, under it, and NOT
        replacing it. Without it the page states a cost for one control and says nothing
        about the one next to it, so the safe read is that swapping costs the same.
        `applySwap` never touches the trainee's `regenCount` / `regenDate`; only
        `regenerateDay` does. Guarded on `week` for the same reason the line above is —
        edge case 4, a trainee with no meal week has no swap control to describe.
      */}
      {week !== null && (
        <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.55 }}>
          {copy.nutrition.swapIsFree(trainee)}
        </p>
      )}

      <Modal
        open={confirming}
        onClose={() => !pending && setConfirming(false)}
        title={copy.nutrition.applyTitle}
        icon="calendar"
        iconTone="amber"
        width={440}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)} disabled={pending}>
              {copy.nutrition.cancel}
            </Button>
            <Button onClick={applyWeek} disabled={pending}>
              {copy.nutrition.applyConfirm}
            </Button>
          </>
        }
      >
        {/* AC3: the dialog names the trainee AND the week start, and states that the
            trainee sees it immediately. */}
        <p style={{ margin: 0, fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.55 }}>
          {copy.nutrition.applyBody(trainee, formatDate(currentWeekStart))}
        </p>
        <p style={{ margin: "8px 0 0", fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.55 }}>
          {copy.nutrition.seesStraightAway(trainee)}
        </p>
        {/* ADR-0015 D6.7: the apply reuses the plan row and carries locked meals
            forward, so "replaces the week" is true of the row and false of every meal
            in it. The ADR asks the dialog to say so; a confirm that promised a clean
            replacement would be the dialog lying about what the button does. */}
        <p style={{ margin: "8px 0 0", fontSize: 13.5, color: "var(--ink-3)", lineHeight: 1.55 }}>
          {copy.nutrition.lockedMealsKept}
        </p>
        {/* EV-256e AC5 — only when the week holds a replaceable recipe meal. */}
        {recipeMeals >= 1 && (
          <p
            data-testid="apply-recipe-warning"
            style={{ margin: "8px 0 0", fontSize: 13.5, color: "var(--warn-ink)", lineHeight: 1.55 }}
          >
            {copy.placement.applyWarning(recipeMeals, first)}
          </p>
        )}
      </Modal>

      <Modal
        open={swapping !== null}
        onClose={() => !pending && setSwapping(null)}
        title={copy.nutrition.swapTitle}
        sub={swapping ? truncateName(swapping.mealName) : undefined}
        icon="apple"
        width={520}
      >
        {swapError && (
          <p
            role="alert"
            data-testid="swap-refusal"
            style={{ margin: "0 0 12px", fontSize: 13, color: "var(--err-ink)", lineHeight: 1.5 }}
          >
            {swapError}
          </p>
        )}
        {candidates === null ? (
          <p style={{ margin: 0, fontSize: 13.5, color: "var(--ink-3)" }}>
            {copy.nutrition.swapLoading}
          </p>
        ) : candidates.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13.5, color: "var(--ink-3)" }}>
            {copy.nutrition.swapNone}
          </p>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {candidates.map((candidate) => (
              <button
                key={candidate.index}
                type="button"
                onClick={() => chooseSwap(candidate.index)}
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
                  {copy.nutrition.macros(
                    candidate.kcal,
                    candidate.proteinG,
                    candidate.carbsG,
                    candidate.fatG
                  )}
                </span>
              </button>
            ))}
          </div>
        )}
      </Modal>

      {placing && (
        <RecipePickerDialog
          key={placing.mealId}
          clientId={clientId}
          firstName={first}
          target={placing}
          onClose={() => setPlacing(null)}
          onPlaced={(placed) => {
            setPlacing(null);
            setError(null);
            setWeek(placed);
            router.refresh();
          }}
          onMealChanged={() => {
            // Edge case 6: the meal is gone. Close, say so, and re-read the week.
            setPlacing(null);
            setError(copy.placement.mealChanged);
            router.refresh();
          }}
          onRefresh={() => router.refresh()}
        />
      )}
    </Card>
  );
}
