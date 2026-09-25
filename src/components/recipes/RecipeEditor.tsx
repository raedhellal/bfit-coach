"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Input, MIN_TOUCH_TARGET, Modal } from "@/components/ui/kit";
import { copy } from "@/lib/copy";
import {
  MACRO_FIELDS,
  MAX_INGREDIENTS,
  MAX_STEPS,
  SEARCH_MAX,
  UNITS,
  forSave,
  ingredientAddress,
  localProblems,
  serverProblem,
  stepAddress,
  type FieldAddress,
  type IngredientLine,
  type MacroField,
  type Problem,
  type RecipeDraft,
} from "@/lib/recipeDocument";
import {
  createRecipeAction,
  searchIngredientsAction,
  updateRecipeAction,
} from "@/lib/recipeActions";
import { settled } from "@/lib/settled";
import { useUnsavedChanges } from "@/lib/useUnsavedChanges";
import type { CoachIngredientOption, RecipeUnit } from "@/lib/coachApi";

/**
 * EV-256b AC2/AC4/AC6 — the recipe editor.
 *
 * ═══ THE FOUR RULES THIS ISLAND HOLDS ═════════════════════════════════════════
 *
 * 1. **An ingredient enters ONLY by picking a search result** (AC2). There is no free-
 *    text path: the search box filters the api's vocabulary and a line is created from
 *    the RESULT the coach presses, carrying the result's own `key`. Enter in the search
 *    box does nothing. So "the coach cannot submit an ingredient that was not picked"
 *    is a property of the data flow, not a validation that could be bypassed — the
 *    `CatalogPicker` rule, applied to food.
 * 2. **Every refusal is shown next to its field, and nothing the coach typed is lost**
 *    (AC4). Local checks and server refusals are both `Problem`s addressed to a control
 *    (`src/lib/recipeDocument.ts`). A failed save changes no value in the form.
 * 3. **The portal refuses first only where it can know the answer.** Bounds, whole
 *    numbers and the name length (in the api's own counting unit) are checked here and
 *    disable Save with the reason beside the field. The name collision, the cap, a
 *    retired key and the macro consistency rule are the server's to answer.
 * 4. **No autosave; the unsaved-changes guard holds the work** — the template editor's
 *    arrangement, for the template editor's reason: a coach typing a recipe is holding
 *    state the server does not have.
 */

const MACRO_LABELS: Record<MacroField, string> = {
  kcal: copy.recipes.kcalLabel,
  proteinG: copy.recipes.proteinLabel,
  carbsG: copy.recipes.carbsLabel,
  fatG: copy.recipes.fatLabel,
};

const FIELD = {
  height: MIN_TOUCH_TARGET,
  width: "100%",
  minWidth: 0,
  borderRadius: "var(--r-md)",
  border: "1px solid var(--border-2)",
  background: "var(--surface)",
  padding: "0 10px",
  fontFamily: "var(--font-body)",
  fontSize: 14,
  color: "var(--ink)",
} as const;

const LABEL = { fontSize: 12, fontWeight: 600, color: "var(--ink-2)", marginBottom: 5 } as const;

