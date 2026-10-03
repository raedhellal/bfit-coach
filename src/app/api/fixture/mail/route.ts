import { NextResponse } from "next/server";
import { fixtureInvitationMails } from "@/lib/coachApi.fixture";
import { COACH_API_MODE } from "@/lib/env";

/**
 * EV-204b — the fixture's MAIL SINK: every invitation `POST /coach-portal/trainees` and its
 * Resend "sent" since the last reset, with the temporary password the email carries.
 *
 * It exists so a test can hold the real value and then prove it is absent from every coach
 * surface (AC-P9). The live portal has no such route and never sees the password: on a real
 * api it exists only in the email (or, with `bfit.mail.enabled=false`, in the api's own
 * `[mail stub]` log line).
 *
 * 404 unless `COACH_API_MODE=fixture`, exactly like `/api/fixture/activations`.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET() {
  if (COACH_API_MODE !== "fixture") return new NextResponse(null, { status: 404, headers: NO_STORE });
  return NextResponse.json({ mails: fixtureInvitationMails() }, { headers: NO_STORE });
}
