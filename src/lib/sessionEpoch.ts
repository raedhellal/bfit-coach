import { IS_PROD } from "./env";

/**
 * BUG-745, ADR-0033 D33.14 — the session epoch: a value that changes at every session
 * boundary in this browser, and that every tab can read.
 *
 * Why a cookie of its own: the three session cookies are `httpOnly` (`session.ts`), so a tab
 * cannot see another tab sign out. This one is readable by scripts and carries NOTHING: no
 * identity, no authority. Nothing on the server reads it as an input. The browser compares it
 * with the value the server rendered the document under (`<html data-session-epoch>`), and a
 * difference means "a sign-in or a sign-out happened in this browser since this document was
 * rendered" (`SessionEpochGuard`).
 *
 * Isomorphic on purpose: middleware, the route handlers (through `session.ts`), the root layout
 * and the browser guard all import this file, so it touches no `window` at import time and
 * imports nothing from `next/headers`.
 *
 * THE RULES (D33.14 point 1), each enforced somewhere named:
 *  - A NEW value at every boundary, and only there: `beginSessionEpoch()` after the login and
 *    activation handlers' `writeSession`, `clearSession()`, and middleware's `toLogin` when the
 *    request carried a session cookie. Never in `writeSession` (rotation calls it, through
 *    `routeAccessToken`) and never in middleware's rotation block: a rotation is not a boundary.
 *  - Never deleted. A session from before this cookie existed has none; its tabs read `null`.
 *    A sign-out that deleted the cookie would leave `null` too, and be invisible to them.
 *  - A missing cookie means "not stale": expiry or a cleared jar is not a boundary.
 *  - This file is the only reader (`readSessionEpoch`). The root layout echoes the value into
 *    `<html data-session-epoch>`, which decides nothing. `qa/session-epoch-cookie.spec.ts`
 *    holds both rules by reading the source.
 */

/**
 * `__Host-` in production: it requires `Secure`, `Path=/` and no `Domain`, so a sibling
 * subdomain cannot plant a same-name cookie and make every tab reload. Production is the same
 * condition that marks the session cookies `Secure` (`session.ts`), so wherever those are
 * stored, this one is. `IS_PROD` is `NODE_ENV === "production"`, which Next inlines into the
 * client bundle, so the reader and the writers agree on the name.
 */
export const SESSION_EPOCH_COOKIE = IS_PROD ? "__Host-evoli_pro_epoch" : "evoli_pro_epoch";

/**
 * 400 days, the longest lifetime browsers keep (staff 2.5). The refresh cookie's 30 days SLIDE
 * on every rotation; this one is written only at a boundary, so a shorter life would expire
 * under a live session (harmless, `null` is not stale, but then the next boundary is the only
 * one the tab can see).
 */
export const SESSION_EPOCH_MAX_AGE = 60 * 60 * 24 * 400;

/** Not `httpOnly`: being readable by scripts is the point. */
export function sessionEpochCookieOptions() {
  return {
    httpOnly: false as const,
    sameSite: "lax" as const,
    secure: IS_PROD,
    path: "/",
    maxAge: SESSION_EPOCH_MAX_AGE,
  };
}

/** A fresh value. `crypto.randomUUID` exists in the edge runtime, in node and in browsers. */
export function newSessionEpoch(): string {
  return crypto.randomUUID();
}

/**
 * THE reader: the epoch in a `Cookie`-format string (`document.cookie` in the browser).
 * `null` when absent or empty.
 */
export function readSessionEpoch(cookieString: string): string | null {
  for (const part of cookieString.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== SESSION_EPOCH_COOKIE) continue;
    const value = part.slice(eq + 1).trim();
    return value === "" ? null : value;
  }
  return null;
}

/** The epoch in this browser's jar now (browser only): `document.cookie`, through the one parser. */
export function readBrowserSessionEpoch(): string | null {
  return readSessionEpoch(document.cookie);
}

/**
 * `stale()` (D33.14 point 2): `cur !== null && cur !== seen`. `seen` is the epoch the server
 * rendered this document under (`null` for a session from before the cookie existed, which
 * still sees the first boundary: `cur` is then a value).
 */
export function isStale(seen: string | null, cur: string | null): boolean {
  return cur !== null && cur !== seen;
}

/** The attribute `leave(layer)` sets on `<html>`; its value is the layer that fired. */
export const SESSION_LEAVING_ATTR = "data-session-leaving";
/** The attribute `ended(layer)` sets on `<html>` (the unsaved-editor exception). */
export const SESSION_ENDED_ATTR = "data-session-ended";
/** The root layout's echo of the epoch it rendered under ("" = none). */
export const SESSION_EPOCH_ATTR = "data-session-epoch";

/**
 * The document is being replaced because the session changed (`leave()` ran). Read by
 * `useUnsavedChanges`'s Back guard cleanup (D33.14 3b): it must not queue a `history.back()`
 * behind the `location.replace` that is already under way.
 */
export function isSessionLeaving(): boolean {
  return typeof document !== "undefined" && document.documentElement.hasAttribute(SESSION_LEAVING_ATTR);
}