export function RecipeEditor({
  recipeId: initialRecipeId,
  initial,
  unknownKeys = [],
}: {
  /** Null for "New recipe": the first successful save is a POST. */
  recipeId: string | null;
  initial: RecipeDraft;
  /** `CoachRecipeResponse.unknownKeys` — lines whose key the api has since retired. */
  unknownKeys?: string[];
}) {
  const router = useRouter();
  const [recipeId, setRecipeId] = useState<string | null>(initialRecipeId);
  const [draft, setDraft] = useState<RecipeDraft>(initial);
  const [dirty, setDirty] = useState(false);
  /** The server's refusals from the LAST save, each addressed to a control. */
  const [refused, setRefused] = useState<Problem[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const leaving = useUnsavedChanges(dirty);
  /** The line to focus once it has rendered — the one the coach just picked. */
  const [focusLine, setFocusLine] = useState<number | null>(null);

  const local = localProblems(draft);
  const saveable = local.length === 0;

  /**
   * An edit clears the server refusals ABOUT WHAT CHANGED, and nothing else: a coach
   * who fixes the name must not lose the macro sentence they have not dealt with yet.
   * Any edit clears the form-level one, which is about the attempt, not a field.
   */
  function edit(next: RecipeDraft, touched: (address: FieldAddress) => boolean) {
    setDraft(next);
    setDirty(true);
    setNotice(null);
    setRefused((current) => current.filter((p) => p.at !== "form" && !touched(p.at)));
  }
  const isLine = (address: FieldAddress) => address === "ingredients" || address.startsWith("ingredients.");
  const isStep = (address: FieldAddress) => address === "steps" || address.startsWith("steps.");

  function setLine(index: number, change: Partial<IngredientLine>) {
    edit(
      { ...draft, ingredients: draft.ingredients.map((l, i) => (i === index ? { ...l, ...change } : l)) },
      (address) => address === ingredientAddress(index)
    );
  }
  /*
   * While a save is in flight, the controls that ADD or REMOVE a line or a step are
   * disabled (`pending`): the server addresses a refusal by the INDEX it was sent
   * (`ingredients[2].key`, `steps[1]`), so a line removed mid-flight would put the
   * refusal on its neighbour. Typing into an existing field shifts no index and stays
   * open.
   */
  function removeLine(index: number) {
    // Removing a line renumbers the ones after it, so every per-line refusal is stale.
    edit({ ...draft, ingredients: draft.ingredients.filter((_, i) => i !== index) }, isLine);
  }
  function pick(option: CoachIngredientOption) {
    if (draft.ingredients.length >= MAX_INGREDIENTS) return;
    if (draft.ingredients.some((l) => l.key === option.key)) return;
    const index = draft.ingredients.length;
    edit(
      {
        ...draft,
        // The quantity starts EMPTY: a default of 100 g would be a number nobody chose.
        ingredients: [...draft.ingredients, { key: option.key, label: option.label, quantity: "", unit: "g" }],
      },
      isLine
    );
    setFocusLine(index);
  }
  useEffect(() => {
    if (focusLine === null) return;
    document
      .querySelector<HTMLInputElement>(`[data-field="${ingredientAddress(focusLine)}"] input`)
      ?.focus();
    setFocusLine(null);
  }, [focusLine]);

  function setMacro(field: MacroField, value: string) {
    edit({ ...draft, [field]: value }, (address) => address === field || address === "macros");
  }

  function setStep(index: number, value: string) {
    // A pasted multi-line step becomes one line, visibly: the api refuses a line break
    // in a step, and splitting it into several steps would be a decision nobody made.
    const oneLine = value.replace(/\r\n|[\r\n]/g, " ");
    edit(
      { ...draft, steps: draft.steps.map((s, i) => (i === index ? oneLine : s)) },
      (address) => address === stepAddress(index)
    );
  }

  function save() {
    if (!saveable || pending) return;
    const body = forSave(draft);
    const sentLines = draft.ingredients.map((l) => ({ key: l.key, label: l.label }));
    startTransition(async () => {
      const result = await settled(
        recipeId ? updateRecipeAction(recipeId, body) : createRecipeAction(body),
        { ok: false, failure: { code: "FAILED", field: null, key: null, computedKcal: null } } as const
      );
      if (!result.ok) {
        // AC4 — addressed and shown; the form keeps everything the coach typed, and the
        // unsaved flag stands because the server still does not have this recipe.
        setNotice(null);
        setRefused([serverProblem(result.failure, { kcal: body.kcal, ingredients: sentLines })]);
        return;
      }
      setRefused([]);
      setNotice(copy.recipes.saved);
      setDirty(false);
      if (recipeId === null) {
        /**
         * A create becomes an edit WITHOUT a router navigation — the template editor's
         * lesson: `router.replace` unmounts this island and destroys the confirmation.
         * The guard's sentinel is released first, then the URL is corrected, so a reload
         * lands on `/recipes/{id}` and cannot create a second recipe.
         */
        const id = result.recipe.id;
        leaving.release(() => {
          setRecipeId(id);
          window.history.replaceState(window.history.state, "", `/recipes/${id}`);
        });
        return;
      }
      leaving.release(() => router.refresh());
    });
  }

  /** The one message shown at an address: the server's refusal wins over the local one. */
  function problemAt(address: FieldAddress): Problem | null {
    return refused.find((p) => p.at === address) ?? local.find((p) => p.at === address) ?? null;
  }

  const full = draft.ingredients.length >= MAX_INGREDIENTS;
  const formProblem = refused.find((p) => p.at === "form") ?? null;

  return (
    <div>
      {recipeId !== null && (
        // AC6, verbatim, above the form — on an existing recipe only, and on a new one
        // from the moment its first save made it one.
        <p
          style={{
            margin: "0 0 14px",
            padding: "10px 12px",
            borderRadius: "var(--r-lg)",
            background: "var(--surface-2)",
            fontSize: 13,
            color: "var(--ink-2)",
            lineHeight: 1.5,
          }}
        >
          {copy.recipes.futureUsesOnly}
        </p>
      )}

      {/* ── name ─────────────────────────────────────────────────────────── */}
      <Card style={{ marginBottom: 16 }}>
        <div
          style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}
        >
          <div data-field="name" style={{ minWidth: 0, flex: "1 1 260px" }}>
            <label style={{ display: "block" }}>
              <div style={LABEL}>{copy.recipes.nameLabel}</div>
              <input
                value={draft.name}
                title={draft.name}
                aria-invalid={isError(problemAt("name")) || undefined}
                onChange={(e) =>
                  edit({ ...draft, name: e.target.value }, (address) => address === "name")
                }
                style={{ ...FIELD, maxWidth: 420, fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 700 }}
              />
            </label>
            <FieldMessage problem={problemAt("name")} />
          </div>
          {dirty && <Badge tone="red">{copy.recipes.unsavedBadge}</Badge>}
        </div>
      </Card>

      {/* ── ingredients ──────────────────────────────────────────────────── */}
      <Card style={{ marginBottom: 16 }}>
        <div data-field="ingredients">
          <h2 className="dt" style={{ margin: 0, fontSize: 15.5, fontWeight: 600, color: "var(--ink)" }}>
            {copy.recipes.ingredientsHeading}
          </h2>
          <p style={{ margin: "6px 0 12px", fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.55 }}>
            {copy.recipes.ingredientsNote}
          </p>

          {draft.ingredients.length > 0 && (
            <ul style={{ listStyle: "none", margin: "0 0 12px", padding: 0, display: "grid", gap: 10 }}>
              {draft.ingredients.map((line, index) => (
                // Keyed on the KEY: it is unique within a recipe (the api refuses a key
                // twice) and is never edited, so a line never remounts under the coach.
                <li key={line.key}>
                  <IngredientRow
                    line={line}
                    index={index}
                    retired={unknownKeys.includes(line.key)}
                    problem={problemAt(ingredientAddress(index))}
                    onQuantity={(quantity) => setLine(index, { quantity })}
                    onUnit={(unit) => setLine(index, { unit })}
                    onRemove={() => removeLine(index)}
                    locked={pending}
                  />
                </li>
              ))}
            </ul>
          )}

          {full ? (
            <p style={{ margin: 0, fontSize: 12.5, color: "var(--ink-3)" }}>{copy.recipes.ingredientsFull}</p>
          ) : (
            <IngredientSearch picked={draft.ingredients.map((l) => l.key)} onPick={pick} locked={pending} />
          )}
          <FieldMessage problem={problemAt("ingredients")} />
        </div>
      </Card>

      {/* ── macros ───────────────────────────────────────────────────────── */}
      <Card style={{ marginBottom: 16 }}>
        <div role="group" aria-label={copy.recipes.macrosHeading} data-field="macros">
          <h2 className="dt" style={{ margin: "0 0 12px", fontSize: 15.5, fontWeight: 600, color: "var(--ink)" }}>
            {copy.recipes.macrosHeading}
          </h2>
          <div className="recipe-macros">
            {MACRO_FIELDS.map((field) => (
              <div key={field} data-field={field} style={{ minWidth: 0 }}>
                <label style={{ display: "block" }}>
                  <div style={LABEL}>{MACRO_LABELS[field]}</div>
                  <input
                    inputMode="numeric"
                    value={draft[field]}
                    aria-invalid={isError(problemAt(field)) || undefined}
                    onChange={(e) => setMacro(field, e.target.value)}
                    style={FIELD}
                  />
                </label>
                <FieldMessage problem={problemAt(field)} />
              </div>
            ))}
          </div>
          <FieldMessage problem={problemAt("macros")} />
        </div>
      </Card>

      {/* ── steps ────────────────────────────────────────────────────────── */}
      <Card style={{ marginBottom: 16 }}>
        <div data-field="steps">
          <h2 className="dt" style={{ margin: 0, fontSize: 15.5, fontWeight: 600, color: "var(--ink)" }}>
            {copy.recipes.stepsHeading}
          </h2>
          <p style={{ margin: "6px 0 12px", fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.55 }}>
            {copy.recipes.stepsNote}
          </p>
          {draft.steps.length > 0 && (
            <ol style={{ listStyle: "none", margin: "0 0 12px", padding: 0, display: "grid", gap: 10 }}>
              {draft.steps.map((step, index) => (
                // Keyed on POSITION: a step's text is what the coach edits, so a
                // text-derived key would remount the textarea on every keystroke.
                <li key={index}>
                  <div role="group" aria-label={copy.recipes.stepLabel(index + 1)} data-field={stepAddress(index)}>
                    <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                      <label style={{ display: "block", flex: "1 1 auto", minWidth: 0 }}>
                        <div style={LABEL}>{copy.recipes.stepLabel(index + 1)}</div>
                        <textarea
                          value={step}
                          rows={2}
                          aria-invalid={isError(problemAt(stepAddress(index))) || undefined}
                          onChange={(e) => setStep(index, e.target.value)}
                          onKeyDown={(e) => {
                            // One step is one line (the api refuses a line break).
                            if (e.key === "Enter") e.preventDefault();
                          }}
                          style={{
                            ...FIELD,
                            height: "auto",
                            minHeight: MIN_TOUCH_TARGET,
                            padding: "10px",
                            resize: "vertical",
                          }}
                        />
                      </label>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon="x"
                        ariaLabel={copy.recipes.removeStepNamed(index + 1)}
                        disabled={pending}
                        onClick={() => edit({ ...draft, steps: draft.steps.filter((_, i) => i !== index) }, isStep)}
                        style={{ marginTop: 22 }}
                      >
                        {copy.recipes.removeStep}
                      </Button>
                    </div>
                    <FieldMessage problem={problemAt(stepAddress(index))} />
                  </div>
                </li>
              ))}
            </ol>
          )}
          <Button
            variant="soft"
            icon="plus"
            disabled={pending || draft.steps.length >= MAX_STEPS}
            title={draft.steps.length >= MAX_STEPS ? copy.recipes.stepsFull : undefined}
            onClick={() => edit({ ...draft, steps: [...draft.steps, ""] }, isStep)}
          >
            {copy.recipes.addStep}
          </Button>
          {draft.steps.length >= MAX_STEPS && (
            <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "var(--ink-3)" }}>{copy.recipes.stepsFull}</p>
          )}
          <FieldMessage problem={problemAt("steps")} />
        </div>
      </Card>

      {/* ── save ─────────────────────────────────────────────────────────── */}
      <Card>
        <div data-field="form">
          <Button icon="check" onClick={save} disabled={pending || !saveable}>
            {pending ? copy.recipes.saving : copy.recipes.save}
          </Button>
          {!saveable && (
            <p style={{ margin: "10px 0 0", fontSize: 12.5, color: "var(--ink-3)" }}>{copy.recipes.notReady}</p>
          )}
          {notice && (
            <p role="status" style={{ margin: "12px 0 0", fontSize: 13, color: "var(--ok-ink)" }}>
              {notice}
            </p>
          )}
          <FieldMessage problem={formProblem} />
        </div>
      </Card>

      <Modal
        open={leaving.prompted}
        onClose={leaving.stay}
        title={copy.routine.leaveTitle}
        icon="shield"
        iconTone="amber"
        width={420}
        footer={
          <>
            <Button variant="secondary" onClick={leaving.stay}>
              {copy.routine.leaveStay}
            </Button>
            <Button variant="danger" onClick={leaving.leave}>
              {copy.routine.leaveConfirm}
            </Button>
          </>
        }
      >
        <p style={{ margin: 0, fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.55 }}>
          {copy.routine.leaveBody}
        </p>
      </Modal>
    </div>
  );
}

