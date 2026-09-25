import { NextResponse } from "next/server";
import { fixtureStateIsPristine, resetFixtureState } from "@/lib/coachApi.fixture";
import { COACH_API_MODE } from "@/lib/env";

/**
 * EV-223 — the fixture store's reset and seed check, for the Playwright gate ONLY.
 *
 *   GET    → `{ pristine }`: is the in-memory store still exactly its seed?
 *   DELETE → reset the store to its seed, answer `{ pristine }` read back after it.
 *
 * **Both answer 404 unless `COACH_API_MODE=fixture`.** In `live` — the default, and
 * what the Vercel deployment runs — there is no fixture store to reset. (Any other
 * method is Next's own 405 in either mode; the path's existence is not a secret, its
 * effect is.) Fixture mode already mints an
 * unsigned session for any email (`/api/auth/login`), so this route grants nothing
 * that mode does not; a deployment in fixture mode is the incident, not this file.
 *
 * It is NOT a public route: it sits inside the middleware matcher like every other
 * page, so it needs a (fixture) coach session. `qa/fixture-test.ts` signs in first and
 * refuses to follow a redirect, so an unauthenticated call is a failed test rather
 * than a 200 from the login page.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = { "Cache-Control": "no-store" };

function notFound() {
  return new NextResponse(null, { status: 404, headers: NO_STORE });
}

export async function GET() {
  if (COACH_API_MODE !== "fixture") return notFound();
  return NextResponse.json({ pristine: fixtureStateIsPristine() }, { headers: NO_STORE });
}

export async function DELETE() {
  if (COACH_API_MODE !== "fixture") return notFound();
  resetFixtureState();
  return NextResponse.json({ pristine: fixtureStateIsPristine() }, { headers: NO_STORE });
}
