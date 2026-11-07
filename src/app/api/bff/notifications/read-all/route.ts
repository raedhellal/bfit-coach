import { ApiError } from "@/lib/apiFetch";
import { coachApi } from "@/lib/coachApi";
import { withTokenSource } from "@/lib/handlerSession";
import { guardWrite, json, noContent, upstreamFailure } from "@/lib/notificationsBff";

/**
 * EV-455f — « Tout marquer comme lu »: `POST {}` → `POST /me/notifications/read-all?audience=COACH`
 * (AC-7, `coachApi.markAllNotificationsRead`). Since EV-475 the api marks only the coach's
 * `CLIENT_*` items whose latest event is at or before the request; the coach's own `COACH_*`
 * items, and the coach's own trainee thread, do not move. `CLIENT_MESSAGE` items follow their
 * threads (EV-455d), so the coach's unread client messages are read too, and an item that
 * arrives after the request stays unread (EV-455b AC-6c).
 *
 * Answers: 204; 403 `COACH_ACCESS_DENIED` (the api's: a link or the role ended mid-call; a retry
 * marks the item alone); and the shared ones (`src/lib/notificationsBff.ts`).
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