function isError(problem: Problem | null): boolean {
  return problem !== null && !problem.missing;
}

/**
 * The message beside a control. A value that is wrong is an ERROR (red, announced); a
 * value not given yet is a quiet hint — a blank form is a form, not a list of failures.
 */
function FieldMessage({ problem }: { problem: Problem | null }) {
  if (!problem) return null;
  const error = !problem.missing;
  return (
    <p
      role={error ? "alert" : undefined}
      data-problem={error ? "error" : "missing"}
      style={{
        margin: "6px 0 0",
        fontSize: 12.5,
        lineHeight: 1.45,
        color: error ? "var(--err-ink)" : "var(--ink-3)",
        overflowWrap: "anywhere",
      }}
    >
      {problem.message}
    </p>
  );
}

function IngredientRow({
  line,
  index,
  retired,
  problem,
  onQuantity,
  onUnit,
  onRemove,
  locked,
}: {
  locked: boolean;
  line: IngredientLine;
  index: number;
  retired: boolean;
  problem: Problem | null;
  onQuantity: (value: string) => void;
  onUnit: (unit: RecipeUnit) => void;
  onRemove: () => void;
}) {
  return (
    <div
      role="group"
      aria-label={line.label}
      data-field={ingredientAddress(index)}
      style={{ border: "1px solid var(--border)", borderRadius: "var(--r-lg)", padding: 12 }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", overflowWrap: "anywhere" }}>
          {line.label}
        </span>
        {retired && <Badge tone="amber">{copy.recipes.retiredBadge}</Badge>}
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
        <label style={{ display: "block", flex: "1 1 110px", minWidth: 0 }}>
          <div style={LABEL}>{copy.recipes.quantityLabel}</div>
          <input
            inputMode="decimal"
            value={line.quantity}
            aria-invalid={isError(problem) || undefined}
            onChange={(e) => onQuantity(e.target.value)}
            style={FIELD}
          />
        </label>
        <label style={{ display: "block", flex: "1 1 110px", minWidth: 0 }}>
          <div style={LABEL}>{copy.recipes.unitLabel}</div>
          <select value={line.unit} onChange={(e) => onUnit(e.target.value as RecipeUnit)} style={FIELD}>
            {UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {copy.recipes.unitNames[unit]}
              </option>
            ))}
          </select>
        </label>
        <Button variant="ghost" size="sm" icon="x" ariaLabel={copy.recipes.removeIngredientNamed(line.label)} onClick={onRemove} disabled={locked}>
          {copy.recipes.removeIngredient}
        </Button>
      </div>
      <FieldMessage problem={problem} />
    </div>
  );
}

