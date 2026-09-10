import { NextResponse } from "next/server";
import { clearSession } from "@/lib/session";

/**
 * POST /api/auth/logout — clears both session cookies.
 *
 * Local only, and that is a limitation worth stating rather than hiding: b-fit-api
 * has no `/auth/logout` and no refresh-token revocation endpoint (grep: nothing
 * matches "logout" in the api source), so signing out drops the browser's copy of the
 * tokens but cannot invalidate the refresh token server-side. It stays valid until it
 * expires or ADR-0010's rotation ledger retires it. EV-060 should add the endpoint.
 */
export async function POST() {
  clearSession();
  return new NextResponse(null, { status: 204 });
}
