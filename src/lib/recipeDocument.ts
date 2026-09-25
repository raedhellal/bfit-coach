import { copy } from "./copy";
import type {
  CoachRecipe,
  CoachRecipeSaveRequest,
  RecipeUnit,
} from "./coachApi";

/**
 * EV-256b — the recipe editor's working copy, the rules it checks before it sends, and
 * the one function that says WHERE on the form a server refusal belongs.
 *
 * Pure and client-safe on purpose: `coachApi.ts` is `server-only`, so a client island
 * may import TYPES from it and nothing else (see the note above `TEMPLATE_NAME_MAX`).
 * It is also imported directly by `qa/recipe-rules.spec.ts`, which is why every import
 * from `coachApi` here is `import type`.
 *
 * ── Why the editor checks locally at all ─────────────────────────────────────────
 *
 * The api is the authority and every refusal it makes is rendered (AC4). The local
 * checks exist so a coach does not press a Save that is certain to fail — the template
 * editor's rule, for the same reason. Each check PORTS an api rule with the api's own
 * bound and the api's own counting unit; a portal that refuses at a different number
 * than the server is worse than one that does not check. Where the portal cannot know
 * the answer (a name another recipe already uses, the 101st recipe, a retired key, the
 * macro consistency rule) it does not guess: the server answers and the answer is put
 * next to its field.
 *
 * The macro CONSISTENCY rule (4·P + 4·C + 9·F within max(50, 15 %)) is deliberately NOT
 * pre-checked. AC4 names that refusal's sentence and says it comes from the server's
 * `computedKcal`; a second implementation in the browser would be a second copy of a
 * product rule with nothing to keep the two in step.
 */

/** `CoachTemplateNames.MAX_LENGTH`, which the recipe name reuses (`coach_recipes.name VARCHAR(80)`). */
export const RECIPE_NAME_MAX = 80;
/** `@Size(min = 1, max = 25)` on `ingredients`. */
export const MAX_INGREDIENTS = 25;
/** `@Size(max = 15)` on `steps`. */
export const MAX_STEPS = 15;
/** `CoachRecipeSaveRequest.MAX_STEP_LENGTH`. */
export const MAX_STEP_LENGTH = 300;
/** `@DecimalMax("5000")` on `quantity`. */
export const MAX_QUANTITY = 5000;
/** `kcal`: `@DecimalMin("1") @DecimalMax("3000")`. */
export const KCAL_MIN = 1;
export const KCAL_MAX = 3000;
/** Each macro: `@DecimalMin("0") @DecimalMax("300")`. */
export const MACRO_MAX = 300;
/**
 * `CoachRecipeUseCase.MAX_RECIPES_PER_COACH`. The LIST serves it as `limit` and the
 * library uses that; this is only for the 409 that reaches the EDITOR, which holds no
 * list and whose refusal body carries no number.
 */
export const RECIPE_LIMIT = 100;
/** `GET /coach-portal/ingredients` — `q` has `maxLength: 100`. */
export const SEARCH_MAX = 100;

export const UNITS: readonly RecipeUnit[] = ["g", "ml", "piece"];

export type MacroField = "kcal" | "proteinG" | "carbsG" | "fatG";
export const MACRO_FIELDS: readonly MacroField[] = ["kcal", "proteinG", "carbsG", "fatG"];

/**
 * One ingredient line in the working copy. `quantity` is the TEXT the coach typed, not
 * a number: "1." and "0.5" are states a number input would destroy mid-keystroke, and
 * the form must keep "everything the coach typed" (AC4) — including what is not valid
 * yet.
 */
export interface IngredientLine {
  key: string;
  label: string;
  quantity: string;
  unit: RecipeUnit;
}

/** The editor's working copy. Macros are text for the same reason quantities are. */
export interface RecipeDraft {
  name: string;
  ingredients: IngredientLine[];
  kcal: string;
  proteinG: string;
  carbsG: string;
  fatG: string;
  steps: string[];
}

