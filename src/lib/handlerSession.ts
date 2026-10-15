import "server-only";
import { isExpired } from "./jwt";
import { routeAccessToken, type RouteSession } from "./routeSession";
import { ACCESS_COOKIE, readAccessToken } from "./session";
import { cookieFromSetCookieList } from "./setCookieList";

/**
 * EV-341b B17 — the access token a route handler INSIDE the middleware matcher must use.
 *
 * ADR-0034 D34.10 (8) reasoned that each autosave passes the middleware, which rotates an
 * expired token, so a coach who types stays signed in. B17's run against a 1-minute token found
 * the gap: the middleware's rotation reaches the BROWSER (its Set-Cookie), but not the handler.
 * Next 14.2.35 copies the cookies a middleware sets into the request as
 * `x-middleware-set-cookie`, and `cookies()` merges them only when
 * `"x-middleware-set-cookie" in req.headers` (`request-async-storage-wrapper.js`,
 * `mergeMiddlewareCookies`), a property test that is true for a page's Node headers object and
 * FALSE for a route handler's web `Headers`. So once the browser has dropped the expired access
 * cookie (its Max-Age is the token's life), `readAccessToken()` in a handler is `null` and every
 * save is a 401, although the middleware has just minted a fresh token for this very request.
 *
 * The order, each step only when the one before has nothing:
 *   1. the token the middleware rotated in THIS request (`x-middleware-set-cookie`);
 *   2. the request's own access cookie, when it is not expired (the middleware rotates one that
 *      is within 30 s of its `exp`, so a cookie it let through is good);
 *   3. a rotation here (`routeAccessToken`, the `/api/auth/*` handlers' own), should a future
 *      Next stop forwarding the header: the session still holds, at the cost of one more refresh.
 */
export async function handlerAccessToken(request: Request): Promise<RouteSession> {
  const rotated = cookieFromSetCookieList(request.headers.get("x-middleware-set-cookie"), ACCESS_COOKIE);
  if (rotated) return { kind: "token", accessToken: rotated };
  const cookie = readAccessToken();
  if (cookie && !isExpired(cookie, 0)) return { kind: "token", accessToken: cookie };
  return routeAccessToken();
}
