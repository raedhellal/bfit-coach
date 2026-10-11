/**
 * Session boundaries in the browser — ADR-0033 D33.7. Sign-in, activation and sign-out
 * each END in a document load, never a soft navigation: the App Router's in-memory cache
 * (and, from branch 2b, a client query cache) holds pages rendered for the previous
 * session, and a soft navigation would replay them. `replace`, not `assign`, so the page
 * the boundary was crossed from is not one Back away.
 *
 * Client-only (it touches `window`); import it from client components.
 */
import { replaceDocument } from "./documentLoad";
import { clearRosterReturn } from "./rosterReturn";

export { replaceDocument };

/**
 * Drop every client-side cache of the old session before the document goes.
 *
 * Branch 1 has no client cache beyond the router's, which the document load below
 * discards. Branch 2b's `queryClient.clear()` goes HERE, so the call sites already in place
 * get it without being touched again.
 *
 * BUG-691: the roster's per-tab note (its URL with the coach's search, the client followed,
 * the URL-change count) is session state in `sessionStorage`, which a document load keeps;
 * it is dropped here so the next coach in this tab starts with none.
 */
export function clearClientSession(): void {
  clearRosterReturn();
}

/** The document load this tab's own crossSessionBoundary asked for, if it did (BUG-745 R9). */
let boundaryTarget: string | null = null;

/** Cross a session boundary: clear the client caches, then a hard `location.replace`. */
export function crossSessionBoundary(path: string): void {
  clearClientSession();
  boundaryTarget = path;
  replaceDocument(path);
}

/**
 * Where a reload for a session change goes (ADR-0033 D33.14 point 2, ruling R9): this tab's own
 * boundary target, else this URL. The tab that crossed the boundary itself is already loading
 * `path`; a stray focus, click or `popstate` before it unloads must not supersede that load with
 * `location.href` (which would drop `/login?error=expired`'s message, or show a PENDING account
 * that has just signed in the login form again).
 */
export function sessionReloadTarget(): string {
  return boundaryTarget ?? window.location.href;
}