export function blankRecipe(): RecipeDraft {
  return { name: "", ingredients: [], kcal: "", proteinG: "", carbsG: "", fatG: "", steps: [] };
}

export function fromRecipe(recipe: CoachRecipe): RecipeDraft {
  return {
    name: recipe.name,
    ingredients: recipe.ingredients.map((line) => ({
      key: line.key,
      label: line.label,
      quantity: String(line.quantity),
      unit: line.unit,
    })),
    kcal: String(recipe.kcal),
    proteinG: String(recipe.proteinG),
    carbsG: String(recipe.carbsG),
    fatG: String(recipe.fatG),
    steps: [...recipe.steps],
  };
}

/* ── the name, counted the way the api counts it ─────────────────────────────────── */

/**
 * Java's `Character.isWhitespace` as `String.strip()` uses it, for the characters that
 * can still be present after `normaliseName` has folded every space separator: the
 * ASCII controls \t \n \v \f \r, U+001C..U+001F, and the line/paragraph separators.
 * JavaScript's `trim()` is NOT this set (it strips U+FEFF and every Zs, and leaves
 * U+001C..U+001F), which is why it is not used.
 */
const JAVA_STRIP_SPACE = /^[\t\n\u000B\f\r\u001C-\u001F \u2028\u2029\u1680\u2000-\u2006\u2008-\u200A\u205F\u3000]+|[\t\n\u000B\f\r\u001C-\u001F \u2028\u2029\u1680\u2000-\u2006\u2008-\u200A\u205F\u3000]+$/g;

export function javaStrip(value: string): string {
  return value.replace(JAVA_STRIP_SPACE, "");
}

/**
 * `CoachTemplateNames.normalise`, ported: every SPACE_SEPARATOR (Zs — NBSP, U+2007,
 * U+202F, U+3000…) folds to a plain space; every FORMAT character (Cf — ZWJ, ZWNJ,
 * U+00AD, U+FEFF…) is REMOVED, not replaced; modifier letters (the Arabic tatweel) are
 * left alone; then `strip()`. Null when nothing is left — which the api refuses.
 */
export function normaliseName(raw: string): string | null {
  const folded = raw.replace(/\p{Zs}/gu, " ").replace(/\p{Cf}/gu, "");
  const stripped = javaStrip(folded);
  return stripped === "" ? null : stripped;
}

/**
 * The length the api compares with 80: Java `String.length()` of the normalised name,
 * i.e. UTF-16 code units — the same unit as JavaScript's `.length`. An emoji counts 2
 * on both sides; that is the api's rule, not a portal approximation of it.
 */
export function nameLength(raw: string): number {
  return normaliseName(raw)?.length ?? 0;
}

/**
 * `NO_CONTROL = ^[^\p{Cc}\u2028\u2029]*$`. Built with `RegExp` from a string so the
 * source file carries no literal control-character class.
 */
const CONTROL = new RegExp("[\\u0000-\\u001F\\u007F-\\u009F\\u2028\\u2029]");

export function hasControl(value: string): boolean {
  return CONTROL.test(value);
}

/* ── numbers ────────────────────────────────────────────────────────────────────── */

/**
 * A macro or kcal field, read the way `@WholeNumber` reads a JSON number: `50` and
 * `50.0` are whole, `50.7` is NOT (and is never rounded or truncated), anything that is
 * not a plain non-negative decimal is not a number at all.
 */
export type ParsedWhole =
  | { kind: "empty" }
  | { kind: "whole"; value: number }
  | { kind: "fraction"; value: number }
  | { kind: "invalid" };

export function parseWhole(raw: string): ParsedWhole {
  const text = raw.trim();
  if (text === "") return { kind: "empty" };
  if (!/^\d+(\.\d+)?$/.test(text)) return { kind: "invalid" };
  const value = Number(text);
  if (!Number.isFinite(value)) return { kind: "invalid" };
  return Number.isInteger(value) ? { kind: "whole", value } : { kind: "fraction", value };
}

