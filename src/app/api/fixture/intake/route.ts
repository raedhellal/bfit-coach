import { NextResponse } from "next/server";
import { fixtureIntakeAnswer } from "@/lib/coachApi.fixture";
import { COACH_API_MODE } from "@/lib/env";

/**
 * EV-341w — the TRAINEE's half of the intake consent request, for the Playwright gate ONLY.
 *
 * The coach's three routes are the fixture's `CoachApi` methods. What a trainee does on their
 * own phone (EV-341q: grant, « Pas maintenant », or simply let the 15 minutes pass) has no
 * coach call, so a spec reaches it here:
 *
 *   POST `{ clientId, answer: "grant" | "dismiss" | "expire" }` → `{ changed }`.
 *
 * **404 unless `COACH_API_MODE=fixture`**, like every route under `/api/fixture`: in `live`
 * the trainee answers on b-fit-api, and this route must not exist.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = { "Cache-Control": "no-store" };
const ANSWERS = new Set(["grant", "dismiss", "expire"]);

export async function POST(request: Request) {
  if (COACH_API_MODE !== "fixture") return new NextResponse(null, { status: 404, headers: NO_STORE });
  const body = (await request.json().catch(() => null)) as { clientId?: unknown; answer?: unknown } | null;
  if (typeof body?.clientId !== "string" || typeof body.answer !== "string" || !ANSWERS.has(body.answer)) {
    return NextResponse.json({ code: "VALIDATION_ERROR" }, { status: 400, headers: NO_STORE });
  }
  const changed = fixtureIntakeAnswer(body.clientId, body.answer as "grant" | "dismiss" | "expire");
  return NextResponse.json({ changed }, { headers: NO_STORE });
}
