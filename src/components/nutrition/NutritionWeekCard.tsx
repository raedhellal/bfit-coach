"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, CardHead, MIN_TOUCH_TARGET, Modal } from "@/components/ui/kit";
import { copy } from "@/lib/copy";
import { formatDate, formatWeekday, truncateName } from "@/lib/format";
import {
  applySwapAction,
  applyWeekAction,
  regenerateDayAction,
  swapOptionsAction,
} from "@/lib/nutritionActions";
import { settled } from "@/lib/settled";
import type { MealWeekView, SwapCandidate } from "@/lib/coachApi";

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
}: {
  clientId: string;
  traineeDisplayName: string;
  week: MealWeekView | null;
  currentWeekStart: string;
}) {
  const router = useRouter();
  const [week, setWeek] = useState<MealWeekView | null>(initialWeek);
  const [confirming, setConfirming] = useState(false);
  const [swapping, setSwapping] = useState<{ mealId: string; mealName: string } | null>(null);
  const [candidates, setCandidates] = useState<SwapCandidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const trainee = truncateName(traineeDisplayName);

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
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 10,
                        flexWrap: "wrap",
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <Badge tone="neutral">
                            {copy.nutrition.mealSlots[meal.slot] ?? meal.slot}
                          </Badge>
                          <span
                            title={meal.name}
                            style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}
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
      </Modal>

      <Modal
        open={swapping !== null}
        onClose={() => !pending && setSwapping(null)}
        title={copy.nutrition.swapTitle}
        sub={swapping ? truncateName(swapping.mealName) : undefined}
        icon="apple"
        width={520}
      >
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
    </Card>
  );
}
