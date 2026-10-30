import { shapedBuildTime, shapedCommit, shapedEnvironment } from "./src/lib/version-shape.js";

/** @type {import('next').NextConfig} */
/**
 * Build stamp for GET /api/version (the portal's answer to the api's
 * /actuator/info).
 *
 * Vercel's documented system environment variables — VERCEL_GIT_COMMIT_SHA and
 * VERCEL_ENV — are "Available at: Both build and runtime", but only while the
 * project's "Automatically expose System Environment Variables" setting is on.
 * Reading them HERE freezes the answer into the build output, so the endpoint keeps
 * telling the truth even if that setting is ever turned off; src/lib/version.ts
 * still falls back to the runtime variable if the inline is empty.
 *
 * Empty string, never a placeholder: a local `next dev` and a `next build` outside
 * Vercel have no such variables, and version.ts turns the empty value into
 * "unknown". A fabricated or stale SHA here would be worse than no endpoint at all.
 *
 * BUG-1067 — every value is shape-checked BEFORE it is inlined, with the same functions
 * version.ts uses (src/lib/version-shape.js, the port of b-fit-admin's BUG-242 fix). `env`
 * values are written into every bundle that reads them, and into the build's own files
 * (`required-server-files.json`, the webpack cache), so validating only at call time was not
 * enough: a mis-set variable reached the build output verbatim while /api/version correctly said
 * "unknown". A mis-shaped value now inlines as "", exactly like an unset one.
 */
const buildStamp = {
  COACH_BUILD_COMMIT: shapedCommit(process.env.VERCEL_GIT_COMMIT_SHA),
  COACH_BUILD_ENV: shapedEnvironment(process.env.VERCEL_ENV),
  COACH_BUILD_TIME: shapedBuildTime(new Date().toISOString()),
};

/**
 * EV-229 — the portal cannot be framed, and sends the standard security headers.
 *
 * Publish and Revoke are one click each, so a page that iframes the portal could
 * stage that click (clickjacking). `X-Frame-Options: DENY` is what older browsers
 * read; `frame-ancestors 'none'` is the CSP form newer ones prefer. Both, because a
 * browser that honours one is not guaranteed to honour the other.
 *
 * The CSP is `frame-ancestors` ONLY, on purpose (the story's Out of scope): a
 * `script-src` policy has to account for Next's inline bootstrap scripts and is a
 * separate, riskier change.
 *
 * `Permissions-Policy` turns off the three powerful features the portal never uses;
 * the invite button's clipboard write is not among them.
 *
 * `source: "/:path*"` covers every route — pages, `/api/*` (including the
 * `/api/auth/*` handlers middleware does not run on), and the 307/403/405/503
 * answers middleware gives itself. AC1's failure clause is "headers on pages but
 * not on /api/*", so `qa/security-headers.spec.ts` asserts both, and a redirect.
 * HSTS is not set here: Vercel already sends it.
 */
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

/**
 * EV-350 — the dictionary chunk is requested in the FIRST wave of a cold load.
 *
 * EV-342m made each dictionary its own async chunk (`import()` in src/lib/i18n/client.tsx),
 * fetched once the first-wave scripts have run: one round trip before hydration, ~95 ms on
 * HTTP/2 at 100 ms RTT. The root layout now puts a `<link rel="preload" as="script">` for
 * the page's language in the document (src/lib/i18n/chunk.ts), so the request leaves with
 * the route's own scripts and the `import()` finds it already on its way.
 *
 * The difficulty: the server compilation runs BEFORE the client one (Next 14's compiler
 * order is server, edge-server, client), so no server component can know an async chunk's
 * `[contenthash]`. Hence two things, both here so they cannot drift apart:
 *   · in the client compilation, the two named chunks (`webpackChunkName` in client.tsx) are
 *     written as `evoli-copy-<locale>.<buildId>.js` rather than `<id>.<contenthash>.js`;
 *   · in the server compilations, the same URLs are inlined (`__EVOLI_COPY_CHUNK_URLS__`).
 * `buildId` is the one value both compilations share. The cost, named: the URL changes on
 * every deploy, so a coach re-downloads the dictionary (~20 kB) after each deploy even when
 * its text did not change. Never a stale one: a new build is always a new URL.
 *
 * A production build that does not emit both named chunks FAILS (a renamed or dropped
 * `webpackChunkName`, or a Next upgrade that stops honouring it), rather than shipping a
 * hint to a file that does not exist. `qa/locale-chunk-preload.spec.ts` (350.8) is the
 * runtime half: the hint and the request must name the same URL.
 */
