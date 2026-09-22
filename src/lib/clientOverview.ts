import "server-only";
import { cache } from "react";
import {
  coachApi,
  isForbidden,
  type ClientOverview,
  type CoachMe,
  type TraineeProgress,
} from "./coachApi";

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
 * EV-187b — the monitoring read (`GET /coach-portal/clients/{id}/progress`).
 *
 * **A 403 here is not the denial page.** The overview endpoint requires an ACTIVE link
 * and no data scope; this one names `PROGRESS` at the guard, so a link that shares only
 * workouts or only nutrition is answered 403 for the monitoring blocks while the rest
 * of the trainee's page is a perfectly legitimate 200. Throwing, or reusing the layout's
 * redirect, would 403 the whole client area for a trainee the coach is entitled to see.
 *
 * So the outcome is a value, and the caller renders **"not shared" from `scopes`** and
 * never from this status — ADR-0012 D4's denial is undifferentiated across "no such
 * id", "another coach's client", "revoked" and "scope missing", so it says nothing
 * about consent and must not be read as if it did.
 *
 * `forbidden` is still returned rather than swallowed: the caller distinguishes "the
 * api said no" (expected for a link without PROGRESS) from "the api did not answer",
 * which is a load error and gets a sentence of its own.
 *
 * Cached per request for the same reason as the overview: the page reads it once.
 */
export const readClientProgress = cache(
  async (id: string): Promise<{ progress: TraineeProgress | null; forbidden: boolean }> => {
    try {
      return { progress: await coachApi.getClientProgress(id), forbidden: false };
    } catch (err) {
      return { progress: null, forbidden: isForbidden(err) };
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
