import { NextResponse } from "next/server";
import { getVersionInfo } from "@/lib/version";

/**
 * GET /api/version — the deploy marker (the portal's /actuator/info).
 *
 * PUBLIC and unauthenticated on purpose: its whole job is to prove which commit is
 * serving BEFORE anyone signs in, which is exactly when a bad deploy has to be
 * caught. `src/middleware.ts` lets it through explicitly — as a statement in code,
 * not as a gap in the matcher regex — and narrows it to GET/HEAD.
 *
 * It leaks nothing. The body is built by `getVersionInfo()` from a fixed set of four
 * fields: a git SHA, its short form, a build timestamp and the environment name. No
 * environment variables, no API base URL, no config, no dependency list, no paths.
 * Treat every addition here as published to the internet, because it is.
 *
 * NEVER CACHED. A cached version endpoint reports the PREVIOUS deploy, which is worse
 * than having none: it would actively confirm a deploy that never happened. Hence
 * `force-dynamic` + `revalidate = 0` (Next's route cache) and `Cache-Control:
 * no-store` (Vercel's CDN and any proxy in between).
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  return NextResponse.json(getVersionInfo(), {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      // Nothing here is worth interpreting as anything but JSON.
      "X-Content-Type-Options": "nosniff",
    },
  });
}