const COPY_CHUNKS = { fr: "evoli-copy-fr", en: "evoli-copy-en" };
const copyChunkFile = (name, buildId) => `static/chunks/${name}.${buildId}.js`;

function preloadableCopyChunks(config, { isServer, dev, buildId, webpack }) {
  if (isServer) {
    const urls = Object.fromEntries(
      Object.entries(COPY_CHUNKS).map(([locale, name]) => [locale, `/_next/${copyChunkFile(name, buildId)}`])
    );
    config.plugins.push(new webpack.DefinePlugin({ __EVOLI_COPY_CHUNK_URLS__: JSON.stringify(urls) }));
    return config;
  }
  const names = Object.values(COPY_CHUNKS);
  const fallback = config.output.chunkFilename;
  config.output.chunkFilename = (pathData, assetInfo) => {
    const name = pathData.chunk?.name;
    if (names.includes(name)) return copyChunkFile(name, buildId);
    return typeof fallback === "function" ? fallback(pathData, assetInfo) : fallback;
  };
  if (!dev) {
    config.plugins.push({
      apply(compiler) {
        compiler.hooks.emit.tap("EvoliCopyChunks", (compilation) => {
          for (const name of names) {
            if (!compilation.getAsset(copyChunkFile(name, buildId))) {
              compilation.errors.push(
                new webpack.WebpackError(
                  `EV-350: the client build emitted no "${name}" chunk, so the root layout's preload ` +
                    `hint would name a missing file. Check the webpackChunkName comments in src/lib/i18n/client.tsx.`
                )
              );
            }
          }
        });
      },
    });
  }
  return config;
}

