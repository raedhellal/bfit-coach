"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
  type TransitionStartFunction,
} from "react";
import { Button, Card, CardHead, MIN_TOUCH_TARGET } from "@/components/ui/kit";
import { TemplateUseConfirmDialog } from "@/components/nutritionTemplates/TemplateUseConfirmDialog";
import { useCopy } from "@/lib/i18n/client";
import { fullNameOf } from "@/lib/traineeName";
import { truncateName } from "@/lib/format";
import { useAdoptPrehydrationInput } from "@/lib/useAdoptPrehydrationInput";
import type { UseOutcome, UseOutcomeKind } from "@/lib/nutritionTemplateUse";
import type { NutritionTemplate } from "@/lib/coachApi";
import type { Copy } from "@/lib/copy";

/**
 * The apply button's label, "Apply to Inès Roux" — today's `nutrition.apply` (EV-337g2 G2.1).
 * Exported because a sentence elsewhere on the page sends the coach to this button by name
 * (`TemplateUseOutcome`'s WEEK_FAILED, PB-5 and G2.4), and must quote it exactly as it is
 * labelled here. Moved here from `NutritionWeekCard` with the button.
 */
export function weekApplyLabel(copy: Copy, traineeDisplayName: string | null): string {
  // BUG-714: a trainee with no name is "Apply to Unnamed client".
  return copy.nutrition.apply(truncateName(fullNameOf(traineeDisplayName, copy)));
}

/**
 * EV-337g2 — what the apply card shares with the two islands it is not part of.
 *
 * TODAY'S APPLY STAYS IN THE MEAL WEEK. `NutritionWeekCard` keeps `applyWeek`, its confirm
 * dialog and every outcome it draws (the error line, `week-generating`, the refusal block),
 * because G2.2 wants each of them "as at a862698" and the week card is where they are. Only
 * the BUTTON moved (G2.1: the page has exactly one apply control, in this card). So the
 * dialog's open state and the week card's transition live here, one level up, where the
 * button and the week card both read them: the button opens the week card's dialog, and it is
 * disabled and reads « Application… » while the week card is busy, exactly as it was in the
 * week card's head.
 *
 * THE TEMPLATE PATH LANDS HERE TOO. The library hands its outcome to this page through
 * `sessionStorage` and a navigation; on this page there is no navigation, so the outcome is
 * put here and `TemplateUseOutcome` shows it in place (G2.3: "on this page once"). Not written
 * to `sessionStorage`: a hand-off written now would be taken AGAIN by the next render of this
 * page within its two minutes and shown twice.
 *
 * ONE SLOT (EV-337g2-R2, G2.3d). The library's landing sentence is put in the same `outcome`
 * when `TemplateUseOutcome` takes it, so there is one sentence at a time: a template apply
 * here replaces it, and the next apply attempt that answers clears it (`clearOutcome`, called
 * by the week card's `applyWeek` once its answer is in). Cancelling a dialog is no attempt.
 * Once cleared, nothing puts it back: the hand-off was consumed when it was taken.
 *
 * `weekApplied` counts the template applies whose WEEK step landed on this page, so the week
 * card can do what its own successful apply does to its state (no refusal, no error, no cap
 * line: an apply writes the plan row with the day-regen counter at zero).
 */
/**
 * What the week card's one transition is running (fluidity batch 1, F1, 4c348b6). Set in the
 * click, before the transition starts, and read only together with `weekPending`.
 */
export type RunningAction =
  | { kind: "apply" }
  | { kind: "regenerate"; index: number }
  | { kind: "swapOptions" }
  | { kind: "swap" };

interface ApplyScope {
  weekPending: boolean;
  startWeekTransition: TransitionStartFunction;
  /** F1: which action `weekPending` is about, so the button says « Application… » for an apply only. */
  weekRunning: RunningAction | null;
  setWeekRunning: (running: RunningAction) => void;
  weekConfirming: boolean;
  setWeekConfirming: (open: boolean) => void;
  outcome: UseOutcome | null;
  showOutcome: (outcome: UseOutcome, weekApplied: boolean) => void;
  clearOutcome: () => void;
  weekApplied: number;
}

const ApplyScopeContext = createContext<ApplyScope | null>(null);

