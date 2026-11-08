import { ApiError } from "@/lib/apiFetch";
import { coachApi } from "@/lib/coachApi";
import { withTokenSource } from "@/lib/handlerSession";
import { guardWrite, json, noContent, upstreamFailure } from "@/lib/notificationsBff";

/**
 * EV-455f — « Tout marquer comme lu »: `POST {}` → `POST /me/notifications/read-all?audience=COACH`
 * (AC-7, `coachApi.markAllNotificationsRead`). Since EV-475 the api marks only the coach's
 * `CLIENT_*` items (the request-time bound, and where it does not hold, below); the coach's own
 * `COACH_*` items, and the coach's own trainee thread, do not move. `CLIENT_MESSAGE` items follow
 * their threads (EV-455d), so the coach's unread client messages are read too. An item that
 * arrives after the request stays unread (EV-455b AC-6c) where the api bounds it by its request
 * time: the non-message `CLIENT_*` items, and `CLIENT_MESSAGE` items on no ACTIVE link. For a
 * coach who holds the role, a `CLIENT_MESSAGE` item on an ACTIVE link has no time bound: its
 * thread is read to `last_seq` under the link lock, and its item with it, so nothing holds unread
 * a message that lands after the api reads its request time and before it takes that lock
 * (BUG-1113: by trace at api `349c9297`, `CoachMessagingUseCase.java:126`; no run has constructed
 * that window).
 *
 * Answers: 204; 403 `COACH_ACCESS_DENIED` (the api's: the coach role or profile ended mid-call;
 * a retry runs read-all again, and if the coach role is still gone the api's de-roled branch
 * marks the `CLIENT_MESSAGE` items up to the retry's request time read without moving their
 * threads: by trace, `MyNotificationsUseCase.java:275` at the same api SHA); and the shared ones
 * (`src/lib/notificationsBff.ts`).
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
  const guarded = await guardWrite(request);
  if ("refused" in guarded) return guarded.refused;
  const { session } = guarded;
  try {
    await coachApi.markAllNotificationsRead(session.accessToken);
    return noContent(session);
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      return withTokenSource(json({ code: "COACH_ACCESS_DENIED" }, 403), session);
    }
    return upstreamFailure(err, session);
  }
}
