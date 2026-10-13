import { NextResponse } from "next/server";
import { fixtureTrialComplete } from "@/lib/coachApi.fixture";
import { COACH_API_MODE } from "@/lib/env";

/**
 * EV-341j — the TRAINEE finishing the trial session in the app, for the Playwright gate ONLY.
 *
 * No coach call completes a session (the app's player does, `POST /me/workout/complete` on the
 * carrier workout: EV-341i I3), so a spec reaches J3's « Faite le {date} » here:
 *
 *   POST `{ clientId, action: "complete" }` → `{ changed }`.
 *
 * **404 unless `COACH_API_MODE=fixture`**, like every route under `/api/fixture`.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  if (COACH_API_MODE !== "fixture") return new NextResponse(null, { status: 404, headers: NO_STORE });
  const body = (await request.json().catch(() => null)) as { clientId?: unknown; action?: unknown } | null;
  if (typeof body?.clientId !== "string" || body.action !== "complete") {
    return NextResponse.json({ code: "VALIDATION_ERROR" }, { status: 400, headers: NO_STORE });
  }
  return NextResponse.json({ changed: fixtureTrialComplete(body.clientId) }, { headers: NO_STORE });
}