/**
 * A quantity: > 0, ≤ 5000, at most two decimal places — `@Digits(integer = 4,
 * fraction = 2)`. A third decimal is refused rather than rounded, including `150.000`,
 * which the api's `@Digits` also refuses (it counts the written scale).
 */
export function parseQuantity(raw: string): number | null {
  const text = raw.trim();
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(text)) return null;
  const value = Number(text);
  return value > 0 && value <= MAX_QUANTITY ? value : null;
}

/* ── where a problem is shown ───────────────────────────────────────────────────── */

/**
 * The address of a message on the form. Every refusal — local or the server's — is
 * addressed to ONE of these, and the editor renders it beside that control.
 *
 *   name · macros (the consistency sentence, under the four inputs) · kcal · proteinG
 *   · carbsG · fatG · ingredients (the list as a whole) · ingredients.N (one line)
 *   · steps (the list as a whole) · steps.N (one step) · form (no field: under Save)
 */
export type FieldAddress = string;

export const ingredientAddress = (index: number): FieldAddress => `ingredients.${index}`;
export const stepAddress = (index: number): FieldAddress => `steps.${index}`;

export interface Problem {
  at: FieldAddress;
  message: string;
  /**
   * A value the coach has not given yet (an empty name on a new recipe). Rendered in
   * the quiet hint style: a blank form is not an error, it is a form. A value that IS
   * there and is wrong renders as an error.
   */
  missing?: boolean;
}

const MACRO_LABEL: Record<MacroField, string> = {
  kcal: copy.recipes.kcalLabel,
  proteinG: copy.recipes.proteinLabel,
  carbsG: copy.recipes.carbsLabel,
  fatG: copy.recipes.fatLabel,
};

function macroProblem(field: MacroField, raw: string): Problem | null {
  const parsed = parseWhole(raw);
  const min = field === "kcal" ? KCAL_MIN : 0;
  const max = field === "kcal" ? KCAL_MAX : MACRO_MAX;
  if (parsed.kind === "empty") {
    return { at: field, message: copy.recipes.required, missing: true };
  }
  if (parsed.kind === "fraction") {
    // The rule the api review turned up: 50.7 is REFUSED, never truncated to 50. The
    // sentence names both whole numbers either side so the coach does not have to.
    return {
      at: field,
      message: copy.recipes.wholeNumbersOnly(Math.floor(parsed.value), Math.ceil(parsed.value)),
    };
  }
  if (parsed.kind === "invalid" || parsed.value < min || parsed.value > max) {
    return { at: field, message: copy.recipes.numberRange(MACRO_LABEL[field], min, max) };
  }
  return null;
}

/**
 * Everything the portal can already see the api will refuse, each addressed to its
 * control. Save is disabled while this is non-empty.
 */
