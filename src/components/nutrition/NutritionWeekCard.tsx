"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, CardHead, MIN_TOUCH_TARGET, Modal } from "@/components/ui/kit";
import {
  readLibrary,
  SuggestionRow,
  SwapSheet,
  type SwapSheetTarget,
} from "@/components/nutrition/SwapSheet";
import { useCopy } from "@/lib/i18n/client";
import { firstName, formatDate, formatWeekday, truncateName } from "@/lib/format";
import {
  applySwapAction,
  applyWeekAction,
  regenerateDayAction,
  swapOptionsAction,
} from "@/lib/nutritionActions";
import { settled } from "@/lib/settled";
import { logPortalEvent } from "@/lib/portalEvents";
import { hasEngineMeal, recipeShare } from "@/lib/recipeShare";
import type { MealWeekView, PlannedMealView, SwapCandidate } from "@/lib/coachApi";
import type { Copy } from "@/lib/copy";

/**
 * The week's apply button label, "Apply to Inès Roux" — exported because a sentence
 * elsewhere on the page sends the coach to this button by name (`TemplateUseOutcome`,
 * PB-5), and must quote it exactly as it is labelled here.
 */
export function weekApplyLabel(copy: Copy, traineeDisplayName: string): string {
  return copy.nutrition.apply(truncateName(traineeDisplayName));
}

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
  const copy = useCopy();
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
 * EV-071b ruling 2.3/2.4 — a 422 `NO_SAFE_MEAL_PLAN`, rendered as what it is: a refusal
 * for the trainee's safety, with nothing written. Not the error colour and not the error
 * sentence: the request was fine, and "could not be applied" sent coaches into retries.
 * Every line is a separate sentence the story fixes verbatim; nothing from the api's
 * body reaches it (its `message` is a fixed developer string).
 */
