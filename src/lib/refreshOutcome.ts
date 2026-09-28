/**
 * What a non-2xx answer from `POST /auth/refresh` means for the session — the one rule
 * `routeSession.ts` (the `/api/auth/*` handlers) and `middleware.ts` (every page) share.
 *
 *   - **401, 403 and any other 4xx** → `expired`: the api looked at the refresh token and
 *     refused it (unknown, revoked, `token_version` bumped). The session is over; the
 *     caller clears it.
 *   - **429** → `unavailable`: `AuthRateLimitGuard.onRefresh` throttles per client IP, and
 *     every coach's rotation reaches b-fit-api from the portal SERVER's one IP. A throttle
 *     is about that IP, not about this person's token, so it must not sign them out.
 *   - **5xx** → `unavailable`: the api failed, not the token.
 *
 * A thrown fetch (no answer at all) is `unavailable` too; each caller handles that arm
 * itself, since it never has a status to pass here. `unavailable` keeps the cookies and
 * says so: the same refresh token is good for the next attempt.
 *
 * Plain module, no `server-only`: middleware runs on the edge runtime and imports it.
 */
export type RefreshOutcome = "expired" | "unavailable";

export function refreshOutcome(status: number): RefreshOutcome {
  if (status === 429) return "unavailable";
  if (status >= 400 && status < 500) return "expired";
  return "unavailable";
}
