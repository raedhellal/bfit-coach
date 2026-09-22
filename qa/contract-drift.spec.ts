import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { DEVIATIONS } from "./contract-deviations";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE GUARD THAT 106 GREEN PLAYWRIGHT TESTS COULD NOT BE.
 *
 * On 2026-09-18 the coach portal's routine page was a 200 with nothing on it but the
 * "Evoli Pro" chrome. `src/lib/coachApi.ts` declared `trainingProfile` on
 * `CoachRoutineResponse`; b-fit-api has never sent such a field on any endpoint; the
 * server component dereferenced `routine.trainingProfile.injuries` and threw inside its
 * own render.
 *
 * Every other gate was green, and each of them was green FOR A REASON:
 *
 *   · `tsc` cannot see it. The value crosses an untyped JSON boundary — `apiFetch`
 *     casts the parsed body — so the type is an ASSERTION about a deployment, and
 *     TypeScript checks assertions against themselves.
 *   · `next lint` and `next build` cannot see it, for the same reason.
 *   · The Playwright suite cannot see it BY CONSTRUCTION. It runs in fixture mode, and
 *     `coachApi.fixture.ts` is typed by the same module as the client — so the fixture
 *     served `trainingProfile: {...}` because the client asked for it. A fixture
 *     written from the same wrong assumption as the client agrees with it perfectly.
 *     Every spec in `qa/` was testing that the portal agrees with itself.
 *   · The live suite (`playwright.live.config.ts`) COULD have seen it and did not: it
 *     stops at the EV-183 overview and never opens the routine tab. It also needs a
 *     real api, a throwaway Postgres and about two minutes, so it is not in the gate
 *     and nobody runs it on a whim.
 *
 * So this spec asserts the client against the ARTEFACT the api publishes —
 * `spec/b-fit-api.openapi.yaml`, vendored by `npm run spec:sync`, at the commit named
 * in `spec/b-fit-api.sha`. It needs no api, no database and no browser; it runs in the
 * default config, in about a second, on every gate.
 *
 * WHAT IT CAN AND CANNOT PROVE, stated rather than assumed:
 *   ✓ a field the portal reads that the api does not publish  — the 2026-09-18 crash
 *   ✓ a field the api publishes that the portal has not noticed — new api capability
 *   ✓ a registered deviation that has silently closed, so the register cannot rot
 *   ✗ that the spec matches the RUNNING api. The spec is b-fit-api's own artefact and
 *     `CoachPortalSpecContractTest` is what holds it to the controllers; the sha file
 *     is what makes a stale copy visible here.
 *   ✗ types, nullability or semantics. It compares NAMES, which is where every drift
 *     this surface has actually suffered has lived.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const ROOT = join(__dirname, "..");
const SPEC = join(ROOT, "spec", "b-fit-api.openapi.yaml");
const CLIENT = join(ROOT, "src", "lib", "coachApi.ts");

/**
 * The property names of one `components.schemas` entry.
 *
 * A deliberate ~40 lines of line-based parsing rather than a YAML dependency. The file
 * is b-fit-api's own generated-shaped artefact with fixed indentation (schemas at 4,
 * their keys at 6, properties at 8), the test asserts that the schema it was asked for
 * was actually found, and `SCHEMAS_EXPECTED` below pins the count — so a parser that
 * silently stopped working fails loudly instead of reporting "no drift".
 */
function schemaProperties(spec: string, name: string): string[] | null {
  const lines = spec.split("\n");
  const start = lines.findIndex((l) => l === `    ${name}:`);
  if (start === -1) return null;

  const props: string[] = [];
  let inProperties = false;
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
    const indent = line.length - line.trimStart().length;
    // Dedented back to a sibling schema (or further): this schema is over.
    if (indent <= 4) break;
    if (indent === 6) {
      inProperties = line.trim() === "properties:";
      continue;
    }
    // Only the schema's OWN properties: anything deeper belongs to a property's body
    // (`items:`, `allOf:`, a nested inline object) and is not a field of this schema.
    if (inProperties && indent === 8) {
      const key = /^\s*([A-Za-z_][A-Za-z0-9_]*):/.exec(line);
      if (key) props.push(key[1]);
    }
  }
  return props;
}

/**
 * The top-level property names of one exported `interface` in `coachApi.ts`, plus the
 * schema its `@wire` tag claims it mirrors.
 *
 * Nested braces are tracked so an inline object property (`adherenceThisWeek: { done:
 * number; planned: number } | null`) contributes its own name and not its innards.
 */
