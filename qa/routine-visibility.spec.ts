import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { VISIBILITY, type Visibility } from "../src/lib/routineVisibility";

/**
 * ADR-0018 guard 4-e — the portal visibility partition (BUG-195c AC3.7).
 *
 * `src/lib/routineVisibility.ts` puts every component of the `Routine` graph in exactly
 * one of CONTROLLED / DERIVED_BY_FORSAVE / CARRIED_UNSEEN, and `tsc` (so `next build`)
 * fails for a component with no entry. That compile-time half is only as good as the
 * portal's TYPES, so this file checks the two things `tsc` cannot:
 *
 *   1. the key set against the API's own published schema — a field b-fit-api adds to
 *      `Routine` is red here even before anybody adds it to `coachApi.ts`;
 *   2. every CONTROLLED claim against the RENDERED editor — an entry that names a
 *      control the page does not have is an unevidenced capability claim, and this is
 *      its witness (CLAUDE.md: "do not assert a capability without a witness").
 *
 * QA's recorded red run for AC3.7: delete `"Routine#weeklyProgression"` from the map and
 * `npx tsc --noEmit` fails with `Property '"Routine#weeklyProgression"' is missing`.
 */

const SPEC = join(__dirname, "..", "spec", "b-fit-api.openapi.yaml");

/**
 * The schema name in the api's spec → the prefix the partition uses, which is the Java
 * record's name (`CoachDraftDocument`'s sets use it). `Constraints` is published as
 * `RoutineConstraints` in the spec.
 */
const SCHEMAS: Record<string, string> = {
  Routine: "Routine",
  RoutineConstraints: "Constraints",
  TrainingDay: "TrainingDay",
  RoutineExercise: "RoutineExercise",
  ProgressionRule: "ProgressionRule",
};

/** The `properties:` keys of one `components.schemas` entry, read line by line. */
function schemaProperties(spec: string, schema: string): string[] {
  const lines = spec.split("\n");
  const start = lines.findIndex((line) => line === `    ${schema}:`);
  expect(start, `schema ${schema} not found in the vendored spec`).toBeGreaterThan(-1);
  const out: string[] = [];
  let inProperties = false;
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^ {4}\S/.test(line)) break; // the next schema
    if (/^ {6}properties:\s*$/.test(line)) {
      inProperties = true;
      continue;
    }
    if (/^ {6}\S/.test(line)) inProperties = false;
    const property = /^ {8}([A-Za-z_][A-Za-z0-9_]*):/.exec(line);
    if (inProperties && property) out.push(property[1]);
  }
  return out;
}

test("the partition covers the api's Routine graph exactly — no component missing, none invented", () => {
  const spec = readFileSync(SPEC, "utf8");
  const fromApi = Object.entries(SCHEMAS)
    .flatMap(([schema, prefix]) => schemaProperties(spec, schema).map((p) => `${prefix}#${p}`))
    .sort();
  // A parser that stopped matching would make this pass by comparing two empty lists.
  expect(fromApi.length).toBe(28); // 8 + 4 + 4 + 9 + 3
  expect(Object.keys(VISIBILITY).sort()).toEqual(fromApi);
});

test("every CARRIED_UNSEEN entry carries a written reason, and weeklyProgression's is ADR-0018 D10's", () => {
  const unseen = Object.entries(VISIBILITY as Record<string, Visibility>).filter(
    ([, v]) => v.set === "CARRIED_UNSEEN"
  );
  expect(unseen.map(([k]) => k).sort()).toEqual([
    "ProgressionRule#adjustment",
    "ProgressionRule#rationale",
    "ProgressionRule#week",
    "Routine#weeklyProgression",
  ]);
  for (const [key, v] of unseen) {
    expect(v.set === "CARRIED_UNSEEN" && v.reason.trim().length > 20, key).toBe(true);
  }
  expect(VISIBILITY["Routine#weeklyProgression"]).toEqual({
    set: "CARRIED_UNSEEN",
    reason:
      "The document stays with its own subject, and clearing it would delete the trainee's own generated progression.",
  });
  // The four subject-owned + derived fields are NOT controls the coach authors.
  for (const key of [
    "Routine#daysPerWeek",
    "Constraints#daysPerWeek",
    "Constraints#equipment",
    "Constraints#injuries",
  ] as const) {
    expect(VISIBILITY[key].set, key).toBe("DERIVED_BY_FORSAVE");
  }
});

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("coach@evoli.fit");
  await page.getByLabel("Password").fill("Password123!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/");
}

test("every CONTROLLED component has its control on a trainee's routine page", async ({ page }) => {
  await signIn(page);
  // Lina: a published plan with progression, several days and exercises.
  await page.goto("/clients/6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001/routine");
  await expect(page.getByLabel("Plan name")).toBeVisible();

  const controlled = Object.entries(VISIBILITY as Record<string, Visibility>).filter(
    ([, v]) => v.set === "CONTROLLED"
  );
  expect(controlled.length).toBe(19);

  // `durationSeconds` is only rendered for a timed exercise, so make one.
  await page
    .getByRole("group", { name: "Barbell Bench Press", exact: true })
    .getByLabel("Tracked as")
    .selectOption("DURATION");

  for (const [key, v] of controlled) {
    if (v.set !== "CONTROLLED") continue;
    const locator =
      "label" in v.control
        ? v.control.label.endsWith(":")
          ? page.getByLabel(new RegExp(`^${v.control.label}`))
          : page.getByLabel(v.control.label, { exact: true })
        : page.getByRole("button", { name: new RegExp(`^${v.control.button}`) });
    await expect(locator.first(), `${key} names a control the page does not render`).toBeVisible();
  }
});
