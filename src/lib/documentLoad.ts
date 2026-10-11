/**
 * A document load of `href` that leaves no history entry for the page it replaces: the one
 * place this app calls `location.replace`. Used by `crossSessionBoundary` (`clientSession.ts`)
 * and by `SessionEpochGuard`'s `leave()` (BUG-745, ADR-0033 D33.14), which reloads a tab whose
 * session changed in another tab so that middleware decides what it may show.
 *
 * Its own module so a browser unit test can replace this one call (`qa/unit-harness.ts` stubs
 * it by specifier) and run the real `clientSession.ts` around it: a real `location.replace`
 * would unload the test page.
 */
export function replaceDocument(href: string): void {
  window.location.replace(href);
}
