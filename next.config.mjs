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

const nextConfig = {
  reactStrictMode: true,
  // No NEXT_PUBLIC_* API URL here on purpose: the browser never talks to b-fit-api.
  // Every api call goes through the server (src/lib/apiFetch.ts) so the session
  // tokens stay in httpOnly cookies (ADR-0012 D5).
  env: buildStamp,
};

export default nextConfig;