export function localProblems(draft: RecipeDraft): Problem[] {
  const problems: Problem[] = [];

  if (hasControl(draft.name)) {
    problems.push({ at: "name", message: copy.recipes.noLineBreaks });
  } else if (normaliseName(draft.name) === null) {
    problems.push({ at: "name", message: copy.recipes.nameRequired, missing: draft.name === "" });
  } else if (nameLength(draft.name) > RECIPE_NAME_MAX) {
    problems.push({ at: "name", message: copy.recipes.nameTooLong });
  }

  if (draft.ingredients.length === 0) {
    problems.push({ at: "ingredients", message: copy.recipes.ingredientsRequired, missing: true });
  } else if (draft.ingredients.length > MAX_INGREDIENTS) {
    problems.push({ at: "ingredients", message: copy.recipes.ingredientsFull });
  }
  draft.ingredients.forEach((line, index) => {
    if (line.quantity.trim() === "") {
      problems.push({ at: ingredientAddress(index), message: copy.recipes.quantityRequired, missing: true });
    } else if (parseQuantity(line.quantity) === null) {
      problems.push({ at: ingredientAddress(index), message: copy.recipes.quantityRange });
    }
  });

  for (const field of MACRO_FIELDS) {
    const problem = macroProblem(field, draft[field]);
    if (problem) problems.push(problem);
  }

  if (draft.steps.length > MAX_STEPS) {
    problems.push({ at: "steps", message: copy.recipes.stepsFull });
  }
  draft.steps.forEach((step, index) => {
    if (hasControl(step)) {
      problems.push({ at: stepAddress(index), message: copy.recipes.noLineBreaks });
    } else if (normaliseName(step) === null) {
      problems.push({ at: stepAddress(index), message: copy.recipes.stepEmpty, missing: step === "" });
    } else if (javaStrip(step).length > MAX_STEP_LENGTH) {
      problems.push({ at: stepAddress(index), message: copy.recipes.stepTooLong });
    }
  });

  return problems;
}

/**
 * The save body. Only called when `localProblems` is empty, so every parse succeeds;
 * the `?? 0` fallbacks are unreachable and exist to keep the type honest, not to invent
 * a value (a draft with a problem is never sent).
 *
 * A step is sent `strip()`ped because the api's `@Size(max = 300)` runs on the RAW
 * string before its own strip: a 300-character step with a trailing space would be a
 * 301-character refusal of text the coach cannot see.
 */
export function forSave(draft: RecipeDraft): CoachRecipeSaveRequest {
  const whole = (raw: string) => {
    const parsed = parseWhole(raw);
    return parsed.kind === "whole" ? parsed.value : 0;
  };
  return {
    name: draft.name,
    ingredients: draft.ingredients.map((line) => ({
      key: line.key,
      quantity: parseQuantity(line.quantity) ?? 0,
      unit: line.unit,
    })),
    kcal: whole(draft.kcal),
    proteinG: whole(draft.proteinG),
    carbsG: whole(draft.carbsG),
    fatG: whole(draft.fatG),
    steps: draft.steps.map(javaStrip),
  };
}

/* ── the server's refusals, addressed ───────────────────────────────────────────── */

/**
 * What a failed save carries back from the server action. Plain data, so it crosses the
 * action boundary and so `qa/recipe-rules.spec.ts` can drive every branch of
 * `serverProblem` without a server.
 */
export type RecipeFailureCode =
  | "UNKNOWN_INGREDIENT"
  | "MACROS_INCONSISTENT"
  | "INVALID_FIELD"
  | "NAME_TAKEN"
  | "LIMIT_REACHED"
  | "ACCESS_DENIED"
  | "FAILED";

export interface RecipeFailure {
  code: RecipeFailureCode;
  /** The api's field path, e.g. `ingredients[2].key`, `proteinG`, `steps[0]`. */
  field: string | null;
  /** `COACH_RECIPE_UNKNOWN_INGREDIENT`'s `details.key`, as sent. */
  key: string | null;
  /** `COACH_RECIPE_MACROS_INCONSISTENT`'s `details.computedKcal`. */
  computedKcal: number | null;
}

/**
 * The api's field path, from either refusal shape:
 *   · `details.field` — the rules `CoachRecipeRules` applies (`CoachRecipeFieldInvalid`,
 *     `CoachRecipeUnknownIngredient`);
 *   · the FIRST token of `message` — Bean Validation's `VALIDATION_ERROR`, which
 *     `RestExceptionHandler.handleValidation` writes as `"<field> <message>"` with no
 *     details at all.
 * Only a token of the recipe body's shape is accepted, so a French JVM message or any
 * other sentence cannot be mistaken for a field.
 */
const FIELD_PATH =
  /^(name|kcal|proteinG|carbsG|fatG|ingredients(?:\[\d+\](?:\.(?:key|quantity|unit))?)?|steps(?:\[\d+\])?)(?=\s|$)/;

