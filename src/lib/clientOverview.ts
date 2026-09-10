import "server-only";
import { cache } from "react";
import { coachApi, isForbidden, type ClientOverview, type CoachMe } from "./coachApi";

/**
 * The trainee overview, read ONCE per request and shared by the two components that
 * need it (BUG-139).
 *
 * `/clients/[id]/layout.tsx` needs the api's answer to decide the **status** the route
 * is served with; `/clients/[id]/page.tsx` needs the data to render it. React's
 * `cache` makes that one `GET /coach-portal/clients/{id}` per request rather than two
 * — which matters because ADR-0012 D3 forbids caching an authorization outcome across
 * requests, so the alternative really would be a second call on every overview a coach
 * legitimately opens.
 *
 * The outcome is returned as a value rather than thrown: the layout must distinguish
 * "the api said no" (403 → the denial page) from "the api did not answer" (the page's
 * friendly error), and a memoised rejection makes that distinction harder to read, not
 * easier.
 */
export const readClientOverview = cache(
  async (id: string): Promise<{ overview: ClientOverview | null; forbidden: boolean }> => {
    try {
      return { overview: await coachApi.getClient(id), forbidden: false };
    } catch (err) {
      // ADR-0012 D4: the coach portal answers 403 for a foreign id AND for one that
      // does not exist, so there is no existence oracle. Both land here.
      return { overview: null, forbidden: isForbidden(err) };
    }
  }
);

/**
 * The coach's own name, for the header. Cached for the same reason and started — not
 * awaited — by the layout, so it is in flight while the overview is being fetched
 * instead of costing a second round trip after it.
 *
 * A failure here must never take down the screen it decorates: it degrades to a header
 * without a name.
 */
export const readCoachMe = cache(async (): Promise<CoachMe | null> => {
  try {
    return await coachApi.getMe();
  } catch {
    return null;
  }
});
