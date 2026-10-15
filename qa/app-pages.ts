import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { pathToRegexp } from "next/dist/compiled/path-to-regexp";

/**
 * The page files under `src/app` and how Next reaches them, read statically. Shared by
 * `render-error-every-route.spec.ts` (the route registry, EV-349/352/353/362) and
 * `editor-create-then-update.spec.ts` (EV-362's shadowed-page guard), so the two cannot
 * disagree about what a page file is or which URL it serves.
 */

/** A Next page file, in any of the default `pageExtensions` (EV-352 352.2; pinned by 353.3). */
export const PAGE_FILE = /(^|\/)page\.(tsx|ts|jsx|js)$/;

/** Every page file under `src/app`, as a `/`-separated path relative to it. */
export function appPages(): string[] {
  const root = join(__dirname, "..", "src", "app");
  return (readdirSync(root, { recursive: true }) as string[])
    .map((p) => relative(root, join(root, p)).split(sep).join("/"))
    .filter((p) => PAGE_FILE.test(p))
    .sort();
}

/**
 * How Next ranks one URL segment of a page file: a static name beats `[param]`, which beats
 * `[...catchAll]`, which beats `[[...optional]]`. Route groups `(…)` are not segments.
 */
export type Segment = { kind: 0 | 1 | 2 | 3; name: string };

export function segmentsOf(file: string): Segment[] {
  return file
    .replace(PAGE_FILE, "")
    .split("/")
    .filter((s) => s !== "" && !/^\(.*\)$/.test(s))
    .map((s): Segment => {
      if (/^\[\[\.\.\.[^\]]+\]\]$/.test(s)) return { kind: 3, name: s };
      if (/^\[\.\.\.[^\]]+\]$/.test(s)) return { kind: 2, name: s };
      if (/^\[[^\].]+\]$/.test(s)) return { kind: 1, name: s };
      // Parallel slots and intercepting routes change what a URL reaches: refuse, do not guess.
      if (/^[@(]|[[\]]/.test(s)) throw new Error(`${file}: segment "${s}" is not one this check can derive`);
      return { kind: 0, name: s };
    });
}

/** The URL pattern a page file serves: groups removed, `[param]` one segment. */
export function urlPattern(file: string): RegExp {
  let body = "";
  for (const seg of segmentsOf(file)) {
    if (seg.kind === 0) body += `/${seg.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`;
    else if (seg.kind === 1) body += "/[^/]+";
    else if (seg.kind === 2) body += "(?:/[^/]+)+";
    else body += "(?:/[^/]+)*";
  }
  // `/?` so the root (`(roster)/page.tsx`, body "") is "/", and an optional catch-all can be empty.
  return new RegExp(`^${body}/?$`);
}

/**
 * One concrete URL a page file serves: groups removed, every dynamic segment filled with
 * `sample` (an optional catch-all too, so the URL has the segment). Used to ask whether a
 * rewrite source would take a page's URL before the file system sees it.
 */
export function sampleUrl(file: string, sample = "ev362-sample"): string {
  const parts = segmentsOf(file).map((seg) => (seg.kind === 0 ? seg.name : sample));
  return `/${parts.join("/")}`;
}

/**
 * The page file Next's file-system router serves `url` from, among `pages`: the most specific
 * match, segment by segment. Middleware and config rewrites are not modelled (353.4).
 */
export function resolvePage(url: string, pages: string[]): string | undefined {
  const rank = (file: string) => segmentsOf(file).map((s) => s.kind);
  const byRank = (a: string, b: string) => {
    const [ra, rb] = [rank(a), rank(b)];
    for (let i = 0; i < Math.max(ra.length, rb.length); i += 1) {
      if ((ra[i] ?? 9) !== (rb[i] ?? 9)) return (ra[i] ?? 9) - (rb[i] ?? 9);
    }
    return 0;
  };
  return pages.filter((p) => urlPattern(p).test(url.split("?")[0])).sort(byRank)[0];
}

/** `next.config.mjs`'s exported config, imported as Next imports it (a function export is called). */
export async function nextConfig(): Promise<Record<string, unknown>> {
  const file = join(__dirname, "..", "next.config.mjs");
  const exported: unknown = (await import(pathToFileURL(file).href)).default;
  const config =
    typeof exported === "function" ? await exported("phase-production-build", { defaultConfig: {} }) : exported;
  if (config === null || typeof config !== "object") throw new Error("next.config.mjs exports no config object");
  return config as Record<string, unknown>;
}

/** A rewrite rule as declared: `source` and `destination`, and any other key it carries, kept. */
export interface Rewrite {
  source: string;
  destination: string;
  [key: string]: unknown;
}

/**
 * The `beforeFiles` rewrites `next.config.mjs` declares, objects as written (empty when
 * `rewrites()` returns an array or nothing).
 */
export async function beforeFilesRewrites(): Promise<Rewrite[]> {
  const config = await nextConfig();
  if (typeof config.rewrites !== "function") return [];
  const rewrites: unknown = await (config.rewrites as () => Promise<unknown>)();
  if (rewrites === null || typeof rewrites !== "object" || Array.isArray(rewrites)) return [];
  return (rewrites as { beforeFiles?: Rewrite[] }).beforeFiles ?? [];
}

/**
 * Whether a rewrite `source` takes `url`'s pathname, compiled the way Next compiles it
 * (`next/dist/shared/lib/router/utils/path-match.js`: path-to-regexp, `/` delimiter,
 * case-insensitive, strict). No `has` / `missing` / `basePath` / `locale` modelling: the coach's
 * rules use none of them.
 */
export function sourceMatches(source: string, url: string): boolean {
  return pathToRegexp(source, [], { delimiter: "/", sensitive: false, strict: true }).test(url.split("?")[0]);
}

/** A rewrite destination's pathname (its query dropped). */
export function destinationPath(destination: string): string {
  return destination.split("?")[0];
}