function RefusalBlock({ testId, lines }: { testId: string; lines: [string, ...string[]] }) {
  const [title, ...rest] = lines;
  return (
    <div
      role="alert"
      data-testid={testId}
      style={{
        margin: "0 0 12px",
        padding: "10px 12px",
        borderRadius: "var(--r-lg)",
        border: "1px solid var(--warn)",
        background: "var(--warn-bg)",
        fontSize: 13,
        lineHeight: 1.5,
        color: "var(--ink)",
      }}
    >
      <p style={{ margin: 0, fontWeight: 700 }}>{title}</p>
      {rest.map((line) => (
        <p key={line} style={{ margin: "4px 0 0", color: "var(--ink-2)" }}>
          {line}
        </p>
      ))}
    </div>
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
   * `=== true` by the page. False in production until EV-256f ships.
   *
   * EV-272: it decides which Swap sheet a meal opens. False → the sheet exactly as it
   * was (suggestions loaded at once, no recipes — AC1). True → `SwapSheet`, which opens
   * on the coach's own recipes and loads suggestions only when asked. There is no
   * second button either way (R1): "Use one of my recipes" is gone.
   */
  recipePlacementEnabled: boolean;
}) {
  const copy = useCopy();
  const router = useRouter();
  const [week, setWeek] = useState<MealWeekView | null>(initialWeek);
  /**
   * The server's week wins when it changes. A write's own render (its action calls
   * `revalidatePath`) or a `router.refresh()` re-renders the page with a fresh `week`
   * prop, and without this the card kept showing the week it was first given — which
   * is what edge case 6 needs NOT to happen: after a 404 the portal "re-fetches the
   * week", and a re-fetch the card ignores is no re-fetch.
   */
  const [seenInitial, setSeenInitial] = useState<MealWeekView | null>(initialWeek);
  const [confirming, setConfirming] = useState(false);
  const [swapping, setSwapping] = useState<{ mealId: string; mealName: string } | null>(null);
  /**
   * EV-272 — the flag-on sheet's meal. Separate from `swapping` (the flag-off sheet) and
   * decided when the sheet OPENS, so a flag switched off under an open sheet (edge case
   * 2, which refreshes the page) cannot swap one sheet for the other mid-choice.
   */
  const [recipeSwap, setRecipeSwap] = useState<SwapSheetTarget | null>(null);
  const [candidates, setCandidates] = useState<SwapCandidate[] | null>(null);
  /** AC7 — a Swap refusal is shown IN the swap dialog, which stays open. */
  const [swapError, setSwapError] = useState<string | null>(null);
  /**
   * EV-288 — the list on screen was replaced after a 409 `SWAP_OPTIONS_STALE`. A notice,
   * not a refusal: nothing is wrong, the coach just picks again from the current list.
   */
  const [swapNotice, setSwapNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /**
   * EV-071b — the last apply was refused (422 `NO_SAFE_MEAL_PLAN`). Cleared by the next
   * write that succeeds: after one, P1's "it hasn't been touched" is no longer true.
   */
  const [weekRefused, setWeekRefused] = useState(false);
  /** EV-071b ruling 2.4 — the index of the day whose regenerate was refused. */
  const [dayRefused, setDayRefused] = useState<number | null>(null);
  /**
   * EV-242b — 429 `COACH_DAY_REGEN_LIMIT`. Every Regenerate stays disabled for the rest
   * of this page: each would meet the same 429 until the cap resets, and the api sends
   * no reset instant to re-enable them at. A reload re-asks the api.
   */
  const [regenCapped, setRegenCapped] = useState(false);
  /**
   * 409 `WEEK_GENERATION_IN_PROGRESS` on the last apply (ADR-0030): the trainee's own
   * generation of this week is still running. A warning, not the error line: nothing was
   * changed and the api released today's apply, so the sentence says to retry later.
   * Replaced by the next apply's answer, and cleared by any write that succeeds.
   */
  const [weekGenerating, setWeekGenerating] = useState(false);
  const [pending, startTransition] = useTransition();
  // Below the refusal state on purpose: it clears them, so it must run after they exist.
  if (initialWeek !== seenInitial) {
    setSeenInitial(initialWeek);
    setWeek(initialWeek);
    // A different week from the server: no refusal on screen still describes it. The cap
    // is NOT cleared here — a swap refreshes the week and leaves the trainee's counter.
    setWeekRefused(false);
    setDayRefused(null);
    setWeekGenerating(false);
  }

  const trainee = truncateName(traineeDisplayName);
  const first = firstName(traineeDisplayName, copy.locale);
  const recipeMeals = replaceableRecipeMeals(week);
  const share = recipeShare(week);

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

  /** A write succeeded: no refusal on screen still describes the week. */
  function clearRefusals() {
    setWeekRefused(false);
    setDayRefused(null);
    setWeekGenerating(false);
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
      // Each apply's answer replaces the last one's: only the branch below sets it again.
      setWeekGenerating(false);
      if (!result.ok) {
        if (result.code === "ACCESS_DENIED") return void handleAccessEnded();
        if (result.code === "WEEK_GENERATING") {
          // Nothing was written, so the week on screen stays exactly as it is.
          setError(null);
          setWeekRefused(false);
          setWeekGenerating(true);
          return;
        }
        if (result.code === "NO_SAFE_MEAL_PLAN") {
          // Nothing was written (openapi: "a coach's refusal is a non-event for that
          // week"), so the week on screen is left exactly as it is, under the block.
          setError(null);
          setDayRefused(null);
          setWeekRefused(true);
          return;
        }
        setWeekRefused(false);
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
      clearRefusals();
      // The apply writes a new week row with the trainee's day-regen counter at zero
      // (WeeklyMealPlanService's week save: regenDate null, regenCount 0), so the cap
      // line and the disabled Regenerate buttons would now be false.
      setRegenCapped(false);
      // The action's week, painted now. No `router.refresh()` (ADR-0033 branch 2a):
      // `applyWeekAction` revalidates, so its response already re-rendered the page and
      // the new `week` prop runs the reset above — one render, where the refresh made two.
      setWeek(result.week);
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
        if (result.code === "NO_SAFE_MEAL_PLAN") {
          setError(null);
          setDayRefused(index);
          return;
        }
        setDayRefused(null);
        if (result.code === "DAY_REGEN_CAPPED") {
          setError(null);
          setRegenCapped(true);
          logPortalEvent({ event: "coach_day_regen_capped" });
          return;
        }
        setError(copy.nutrition.regenerateFailed);
        return;
      }
      setError(null);
      clearRefusals();
      // No refresh: `regenerateDayAction` revalidates (see `applyWeek`).
      setWeek(result.week);
    });
  }

  function openSwap(mealId: string, mealName: string) {
    setSwapping({ mealId, mealName });
    setCandidates(null);
    setSwapError(null);
    setSwapNotice(null);
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

  /** EV-272 — flag on: open on the coach's recipes. Nothing is requested here. */
  function openRecipeSwap(meal: PlannedMealView, weekday: string) {
    setError(null);
    setRecipeSwap({
      mealId: meal.mealId,
      mealName: meal.name,
      weekday,
      kcal: meal.kcal,
      locked: meal.locked,
      // BUG-537: what the meal holds now, so the recipe matching it is marked « On this meal ».
      current: meal,
      // AC2: ONE library read per opening, sent from this click; AC6: none when locked.
      library: meal.locked ? null : readLibrary(),
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
      if (!result.ok && result.code === "SWAP_OPTIONS_STALE") {
        /**
         * EV-288 (BUG-271, ADR-0028 §4.3b): the list this coach chose from is not the
         * server's any more (the trainee, or another tab, swapped this meal meanwhile).
         * Nothing was written. The dialog stays open, the options are read ONCE more
         * and shown with the line. The apply is NOT retried: the coach picks again from
         * what they can see, which is the whole point of the api refusing.
         */
        setSwapError(null);
        setSwapNotice(null);
        setCandidates(null);
        const fresh = await settled(swapOptionsAction(clientId, target.mealId), {
          ok: false,
          code: "FAILED",
        } as const);
        if (!fresh.ok && fresh.code === "ACCESS_DENIED") {
          setSwapping(null);
          return void handleAccessEnded();
        }
        // Edge case 1: the re-read failed → today's options-error state, and no line
        // pointing at "current ones" that are not there.
        setCandidates(fresh.ok ? fresh.options.candidates : []);
        if (fresh.ok) setSwapNotice(copy.nutrition.swapOptionsChanged);
        return;
      }
      setSwapNotice(null);
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
      clearRefusals();
      // No refresh: `applySwapAction` revalidates (see `applyWeek`).
      setWeek(result.week);
    });
  }

  return (
    <Card>
      <CardHead
        title={copy.nutrition.weekTitle}
        icon="calendar"
        sub={copy.nutrition.weekOf(formatDate(week?.weekStart ?? currentWeekStart, copy.locale))}
        // BUG-252's second leaf: "Appliquer à Lina M." is a nowrap button that pushed the
        // page 17 px sideways at 320 px in French once the activity badge stopped doing so.
        // The head wraps, so the button drops under the title when the two do not fit, and
        // the label may wrap inside the button: a 40-character name ("Apply to …", 393 px)
        // overflowed every phone width even on a line of its own. Height stays >= 44 px.
        style={{ flexWrap: "wrap" }}
        action={
          <Button
            icon="refresh"
            onClick={() => setConfirming(true)}
            disabled={pending}
            style={{
              whiteSpace: "normal",
              height: "auto",
              minHeight: MIN_TOUCH_TARGET,
              maxWidth: "100%",
              paddingTop: 6,
              paddingBottom: 6,
            }}
          >
            {pending ? copy.nutrition.applying : weekApplyLabel(copy, traineeDisplayName)}
          </Button>
        }
      />

      {/*
        EV-320 AC17 — one line: how much of the week comes from this coach's recipes. Hidden
        while recipe placement is off (`recipePlacementEnabled`, the only flag the coach wire
        serves; the fill flag is not on it), when there is no week to count, and on any week
        that is not ACTIVE: a REFUSED week keeps only the eaten meals and a GENERATING one is
        unfinished, so "0 of 3" there would describe a week that is not the plan. A zero is
        shown ("0 of 28"): it is the true answer after an engine-only apply (edge case 1).
        A status region, so the new count is announced after Apply.
      */}
      {recipePlacementEnabled === true && week?.status === "ACTIVE" && share.totalMeals > 0 && (
        <p
          role="status"
          data-testid="recipe-share"
          data-recipe-meals={share.recipeMeals}
          data-total-meals={share.totalMeals}
          style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 600, color: "var(--ink-2)", lineHeight: 1.5 }}
        >
          {share.recipeMeals === share.totalMeals
            ? copy.nutrition.recipeShareAll
            : copy.nutrition.recipeShare(share.recipeMeals, share.totalMeals)}
        </p>
      )}

      {error && (
        <p role="alert" style={{ margin: "0 0 12px", fontSize: 13, color: "var(--err-ink)" }}>
          {error}
        </p>
      )}

      {weekGenerating && (
        <p
          role="alert"
          data-testid="week-generating"
          style={{ margin: "0 0 12px", fontSize: 13, color: "var(--warn-ink)", lineHeight: 1.5 }}
        >
          {copy.nutrition.weekGenerating(first)}
        </p>
      )}

      {regenCapped && week !== null && (
        <p
          role="alert"
          data-testid="day-regen-capped"
          style={{ margin: "0 0 12px", fontSize: 13, color: "var(--warn-ink)", lineHeight: 1.5 }}
        >
          {copy.nutrition.dayRegenCapped(trainee, first)}
        </p>
      )}

      {/* EV-071b ruling 2.2: placement follows what exists. A week on screen stays fully
          rendered under the block (P1); with none, the block stands in for it (P2). */}
      {weekRefused && (
        <RefusalBlock
          testId="week-refusal"
          lines={[
            copy.nutrition.weekRefusedTitle(first),
            copy.nutrition.weekRefusedBody,
            week ? copy.nutrition.weekRefusedKept(first) : copy.nutrition.weekRefusedNoWeek(first),
            copy.nutrition.refusedAskThem(first),
          ]}
        />
      )}

      {!week ? (
        weekRefused ? null : (
          <p style={{ margin: 0, fontSize: 13.5, color: "var(--ink-3)" }}>
            {copy.nutrition.emptyBody}
          </p>
        )
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
                    {formatWeekday(day.date, copy.locale)}
                  </span>
                  <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
                    {formatDate(day.date, copy.locale)}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  icon="refresh"
                  ariaLabel={copy.common.labelled(copy.nutrition.regenerate, formatWeekday(day.date, copy.locale))}
                  onClick={() => regenerate(day.index)}
                  disabled={pending || regenCapped}
                >
                  {copy.nutrition.regenerate}
                </Button>
              </div>

              {/* EV-071b ruling 2.4 — in the refused day's own card, its meals left under it. */}
              {dayRefused === day.index && (
                <RefusalBlock
                  testId="day-refusal"
                  lines={[
                    copy.nutrition.dayRefusedTitle(formatWeekday(day.date, copy.locale), first),
                    copy.nutrition.dayRefusedBody,
                    copy.nutrition.dayRefusedKept(formatWeekday(day.date, copy.locale)),
                    copy.nutrition.refusedAskThem(first),
                  ]}
                />
              )}

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
                      aria-label={`${formatWeekday(day.date, copy.locale)} ${
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
                          ariaLabel={copy.common.labelled(copy.nutrition.swap, meal.name)}
                          onClick={() =>
                            recipePlacementEnabled
                              ? openRecipeSwap(meal, formatWeekday(day.date, copy.locale))
                              : openSwap(meal.mealId, meal.name)
                          }
                          disabled={pending}
                        >
                          {copy.nutrition.swap}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/*
        EV-185 AC3's English-only note, shown only while the week holds at least one ENGINE
        meal (Raed, 2026-09-30): on a week that is all coach recipes, the text on screen is
        the coaches' own and the note would be false — right under AC17's "whole week" line.
        See `hasEngineMeal` for why any coach's recipe counts, not only this coach's.
      */}
      {hasEngineMeal(week) && (
        <p
          data-testid="english-only-note"
          style={{ margin: "16px 0 0", fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.55 }}
        >
          {copy.nutrition.englishOnly}
        </p>
      )}
      {/* ADR-0015 D6: "Regenerate day" is free to the coach and capped on the
          TRAINEE's plan row, so the coach is spending someone else's allowance. The
          ADR's accept-and-disclose — the sentence is only shown where the control is. */}
      {week !== null && (
        // First of the footer lines when the English-only note above is hidden: it takes
        // the note's 16 px gap from the week.
        <p
          style={{
            margin: `${hasEngineMeal(week) ? 6 : 16}px 0 0`,
            fontSize: 12.5,
            color: "var(--ink-3)",
            lineHeight: 1.55,
          }}
        >
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
        dirty={false}
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
          {copy.nutrition.applyBody(trainee, formatDate(currentWeekStart, copy.locale))}
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
        dirty={false}
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
        {swapNotice && (
          <p
            role="status"
            data-testid="swap-options-changed"
            style={{ margin: "0 0 12px", fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5 }}
          >
            {swapNotice}
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
              <SuggestionRow
                key={candidate.index}
                candidate={candidate}
                onChoose={chooseSwap}
                pending={pending}
              />
            ))}
          </div>
        )}
      </Modal>

      {recipeSwap && (
        <SwapSheet
          key={recipeSwap.mealId}
          clientId={clientId}
          firstName={first}
          target={recipeSwap}
          onClose={() => setRecipeSwap(null)}
          onWeek={(next) => {
            setRecipeSwap(null);
            setError(null);
            clearRefusals();
            // No refresh: both writes behind `onWeek` (`placeRecipeAction`,
            // `applySwapAction`) revalidate, so the page was re-rendered with the action.
            setWeek(next);
          }}
          onMealChanged={() => {
            // EV-256e edge case 6: the meal is gone. Close, say so, re-read the week.
            setRecipeSwap(null);
            setError(copy.placement.mealChanged);
            router.refresh();
          }}
          onAccessEnded={() => {
            setRecipeSwap(null);
            handleAccessEnded();
          }}
          onSwapFailed={() => {
            setRecipeSwap(null);
            setError(copy.nutrition.swapFailed);
          }}
          onRefresh={() => router.refresh()}
        />
      )}
    </Card>
  );
}