const nextConfig = {
  reactStrictMode: true,
  /**
   * BUG-751 — lint the whole repo, at build time and in `npm run lint`, from this one list.
   *
   * `next build` lints only `eslint.dirs` (default `app pages components lib src`,
   * `next/dist/lib/verifyAndLint.js`), and `next lint` with no `--dir` reads the same key
   * (`next/dist/cli/next-lint.js`). The `lint` script used to name `--dir src --dir qa`, so a
   * `shared/NavLink.tsx` or a root `NavLink.tsx` that re-exported `next/link`, imported by a
   * src component, was bundled and never linted: invariant N held only for files under src.
   *
   * `"."`, not a list of folders: Next bundles any file a src import reaches, wherever it lives,
   * so the safe default is "everything is linted" and the exceptions are named. ESLint reads
   * them from `.eslintrc.json`: `ignorePatterns` (what git does not ship, and Next's generated
   * `next-env.d.ts`) and the bans override's `excludedFiles` (test code, which a file Next can
   * bundle is barred from importing). `qa/invariant-n-lint-bans.spec.ts` holds a SECOND copy on
   * purpose (its `TEST_CODE`, and `.gitignore`'s directory entries) and walks the whole tree:
   * it fails on any file outside its copy that ESLint skips or lints without both bans, so
   * `excludedFiles` and `ignorePatterns` cannot widen alone (the census's own copy can: review
   * that list). A folder list fails open: the next new top-level
   * folder is unlinted until someone remembers it. The census also pins this key, the `lint`
   * script, and the resolver aliases (tsconfig `paths`, package.json, the `webpack` below).
   */
  eslint: { dirs: ["."] },
  // No NEXT_PUBLIC_* API URL here on purpose: the browser never talks to b-fit-api.
  // Every api call goes through the server (src/lib/apiFetch.ts) so the session
  // tokens stay in httpOnly cookies (ADR-0012 D5).
  env: buildStamp,
  experimental: {
    /**
     * ADR-0033 D33.0 (branch 2a), amended by EV-356d: the client router cache, written down
     * rather than inherited. These are NOT Next's defaults any more (14.2.35's are
     * `{ dynamic: 30, static: 300 }`, `next/dist/server/config-shared.js`).
     *
     * `dynamic: 30` — a coach who returns to a page inside 30 s gets it from the browser's
     * router cache with no server render, which the 2a baseline measured at 2-16 ms against
     * ~310 ms for a first visit. Next 15 changes this default to 0, so an upgrade would
     * silently take that away; with the value here it cannot.
     *
     * `static: 30` (was 300) — EV-356d's intent prefetch (`IntentLink`, roster rows only)
     * makes a FULL prefetch of a client's overview, and a FULL entry is reused without a
     * refetch until `static` from the prefetch (`prefetch-cache-utils.js`
     * `getPrefetchEntryCacheStatus`), then `dynamic` from its first use. At 300 a hovered
     * row clicked four minutes later would paint four-minute-old data. At 30 the window is
     * ≤ ~60 s, the bound Raed ruled on 2026-10-10 (option A) — including the first open of a
     * client after the trainee ended the link, if the row was hovered before. The api side
     * is unchanged: it caches nothing and refuses every request after the revoke.
     *
     * ⚠ `static: 30` is safe ONLY together with ADR-0033 D33.13 invariant N: the portal sends
     * no AUTO prefetch (every link is `src/components/ui/Link.tsx`, `prefetch={false}`;
     * ESLint bans `next/link` elsewhere; `qa/no-auto-prefetch.spec.ts` checks it at runtime).
     * With `static == dynamic` the AUTO "stale" band is gone (an AUTO entry goes from fresh
     * or reusable straight to expired at 30 s), and without N a hover over an expired plain
     * `<Link>` made a fresh tree-only entry whose click repainted the router's OLD cached
     * page with no request, however old (P4, witnessed at +35 s and +70 s after a revoke).
     * Under N no AUTO entry exists, so that path is closed and a return after 30 s always
     * reaches the server. `STATIC_STALETIME_MS` has no server-side consumer.
     *
     * Every server action that calls `revalidatePath` still purges this cache (14.2's
     * action reducer clears the prefetch cache whenever the action renders), so a write
     * is never followed by a cached page. `qa/stale-times-config.spec.ts` pins both
     * numbers; `qa/intent-prefetch.spec.ts` D.5 witnesses the 60 s bound on `next start`.
     */
    staleTimes: { dynamic: 30, static: 30 },
  },
  webpack: preloadableCopyChunks,
  /**
   * BUG-739 — the recipe and training-template editors are ONE route each, whatever the URL.
   *
   * `/x/new` and `/x/{id}` are both served by `src/app/x/editor/page.tsx`, the id in the query.
   * Next 14.2 keys a page by its path segments and drops the search params from that key
   * (`layout-router.js`), so an editor whose id changes is NOT re-mounted. Before, `new/` and
   * `[id]/` were two segments: a create corrected the URL to `/x/{id}`, and the next update's
   * revalidating render swapped the segment and re-mounted the editor, losing a rename typed
   * during « Saving… », the saved notice and the leave guard. The addresses do not change. Since
   * EV-362 there is no `new/` or `[id]/` page file left: `editor/page.tsx` holds both branches,
   * so without these rules `/x/new` and `/x/{id}` match no page file.
   *
   * Two pitfalls, both measured, both load-bearing:
   *   · `beforeFiles` rewrites CHAIN. Without the `(?!new$|editor$)` lookahead, `/recipes/new`
   *     became `/recipes/editor` and was then matched again as an id (`?id=editor`), and
   *     « New recipe » rendered the not-yours notice.
   *   · the REQUEST's query merges into the destination's, and only a key the destination names
   *     wins (`prepare-destination.js`). With `/recipes/new → /recipes/editor`, a request for
   *     `/recipes/new?id=<A>` served recipe A's editor under `/new` (staff's probe P1). The `new`
   *     rules therefore pin `id=` (empty: a new record).
   *
   * `beforeFiles`, so the rules run before the filesystem (they were written while `new/` and
   * `[id]/` still existed; `qa/editor-create-then-update.spec.ts` pins the four rules as written).
   * Middleware runs on the ORIGINAL path, before these rules, so its matcher is unchanged.
   */
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/recipes/new", destination: "/recipes/editor?id=" },
        { source: "/recipes/:id((?!new$|editor$)[^/]+)", destination: "/recipes/editor?id=:id" },
        { source: "/templates/new", destination: "/templates/editor?id=" },
        { source: "/templates/:id((?!new$|editor$)[^/]+)", destination: "/templates/editor?id=:id" },
      ],
    };
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
