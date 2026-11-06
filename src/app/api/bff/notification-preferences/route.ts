import { ApiError } from "@/lib/apiFetch";
import { coachApi } from "@/lib/coachApi";
import { handlerAccessToken, withTokenSource } from "@/lib/handlerSession";
import { asEmailSwitches, channelsBody, isCoachEmailType } from "@/lib/notificationPreferences";
import { guardWrite, json, refuseCrossSiteRead, upstreamFailure } from "@/lib/notificationsBff";

/**
 * EV-455k — the settings page's two calls to EV-455h's document, `/me/notification-preferences`.
 * Same guards as EV-455f's routes, reused as they are (`src/lib/notificationsBff.ts`): route
 * handlers, `no-store`, `handlerAccessToken` for the bearer, inside the middleware matcher, and
 * every 2xx body re-built field by field (`asEmailSwitches`), so only the four coach email pairs
 * reach the browser: never `timezone`, `quietHours`, a pair the page does not draw, or a token.
 *
 *   GET          → GET /me/notification-preferences. 200 `{ channels: { <TYPE>: { email } } }`.
 *   PUT `{ type, email }` → PUT /me/notification-preferences `{ channels: { <type>: { email } } }`,
 *                  the one pair (a merge, so `timezone` and `quietHours` keep their values,
 *                  story ruling 2026-10-27 (ar)). 200 with the STORED pairs, the same shape as GET.
 *                  `type` must be one of the four coach email types and `email` a boolean, and
 *                  the body holds nothing else: 400 `INVALID_REQUEST` before any api call. The
 *                  api's own 400 (a pair that does not apply to this caller) is 400 too.
 *
 * Answers, both: 200; 400 `INVALID_REQUEST`; and the shared ones (`notificationsBff.ts`): 401
 * `SESSION_EXPIRED` | `SESSION_CHANGED`, 403 `CROSS_ORIGIN`, 415 (PUT), 502 `UPSTREAM` (the api
 * failed, did not answer, or answered a document without the pair).
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
    const switches = asEmailSwitches(await coachApi.getNotificationPreferences(session.accessToken));
    if (!switches) return withTokenSource(json({ code: "UPSTREAM" }, 502), session);
    return withTokenSource(json(channelsBody(switches), 200), session);
  } catch (err) {
    return upstreamFailure(err, session);
  }
}

/** `{ type, email }` and nothing else, or null. */
function asChange(text: string): { type: string; email: boolean } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const body = parsed as Record<string, unknown>;
  const keys = Object.keys(body).sort();
  if (keys.length !== 2 || keys[0] !== "email" || keys[1] !== "type") return null;
  if (!isCoachEmailType(body.type) || typeof body.email !== "boolean") return null;
  return { type: body.type, email: body.email };
}

export async function PUT(request: Request) {
  const guarded = await guardWrite(request);
  if ("refused" in guarded) return guarded.refused;
  const { session } = guarded;
  const reply = (body: Record<string, unknown>, status: number) => withTokenSource(json(body, status), session);

  let text: string;
  try {
    text = await request.text();
  } catch {
    return reply({ code: "INVALID_REQUEST" }, 400);
  }
  // guardWrite refused a declared length over 1 kB; this catches a body sent without one.
  if (text.length > 1024) return reply({ code: "INVALID_REQUEST" }, 400);
  const change = asChange(text);
  if (!change) return reply({ code: "INVALID_REQUEST" }, 400);

  try {
    const stored = asEmailSwitches(
      await coachApi.putNotificationPreferences({ channels: { [change.type]: { email: change.email } } }, session.accessToken)
    );
    if (!stored || !stored.some((s) => s.type === change.type)) return reply({ code: "UPSTREAM" }, 502);
    return reply(channelsBody(stored), 200);
  } catch (err) {
    if (err instanceof ApiError && err.status === 400) return reply({ code: "INVALID_REQUEST" }, 400);
    return upstreamFailure(err, session);
  }
}
