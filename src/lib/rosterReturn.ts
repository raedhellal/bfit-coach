import type { RosterFilter } from "./rosterView";

/**
 * BUG-691 (audit A8) — the roster keeps its search, its filter and its scroll position across
 * a visit to a client, and « Retour aux clients » does not grow the history.
 *
 * The daily round is « Alertes » → open a client → back → next. Before this, the filter and
 * the search lived in `useState` only, and « Retour aux clients » was a plain link to `/`:
 * each return remounted the roster on « Tous », with an empty search, at the top, and pushed
 * a new history entry, so the browser's Back from the roster went to the client again.
 *
 * Three pieces, all in the browser (nothing here is a server read or a trainee fact):
 *
 *   1. **The URL carries the state** (`/?filter=alerts&q=lin`). `RosterBrowser` reads it at
 *      mount and writes it back with `history.replaceState` on every change, so a reload, a
 *      Back and a shared link all land on the same view. Replace, never push: a keystroke is
 *      not a page.
 *   2. **The roster notes what it was when the coach left it** (`noteLeavingRoster`): its URL,
 *      its scroll position, the link followed and the URL-change count at that moment.
 *   3. **« Retour aux clients » goes BACK when the previous entry is that roster**
 *      (`cameStraightFromRoster`), and otherwise links to the noted URL. "Previous entry" is
 *      not something a page can read from the History API, so it is proved by counting: every
 *      committed URL change is counted (`UrlChangeCounter`, in the root layout), and the
 *      client page is directly after the roster exactly when ONE change happened since the
 *      roster noted its count, and that change landed on the link it noted. Any other path
 *      (a tab, a Back then Forward, a reload of another page) fails the test and gets the
 *      link, which still restores the filter, the search and the scroll position; it only
 *      adds the history entry this row is about, in the cases the count cannot vouch for.
 *      On the Back path the browser restores the scroll position itself (Chromium and
 *      WebKit, measured); the explicit restore (`takeScrollRestore`) is what the link path
 *      needs, because a push scrolls to the top.
 *
 * `sessionStorage`, so it is per tab and gone with the tab. Every access is guarded: a
 * storage that throws (a locked-down browser) leaves the roster exactly as it was before
 * this row, never broken.
 */

const RETURN_KEY = "evoli.roster.return";
const COUNT_KEY = "evoli.urlChanges";
const RESTORE_KEY = "evoli.roster.restoreScroll";
/** A restore request older than this is stale (a navigation that never reached the roster). */
const RESTORE_TTL_MS = 30_000;

/** The URL spelling of each filter. « Alertes » is `alerts` (the bug's Expected), « Tous » is no parameter. */
const FILTER_PARAM: Record<RosterFilter, string | null> = { all: null, flagged: "alerts", inactive: "inactive" };

export function filterFromParam(value: string | null | undefined): RosterFilter {
  for (const [filter, param] of Object.entries(FILTER_PARAM) as [RosterFilter, string | null][]) {
    if (param !== null && param === value) return filter;
  }
  return "all";
}

/** The roster's URL for a filter and a search, exactly as typed (`/` when neither is set). */
export function rosterHref(filter: RosterFilter, query: string): string {
  const params = new URLSearchParams();
  const f = FILTER_PARAM[filter];
  if (f) params.set("filter", f);
  if (query !== "") params.set("q", query);
  const search = params.toString();
  return search ? `/?${search}` : "/";
}

export interface RosterReturn {
  /** The roster's URL when the coach left it. */
  href: string;
  scrollY: number;
  /** `pathname + search` of the link the coach followed. */
  target: string;
  /** The URL-change count when the coach left. */
  count: number;
}

function read(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, value);
  } catch {
    // No storage: the roster behaves as before BUG-691, nothing worse.
  }
}

export function urlChangeCount(): number {
  const n = Number(read(COUNT_KEY));
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

/** Called by `UrlChangeCounter` for every committed path-or-query change, push, replace or Back. */
export function countUrlChange(): void {
  write(COUNT_KEY, String(urlChangeCount() + 1));
}

function here(): string {
  return `${window.location.pathname}${window.location.search}`;
}

/** The roster, as the coach is about to leave it by following `target`. */
export function noteLeavingRoster(target: string): void {
  const note: RosterReturn = { href: here(), scrollY: Math.round(window.scrollY), target, count: urlChangeCount() };
  write(RETURN_KEY, JSON.stringify(note));
}

export function readRosterReturn(): RosterReturn | null {
  const raw = read(RETURN_KEY);
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<RosterReturn>;
    if (
      typeof v.href === "string" &&
      v.href.startsWith("/") &&
      !v.href.startsWith("//") &&
      typeof v.scrollY === "number" &&
      typeof v.target === "string" &&
      typeof v.count === "number"
    ) {
      return { href: v.href, scrollY: v.scrollY, target: v.target, count: v.count };
    }
  } catch {
    // Unreadable: as if never noted.
  }
  return null;
}

/** True when the history entry before this one is the roster the note describes (see 3. above). */
export function cameStraightFromRoster(note: RosterReturn): boolean {
  return urlChangeCount() === note.count + 1 && here() === note.target;
}

/** « Retour aux clients » asks the roster it lands on to scroll back to where the coach was. */
export function requestScrollRestore(): void {
  write(RESTORE_KEY, String(Date.now()));
}

/**
 * The scroll position to restore on the roster now showing, once: a pending request from
 * « Retour aux clients » (not stale) and a note for this very URL. Null otherwise; the
 * request is consumed either way.
 */
export function takeScrollRestore(): number | null {
  const at = Number(read(RESTORE_KEY));
  write(RESTORE_KEY, null);
  if (!Number.isFinite(at) || at <= 0 || Date.now() - at > RESTORE_TTL_MS) return null;
  const note = readRosterReturn();
  return note && note.href === here() ? note.scrollY : null;
}
