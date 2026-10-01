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

const nextConfig = {
  reactStrictMode: true,
  // No NEXT_PUBLIC_* API URL here on purpose: the browser never talks to b-fit-api.
  // Every api call goes through the server (src/lib/apiFetch.ts) so the session
  // tokens stay in httpOnly cookies (ADR-0012 D5).
  env: buildStamp,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
