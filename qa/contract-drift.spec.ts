import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { DEVIATIONS, type SchemaDeviation } from "./contract-deviations";

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
 *   ✓ a field a REQUEST schema marks `required` that the portal's type does not carry —
 *     whatever the register says about it (EV-222; the next BUG-195)
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
 * The lines of one `components.schemas` entry, header excluded — or null if absent.
 */
function schemaBlock(spec: string, name: string): string[] | null {
  const lines = spec.split("\n");
  const start = lines.findIndex((l) => l === `    ${name}:`);
  if (start === -1) return null;
  const block: string[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim() !== "" && line.length - line.trimStart().length <= 4) break;
    block.push(line);
  }
  return block;
}

/**
 * The names one schema lists under its OWN `required:` (indent 6), in either spelling
 * the vendored file uses: flow (`required: [a, b]`) or block (`required:` then `- a`
 * at indent 8). A property's own `required: false` sits deeper and is not read.
 */
function schemaRequired(spec: string, name: string): string[] {
  const block = schemaBlock(spec, name) ?? [];
  const out: string[] = [];
  for (let i = 0; i < block.length; i += 1) {
    const flow = /^ {6}required:\s*\[(.*)\]\s*$/.exec(block[i]);
    if (flow) {
      out.push(...flow[1].split(",").map((f) => f.trim()).filter(Boolean));
      continue;
    }
    if (/^ {6}required:\s*$/.test(block[i])) {
      for (let j = i + 1; j < block.length; j += 1) {
        const item = /^ {8}- ([A-Za-z_][A-Za-z0-9_]*)\s*$/.exec(block[j]);
        if (!item) break;
        out.push(item[1]);
      }
    }
  }
  return out;
}

