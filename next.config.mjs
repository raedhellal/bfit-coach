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
 */
const buildStamp = {
  COACH_BUILD_COMMIT: process.env.VERCEL_GIT_COMMIT_SHA || "",
  COACH_BUILD_ENV: process.env.VERCEL_ENV || "",
  COACH_BUILD_TIME: new Date().toISOString(),
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
  // No NEXT_PUBLIC_* API URL here on purpose: the browser never talks to b-fit-api.
  // Every api call goes through the server (src/lib/apiFetch.ts) so the session
  // tokens stay in httpOnly cookies (ADR-0012 D5).
  env: buildStamp,
  experimental: {
    /**
     * ADR-0033 D33.0 (branch 2a): the client router cache, written down rather than
     * inherited. These ARE Next 14.2.35's defaults (`next/dist/server/config-shared.js`).
     * A coach who returns to a page inside 30 s gets it from the browser's router cache
     * with no server render, which the 2a baseline measured at 2-16 ms against ~310 ms
     * for a first visit. Next 15 changes the dynamic default to 0, so an upgrade would
     * silently take that away; with the values here it cannot.
     *
     * Every server action that calls `revalidatePath` still purges this cache (14.2's
     * action reducer clears the prefetch cache whenever the action renders), so a write
     * is never followed by a 30 s-old page. `qa/stale-times-config.spec.ts` pins both
     * numbers.
     */
    staleTimes: { dynamic: 30, static: 300 },
  },
  webpack: preloadableCopyChunks,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
