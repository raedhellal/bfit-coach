import { ApiError } from "@/lib/apiFetch";
import { coachApi, isNotificationNotFound } from "@/lib/coachApi";
import { withTokenSource } from "@/lib/handlerSession";
import { guardWrite, json, noContent, upstreamFailure } from "@/lib/notificationsBff";

/**
 * EV-455f — open an item: `POST {}` → `POST /me/notifications/{id}/read`, sent by the inbox when
 * the coach clicks an unread item (AC-4). For a `CLIENT_MESSAGE` item on an ACTIVE link the api
 * also moves the coach's read position in that thread (EV-455 X4, EV-455d).
 *
 * Answers: 204; 400 `INVALID_REQUEST` (not a UUID: no api call); 404 `NOTIFICATION_NOT_FOUND`
 * (the api's, for any id that is not this coach's, X5); 403 `COACH_ACCESS_DENIED` (the api's: a
 * link or the role ended between its routing decision and the thread write; a retry marks the
 * item alone); and the shared ones (`src/lib/notificationsBff.ts`).
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const guarded = await guardWrite(request);
  if ("refused" in guarded) return guarded.refused;
  const { session } = guarded;
  if (!UUID.test(params.id)) return withTokenSource(json({ code: "INVALID_REQUEST" }, 400), session);
  try {
    await coachApi.markNotificationRead(params.id, session.accessToken);
    return noContent(session);
  } catch (err) {
    if (isNotificationNotFound(err)) return withTokenSource(json({ code: "NOTIFICATION_NOT_FOUND" }, 404), session);
    if (err instanceof ApiError && err.status === 403) {
      return withTokenSource(json({ code: "COACH_ACCESS_DENIED" }, 403), session);
    }
    return upstreamFailure(err, session);
  }
}
