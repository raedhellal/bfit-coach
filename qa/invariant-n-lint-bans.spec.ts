import { readdirSync, readFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { ESLint, type LintMessage } from "eslint";

/**
 * BUG-743 + BUG-744 + BUG-751 — the lint half of ADR-0033 D33.13 points 1 and 2 (EV-356d), held
 * by the repo's REAL `.eslintrc.json`, through ESLint's Node API, on in-memory files.
 *
 * Point 2, invariant N: the portal sends no AUTO prefetch, so `next/link` is reached only through
 * `src/components/ui/Link.tsx` (which forces `prefetch={false}`) and `roster/IntentLink.tsx`.
 * Point 1: the one FULL prefetch is IntentLink's `router.prefetch(href)`; any other host is an ADR
 * amendment. The runtime walk (`qa/no-auto-prefetch.spec.ts`) sees only the pages it visits and
 * counts AUTO, not FULL, so this gate is what stops a second host from merging.
 *
 * Before this file, `no-restricted-imports` read only static imports with the exact spelling
 * (BUG-743) and the FULL ban matched only `x.prefetch(...)` (BUG-744). Every row below is a shape
 * that must FAIL lint; each names the file it is linted as, because the bans exempt test code
 * (`qa/`, the root playwright configs) and the parser depends on the extension. A snippet that does not parse is a failure of this
 * test, never a pass: a parse error is also a severity-2 message, so `fatal` is checked first.
 *
 * Over-matching is by design: a false positive fails loudly and is fixed by renaming (or an ADR
 * amendment); a false negative merges silently. So any identifier, string or template named
 * `prefetch` in `src/` is flagged, the router's or not (BUG-744 expected (4)).
 *
 * What no selector can see, because ESLint has no data flow. Each of these lints CLEAN (staff
 * confirmed them in the BUG-743/744 review): a name built at runtime, such as `"pre" + "fetch"`,
 * `` `pre${"fetch"}` `` or `["pre", "fetch"].join("")`; a computed key spread onto a Link
 * (`{...{ [k]: true }}`); and an aliased `require` called with a computed name
 * (`const r = require; r(m)`). Behind them are tsc, `next build` and the runtime walk.
 *
 * A pure check: it reads files and runs ESLint, it starts no server.
 */

const ROOT = resolve(__dirname, "..");
const PROBE = "src/components/zzprobe";

/** Which ADR clause the message must name: the rule fired for the right reason, not by accident. */
type Clause = "invariant N" | "D33.13 point 1" | "Next's internals by a deep path" | "Test code is not app code";

interface Evasion {
  /** The row it comes from, or "control" for a shape that was flagged before and must stay so. */
  from: "BUG-743" | "BUG-744" | "BUG-743 extra" | "BUG-744 extra" | "BUG-751" | "control";
  name: string;
  file: string;
  code: string;
  clause: Clause;
}

const ROUTER = `"use client";\nimport { useRouter } from "next/navigation";\n`;

const EVASIONS: Evasion[] = [
  // ---- BUG-743: next/link reached other than by the exact static import ------------------------
  {
    from: "BUG-743",
    name: "dynamic(() => import(\"next/link\"))",
    file: `${PROBE}/dynamicImport.tsx`,
    code: `import dynamic from "next/dynamic";\nexport const L = dynamic(() => import("next/link"));\n`,
    clause: "invariant N",
  },
  {
    from: "BUG-743",
    name: "require(\"next/link\").default",
    file: `${PROBE}/requireLink.tsx`,
    code: `const L = require("next/link").default;\nexport default L;\n`,
    clause: "invariant N",
  },
  {
    from: "BUG-743",
    name: "a static import by a relative path into node_modules",
    file: `${PROBE}/relativeImport.tsx`,
    code: `import L from "../../../node_modules/next/link";\nexport default L;\n`,
    clause: "invariant N",
  },
  {
    from: "BUG-743",
    name: "import() in a .js file (Babel parser, not TypeScript's)",
    file: `${PROBE}/dynamicImport.js`,
    code: `export const L = () => import("next/link");\n`,
    clause: "invariant N",
  },
  {
    from: "BUG-743",
    name: "require() in a .js file",
    file: `${PROBE}/requireLink.js`,
    code: `export const L = require("next/link").default;\n`,
    clause: "invariant N",
  },
  {
    from: "BUG-743 extra",
    name: "import() by a relative path into node_modules",
    file: `${PROBE}/relativeDynamic.tsx`,
    code: `export const L = () => import("../../../node_modules/next/link");\n`,
    clause: "invariant N",
  },
  {
    from: "BUG-743 extra",
    name: "the file name: next/link.js",
    file: `${PROBE}/linkDotJs.tsx`,
    code: `import L from "next/link.js";\nexport default L;\n`,
    clause: "invariant N",
  },
  {
    from: "BUG-743 extra",
    name: "through the @/ alias: @/../node_modules/next/link",
    file: `${PROBE}/aliasPath.tsx`,
    code: `import L from "@/../node_modules/next/link";\nexport default L;\n`,
    clause: "invariant N",
  },
  {
    from: "BUG-743 extra",
    name: "an absolute path",
    file: `${PROBE}/absolutePath.tsx`,
    code: `import L from "/srv/app/node_modules/next/link";\nexport default L;\n`,
    clause: "invariant N",
  },
  {
    from: "BUG-743 extra",
    name: "a path that normalises to it: next/./link",
    file: `${PROBE}/dotSegment.tsx`,
    code: `import L from "next/./link";\nexport default L;\n`,
    clause: "invariant N",
  },
  {
    from: "BUG-743 extra",
    name: "another case: next/Link (resolves on a case-insensitive disk)",
    file: `${PROBE}/upperCase.tsx`,
    code: `import L from "next/Link";\nexport default L;\n`,
    clause: "invariant N",
  },
  {
    from: "BUG-743 extra",
    name: "a resource query: import(\"next/link?x\")",
    file: `${PROBE}/resourceQuery.tsx`,
    code: `export const L = () => import("next/link?x");\n`,
    clause: "invariant N",
  },
  {
    from: "BUG-743 extra",
    name: "a re-export: export { default } from \"next/link.js\"",
    file: `${PROBE}/reExport.tsx`,
    code: `export { default } from "next/link.js";\n`,
    clause: "invariant N",
  },
  {
    from: "BUG-743 extra",
    name: "a template literal: import(`next/link`)",
    file: `${PROBE}/templateImport.tsx`,
    code: "export const L = () => import(`next/link`);\n",
    clause: "invariant N",
  },
  {
    from: "BUG-743 extra",
    name: "a computed module name: import(`next/${\"link\"}`)",
    file: `${PROBE}/computedImport.tsx`,
    code: 'export const L = () => import(`next/${"link"}`);\n',
    clause: "invariant N",
  },
  {
    from: "BUG-743 extra",
    name: "a module name in a variable: const m = ...; import(m)",
    file: `${PROBE}/variableImport.tsx`,
    code: `const m = ["next", "link"].join("/");\nexport const L = () => import(m);\n`,
    clause: "invariant N",
  },
  {
    from: "BUG-743 extra",
    name: "a computed require: require(m)",
    file: `${PROBE}/variableRequire.tsx`,
    code: `const m = ["next", "link"].join("/");\nexport const L = require(m);\n`,
    clause: "invariant N",
  },
  {
    from: "BUG-743 extra",
    name: "another require: module.require(\"next/link\")",
    file: `${PROBE}/moduleRequire.js`,
    code: `export const L = module.require("next/link");\n`,
    clause: "invariant N",
  },
  // A template outside import()/require(): only the TemplateElement selectors see these (staff S2).
  {
    from: "BUG-743 extra",
    name: "a template in another require: module.require(`next/link`)",
    file: `${PROBE}/moduleRequireTemplate.tsx`,
    code: "export const L = module.require(`next/link`);\n",
    clause: "invariant N",
  },
  {
    from: "BUG-743 extra",
    name: "a template deep path in another require: module.require(`next/dist/client/link`)",
    file: `${PROBE}/moduleRequireDeepLinkTemplate.tsx`,
    code: "export const L = module.require(`next/dist/client/link`);\n",
    clause: "invariant N",
  },
  {
    from: "BUG-744 extra",
    name: "a template deep path that is not Link: module.require(`next/dist/client/components/app-router`)",
    file: `${PROBE}/moduleRequireDeepTemplate.tsx`,
    code: "export const R = module.require(`next/dist/client/components/app-router`);\n",
    clause: "Next's internals by a deep path",
  },
  {
    from: "BUG-743 extra",
    name: "the deep module by import(): import(\"next/dist/client/link\")",
    file: `${PROBE}/deepDynamic.tsx`,
    code: `export const L = () => import("next/dist/client/link");\n`,
    clause: "invariant N",
  },
  {
    from: "BUG-744 extra",
    name: "Next's router internals by a deep path (prefetch under another name)",
    file: `${PROBE}/deepInternals.tsx`,
    code: `import { prefetchQueue } from "next/dist/client/components/router-reducer/reducers/prefetch-reducer";\nexport const q = prefetchQueue;\n`,
    clause: "invariant N",
  },
  // Flagged before this fix (QA's census at f303bc0): they must stay flagged.
  {
    from: "control",
    name: "import L from \"next/link\"",
    file: `${PROBE}/plainImport.tsx`,
    code: `import L from "next/link";\nexport default L;\n`,
    clause: "invariant N",
  },
  {
    from: "control",
    name: "export * from \"next/link\"",
    file: `${PROBE}/exportStar.tsx`,
    code: `export * from "next/link";\n`,
    clause: "invariant N",
  },
  {
    from: "control",
    name: "import type { LinkProps } from \"next/link\"",
    file: `${PROBE}/typeImport.tsx`,
    code: `import type { LinkProps } from "next/link";\nexport type P = LinkProps;\n`,
    clause: "invariant N",
  },
  {
    from: "control",
    name: "import L from \"next/dist/client/link\"",
    file: `${PROBE}/deepStatic.tsx`,
    code: `import L from "next/dist/client/link";\nexport default L;\n`,
    clause: "invariant N",
  },
  {
    from: "control",
    name: "import L from \"next/dist/esm/client/link.js\"",
    file: `${PROBE}/deepEsmStatic.tsx`,
    code: `import L from "next/dist/esm/client/link.js";\nexport default L;\n`,
    clause: "invariant N",
  },

  // ---- BUG-744: a FULL prefetch other than as x.prefetch(...) ---------------------------------
  {
    from: "BUG-744",
    name: "const { prefetch } = useRouter(); prefetch(x)",
    file: `${PROBE}/destructured.tsx`,
    code: `${ROUTER}export function P() {\n  const { prefetch } = useRouter();\n  prefetch("/clients/x");\n  return null;\n}\n`,
    clause: "D33.13 point 1",
  },
  {
    from: "BUG-744",
    name: "r[\"prefetch\"](x)",
    file: `${PROBE}/computedMember.tsx`,
    code: `${ROUTER}export function P() {\n  const r = useRouter();\n  r["prefetch"]("/clients/x");\n  return null;\n}\n`,
    clause: "D33.13 point 1",
  },
  {
    from: "BUG-744 extra",
    name: "a renamed destructure: const { prefetch: go } = useRouter(); go(x)",
    file: `${PROBE}/renamed.tsx`,
    code: `${ROUTER}export function P() {\n  const { prefetch: go } = useRouter();\n  go("/clients/x");\n  return null;\n}\n`,
    clause: "D33.13 point 1",
  },
  {
    from: "BUG-744 extra",
    name: "a quoted destructure key: const { \"prefetch\": go } = useRouter()",
    file: `${PROBE}/quotedKey.tsx`,
    code: `${ROUTER}export function P() {\n  const { "prefetch": go } = useRouter();\n  go("/clients/x");\n  return null;\n}\n`,
    clause: "D33.13 point 1",
  },
  {
    from: "BUG-744 extra",
    name: "a computed destructure key: const { [\"prefetch\"]: go } = useRouter()",
    file: `${PROBE}/computedKey.tsx`,
    code: `${ROUTER}export function P() {\n  const { ["prefetch"]: go } = useRouter();\n  go("/clients/x");\n  return null;\n}\n`,
    clause: "D33.13 point 1",
  },
  {
    from: "BUG-744 extra",
    name: "a template member: r[`prefetch`](x)",
    file: `${PROBE}/templateMember.tsx`,
    code: `${ROUTER}export function P() {\n  const r = useRouter();\n  r[\`prefetch\`]("/clients/x");\n  return null;\n}\n`,
    clause: "D33.13 point 1",
  },
  {
    from: "BUG-744 extra",
    name: "the name in a variable: const k = \"prefetch\"; r[k](x)",
    file: `${PROBE}/keyVariable.tsx`,
    code: `${ROUTER}const k = "prefetch" as const;\nexport function P() {\n  const r = useRouter();\n  r[k]("/clients/x");\n  return null;\n}\n`,
    clause: "D33.13 point 1",
  },
  {
    from: "BUG-744 extra",
    name: "the method taken, not called: const go = r.prefetch; go(x)",
    file: `${PROBE}/methodTaken.tsx`,
    code: `${ROUTER}export function P() {\n  const r = useRouter();\n  const go = r.prefetch;\n  go("/clients/x");\n  return null;\n}\n`,
    clause: "D33.13 point 1",
  },
  {
    from: "BUG-744 extra",
    name: "the method passed as a callback: hrefs.forEach(r.prefetch)",
    file: `${PROBE}/methodPassed.tsx`,
    code: `${ROUTER}export function P() {\n  const r = useRouter();\n  ["/clients/x"].forEach(r.prefetch);\n  return null;\n}\n`,
    clause: "D33.13 point 1",
  },
  {
    from: "BUG-744 extra",
    name: "Reflect.get(r, \"prefetch\")",
    file: `${PROBE}/reflectGet.tsx`,
    code: `${ROUTER}export function P() {\n  const r = useRouter();\n  (Reflect.get(r, "prefetch") as (h: string) => void)("/clients/x");\n  return null;\n}\n`,
    clause: "D33.13 point 1",
  },
  {
    from: "BUG-744 extra",
    name: "a bare prefetch(x) of a local function, not the router's (flagged on purpose)",
    file: `${PROBE}/localFunction.tsx`,
    code: `function prefetch(_href: string) {}\nexport function P() {\n  prefetch("/clients/x");\n  return null;\n}\n`,
    clause: "D33.13 point 1",
  },
  // A Link prefetch prop other than the literal {false}: a FULL prefetch of every link if it were
  // the wrapper's (true), Next 14's AUTO (null), or a string that is truthy at runtime ("false").
  {
    from: "BUG-744 extra",
    name: "a Link prefetch prop: <NextLink prefetch> (true, FULL)",
    file: `${PROBE}/prefetchPropTrue.tsx`,
    code: `import NextLink from "next/link";\nexport const A = () => <NextLink href="/" prefetch />;\n`,
    clause: "D33.13 point 1",
  },
  {
    from: "BUG-744 extra",
    name: "a Link prefetch prop: <NextLink prefetch={null}> (AUTO)",
    file: `${PROBE}/prefetchPropNull.tsx`,
    code: `import NextLink from "next/link";\nexport const B = () => <NextLink href="/" prefetch={null} />;\n`,
    clause: "D33.13 point 1",
  },
  {
    from: "BUG-744 extra",
    name: "a Link prefetch prop: <NextLink prefetch={\"false\"}> (a string, so FULL)",
    file: `${PROBE}/prefetchPropString.tsx`,
    code: `import NextLink from "next/link";\nexport const C = () => <NextLink href="/" prefetch={"false"} />;\n`,
    clause: "D33.13 point 1",
  },

  // ---- BUG-751: app code reaching test code, which the bans exempt -----------------------------
  // qa/ and the root playwright configs are the one exemption from the bans (they drive the
  // router's prefetch on purpose). A file Next can bundle that imports from them would carry an
  // unlinted next/link or FULL prefetch into the portal, so the import itself is banned.
  {
    from: "BUG-751",
    name: "a static import from qa/ by a relative path",
    file: `${PROBE}/qaStatic.tsx`,
    code: `import L from "../../../qa/NavLink";\nexport default L;\n`,
    clause: "Test code is not app code",
  },
  {
    from: "BUG-751",
    name: "a re-export from qa/ through the @/ alias",
    file: `${PROBE}/qaAlias.tsx`,
    code: `export { default } from "@/../qa/NavLink";\n`,
    clause: "Test code is not app code",
  },
  {
    from: "BUG-751",
    name: "another case: ../QA/ (resolves on a case-insensitive disk)",
    file: `${PROBE}/qaUpper.tsx`,
    code: `import L from "../../../QA/NavLink";\nexport default L;\n`,
    clause: "Test code is not app code",
  },
  {
    from: "BUG-751",
    name: "import() from qa/",
    file: `${PROBE}/qaDynamic.tsx`,
    code: `export const L = () => import("../../../qa/NavLink");\n`,
    clause: "Test code is not app code",
  },
  {
    from: "BUG-751",
    name: "require() from qa/ in a .js file",
    file: `${PROBE}/qaRequire.js`,
    code: `export const L = require("../../../qa/NavLink").default;\n`,
    clause: "Test code is not app code",
  },
  {
    from: "BUG-751",
    name: "a template: import(`../qa/...`)",
    file: `${PROBE}/qaTemplate.tsx`,
    code: "export const L = () => import(`../../../qa/NavLink`);\n",
    clause: "Test code is not app code",
  },
  {
    from: "BUG-751",
    name: "the qa folder itself: import from \"../../../qa\"",
    file: `${PROBE}/qaFolder.tsx`,
    code: `import * as Q from "../../../qa";\nexport default Q;\n`,
    clause: "Test code is not app code",
  },
  {
    from: "BUG-751",
    name: "a root playwright config",
    file: `${PROBE}/playwrightConfig.tsx`,
    code: `import c from "../../../playwright.start.config";\nexport default c;\n`,
    clause: "Test code is not app code",
  },
  {
    from: "BUG-751",
    name: "from a file at the repo root: \"./qa/...\"",
    file: "zzprobe-root.tsx",
    code: `import L from "./qa/NavLink";\nexport default L;\n`,
    clause: "Test code is not app code",
  },
  {
    from: "control",
    name: "r.prefetch(x)",
    file: `${PROBE}/dotCall.tsx`,
    code: `${ROUTER}export function P() {\n  const r = useRouter();\n  r.prefetch("/clients/x");\n  return null;\n}\n`,
    clause: "D33.13 point 1",
  },
  {
    from: "control",
    name: "r?.prefetch(x)",
    file: `${PROBE}/optionalCall.tsx`,
    code: `${ROUTER}export function P() {\n  const r = useRouter();\n  r?.prefetch("/clients/x");\n  return null;\n}\n`,
    clause: "D33.13 point 1",
  },
];

const BANS = new Set(["no-restricted-imports", "no-restricted-syntax"]);
const LINK = "src/components/ui/Link.tsx";
const INTENT = "src/components/roster/IntentLink.tsx";

const eslint = new ESLint({ cwd: ROOT, useEslintrc: true });
const describe = (m: LintMessage) => `${m.line}:${m.column} ${m.ruleId ?? "(parse)"}: ${m.message}`;

test.describe("BUG-743 + BUG-744: every evasion of invariant N's lint bans fails lint", () => {
  for (const evasion of EVASIONS) {
    test(`${evasion.from}: ${evasion.name}`, async () => {
      const [result] = await eslint.lintText(evasion.code, { filePath: join(ROOT, evasion.file) });
      const fatal = result.messages.filter((m) => m.fatal);
      expect(fatal.map(describe), "the snippet parses (a parse error is not a ban)").toEqual([]);
      const bans = result.messages.filter((m) => m.severity === 2 && m.ruleId !== null && BANS.has(m.ruleId));
      test.info().annotations.push({ type: "lint", description: bans.map(describe).join(" | ") || "(no ban fired)" });
      expect(
        bans.filter((m) => m.message.includes(evasion.clause)).map(describe),
        `${evasion.file} must fail lint with a message naming ADR-0033 ${evasion.clause}`
      ).not.toEqual([]);
    });
  }
});

test.describe("the sanctioned files still lint clean, and only because of their overrides", () => {
  for (const file of [LINK, INTENT]) {
    test(`${file} lints with no error at all`, async () => {
      const [result] = await eslint.lintFiles([join(ROOT, file)]);
      expect(result.messages.map(describe)).toEqual([]);
    });
  }

  /**
   * The positive control. The same source text at another path must fail: otherwise "clean" above
   * could be a rule that sees nothing, and the overrides would be untested.
   */
  for (const [file, rules] of [
    [LINK, ["no-restricted-imports"]],
    [INTENT, ["no-restricted-imports", "no-restricted-syntax"]],
  ] as const) {
    test(`${file}'s own text, linted as another file in src, fails ${rules.join(" and ")}`, async () => {
      const source = readFileSync(join(ROOT, file), "utf8");
      const [result] = await eslint.lintText(source, { filePath: join(ROOT, PROBE, "Copy.tsx") });
      const fired = new Set(result.messages.filter((m) => m.severity === 2).map((m) => m.ruleId));
      for (const rule of rules) expect(fired.has(rule), `${rule} fires on a copy of ${file}`).toBe(true);
    });
  }

  /**
   * The wrapper is exempt from the import ban only. Edited to `prefetch` (true: a FULL prefetch of
   * every link in the portal) or `prefetch={null}` (Next 14's AUTO), it fails lint in place.
   */
  for (const prop of ["prefetch", "prefetch={null}", "prefetch={true}"]) {
    test(`${LINK} edited to <NextLink ${prop}> fails D33.13 point 1 at its own path`, async () => {
      const source = readFileSync(join(ROOT, LINK), "utf8");
      // The JSX attribute, not the same words in the file's doc comment.
      const jsx = /(<NextLink\b[^>]*?)\bprefetch=\{false\}/;
      expect(source, "the wrapper still renders <NextLink ... prefetch={false}>").toMatch(jsx);
      const [result] = await eslint.lintText(source.replace(jsx, `$1${prop}`), { filePath: join(ROOT, LINK) });
      expect(result.messages.filter((m) => m.fatal).map(describe), "the edit parses").toEqual([]);
      const point1 = result.messages.filter((m) => m.ruleId === "no-restricted-syntax" && m.message.includes("D33.13 point 1"));
      expect(point1.map(describe)).not.toEqual([]);
    });
  }
});

/**
 * S3 (staff, BUG-743/744 review). IntentLink has `no-restricted-syntax` OFF, so lint cannot see what
 * its `<Link>` does: its `prefetch={false}` is pinned here instead, as the wrapper's is above. Without
 * it, the roster rows would add Link's AUTO prefetch (viewport, hover, touch) to the ruled FULL one.
 */
test("roster/IntentLink.tsx renders exactly one <Link>, and it carries prefetch={false}", () => {
  const code = readFileSync(join(ROOT, INTENT), "utf8")
    .split("\n")
    .filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line))
    .join("\n");
  expect(code.match(/<Link\b/g) ?? [], "one <Link> element in the component's code").toHaveLength(1);
  expect(code).toMatch(/return \(\s*<Link\b[^>]*?\bprefetch=\{false\}/);
});

