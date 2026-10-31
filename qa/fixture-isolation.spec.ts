import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { expect, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";

/**
 * EV-223 AC3 — a test that WRITES a draft, then a test that READS drafts, and the second
 * does not see the first's.
 *
 * `serial` on purpose: this file is the one place where the order is the experiment.
 * The first test must really write (it reloads and reads its own draft back, so a
 * silently failed save cannot make the second test vacuous); the second opens the same
 * trainee and must find the seed's published plan with no draft on it. Without the
 * per-test reset in `qa/fixture-test.ts` the second test is red.
 *
 * The seed check itself (`{ pristine: true }` before every test) is asserted by the auto
 * fixture, so it runs here too.
 */

const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
const SEED_PLAN_NAME = "Intermediate Muscle Building Routine";
const WRITTEN_PLAN_NAME = "EV-223 isolation probe";

test.describe.configure({ mode: "serial" });

async function signIn(page: Page) {
  await signInThroughForm(page, { email: "coach@evoli.fit", password: "Password123!" });
}

test("writer: a saved draft survives a reload in the same test", async ({ page }) => {
  await signIn(page);
  await page.goto(`/clients/${LINA}/routine`);
  await expect(page.getByText("Published plan")).toBeVisible();

  await page.getByLabel("Plan name").fill(WRITTEN_PLAN_NAME);
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText(/^Draft saved /)).toBeVisible();

  await page.reload();
  await expect(page.getByText("Draft — not yet published")).toBeVisible();
  await expect(page.getByLabel("Plan name")).toHaveValue(WRITTEN_PLAN_NAME);
});

test("reader: the next test does not see that draft", async ({ page }) => {
  await signIn(page);
  await page.goto(`/clients/${LINA}/routine`);
  await expect(page.getByLabel("Plan name")).toHaveValue(SEED_PLAN_NAME);
  await expect(page.getByText("Published plan")).toBeVisible();
  await expect(page.getByText("Draft — not yet published")).toHaveCount(0);
});

/**
 * A spec file that imports `test` from `@playwright/test` instead of `./fixture-test`
 * silently opts out of the reset, and nothing else would notice until it shared state
 * with a neighbour. The exempt files are listed with why; any other spec file must use
 * the resetting `test`.
 */
const NOT_ON_THE_FIXTURE_SERVER: Record<string, string> = {
  "coach-live.spec.ts": "live config: a real b-fit-api and Postgres, no fixture store",
  "coach-affordance.live.spec.ts": "live config, same",
  "coach-routine-draft.live.spec.ts": "live config, same (BUG-195c)",
  "coach-challenges.live.spec.ts": "live config, same (EV-321b)",
  "coach-nutrition-templates.live.spec.ts": "live config, same (EV-273b)",
  "coach-add-client.live.spec.ts": "live config, same (EV-204b): reads the api's mail-stub log",
  "intake-token-expiry.live.spec.ts": "intake-live config (EV-341b B17): a real b-fit-api with a 1-minute token, no fixture store",
  "coach-legacy-api.spec.ts": "legacy config: COACH_API_MODE=live against qa/legacy-api.mjs",
  "refresh-single-flight.spec.ts": "refresh config: COACH_API_MODE=live against qa/stub-api.mjs",
  "coach-activation.stub.spec.ts": "activation config: COACH_API_MODE=live against qa/activation-stub-api.mjs; resets the stub per test",
  "api-timeout.stub.spec.ts": "timeout config: COACH_API_MODE=live against qa/stall-api.mjs; resets the stub per test",
  "contract-drift.spec.ts": "reads two files from disk; never calls the dev server",
  "api-merge-condition.spec.ts": "reads git and a file from disk; never calls the dev server",
  "stale-times-config.spec.ts": "imports next.config.mjs (ADR-0033 2a); never calls the dev server",
  "invariant-n-lint-bans.spec.ts": "runs ESLint on in-memory files (BUG-743/744); never calls the dev server",
  "reseed-selection-unit.spec.ts": "pure unit test of src/lib/reseedSelection (BUG-1070): no page or request fixture; never calls the dev server",
};