export function recipeFieldOf(
  details: Record<string, unknown> | null,
  message: string | null
): string | null {
  const named = details?.field;
  if (typeof named === "string" && FIELD_PATH.test(named)) return named;
  const lead = message ? FIELD_PATH.exec(message) : null;
  return lead ? lead[1] : null;
}

/** `ingredients[3].key` → `ingredients.3`, `steps[1]` → `steps.1`, a scalar → itself. */
export function addressOf(field: string | null): FieldAddress {
  if (!field) return "form";
  const line = /^ingredients\[(\d+)\]/.exec(field);
  if (line) return ingredientAddress(Number(line[1]));
  const step = /^steps\[(\d+)\]/.exec(field);
  if (step) return stepAddress(Number(step[1]));
  return field;
}

/**
 * AC4 — where a server refusal is shown, and in which words. The form itself is never
 * touched: this returns a message, the editor renders it, and every value the coach
 * typed stays where it was.
 */
export function serverProblem(
  failure: RecipeFailure,
  sent: { kcal: number; ingredients: { key: string; label: string }[] }
): Problem {
  switch (failure.code) {
    case "UNKNOWN_INGREDIENT": {
      const at = addressOf(failure.field);
      const index = /^ingredients\.(\d+)$/.exec(at);
      const line = index ? sent.ingredients[Number(index[1])] : undefined;
      const label = line?.label ?? failure.key ?? "";
      // Addressed to the LINE the api named; a refusal without a usable field still
      // lands on the ingredient list rather than on nothing.
      return { at: index ? at : "ingredients", message: copy.recipes.ingredientRetired(label) };
    }
    case "MACROS_INCONSISTENT":
      return {
        at: "macros",
        // AC4, verbatim. {kcal} is the number the coach SENT — the api's details carry
        // only computedKcal, and its message is not parsed.
        message: copy.recipes.macrosInconsistent(failure.computedKcal ?? 0, sent.kcal),
      };
    case "NAME_TAKEN":
      return { at: "name", message: copy.recipes.nameTaken };
    case "LIMIT_REACHED":
      return { at: "form", message: copy.recipes.limitReached(RECIPE_LIMIT) };
    case "ACCESS_DENIED":
      return { at: "form", message: copy.recipes.notYours };
    case "INVALID_FIELD":
      return { at: addressOf(failure.field), message: invalidFieldMessage(failure.field) };
    default:
      return { at: "form", message: copy.recipes.saveFailed };
  }
}

/**
 * A `VALIDATION_ERROR` put into the portal's words for the field it names. The api's
 * own text is not shown: Bean Validation's default messages follow the JVM locale
 * (French on the dev machine that built EV-256a), and the field is what matters.
 */
function invalidFieldMessage(field: string | null): string {
  if (!field) return copy.recipes.saveFailed;
  if (field === "name") return copy.recipes.nameInvalid;
  if (field === "kcal") return copy.recipes.numberRange(MACRO_LABEL.kcal, KCAL_MIN, KCAL_MAX);
  if (field === "proteinG" || field === "carbsG" || field === "fatG") {
    return copy.recipes.numberRange(MACRO_LABEL[field], 0, MACRO_MAX);
  }
  if (/^ingredients\[\d+\]\.key$/.test(field)) return copy.recipes.ingredientTwice;
  if (/^ingredients\[\d+\]\.quantity$/.test(field)) return copy.recipes.quantityRange;
  if (/^ingredients\[\d+\]/.test(field)) return copy.recipes.ingredientInvalid;
  if (field === "ingredients") return copy.recipes.ingredientsBound;
  if (field === "steps") return copy.recipes.stepsFull;
  if (/^steps\[\d+\]$/.test(field)) return copy.recipes.stepInvalid;
  return copy.recipes.saveFailed;
}
