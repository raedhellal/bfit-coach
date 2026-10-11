import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { ESLint, type LintMessage } from "eslint";

/**
 * BUG-743 + BUG-744 — the lint half of ADR-0033 D33.13 points 1 and 2 (EV-356d), held by the
 * repo's REAL `.eslintrc.json`, through ESLint's Node API, on in-memory files under `src/`.
 *
 * Point 2, invariant N: the portal sends no AUTO prefetch, so `next/link` is reached only through
 * `src/components/ui/Link.tsx` (which forces `prefetch={false}`) and `roster/IntentLink.tsx`.
 * Point 1: the one FULL prefetch is IntentLink's `router.prefetch(href)`; any other host is an ADR
 * amendment. The runtime walk (`qa/no-auto-prefetch.spec.ts`) sees only the pages it visits and
 * counts AUTO, not FULL, so this gate is what stops a second host from merging.
 *
 * Before this file, `no-restricted-imports` read only static imports with the exact spelling
 * (BUG-743) and the FULL ban matched only `x.prefetch(...)` (BUG-744). Every row below is a shape
 * that must FAIL lint; each names the file it is linted as, because the bans are scoped to `src/`
 * and the parser depends on the extension. A snippet that does not parse is a failure of this
 * test, never a pass: a parse error is also a severity-2 message, so `fatal` is checked first.
 *
 * Over-matching is by design: a false positive fails loudly and is fixed by renaming (or an ADR
 * amendment); a false negative merges silently. So any identifier, string or template named
 * `prefetch` in `src/` is flagged, the router's or not (BUG-744 expected (4)).
 *
 * A pure check: it reads files and runs ESLint, it starts no server.
 */

const ROOT = resolve(__dirname, "..");
const PROBE = "src/components/zzprobe";

/** Which ADR clause the message must name: the rule fired for the right reason, not by accident. */
type Clause = "invariant N" | "D33.13 point 1";

interface Evasion {
  /** The row it comes from, or "control" for a shape that was flagged before and must stay so. */
  from: "BUG-743" | "BUG-744" | "BUG-743 extra" | "BUG-744 extra" | "control";
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
  {
    from: "BUG-744 extra",
    name: "a Link prefetch prop other than {false} (a FULL prefetch of every link if it were the wrapper's)",
    file: `${PROBE}/prefetchProp.tsx`,
    code: `import NextLink from "next/link";\nexport const A = () => <NextLink href="/" prefetch />;\nexport const B = () => <NextLink href="/" prefetch={null} />;\n`,
    clause: "D33.13 point 1",
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
 * The bans only hold if ESLint reaches every file with them ON. The bypasses a selector cannot
 * see: a nested `.eslintrc`, an `.eslintignore` or an `ignorePatterns` entry that drops a file, an
 * override that turns a ban off for one more file, a file whose extension `next lint` skips, and an
 * inline directive that switches a ban off for a line or a file.
 */
test.describe("every file in src is linted with both bans on", () => {
  const LINTED = new Set([".js", ".mjs", ".cjs", ".jsx", ".ts", ".mts", ".cts", ".tsx"]);
  const ASSETS = new Set([".css", ".png", ".svg", ".jpg", ".jpeg", ".webp", ".ico", ".json", ".woff", ".woff2"]);
  /** Every regular file under src, relative to the repo root. */
  const all = (readdirSync(join(ROOT, "src"), { recursive: true, encoding: "utf8" }) as string[])
    .map((f) => join("src", f))
    .filter((f) => statSync(join(ROOT, f)).isFile());
  const files = all.filter((f) => LINTED.has(extname(f)));

  test("no ESLint config or ignore file under src, and no file type next lint would skip", () => {
    expect(all.filter((f) => /(^|\/)(\.eslint[^/]*|package\.json)$/.test(f)), "a nested ESLint config can turn the bans off").toEqual([]);
    expect(all.filter((f) => !LINTED.has(extname(f)) && !ASSETS.has(extname(f))), "a file next lint does not read").toEqual([]);
  });

  /**
   * Not only ON: the SAME options as the probe path the evasions above are linted at. An override
   * that re-enabled a ban for one folder with a shorter selector list would pass an on/off check.
   */
  test("ESLint ignores no file in src, and each one gets both bans exactly as the probe does, except the two sanctioned files", async () => {
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

  test("no inline directive in src switches a ban off, or switches every rule off", () => {
    const found: string[] = [];
    for (const file of files) {
      const lines = readFileSync(join(ROOT, file), "utf8").split("\n");
      lines.forEach((line, i) => {
        const directive = /(?:\/\/|\/\*)\s*(eslint-disable(?:-next-line|-line)?|eslint-enable|eslint(?=\s))\s*([^*\n]*)/.exec(line);
        if (!directive) return;
        const names = directive[2].split("--")[0].trim();
        if (directive[1] === "eslint-enable") return;
        if (names === "" || /no-restricted-(imports|syntax)/.test(names)) found.push(`${file}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(found).toEqual([]);
  });
});
