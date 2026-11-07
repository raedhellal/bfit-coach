import { coachApi } from "@/lib/coachApi";
import { handlerAccessToken, withTokenSource } from "@/lib/handlerSession";
import { json, refuseCrossSiteRead, upstreamFailure } from "@/lib/notificationsBff";

/**
 * EV-455f — the bell's count: `GET` → `GET /me/notifications/unread-count?audience=COACH`
 * (`coachApi.getNotificationsUnreadCount`): since EV-475, the unread `CLIENT_*` items only, never
 * the coach's own `COACH_*` ones. Read by the shell on
 * every signed-in page and every 60 s while the tab is visible (`NotificationsProvider`).
 *
 * Answers: 200 `{ count }`, a non-negative integer, or 502 `UPSTREAM` — a body without one is a
 * failed read, never a 0 (AC-9); and the shared ones (`src/lib/notificationsBff.ts`).
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const refused = refuseCrossSiteRead(request);
  if (refused) return refused;
  const session = await handlerAccessToken(request);
  if (session.kind === "expired") return json({ code: "SESSION_EXPIRED" }, 401);
  if (session.kind === "unavailable") return json({ code: "UPSTREAM" }, 502);
  try {
    const count = (await coachApi.getNotificationsUnreadCount(session.accessToken))?.count;
    if (typeof count !== "number" || !Number.isInteger(count) || count < 0) {
      return withTokenSource(json({ code: "UPSTREAM" }, 502), session);
    }
    return withTokenSource(json({ count }, 200), session);
  } catch (err) {
    return upstreamFailure(err, session);
  }
}