/**
 * AC2's search box and AC3's zero-result sentence.
 *
 * The results are BUTTONS, one per `CoachIngredientOption`, and pressing one is the only
 * way a line is created. Enter does nothing — not "pick the first", which would turn a
 * typed word into an ingredient the coach never saw and is exactly the free-text path
 * AC2 forbids.
 *
 * Searched only when there is a query: the api's blank-query answer is "the first 20
 * alphabetically", which is a list of almonds and anchovies, not help.
 */
function IngredientSearch({
  picked,
  onPick,
  locked,
}: {
  picked: string[];
  onPick: (option: CoachIngredientOption) => void;
  /** A save is in flight: no line may be added until its refusal (if any) is addressed. */
  locked: boolean;
}) {
  const [q, setQ] = useState("");
  const [options, setOptions] = useState<CoachIngredientOption[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [searching, setSearching] = useState(false);
  /** The query whose answer is on screen — AC3's sentence quotes THIS, not the box. */
  const [answered, setAnswered] = useState("");
  /** Only the latest request may write: a slow answer to "chi" must not land over "chick". */
  const latest = useRef(0);

  useEffect(() => {
    const query = q.trim();
    // Every keystroke takes a new ticket NOW, not when the debounce fires: a request
    // already in flight for "chi" is superseded the moment "chic" is typed, so its late
    // answer can never be painted under a box that no longer says "chi".
    const ticket = ++latest.current;
    if (query === "") {
      setOptions(null);
      setFailed(false);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      const result = await settled(searchIngredientsAction(query), { ok: false, code: "FAILED" } as const);
      if (ticket !== latest.current) return;
      setSearching(false);
      setAnswered(query);
      if (!result.ok) {
        setFailed(true);
        setOptions(null);
        return;
      }
      setFailed(false);
      setOptions(result.options);
    }, 200);
    return () => clearTimeout(timer);
  }, [q]);

  return (
    <div>
      <Input
        label={copy.recipes.searchLabel}
        value={q}
        icon="search"
        placeholder={copy.recipes.searchPlaceholder}
        full
        onChange={(e) => setQ(e.target.value.slice(0, SEARCH_MAX))}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.preventDefault();
        }}
      />
      {/*
        ONE announced line per search (role="status"): the count, the searching note, or
        AC3's sentence. The result buttons themselves are NOT in a live region — a live
        list re-read up to 20 labels on every keystroke to a screen-reader user.
      */}
      <div style={{ marginTop: 10 }}>
        {failed ? (
          <p role="alert" style={{ margin: 0, fontSize: 12.5, color: "var(--err-ink)" }}>
            {copy.recipes.searchFailed}
          </p>
        ) : (
          <p
            role="status"
            data-testid="ingredient-status"
            style={{
              margin: 0,
              fontSize: options !== null && options.length === 0 ? 13 : 12.5,
              color: options !== null && options.length === 0 ? "var(--ink-2)" : "var(--ink-3)",
              lineHeight: 1.5,
              overflowWrap: "anywhere",
            }}
          >
            {searching && options === null
              ? copy.recipes.searching
              : options === null
                ? ""
                : options.length === 0
                  ? // AC3, verbatim.
                    copy.recipes.noIngredientMatch(answered)
                  : copy.recipes.found(options.length)}
          </p>
        )}
      </div>
      <div data-testid="ingredient-results" style={{ marginTop: 8 }}>
        {!failed && options !== null && options.length > 0 && (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexWrap: "wrap", gap: 8 }}>
            {options.map((option) => {
              const already = picked.includes(option.key);
              return (
                <li key={option.key}>
                  <button
                    type="button"
                    disabled={already || locked}
                    aria-label={already ? `${option.label}: ${copy.recipes.alreadyAdded}` : copy.recipes.addIngredientNamed(option.label)}
                    onClick={() => {
                      onPick(option);
                      setQ("");
                    }}
                    style={{
                      minHeight: MIN_TOUCH_TARGET,
                      padding: "0 14px",
                      borderRadius: "var(--r-md)",
                      border: "1px solid var(--border-2)",
                      background: already ? "var(--surface-2)" : "var(--surface)",
                      color: already ? "var(--ink-3)" : "var(--ink)",
                      fontSize: 13.5,
                      fontWeight: 600,
                      cursor: already ? "default" : "pointer",
                    }}
                  >
                    {option.label}
                    {already ? ` · ${copy.recipes.alreadyAdded}` : ""}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
