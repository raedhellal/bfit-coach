import "server-only";
import { ApiError, apiPost } from "./apiFetch";
import { isExpired } from "./jwt";
import { readAccessToken, readRefreshToken, writeSession } from "./session";

/**
 * The session's access token for a `/api/auth/*` route handler, rotated first if it has to be.
 *
 * Why the handler does this itself: rotation lives in `middleware.ts`, and the matcher
 * EXCLUDES `/api/auth/*` (those handlers are the way in and out of a session). The access
 * cookie's Max-Age is the api's `expiresIn` — 900 s in production — so a person who spends
 * more than fifteen minutes on /activate submits with NO access cookie and a perfectly good
 * 30-day refresh cookie, and `apiFetch`'s refresh-on-401 never runs because it throws on a
 * missing token before it calls anything. Staff round 2 on EV-278c, blocking.
 *
 * So: a token that is present and not expired is returned as is. Otherwise, with a refresh
 * cookie, `POST /auth/refresh` is called and BOTH cookies are rewritten (a route handler
 * may write them, and the cookie store reads back what was written, so a following
 * `apiFetch` in the same request sends the fresh token). No refresh cookie, or a rotation
 * the api refuses → `expired`, and the caller answers 401. An api that cannot be reached
 * → `unavailable`: that is not the session ending, and must not be told as one.
 *
 * Not joined to `apiFetch`'s single-flight: that one is for a page render fanning out
 * several calls at once. A handler makes one rotation, then one call.
 */
export type RouteSession =
  | { kind: "token"; accessToken: string }
  | { kind: "expired" }
  | { kind: "unavailable" };

export async function routeAccessToken(): Promise<RouteSession> {
  const access = readAccessToken();
  if (access && !isExpired(access)) return { kind: "token", accessToken: access };

  const refreshToken = readRefreshToken();
  if (!refreshToken) return { kind: "expired" };
  try {
    const tokens = await apiPost<{ accessToken?: string; refreshToken?: string; expiresIn?: number }>(
      "/auth/refresh",
      { refreshToken }
    );
    if (!tokens?.accessToken || !tokens?.refreshToken) return { kind: "expired" };
    writeSession({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
    });
    return { kind: "token", accessToken: tokens.accessToken };
  } catch (err) {
    return err instanceof ApiError ? { kind: "expired" } : { kind: "unavailable" };
  }
}
