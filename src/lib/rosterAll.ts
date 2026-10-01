import type { RosterClient, RosterPage } from "./coachApi";

/**
 * BUG-472 — the WHOLE roster, every page of `GET /coach-portal/clients`.
 *
 * A screen that offers "pick a client" (the challenge invite list) must offer every
 * ACTIVE client, not the first page of them: a coach with 101 clients could not invite
 * the 101st. b-fit-api has no roster search (`CoachPortalController.clients` takes only
 * `page`, `size` ≤ 100 and `sort`, api main 2026-10-01), so the list reads every page.
 *
 * Page 0 says how many pages there are; the rest are read in parallel. A row is kept
 * once, by id: the roster is sorted by activity, so a row can move between two page
 * reads and arrive twice. (The other half of that — a row moving BACK past a page
 * already read and arriving zero times — cannot be closed from here without a stable
 * sort key on the api; it needs the roster to change during the few milliseconds of the
 * read, and the next page load reads it again.)
 *
 * Any page failing fails the whole read: a partial list would be the defect this exists
 * to fix, said with more confidence. The caller's failure branch already says the
 * clients could not be loaded. So does a roster of more than `maxPages` pages — far past
 * any tier that exists (the largest is 100 profiles) — rather than a silent truncation.
 *
 * Pure: the page reader is passed in, so `qa/roster-all.spec.ts` drives it without a
 * server.
 */
export const ROSTER_MAX_PAGES = 50;

export async function readWholeRoster(
  readPage: (page: number) => Promise<RosterPage>,
  maxPages = ROSTER_MAX_PAGES
): Promise<RosterClient[]> {
  const first = await readPage(0);
  const pages = Math.max(1, first.totalPages);
  if (pages > maxPages) {
    throw new Error(`The roster has ${pages} pages; at most ${maxPages} are read.`);
  }
  const rest = await Promise.all(Array.from({ length: pages - 1 }, (_, i) => readPage(i + 1)));
  const seen = new Set<string>();
  const rows: RosterClient[] = [];
  for (const page of [first, ...rest]) {
    for (const row of page.items) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      rows.push(row);
    }
  }
  return rows;
}
