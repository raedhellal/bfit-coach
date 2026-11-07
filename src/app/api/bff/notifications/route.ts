import { ApiError } from "@/lib/apiFetch";
import { coachApi } from "@/lib/coachApi";
import { handlerAccessToken, withTokenSource } from "@/lib/handlerSession";
import { asNotificationPage } from "@/lib/notifications";
import { json, refuseCrossSiteRead, upstreamFailure } from "@/lib/notificationsBff";

/**
 * EV-455f — the inbox's page read: `GET ?cursor=` →
 * `GET /me/notifications?audience=COACH&limit=20&cursor=` (`coachApi.listNotifications`). Since
 * EV-475 the api pages the coach's `CLIENT_*` items only, never the coach's own `COACH_*` ones.
 * The cursor is the api's opaque `nextCursor`, forwarded as given; the api is its one judge (a
 * cursor it did not issue is its 400, answered here as 400 `INVALID_REQUEST`).
 *
 * Answers: 200 `{ items, nextCursor }` (re-built, `asNotificationPage`); 400 `INVALID_REQUEST`;
 * and the shared ones (`src/lib/notificationsBff.ts`).
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const refused = refuseCrossSiteRead(request);
  if (refused) return refused;
  const cursor = new URL(request.url).searchParams.get("cursor");
  if (cursor !== null && (cursor === "" || cursor.length > 512)) return json({ code: "INVALID_REQUEST" }, 400);

  const session = await handlerAccessToken(request);
  if (session.kind === "expired") return json({ code: "SESSION_EXPIRED" }, 401);
  if (session.kind === "unavailable") return json({ code: "UPSTREAM" }, 502);
  try {
    const page = asNotificationPage(await coachApi.listNotifications(cursor, session.accessToken));
    if (!page) return withTokenSource(json({ code: "UPSTREAM" }, 502), session);
    return withTokenSource(json({ items: page.items, nextCursor: page.nextCursor }, 200), session);
  } catch (err) {
    if (err instanceof ApiError && err.status === 400) {
      return withTokenSource(json({ code: "INVALID_REQUEST" }, 400), session);
    }
    return upstreamFailure(err, session);
  }
}