/**
 * BUG-751. Before it, the bans' override was `files: ["src/**"]` and the `lint` script read only
 * `src` and `qa`: a `shared/NavLink.tsx` or a root `NavLink.tsx` re-exporting next/link, imported by
 * a src component, was bundled and never linted. The override now covers every file except test
 * code, and `next build` and `npm run lint` read the whole repo (`eslint.dirs` in next.config.mjs).
 *
 * The rows below lint the same shapes at paths outside src that have no file today, so a folder
 * added tomorrow is covered before it exists: the census further down only sees files on disk.
 * The last three paths are inside the exemption's NAMES but not its paths: an override glob with
 * no slash matches a basename in any folder, so an unanchored `playwright*.config.ts` exemption
 * would have exempted `src/playwright.zz.config.ts` too.
 */
test.describe("BUG-751: the bans hold outside src, on any path but test code", () => {
  const OUTSIDE = [
    "shared/zzprobe/Probe.tsx",
    "zzprobe.tsx",
    "lib/deep/zzprobe/Probe.tsx",
    "src/qa/Probe.tsx",
    "src/playwright.zz.config.ts",
    "shared/playwright.config.ts",
  ];
  /** `jsx`: linted as `.tsx` where the path is `.ts`, which would not parse it. */
  const SHAPES: Array<{ name: string; code: string; clause: Clause; jsx?: true }> = [
    { name: "import NextLink from \"next/link\" (QA's plant)", code: `import NextLink from "next/link";\nexport default NextLink;\n`, clause: "invariant N" },
    { name: "export { default } from \"next/link.js\"", code: `export { default } from "next/link.js";\n`, clause: "invariant N" },
    {
      name: "useRouter().prefetch(x)",
      code: `${ROUTER}export function P() {\n  useRouter().prefetch("/clients/x");\n  return null;\n}\n`,
      clause: "D33.13 point 1",
    },
    {
      name: "const { prefetch: go } = useRouter()",
      code: `${ROUTER}export function P() {\n  const { prefetch: go } = useRouter();\n  go("/clients/x");\n  return null;\n}\n`,
      clause: "D33.13 point 1",
    },
    {
      name: "a FULL <Link prefetch={true}>",
      code: `import Link from "@/components/ui/Link";\nexport const A = () => <Link href="/" prefetch={true} />;\n`,
      clause: "D33.13 point 1",
      jsx: true,
    },
  ];
  for (const path of OUTSIDE) {
    for (const shape of SHAPES) {
      const file = shape.jsx && path.endsWith(".ts") ? `${path}x` : path;
      test(`${file}: ${shape.name}`, async () => {
        const [result] = await eslint.lintText(shape.code, { filePath: join(ROOT, file) });
        expect(result.messages.filter((m) => m.fatal).map(describe), "the snippet parses").toEqual([]);
        const bans = result.messages.filter((m) => m.severity === 2 && m.ruleId !== null && BANS.has(m.ruleId));
        expect(
          bans.filter((m) => m.message.includes(shape.clause)).map(describe),
          `${file} must fail lint with a message naming ADR-0033 ${shape.clause}`
        ).not.toEqual([]);
      });
    }
  }
});