/** Wraps the nutrition page below its `h2`: the outcome, the cards and the meal week. */
export function NutritionApplyScope({ children }: { children: ReactNode }) {
  const [weekPending, startWeekTransition] = useTransition();
  const [weekRunning, setWeekRunning] = useState<RunningAction | null>(null);
  const [weekConfirming, setWeekConfirming] = useState(false);
  const [outcome, setOutcome] = useState<UseOutcome | null>(null);
  const [weekApplied, setWeekApplied] = useState(0);
  // Stable, so `TemplateUseOutcome`'s mount effect (which takes the library's hand-off once)
  // can name it as a dependency without running again on every render of the scope.
  const showOutcome = useCallback((next: UseOutcome, applied: boolean) => {
    setOutcome(next);
    if (applied) setWeekApplied((n) => n + 1);
  }, []);
  const clearOutcome = useCallback(() => setOutcome(null), []);
  const scope: ApplyScope = {
    weekPending,
    startWeekTransition,
    weekRunning,
    setWeekRunning,
    weekConfirming,
    setWeekConfirming,
    outcome,
    showOutcome,
    clearOutcome,
    weekApplied,
  };
  return <ApplyScopeContext.Provider value={scope}>{children}</ApplyScopeContext.Provider>;
}

/** For the islands that must sit inside the scope (the week card, the apply card). */
export function useApplyScope(): ApplyScope {
  const scope = useContext(ApplyScopeContext);
  if (!scope) throw new Error("EV-337g2: render this inside <NutritionApplyScope>.");
  return scope;
}

/**
 * Whether each outcome's TARGETS step landed, every kind classified by name (staff N1). A
 * `Record`, not a deny-list: a kind added to `UseOutcomeKind` is a type error here until
 * someone decides it, instead of silently counting as "landed" and resetting the selection.
 */
const TARGETS_LANDED: Record<UseOutcomeKind, boolean> = {
  APPLIED: true,
  WEEK_RATE_LIMITED: true,
  WEEK_GENERATING: true,
  WEEK_FAILED: true,
  WEEK_UNKNOWN: true,
  TARGETS_FAILED: false,
  TARGETS_UNKNOWN: false,
};

/**
 * The selection after an outcome (EV-337g2-R1, G2.3c). When the targets step LANDED (APPLIED and
 * every WEEK_* kind), the template's targets are now the current targets, and a template's week
 * step is the same week apply as today's (it carries no template), so what is left to do is
 * today's apply: back to the first option. When the targets step was refused or its answer was
 * lost (TARGETS_*), nothing known changed, and the selection still says what the coach asked for.
 */
export function targetsLanded(kind: UseOutcomeKind): boolean {
  return TARGETS_LANDED[kind];
}

/** The first option's value. A template's id is a UUID, so it can never collide. */
const CURRENT_TARGETS = "current-targets";
const TITLE_ID = "nutrition-apply-title";

/**
 * EV-337g2 G2.1 — « Appliquer à la semaine »: one card in the aside, under the targets card.
 *
 * One `select` (G2.1, ruling 17): « Ses objectifs actuels », then each of the coach's nutrition
 * templates by name, in the order the library lists them (the api's order, which the library
 * prints as served). The cost sentence is static and always shown, before any click; nothing
 * says whether today's apply is spent (G2.6: the portal cannot know before the click). The
 * button keeps today's label.
 *
 *   · current targets → the week card's own dialog and apply (G2.2), unchanged;
 *   · a template      → the library's confirm dialog and chain (G2.3), for this client, with
 *                       no picker; the outcome lands on this page (`ApplyScope`).
 *
 * `templates` is null when the list could not be read (G2.5): the first option alone, and the
 * library's own load-error sentence. An empty list is the first option alone and no sentence.
 */
