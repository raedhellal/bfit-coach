import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import type { Page } from "@playwright/test";
import ts from "typescript";

/**
 * A browser unit harness for client modules, with the React the portal actually runs.
 *
 * The portal has no jsdom, no Testing Library and no bundler a spec can call, and some rules
 * can only be held in a real DOM with a real React commit: ADR-0033 D33.14's U1–U3 and U7–U9
 * are about capture listeners, a `popstate` task and WHICH PHASE of a React commit a check runs
 * in. So this file is a tiny CommonJS bundler: it transpiles the named source files with the
 * project's own `typescript` (types stripped, JSX to `react/jsx-runtime`), follows their
 * `require`s, and serves the result into a real page. React and ReactDOM are Next's compiled
 * copies (`next/dist/compiled/react-dom`, 18.3.0-canary), the same code `next start` ships, in
 * their development build.
 *
 * It reads the source FROM DISK at each call, so a mutant written into `src/` is what runs.
 *
 * `stubs` replace a module by specifier (`@/lib/clientSession`) with JavaScript source: the
 * seams a unit test needs (a `location.replace` that does not unload the page, a router).
 */

const ROOT = resolve(__dirname, "..");
const nodeRequire = createRequire(join(ROOT, "package.json"));

/** Bare specifiers, pinned to Next's compiled copies (files, not package subpaths). */
const COMPILED = join(ROOT, "node_modules", "next", "dist", "compiled");
const ALIASES: Record<string, string> = {
  react: join(COMPILED, "react", "index.js"),
  "next/dist/compiled/react": join(COMPILED, "react", "index.js"),
  "react/jsx-runtime": join(COMPILED, "react", "jsx-runtime.js"),
  "react-dom": join(COMPILED, "react-dom", "index.js"),
  "next/dist/compiled/react-dom": join(COMPILED, "react-dom", "index.js"),
  "react-dom/client": join(COMPILED, "react-dom", "client.js"),
  scheduler: join(COMPILED, "scheduler", "index.js"),
  "next/dist/compiled/scheduler": join(COMPILED, "scheduler", "index.js"),
};

function resolveFile(spec: string, from: string): string {
  if (spec.startsWith("@/") || spec.startsWith(".")) {
    const base = spec.startsWith("@/") ? join(ROOT, "src", spec.slice(2)) : resolve(dirname(from), spec);
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, join(base, "index.ts"), join(base, "index.js")]) {
      if (existsSync(candidate) && !candidate.endsWith("/") && /\.(tsx?|js)$/.test(candidate)) return candidate;
    }
    throw new Error(`unit-harness: cannot resolve ${spec} from ${relative(ROOT, from)}`);
  }
  if (ALIASES[spec]) return ALIASES[spec];
  return nodeRequire.resolve(spec, { paths: [dirname(from)] });
}

function compile(file: string): string {
  const source = readFileSync(file, "utf8");
  if (file.endsWith(".js")) return source;
  return ts.transpileModule(source, {
    fileName: file,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
}

const REQUIRE = /\brequire\(\s*(["'])([^"']+)\1\s*\)/g;

/**
 * One script that defines every module and returns `require(entry)` for each entry as
 * `window.__unit[name]`. `stubs` win over files.
 */
export function bundle(entries: Record<string, string>, stubs: Record<string, string>): string {
  const ids = new Map<string, number>();
  const bodies: string[] = [];
  const stubIds = new Map<string, number>();

  function add(key: string, code: string, resolveDep: (spec: string) => number): number {
    const id = bodies.length;
    ids.set(key, id);
    bodies.push("");
    const deps: Record<string, number> = {};
    for (const [, , spec] of code.matchAll(REQUIRE)) deps[spec] = resolveDep(spec);
    bodies[id] =
      `[function (module, exports, require) {\n${code}\n}, ${JSON.stringify(deps)}]`;
    return id;
  }

  function stub(spec: string): number {
    const known = stubIds.get(spec);
    if (known !== undefined) return known;
    const id = add(`stub:${spec}`, stubs[spec], (dep) => visit(dep, ROOT));
    stubIds.set(spec, id);
    return id;
  }

  function visit(spec: string, from: string): number {
    if (spec in stubs) return stub(spec);
    const file = resolveFile(spec, from);
    const known = ids.get(file);
    if (known !== undefined) return known;
    return add(file, compile(file), (dep) => visit(dep, file));
  }

  const roots: Record<string, number> = {};
  for (const [name, spec] of Object.entries(entries)) roots[name] = visit(spec, join(ROOT, "qa", "x.ts"));

  return `(function () {
var process = { env: { NODE_ENV: "development" } };
window.process = process;
var defs = [${bodies.join(",\n")}];
var cache = {};
function load(id) {
  if (cache[id]) return cache[id].exports;
  var module = (cache[id] = { exports: {} });
  var def = defs[id];
  def[0].call(module.exports, module, module.exports, function (spec) {
    if (!(spec in def[1])) throw new Error("unit-harness: unbundled require " + spec);
    return load(def[1][spec]);
  });
  return module.exports;
}
window.__unit = {};
${Object.entries(roots)
  .map(([name, id]) => `window.__unit[${JSON.stringify(name)}] = load(${id});`)
  .join("\n")}
})();`;
}

/**
 * A fresh page at a real https origin (cookies need one), with `html` attributes set BEFORE the
 * bundle evaluates (the guard reads `data-session-epoch` at module evaluation), then the bundle.
 */
export async function loadUnitPage(
  page: Page,
  script: string,
  opts: { htmlAttrs?: Record<string, string>; cookies?: Record<string, string> } = {}
): Promise<void> {
  const origin = "https://unit.evoli.test";
  const attrs = Object.entries(opts.htmlAttrs ?? {})
    .map(([k, v]) => ` ${k}="${v.replace(/"/g, "&quot;")}"`)
    .join("");
  await page.route(`${origin}/**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: `<!doctype html><html${attrs}><head><meta charset="utf-8"></head><body><div id="root"></div></body></html>`,
    })
  );
  await page.goto(`${origin}/a`);
  for (const [name, value] of Object.entries(opts.cookies ?? {})) {
    await page.evaluate(([n, v]) => (document.cookie = `${n}=${v}; path=/`), [name, value]);
  }
  await page.addScriptTag({ content: script });
}