/**
 * The bans only hold if ESLint reaches every file Next can bundle, with them ON. Next bundles any
 * file a src import reaches, wherever it lives, so the census walks the whole repo rather than
 * `src/` (BUG-751), and what it skips is NAMED:
 *   · test code: `qa/**` and the root `playwright*.config.ts`, the bans override's `excludedFiles`.
 *     App code may not import from it (the BUG-751 rows above), so it never reaches the bundle;
 *   · what git does not ship (the directories `.gitignore` names: `node_modules/`, `.next/`, the
 *     report folders): a Vercel build is a clone, so it cannot bundle them;
 *   · `next-env.d.ts`, which Next generates, ESLint ignores and no bundle contains.
 * Everything else must be linted with both bans exactly as the probe path is, a dot-folder
 * included: ESLint skips those by default, so `.eslintrc.json` opens them (`"!.*"`) and names the
 * ones to keep closed (`.git/`, `.next/`, `.vercel/`, `.idea/`, all unshipped).
 *
 * The bypasses a selector cannot see: a nested `.eslintrc`, an `.eslintignore` or an
 * `ignorePatterns` entry that drops a file, an override that turns a ban off for one more file, a
 * file whose extension `next build` skips, and an inline directive that switches a ban off.
 */
test.describe("every file Next can bundle is linted with both bans on", () => {
  /**
   * S1 (staff): what `next build` lints, which is the Vercel pass: `.js`, `.jsx`, `.ts` and `.tsx`
   * only (`next/dist/lib/eslint/runLintCheck.js:137-142`). `next lint`'s CLI default also reads
   * `.mjs`, `.cjs`, `.mts` and `.cts`, but a build would ship an `.mjs` that re-exports next/link
   * unlinted. So those four extensions are forbidden in src, and outside it they are allowed only
   * for the node entry points (`next.config.mjs`, `scripts/`), which `npm run lint` and this census
   * still lint with both bans.
   */
  const LINTED = new Set([".js", ".jsx", ".ts", ".tsx"]);
  const CODE = new Set([...LINTED, ".mjs", ".cjs", ".mts", ".cts"]);
  const ASSETS = new Set([".css", ".png", ".svg", ".jpg", ".jpeg", ".webp", ".ico", ".json", ".woff", ".woff2"]);
  const NODE_ENTRY = (f: string) => f === "next.config.mjs" || f.startsWith("scripts/");
  const TEST_CODE = (f: string) => f.startsWith("qa/") || /^playwright[^/]*\.config\.ts$/.test(f);

  /** The directories git does not ship: the `.gitignore` entries that end in a slash, plus `.git`. */
  const UNSHIPPED = new Set([
    ".git",
    ...readFileSync(join(ROOT, ".gitignore"), "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => /^[^#!*][^*]*\/$/.test(line))
      .map((line) => line.replace(/^\/|\/$/g, "")),
  ]);

  /** Every regular file in the repo that git can ship, relative to the root, `/`-separated. */
  const walk = (dir: string): string[] =>
    readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
      const path = dir ? `${dir}/${entry.name}` : entry.name;
      // A directory's base name, at any depth, as git reads `node_modules/` (the worktree's
      // node_modules is a symlink, so it is matched by name here, never followed).
      if (UNSHIPPED.has(entry.name)) return [];
      if (entry.isDirectory()) return walk(path);
      return entry.isFile() ? [path] : [];
    });
  const all = walk("");
  const inSrc = all.filter((f) => f.startsWith("src/"));
  const files = all.filter((f) => CODE.has(extname(f)) && !TEST_CODE(f) && f !== "next-env.d.ts");

  test("the census reaches the sanctioned files and files outside src (N3: a list that missed them would prove nothing about them)", () => {
    expect([...UNSHIPPED], "node_modules and .next are read from .gitignore").toEqual(expect.arrayContaining(["node_modules", ".next"]));
    expect(files).toContain(LINK);
    expect(files).toContain(INTENT);
    expect(files).toContain("next.config.mjs");
    expect(files).toContain("scripts/spec-sync.mjs");
    expect(files.filter((f) => f.startsWith("qa/")), "test code is the exemption").toEqual([]);
  });

  test("no ESLint config or ignore file but the root's, and no file type next build's lint would skip", () => {
    const configs = all.filter((f) => /(^|\/)(\.eslint[^/]*|eslint\.config\.[^/]*|package\.json)$/.test(f));
    expect(configs, "a nested ESLint config can turn the bans off").toEqual([".eslintrc.json", "package.json"]);
    expect(inSrc.filter((f) => !LINTED.has(extname(f)) && !ASSETS.has(extname(f))), "a file in src next build's lint does not read").toEqual([]);
    expect(
      files.filter((f) => !LINTED.has(extname(f)) && !NODE_ENTRY(f)),
      "an .mjs/.cjs/.mts/.cts outside the node entry points: next build's lint does not read it"
    ).toEqual([]);
  });

  /**
   * Not only ON: the SAME options as the probe path the evasions above are linted at. An override
   * that re-enabled a ban for one folder with a shorter selector list would pass an on/off check.
   */
  test("ESLint ignores no file Next can bundle, and each one gets both bans exactly as the probe does, except the two sanctioned files", async () => {
    const probe = (await eslint.calculateConfigForFile(join(ROOT, PROBE, "probe.tsx"))).rules ?? {};
    const level = (setting: unknown) => (Array.isArray(setting) ? setting[0] : setting);
    for (const rule of BANS) expect([2, "error"], `${rule} is an error at the probe path`).toContain(level(probe[rule]));
    const off: string[] = [];
    for (const file of files) {
      const absolute = join(ROOT, file);
      if (await eslint.isPathIgnored(absolute)) {
        off.push(`${file}: ignored`);
        continue;
      }
      const { rules = {} } = await eslint.calculateConfigForFile(absolute);
      for (const rule of BANS) {
        const sanctioned = (file === LINK && rule === "no-restricted-imports") || file === INTENT;
        if (sanctioned) continue;
        // Severity spelled "error" or 2 resolves to the same number; compare the options after it.
        const same = level(rules[rule]) === level(probe[rule]) && JSON.stringify(rules[rule]) === JSON.stringify(probe[rule]);
        if (!same) off.push(`${file}: ${rule} differs from the probe's (${JSON.stringify(level(rules[rule]))})`);
      }
    }
    expect(off).toEqual([]);
  });

  /**
   * B1 (staff). ESLint judges the directives, not a regex: a line-by-line scan missed a block
   * comment that puts `eslint-disable no-restricted-syntax` on its own line, which ESLint honours.
   * With inline config OFF, no file Next can bundle may report either ban. Directives for OTHER
   * rules (`InviteLinkPanel.tsx`'s img, `portalEvents.ts`'s console) stay allowed: their rules are
   * ignored. A file ESLint ignores is reported by the test above, not here.
   */
  test("with inline directives ignored, no file Next can bundle reports either ban", async () => {
    const strict = new ESLint({ cwd: ROOT, useEslintrc: true, allowInlineConfig: false });
    const results = await strict.lintFiles(files.map((f) => join(ROOT, f)));
    const hidden = results.flatMap((r) =>
      r.messages
        .filter((m) => m.ruleId !== null && BANS.has(m.ruleId))
        .map((m) => `${r.filePath.slice(ROOT.length + 1)}:${describe(m)}`)
    );
    expect(hidden, "a ban hidden by an inline directive").toEqual([]);
  });
});
