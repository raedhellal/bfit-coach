/**
 * Session boundaries in the browser — ADR-0033 D33.7. Sign-in, activation and sign-out
 * each END in a document load, never a soft navigation: the App Router's in-memory cache
 * (and, from branch 2b, a client query cache) holds pages rendered for the previous
 * session, and a soft navigation would replay them. `replace`, not `assign`, so the page
 * the boundary was crossed from is not one Back away.
 *
 * Client-only (it touches `window`); import it from client components.
 */
import { clearRosterReturn } from "./rosterReturn";

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

/** Cross a session boundary: clear the client caches, then a hard `location.replace`. */
export function crossSessionBoundary(path: string): void {
  clearClientSession();
  window.location.replace(path);
}
