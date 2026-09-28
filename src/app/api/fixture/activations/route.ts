import { NextResponse } from "next/server";
import { fixtureActivations } from "@/lib/coachApi.fixture";
import { COACH_API_MODE } from "@/lib/env";

/**
 * EV-278c — every `POST /me/activate` the fixture answered since the last reset, for the
 * Playwright gate ONLY: the body's KEYS (the portal must never send a role), the consent
 * flag and versions it carried, and the outcome. Never a password value.
 *
 * 404 unless `COACH_API_MODE=fixture`, exactly like `/api/fixture/state` and
 * `/api/fixture/calls` — see the note on that route for why the mode is the only guard.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET() {
  if (COACH_API_MODE !== "fixture") return new NextResponse(null, { status: 404, headers: NO_STORE });
  return NextResponse.json({ activations: fixtureActivations() }, { headers: NO_STORE });
}