test("every spec file on the fixture server uses the resetting test", () => {
  const qa = __dirname;
  // RECURSIVE, like Playwright's own `testDir`: a spec in a subfolder is still run.
  const plain = readdirSync(qa, { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith(".spec.ts"))
    .filter((f) => !/import \{ test \} from "\.\/fixture-test";/.test(readFileSync(join(qa, f), "utf8")))
    .sort();
  expect(
    plain,
    "a spec file outside the exempt list does not import { test } from ./fixture-test, so it does not reset the fixture store"
  ).toEqual(Object.keys(NOT_ON_THE_FIXTURE_SERVER).sort());
});

/**
 * BUG-1078 — the guard above checks an exempt file's IMPORT line only. For the entries whose
 * reason says « never calls the dev server », that reason is a claim about the file's tests,
 * and nothing checked it: a later test there that took `page` or `request` would run against
 * the fixture server with no reset, and pass. This test reads those files' syntax (the
 * TypeScript parser, not a word match: `contract-drift.spec.ts` has « page » and « request »
 * in comments, strings and a test title, and `stale-times-config.spec.ts` has « page » in a
 * comment, so a word match is red on a correct tree) and fails, naming the file and line, on:
 *
 *  1. any function whose first parameter destructures a fixture that reaches the dev server
 *     or a browser (`DEV_SERVER_FIXTURES`), or destructures `...rest` (it gets every fixture);
 *  2. a function passed straight to a `test…(…)` call (a test or hook) whose first parameter is
 *     NOT destructured, so the fixtures it takes cannot be read. `test.step` is not counted: its
 *     body gets a `TestStepInfo`, not fixtures (`body: (step: TestStepInfo) => …` in the installed
 *     @playwright/test 1.63 types);
 *  3. a call to a navigating or context-making method (`NAVIGATIONS`), on any receiver; a call
 *     to the global `fetch`; or any read of `globalThis.fetch` / `window.fetch`;
 *  4. a file that does not parse (its syntactic diagnostics are not empty), so that running this
 *     spec alone cannot pass an exempt file that would not even load.
 *
 * Known limits. NOT exhaustive; among them:
 *  - run (BUG-1078 mutant F): a test that takes its fixtures as one object through a wrapper
 *    that is not itself a `test…` call, like contract-drift's `known(title, body)`, is not caught
 *    by rule 2; rules 1 and 3 still read the function passed to it;
 *  - found by reading, not run: a computed member (`page["goto"]`); other HTTP paths
 *    (`node:http`, `undici`, `execFileSync("curl", …)`); rule 2 keys on the literal name `test`,
 *    so `import { test as it }` slips past it.
 * The live/stub-config entries are out of scope: their reasons name a config, which a reading of
 * the file cannot verify.
 */
const DEV_SERVER_FIXTURES = new Set(["page", "context", "browser", "request", "baseURL", "playwright"]);
const NAVIGATIONS = new Set(["goto", "reload", "goBack", "goForward", "waitForURL", "newPage", "newContext"]);

function devServerUses(file: string, text: string): string[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const found: string[] = [];
  const parse = ts.transpileModule(text, { fileName: file, reportDiagnostics: true }).diagnostics ?? [];
  for (const d of parse) {
    const line = d.start === undefined ? "?" : sf.getLineAndCharacterOfPosition(d.start).line + 1;
    found.push(`qa/${file}:${line} does not parse: ${ts.flattenDiagnosticMessageText(d.messageText, " ")}`);
  }
  const at = (node: ts.Node, what: string) =>
    found.push(`qa/${file}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1} ${what}`);
  const rootName = (e: ts.Expression): string | undefined =>
    ts.isIdentifier(e) ? e.text : ts.isPropertyAccessExpression(e) || ts.isCallExpression(e) ? rootName(e.expression) : undefined;

  const visit = (node: ts.Node): void => {
    if (ts.isFunctionLike(node) && node.parameters.length > 0) {
      const first = node.parameters[0].name;
      if (ts.isObjectBindingPattern(first)) {
        for (const el of first.elements) {
          const key = el.propertyName ?? el.name;
          if (el.dotDotDotToken) at(el, "destructures ...rest, so it takes every fixture");
          else if (ts.isIdentifier(key) && DEV_SERVER_FIXTURES.has(key.text)) at(el, `takes the ${key.text} fixture`);
        }
      }
    }
    if (ts.isCallExpression(node)) {
      const isStep = (e: ts.Expression): boolean =>
        ts.isPropertyAccessExpression(e) && (e.name.text === "step" || isStep(e.expression));
      if (rootName(node.expression) === "test" && !isStep(node.expression)) {
        for (const arg of node.arguments) {
          if ((ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) && arg.parameters.length > 0 && !ts.isObjectBindingPattern(arg.parameters[0].name)) {
            at(arg, "a test callback takes its fixtures as one object, so which ones it uses cannot be read");
          }
        }
      }
      const callee = node.expression;
      if (ts.isPropertyAccessExpression(callee) && NAVIGATIONS.has(callee.name.text)) at(node, `calls .${callee.name.text}()`);
      if (ts.isIdentifier(callee) && callee.text === "fetch") at(node, "calls fetch()");
    }
    if (
      ts.isPropertyAccessExpression(node) &&
      node.name.text === "fetch" &&
      ts.isIdentifier(node.expression) &&
      (node.expression.text === "globalThis" || node.expression.text === "window")
    ) {
      at(node, `reads ${node.expression.text}.fetch`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

test("an exempt file whose reason says it never calls the dev server takes no page or request fixture and does not navigate", () => {
  const diskOnly = Object.entries(NOT_ON_THE_FIXTURE_SERVER)
    .filter(([, why]) => why.includes("never calls the dev server"))
    .map(([file]) => file)
    .sort();
  // Pinned, so that rewording a reason cannot drop its file from this check unseen.
  expect(diskOnly, "the « never calls the dev server » entries changed: update this list with them").toEqual([
    "api-merge-condition.spec.ts",
    "contract-drift.spec.ts",
    "invariant-n-lint-bans.spec.ts",
    "reseed-selection-unit.spec.ts",
    "stale-times-config.spec.ts",
  ]);
  const uses = diskOnly.flatMap((file) => devServerUses(file, readFileSync(join(__dirname, file), "utf8")));
  expect(
    uses,
    "an exempt file's reason says it never calls the dev server, but it takes a browser or request fixture, or navigates: it would run against the fixture store with no reset. Import { test } from ./fixture-test and drop the exemption, or remove the call"
  ).toEqual([]);
});
