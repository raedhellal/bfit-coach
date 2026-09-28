/**
 * Fixture mode has to mint something the middleware can read, so it builds an unsigned
 * token with the same claim shape b-fit-api's `JwtTokenService` writes (`sub`, `email`,
 * `roles`, `exp`). It is accepted by nothing but this app's own routing: every api call
 * in fixture mode is served from `coachApi.fixture.ts` and never leaves the process.
 * Only ever called when `COACH_API_MODE=fixture` (a server env), so it cannot be turned
 * on from a browser.
 *
 * Moved out of `/api/auth/login` for EV-278c: the fixture's `POST /me/activate` has to
 * hand back FRESH tokens with the granted role, exactly as the api does, and minting
 * them in two places would be two claim shapes.
 */
export const FIXTURE_COACH_SUB = "1a2b3c4d-0000-4000-8000-00000000c0ac";

export function mintFixtureToken(
  email: string,
  roles: readonly string[] = ["USER", "COACH"],
  sub: string = FIXTURE_COACH_SUB
): string {
  const enc = (o: unknown) =>
    btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const payload = {
    sub,
    email,
    roles: [...roles],
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 8,
  };
  return `${enc({ alg: "none", typ: "JWT" })}.${enc(payload)}.fixture`;
}
