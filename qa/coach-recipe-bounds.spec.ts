import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import {
  KCAL_MAX,
  KCAL_MIN,
  MACRO_MAX,
  MAX_INGREDIENTS,
  MAX_QUANTITY,
  MAX_STEPS,
  MAX_STEP_LENGTH,
} from "../src/lib/recipeDocument";
import { FIXTURE_RECIPE_BOUNDS } from "../src/lib/fixtureRecipeBounds";

/**
 * EV-256b — the recipe bounds, held equal in THREE places: the api's published contract
 * (`spec/b-fit-api.openapi.yaml`, vendored from b-fit-api), the portal's local checks
 * (`src/lib/recipeDocument.ts`) and the fixture's copy (`src/lib/fixtureRecipeBounds.ts`).
 *
 * `qa/contract-drift.spec.ts` compares property NAMES only. Staff review measured the
 * gap: loosening every recipe bound in the vendored spec (25→30 ingredients, 15→20
 * steps, 300→500 step length, 3000→4000 kcal, 5000→9000 quantity) left that guard and
 * both recipe specs green. A portal that refuses at a different number than the api is
 * worse than one that does not check, so the numbers are read from the spec itself here.
 *
 * No browser: a node read of three sources.
 */

const SPEC = readFileSync(join(__dirname, "..", "spec", "b-fit-api.openapi.yaml"), "utf8").split("\n");

const indent = (line: string) => line.length - line.trimStart().length;

/** The lines of `components.schemas.<name>` (indent 4). */
function schema(name: string): string[] {
  const start = SPEC.findIndex((l) => l === `    ${name}:`);
  expect(start, `${name} is not a schema in the vendored spec`).toBeGreaterThan(-1);
  const out: string[] = [];
  for (let i = start + 1; i < SPEC.length; i += 1) {
    if (SPEC[i].trim() !== "" && indent(SPEC[i]) <= 4) break;
    out.push(SPEC[i]);
  }
  return out;
}

/** The lines of one property of a schema (indent 8), including its nested `items:`. */
function property(lines: string[], name: string): string[] {
  const start = lines.findIndex((l) => l === `        ${name}:`);
  expect(start, `property ${name} not found`).toBeGreaterThan(-1);
  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    if (lines[i].trim() !== "" && indent(lines[i]) <= 8) break;
    out.push(lines[i]);
  }
  return out;
}

/** The first `key: <integer>` in `lines`. A missing key fails, never reads as undefined. */
function num(lines: string[], key: string): number {
  const hit = lines.map((l) => new RegExp(`^\\s*${key}: (\\d+)\\s*$`).exec(l)).find(Boolean);
  expect(hit, `${key} not found`).toBeTruthy();
  return Number(hit![1]);
}

const save = schema("CoachRecipeSaveRequest");
const line = schema("CoachRecipeIngredientRequest");

const published = {
  ingredientsMin: num(property(save, "ingredients"), "minItems"),
  ingredientsMax: num(property(save, "ingredients"), "maxItems"),
  stepsMax: num(property(save, "steps"), "maxItems"),
  // `steps.items.maxLength` — nested one level under the property.
  stepMaxLength: num(property(save, "steps"), "maxLength"),
  kcalMin: num(property(save, "kcal"), "minimum"),
  kcalMax: num(property(save, "kcal"), "maximum"),
  proteinMax: num(property(save, "proteinG"), "maximum"),
  carbsMax: num(property(save, "carbsG"), "maximum"),
  fatMax: num(property(save, "fatG"), "maximum"),
  macroMin: num(property(save, "proteinG"), "minimum"),
  quantityMax: num(property(line, "quantity"), "maximum"),
};

test("the parser read real numbers (a guard that reads nothing passes everything)", () => {
  expect(published).toEqual({
    ingredientsMin: 1,
    ingredientsMax: 25,
    stepsMax: 15,
    stepMaxLength: 300,
    kcalMin: 1,
    kcalMax: 3000,
    proteinMax: 300,
    carbsMax: 300,
    fatMax: 300,
    macroMin: 0,
    quantityMax: 5000,
  });
});

test("the portal's local checks refuse at the api's published numbers", () => {
  expect({
    ingredientsMax: MAX_INGREDIENTS,
    stepsMax: MAX_STEPS,
    stepMaxLength: MAX_STEP_LENGTH,
    kcalMin: KCAL_MIN,
    kcalMax: KCAL_MAX,
    macroMax: MACRO_MAX,
    quantityMax: MAX_QUANTITY,
  }).toEqual({
    ingredientsMax: published.ingredientsMax,
    stepsMax: published.stepsMax,
    stepMaxLength: published.stepMaxLength,
    kcalMin: published.kcalMin,
    kcalMax: published.kcalMax,
    // One constant stands for all three macros, so all three must publish the same bound.
    macroMax: published.proteinMax === published.carbsMax && published.carbsMax === published.fatMax
      ? published.proteinMax
      : NaN,
    quantityMax: published.quantityMax,
  });
});

test("the fixture's copy refuses at the api's published numbers too", () => {
  expect({
    ingredientsMin: FIXTURE_RECIPE_BOUNDS.ingredientsMin,
    ingredientsMax: FIXTURE_RECIPE_BOUNDS.ingredientsMax,
    stepsMax: FIXTURE_RECIPE_BOUNDS.stepsMax,
    stepMaxLength: FIXTURE_RECIPE_BOUNDS.stepMaxLength,
    kcalMin: FIXTURE_RECIPE_BOUNDS.kcalMin,
    kcalMax: FIXTURE_RECIPE_BOUNDS.kcalMax,
    macroMin: FIXTURE_RECIPE_BOUNDS.macroMin,
    macroMax: FIXTURE_RECIPE_BOUNDS.macroMax,
    quantityMax: FIXTURE_RECIPE_BOUNDS.quantityMax,
  }).toEqual({
    ingredientsMin: published.ingredientsMin,
    ingredientsMax: published.ingredientsMax,
    stepsMax: published.stepsMax,
    stepMaxLength: published.stepMaxLength,
    kcalMin: published.kcalMin,
    kcalMax: published.kcalMax,
    macroMin: published.macroMin,
    macroMax: published.proteinMax,
    quantityMax: published.quantityMax,
  });
});
