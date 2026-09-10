// The single place this app reads its environment, and the single place a
// request URL is assembled.
//
// Ported from b-fit-admin/src/lib/env.ts (EV-166 / BUG-065): trailing slashes are
// stripped ONCE, here at the boundary, so no consumer can emit `//path`. A doubled
// leading slash is rejected by Spring Security's path matching *before*
// authentication is considered, so `//auth/login` answers AUTH_UNAUTHORIZED and a
// valid bearer token does not rescue it — one trailing keystroke in the environment
// would be a total outage with no local reproduction.
//
// Unlike the admin's copy this is NOT `NEXT_PUBLIC_`: the browser never calls
// b-fit-api directly here (ADR-0012 D5 — every call is server-to-server through the
// BFF), so the base URL must not be inlined into the client bundle.

export const API_BASE_URL = (
  process.env.API_BASE_URL || "http://localhost:8080"
).replace(/\/+$/, "");

/** Join the configured base URL and a request path with exactly ONE slash. */
export function apiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_BASE_URL}/${path.replace(/^\/+/, "")}`;
}

/**
 * `live` (default) talks to b-fit-api. `fixture` serves the in-memory demo data in
 * src/lib/coachApi.fixture.ts so the screens are demoable before the D4 endpoints
 * land. Read on the server only — a fixture that could be switched on from the
 * browser would be a way to fake a session.
 */
export type CoachApiMode = "live" | "fixture";
export const COACH_API_MODE: CoachApiMode =
  process.env.COACH_API_MODE === "fixture" ? "fixture" : "live";

/**
 * Base URL the invite link is built from. The token is issued by the api
 * (`POST /coach-portal/invites`); the URL around it is this surface's business,
 * because only this surface knows what host a phone can reach it on. For the demo
 * that is the laptop's LAN IP, not localhost — a phone cannot resolve localhost
 * (ADR-0012 D5, and the runbook has to say so).
 */
export const INVITE_BASE_URL = (
  process.env.INVITE_BASE_URL || "http://localhost:3300"
).replace(/\/+$/, "");

export const IS_PROD = process.env.NODE_ENV === "production";
