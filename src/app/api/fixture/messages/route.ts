import { NextResponse } from "next/server";
import { ApiError } from "@/lib/apiFetch";
import { fixtureMessageThreadRecord, fixtureTraineeSendsMessage } from "@/lib/coachApi.fixture";
import { COACH_API_MODE } from "@/lib/env";

/**
 * EV-095b — the CLIENT's half of the thread, for the Playwright gate ONLY.
 *
 * The coach's four routes are the fixture's `CoachApi` methods. What the client writes on their
 * phone (`POST /me/my-coach/messages`, EV-095c1) has no coach call, so a spec reaches it here:
 *
 *   POST `{ clientId, body, sentAt? }` → `{ seq }` — one message from the client, under the api's
 *                               rules; `sentAt` (ISO, optional) pins its instant (BUG-934's spec);
 *   GET  `?clientId=`         → the stored thread with BOTH read positions (a witness the coach
 *                               portal never receives: the client's position is never on its wire).
 *
 * **404 unless `COACH_API_MODE=fixture`**, like every route under `/api/fixture`.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  if (COACH_API_MODE !== "fixture") return new NextResponse(null, { status: 404, headers: NO_STORE });
  const body = (await request.json().catch(() => null)) as { clientId?: unknown; body?: unknown; sentAt?: unknown } | null;
  if (
    typeof body?.clientId !== "string" ||
    typeof body.body !== "string" ||
    (body.sentAt !== undefined && (typeof body.sentAt !== "string" || Number.isNaN(Date.parse(body.sentAt))))
  ) {
    return NextResponse.json({ code: "VALIDATION_ERROR" }, { status: 400, headers: NO_STORE });
  }
  try {
    const message = await fixtureTraineeSendsMessage(body.clientId, body.body, body.sentAt);
    return NextResponse.json({ seq: message.seq }, { headers: NO_STORE });
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 400;
    const code = err instanceof ApiError ? err.code : "VALIDATION_ERROR";
    return NextResponse.json({ code }, { status, headers: NO_STORE });
  }
}

export async function GET(request: Request) {
  if (COACH_API_MODE !== "fixture") return new NextResponse(null, { status: 404, headers: NO_STORE });
  const clientId = new URL(request.url).searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ code: "VALIDATION_ERROR" }, { status: 400, headers: NO_STORE });
  return NextResponse.json(fixtureMessageThreadRecord(clientId), { headers: NO_STORE });
}