function wireInterfaces(source: string): { name: string; schema: string; fields: string[] }[] {
  const lines = source.split("\n");
  const out: { name: string; schema: string; fields: string[] }[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const declaration = /^export interface ([A-Za-z0-9_]+)/.exec(lines[i]);
    if (!declaration) continue;

    // The `@wire <Schema>` tag lives in the jsdoc immediately above the declaration.
    let schema: string | null = null;
    for (let j = i - 1; j >= 0 && j > i - 120; j -= 1) {
      if (/^export |^}/.test(lines[j])) break;
      const tag = /@wire\s+([A-Za-z0-9_]+)/.exec(lines[j]);
      if (tag) {
        schema = tag[1];
        break;
      }
    }
    if (!schema) continue;

    const fields: string[] = [];
    let depth = 0;
    for (let k = i; k < lines.length; k += 1) {
      const line = lines[k];
      const before = depth;
      depth += (line.match(/{/g) ?? []).length - (line.match(/}/g) ?? []).length;
      if (before === 1) {
        const field = /^\s{2}([A-Za-z_][A-Za-z0-9_]*)\??:/.exec(line);
        if (field) fields.push(field[1]);
      }
      if (depth === 0 && k > i) break;
    }
    out.push({ name: declaration[1], schema, fields });
  }
  return out;
}

/**
 * How many `@wire` interfaces must be found.
 *
 * Without it, deleting a tag — or a refactor that moves a type into another file —
 * makes this spec pass by checking nothing, which is the one way a guard fails that
 * nobody notices. Raise it deliberately when a type is added.
 */
const SCHEMAS_EXPECTED = 51;

const spec = readFileSync(SPEC, "utf8");
const client = readFileSync(CLIENT, "utf8");
const interfaces = wireInterfaces(client);

test("every @wire interface is checked, and the parser still works", () => {
  expect(
    interfaces.length,
    "an @wire interface has been removed or the parser has stopped matching — either way this suite would be passing by checking nothing"
  ).toBe(SCHEMAS_EXPECTED);

  for (const entry of interfaces) {
    expect(
      schemaProperties(spec, entry.schema),
      `${entry.name} claims @wire ${entry.schema}, which is not a schema in spec/b-fit-api.openapi.yaml`
    ).not.toBeNull();
    expect(entry.fields.length, `${entry.name} parsed as having no fields`).toBeGreaterThan(0);
  }
});

for (const entry of interfaces) {
  test(`${entry.name} matches ${entry.schema} on the wire`, () => {
    const published = schemaProperties(spec, entry.schema) ?? [];
    const registered = DEVIATIONS[entry.name] ?? {};
    const notOnWire = registered.notOnWire ?? {};
    const missingInPortal = registered.missingInPortal ?? {};

    // ── the 2026-09-18 crash: a field the portal reads and nobody sends ──────
    const unpublished = entry.fields.filter(
      (f) => !published.includes(f) && !(f in notOnWire)
    );
    expect(
      unpublished,
      `${entry.name} declares ${unpublished.join(", ")}, which ${entry.schema} does not publish. ` +
        `A field typed here is a claim about a deployment: either the name is wrong, or the api has ` +
        `not shipped it, or it is a deliberate deviation and belongs in qa/contract-deviations.ts ` +
        `with a reason.`
    ).toEqual([]);

    // ── the other direction: api capability the portal has not noticed ───────
    const unread = published.filter((f) => !entry.fields.includes(f) && !(f in missingInPortal));
    expect(
      unread,
      `${entry.schema} publishes ${unread.join(", ")}, which ${entry.name} does not declare. ` +
        `Not automatically a bug — but it must be a DECISION, so register it in ` +
        `qa/contract-deviations.ts with why the portal does not read it.`
    ).toEqual([]);

    // ── the register cannot rot ──────────────────────────────────────────────
    const stale = [
      ...Object.keys(notOnWire).filter((f) => published.includes(f)),
      ...Object.keys(missingInPortal).filter((f) => entry.fields.includes(f)),
    ];
    expect(
      stale,
      `qa/contract-deviations.ts still registers ${stale.join(", ")} on ${entry.name}, but ${
        entry.schema
      } and the portal now agree about them. Delete the entries — a register of things that stopped being true is how the next real deviation gets waved through.`
    ).toEqual([]);
  });
}

/*
 * The provenance assertion that used to sit here has MOVED to
 * `qa/api-merge-condition.spec.ts`, and grew a second half.
 *
 * It read `spec/b-fit-api.sha` and checked it was 40 hex characters. That proves the
 * file is a sha and nothing about whether the api it names has SHIPPED — and EV-188b is
 * written against `feat/ev188a-template-library-api`, a branch. So the check now lives
 * beside the merge condition it serves, where it can be checked against the sibling
 * repo rather than against a regex.
 */