const SCHEMA_REF = /\$ref:\s*["']#\/components\/schemas\/([A-Za-z0-9_]+)["']/;

/**
 * Every schema the api can RECEIVE: each one a `requestBody` references under `paths`,
 * plus everything reachable from those through `$ref` (a `Routine` body carries
 * `TrainingDay`s, which carry `RoutineExercise`s — an omission at any depth is the same
 * 400).
 *
 * Derived from the api's artefact rather than from the portal's naming (`…Request`):
 * `PUT …/routine/draft` takes a `Routine`, which is not called a request anywhere, and
 * that is the one this row exists for.
 */
function requestSchemas(spec: string): Set<string> {
  const lines = spec.split("\n");
  const roots: string[] = [];
  const end = lines.findIndex((l) => l === "components:");
  for (let i = 0; i < (end === -1 ? lines.length : end); i += 1) {
    const rb = /^(\s*)requestBody:\s*$/.exec(lines[i]);
    if (!rb) continue;
    const indent = rb[1].length;
    for (let j = i + 1; j < lines.length; j += 1) {
      const line = lines[j];
      if (line.trim() !== "" && line.length - line.trimStart().length <= indent) break;
      const ref = SCHEMA_REF.exec(line);
      if (ref) roots.push(ref[1]);
    }
  }
  const seen = new Set<string>();
  const queue = [...roots];
  while (queue.length > 0) {
    const name = queue.shift() as string;
    if (seen.has(name)) continue;
    seen.add(name);
    for (const line of schemaBlock(spec, name) ?? []) {
      const ref = SCHEMA_REF.exec(line);
      if (ref && !seen.has(ref[1])) queue.push(ref[1]);
    }
  }
  return seen;
}

/**
 * The fields `schema` requires that the portal type does not declare. The register in
 * `qa/contract-deviations.ts` is deliberately NOT consulted: `missingInPortal` is an
 * allowance for an OPTIONAL field the portal chooses not to send, and no allowance can
 * make the api accept a body without a field it requires.
 */
function requiredOmissions(spec: string, entry: { schema: string; fields: string[] }): string[] {
  return schemaRequired(spec, entry.schema).filter((f) => !entry.fields.includes(f));
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
const SCHEMAS_EXPECTED = 58;

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

/* ═══════════════════════════════════════════════════════════════════════════
 * EV-222 — A REQUIRED FIELD THE PORTAL DOES NOT SEND IS RED, WHATEVER THE REGISTER SAYS.
 *
 * Until this block the loop above treated a registered "missing" field the same whether
 * or not the api requires it, so it printed `✓ CoachRoutineDraftRequest matches Routine
 * on the wire` while `qa/contract-deviations.ts` said "⛔ KNOWN BROKEN AGAINST LIVE" about
 * the same type. That is BUG-195 — every Save draft against a real api is a 400 — and a
 * green line in the suite about it.
 *
 * The check runs on every `@wire` interface whose schema the api can RECEIVE (see
 * `requestSchemas`). What it does NOT prove, stated:
 *   ✗ that a field declared on the type is actually put on the body at runtime, or
 *     declared non-optional — it reads names, like the rest of this file;
 *   ✗ anything about a request the portal builds from an UNTAGGED type. The editor's
 *     `RoutineDayEntry` rides inside `CoachRoutineDraftRequest.trainingDays` with no
 *     `@wire` tag, so the nested half of BUG-195 is invisible here; the top-level half
 *     is enough to hold the case red.
 *
 * NO SERVER-RESOLVED ALLOWANCE, deliberately. ADR-0018 D3 has the server overwrite four
 * subject-owned fields (`goal`, `level`, `constraints.equipment`,
 * `constraints.injuries`), but under its chosen shape (D1, option 1-D) the portal still
 * SENDS them — the whole `Routine` is `@Valid`, and `Routine.goal` / `.level` are
 * `@NotBlank` on b-fit-api main, so an omitted one is a 400 however the server would
 * have resolved it. An allowance here would be a green line about a request the api
 * refuses, which is the defect this block exists to end. If the api ever stops
 * requiring one of them, the spec stops listing it as `required` and this check follows
 * the spec — nothing to register.
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Interfaces whose required-field case is KNOWN red, each wrapped in `test.fail()` with
 * the bug as its annotation. The marker is not an exemption: the day the case starts
 * passing, `test.fail` fails the run, so the entry has to be deleted by the fix that
 * closes it (BUG-195c) rather than forgotten.
 */
const KNOWN_REQUIRED_OMISSIONS: Record<string, string> = {
  CoachRoutineDraftRequest: "BUG-195",
};

/**
 * How many `@wire` interfaces face a schema the api can receive. Pinned for the same
 * reason as `SCHEMAS_EXPECTED`: a `requestSchemas` that silently stopped matching would
 * make every case below vanish and the suite pass by checking nothing.
 */
const REQUEST_FACING_EXPECTED = 16;

const receivable = requestSchemas(spec);
const requestFacing = interfaces.filter((entry) => receivable.has(entry.schema));

test("every interface the api receives is checked for required fields", () => {
  expect(
    requestFacing.map((e) => e.name).sort(),
    "the set of @wire interfaces facing a request schema changed — or requestSchemas() stopped matching"
  ).toHaveLength(REQUEST_FACING_EXPECTED);
  for (const name of Object.keys(KNOWN_REQUIRED_OMISSIONS)) {
    expect(
      requestFacing.some((e) => e.name === name),
      `KNOWN_REQUIRED_OMISSIONS marks ${name}, which is not an @wire interface facing a request schema — delete the marker`
    ).toBe(true);
  }
});

/** The failure text. Names the interface, the schema and every omitted field (AC1). */
function requiredOmissionMessage(
  entry: { name: string; schema: string },
  omitted: string[],
  registered: string[]
): string {
  const excused = omitted.filter((f) => registered.includes(f));
  return (
    `${entry.schema} requires ${omitted.join(", ")}, which ${entry.name} does not carry — a body ` +
    `without a required field is a 400 from the api. ` +
    (excused.length > 0
      ? `qa/contract-deviations.ts registers ${excused.join(", ")} as missingInPortal, which is an ` +
        `allowance for an OPTIONAL field and does not excuse a required one.`
      : `Carry the field, or get the api to stop requiring it.`)
  );
}

for (const entry of requestFacing) {
  const title = `${entry.name} carries every field ${entry.schema} requires`;
  const body = () => {
    const omitted = requiredOmissions(spec, entry);
    const registered = Object.keys(DEVIATIONS[entry.name]?.missingInPortal ?? {});
    expect(omitted, requiredOmissionMessage(entry, omitted, registered)).toEqual([]);
  };
  const bug = KNOWN_REQUIRED_OMISSIONS[entry.name];
  if (bug) test.fail(title, { annotation: { type: "issue", description: bug } }, body);
  else test(title, body);
}

/**
 * EV-222 AC4 — the check, run on a SYNTHETIC spec and portal module.
 *
 * The live cases above can only show red while BUG-195 is open; the day BUG-195c lands
 * they are all green and nothing in the gate would notice a `schemaRequired` or
 * `requestSchemas` that had quietly stopped matching. This keeps a known omission in
 * front of the same parsers permanently. The fixture registers the omitted required
 * field as `missingInPortal`, exactly the allowance that hid BUG-195, and an OPTIONAL
 * field the same way (AC2 — it must not be reported).
 */
test("the required-field check fires on a synthetic request schema, and only there", () => {
  const fixtures = join(__dirname, "fixtures", "contract-drift");
  const fakeSpec = readFileSync(join(fixtures, "synthetic.openapi.yaml"), "utf8");
  const fakeClient = wireInterfaces(readFileSync(join(fixtures, "synthetic.client.txt"), "utf8"));
  const fakeRegister: Record<string, SchemaDeviation> = {
    WidgetRequest: { missingInPortal: { size: "the allowance that hid BUG-195", colour: "optional" } },
  };

  expect([...requestSchemas(fakeSpec)].sort()).toEqual(["WidgetPart", "WidgetRequest"]);
  expect(schemaRequired(fakeSpec, "WidgetPart"), "block-spelled required: list").toEqual(["partId", "qty"]);

  const found = Object.fromEntries(
    fakeClient
      .filter((e) => requestSchemas(fakeSpec).has(e.schema))
      .map((e) => [e.name, requiredOmissions(fakeSpec, e)])
  );
  expect(found).toEqual({ WidgetRequest: ["size"], WidgetPart: ["qty"] });

  const message = requiredOmissionMessage(
    { name: "WidgetRequest", schema: "WidgetRequest" },
    found.WidgetRequest,
    Object.keys(fakeRegister.WidgetRequest.missingInPortal ?? {})
  );
  expect(message).toContain("WidgetRequest requires size");
  expect(message).toContain("registers size as missingInPortal");
});

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