export function NutritionApplyCard({
  clientId,
  traineeDisplayName,
  templates,
}: {
  clientId: string;
  traineeDisplayName: string | null;
  templates: NutritionTemplate[] | null;
}) {
  const copy = useCopy();
  const scope = useApplyScope();
  const [source, setSource] = useState<string>(CURRENT_TARGETS);
  /** The template whose dialog is open, or null. A new open is a new mount, so a new read. */
  const [using, setUsing] = useState<NutritionTemplate | null>(null);
  // A template chosen before hydration is the one the state holds (BUG-686's class).
  const root = useAdoptPrehydrationInput<HTMLElement>();
  /** The kit's `Button` takes no ref: its wrapper is how focus finds it again. */
  const buttonWrap = useRef<HTMLDivElement>(null);
  /** Set when a dialog opens from this button; focus returns to it once both are closed. */
  const returnFocus = useRef(false);

  // A template deleted elsewhere (another tab, then a revalidation) is no longer offered; the
  // selection falls back to the first option rather than pointing at nothing.
  const chosen = templates?.find((t) => t.id === source) ?? null;
  const value = chosen ? chosen.id : CURRENT_TARGETS;
  const dialogOpen = scope.weekConfirming || using !== null;
  // F1 (4c348b6): « Application… » only while the week is applied; a regenerate or a swap
  // shares the transition (so the button is disabled), but is not an apply.
  const applying = scope.weekPending && scope.weekRunning?.kind === "apply";

  useEffect(() => {
    if (dialogOpen || scope.weekPending || !returnFocus.current) return;
    returnFocus.current = false;
    buttonWrap.current?.querySelector("button")?.focus();
  }, [dialogOpen, scope.weekPending]);

  function press() {
    returnFocus.current = true;
    if (chosen) setUsing(chosen);
    else scope.setWeekConfirming(true);
  }

  return (
    // A named region, as the targets card is: the frame and a spec find it by its name.
    <section aria-labelledby={TITLE_ID} ref={root}>
      <Card style={{ marginBottom: 18 }}>
        <CardHead title={<span id={TITLE_ID}>{copy.nutrition.applyCardTitle}</span>} icon="calendar" />
        <label style={{ display: "block" }}>
          {/* Staff N4: a label holds phrasing content, so the caption is a block-styled span. */}
          <span
            style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--ink-2)", marginBottom: 6 }}
          >
            {copy.nutrition.applyFrom}
          </span>
          <select
            value={value}
            onChange={(e) => setSource(e.target.value)}
            style={{
              height: MIN_TOUCH_TARGET,
              width: "100%",
              minWidth: 0,
              maxWidth: "100%",
              borderRadius: "var(--r-md)",
              border: "1px solid var(--border-2)",
              background: "var(--surface)",
              color: "var(--ink)",
              fontSize: 14,
              padding: "0 10px",
            }}
          >
            <option value={CURRENT_TARGETS}>{copy.nutrition.applyFromTargets}</option>
            {(templates ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        {templates === null && (
          // Part of the page as it loads, like the food log's load error: no live region.
          <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--err-ink)", lineHeight: 1.5 }}>
            {copy.nutritionTemplates.loadError}
          </p>
        )}
        <p style={{ margin: "12px 0", fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.55 }}>
          {copy.nutrition.applyCost}
        </p>
        <div ref={buttonWrap}>
          <Button
            icon="refresh"
            onClick={press}
            disabled={scope.weekPending}
            style={{
              // BUG-252: a 40-character name wraps inside the button rather than scrolling the
              // page at 320 px; at least 44 px tall whatever it wraps to (as in the week's head).
              whiteSpace: "normal",
              height: "auto",
              minHeight: MIN_TOUCH_TARGET,
              maxWidth: "100%",
              paddingTop: 6,
              paddingBottom: 6,
            }}
          >
            {applying ? copy.nutrition.applying : weekApplyLabel(copy, traineeDisplayName)}
          </Button>
        </div>
      </Card>

      {using && (
        <TemplateUseConfirmDialog
          key={using.id}
          template={using}
          trainee={{ id: clientId, traineeDisplayName }}
          onClose={() => setUsing(null)}
          onLand={(kind, floorCalories) => {
            // The page under the dialog was re-rendered by each write's own revalidation, so
            // the targets card and the meal week already show what the api holds.
            scope.showOutcome(
              { clientId, template: using.name, kind, floorCalories, at: Date.now() },
              kind === "APPLIED"
            );
            if (targetsLanded(kind)) setSource(CURRENT_TARGETS);
            setUsing(null);
          }}
        />
      )}
    </section>
  );
}
