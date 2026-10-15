import "server-only";
import { createHash } from "node:crypto";
import { decodeJwt } from "./jwt";
import { readAccessToken } from "./session";

/**
 * EV-341b — which ACCOUNT a page was rendered for, as an opaque tag, so a write the page starts
 * from a timer (the intake's autosave) can never land under another account's cookies.
 *
 * ADR-0033 D33.14 (BUG-745): a sign-in or sign-out in one tab changes the cookies every tab
 * sends. A click is stopped by `SessionEpochGuard` while the tab is stale; a write started by a
 * TIMER is not. ADR-0033 R11 (2026-10-15, amending point 4) lets such a write be guarded by the
 * SERVER instead of by `isSessionStale()`: the page sends this tag with each save, and the route
 * handler refuses (401 `SESSION_CHANGED`, read by the page as "session ended") any save whose
 * cookies belong to a different account, before any upstream call. A staleness check alone could
 * not serve EV-341b B15 ("after signing in in another tab « Réessayer » saves"): every sign-in is
 * a new epoch. The same account signed in again saves; another account never writes. R12 is why
 * « Réessayer » may be `data-session-safe` and « Recharger » is not.
 *
 * The tag is a SHA-256 of the access token's `sub` (truncated), not the id itself: it only has
 * to be equal for one account and different for two, and the page has no use for the id.
 */
export function sessionSubjectTag(token: string | null = readAccessToken()): string | null {
  const sub = token ? decodeJwt(token)?.sub : null;
  if (!sub) return null;
  return createHash("sha256").update(`evoli-session-subject:${sub}`).digest("hex").slice(0, 32);
}
