import "server-only";
import { cache } from "react";
import { coachApi, INVITED_PAGE_SIZE, type InitialisedAccount } from "./coachApi";

/**
 * EV-204b — the coach's Invited accounts, read WHOLE.
 *
 * `GET /coach-portal/trainees` is paged (size ≤ 100) and the api throttles initialisation at
 * 30 an hour inside a 30-day window, so a busy coach can hold more than one page. Reading
 * only page 0 would hide the oldest invitations — the ones closest to being deleted, which
 * are exactly the ones a coach needs to see (D22.4c). So every page is read, in parallel
 * after the first, bounded so a runaway `totalPages` cannot fan out without limit.
 *
 * There is no `GET /coach-portal/trainees/{id}`: the person's own page finds its row here.
 * `cache` makes the roster and that page each pay for one read per render.
 */
export const INVITED_MAX_PAGES = 20;

export const readAllInvited = cache(async (): Promise<InitialisedAccount[]> => {
  const first = await coachApi.listInvited(0, INVITED_PAGE_SIZE);
  const pages = Math.max(1, first.totalPages);
  if (pages > INVITED_MAX_PAGES) {
    throw new Error(`The Invited list has ${pages} pages; at most ${INVITED_MAX_PAGES} are read.`);
  }
  const rest = await Promise.all(
    Array.from({ length: pages - 1 }, (_, i) => coachApi.listInvited(i + 1, INVITED_PAGE_SIZE))
  );
  const seen = new Set<string>();
  const out: InitialisedAccount[] = [];
  for (const page of [first, ...rest]) {
    for (const row of page.items) {
      if (seen.has(row.userId)) continue; // a row that moved pages between two reads
      seen.add(row.userId);
      out.push(row);
    }
  }
  return out;
});
