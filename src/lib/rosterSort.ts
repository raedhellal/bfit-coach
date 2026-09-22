import "server-only";
import { cookies } from "next/headers";
import { asRosterSort, DEFAULT_ROSTER_SORT, type RosterSort } from "./coachApi";

/**
 * EV-187 AC2's sort preference: **remembered for that browser session only**, and
 * "Needs attention" on a fresh session.
 *
 * It is a **session cookie** — no `maxAge`, no `expires` — which is the one mechanism
 * that means literally that: the browser drops it when it closes, and the next fresh
 * session is the default again. The two alternatives were both worse:
 *
 *   · `sessionStorage` is client-only, and the roster is a SERVER component that has to
 *     know the sort before it calls the api (the api sorts, not the portal). Reading it
 *     in the browser would mean rendering the roster once in the wrong order and then
 *     re-fetching — a visible reshuffle on every load, on the one screen whose whole
 *     job is "who do I open first".
 *   · a query string is not remembered at all: the coach opens a trainee, comes back
 *     via the header link, and their choice is gone.
 *
 * `httpOnly` is deliberately FALSE-by-omission-of-need: nothing here is a credential,
 * and the value is echoed straight back into the page anyway. `sameSite: lax` and the
 * value being validated by `asRosterSort` on read is what keeps a tampered cookie from
 * reaching the api, which answers 400 for anything that is not one of its two words.
 */
export const ROSTER_SORT_COOKIE = "evoli_roster_sort";

/** The sort for this request: the session cookie, or AC2's default. */
export function readRosterSort(): RosterSort {
  return asRosterSort(cookies().get(ROSTER_SORT_COOKIE)?.value);
}

export { DEFAULT_ROSTER_SORT, type RosterSort };
