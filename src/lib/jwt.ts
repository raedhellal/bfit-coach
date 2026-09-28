/**
 * Server-side JWT claim reading. NO signature verification, deliberately, and it is
 * safe here for exactly one reason: this app only ever decodes a token it minted a
 * cookie for itself, from a `POST /auth/login` response it made server-to-server.
 * The token never round-trips through the browser, so there is nothing for a client
 * to forge. The authoritative check is still the api's — every read is a bearer call
 * that b-fit-api verifies and authorises (ADR-0001: server-enforced, client
 * untrusted). What we read here decides UI routing, not access.
 *
 * Why we decode at all: `GET /me` (`UserResponse`) exposes id, email, fullName,
 * createdAt and emailVerified — and NO roles. The roles live only in the access
 * token, as the `roles` claim written by `JwtTokenService` (a JSON array of
 * `Role.name()`: "USER" | "COACH" | "ADMIN" | "PENDING"). So "is this a coach?" cannot be
 * answered from `/me` today; it is answered from the claim.
 *
 * Runs in the edge runtime (middleware) as well as node, so: `atob` only, no Buffer.
 */
export interface JwtClaims {
  sub?: string;
  email?: string;
  roles?: string[];
  exp?: number; // seconds since epoch
  iat?: number;
}

export function decodeJwt(token: string): JwtClaims | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const json = decodeURIComponent(
      atob(padded)
        .split("")
        .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join("")
    );
    return JSON.parse(json) as JwtClaims;
  } catch {
    return null;
  }
}

export function hasCoachRole(token: string | null | undefined): boolean {
  if (!token) return false;
  return decodeJwt(token)?.roles?.includes("COACH") === true;
}

/**
 * EV-278c — an account somebody else initialised that its person has not activated.
 *
 * EXACTLY `["PENDING"]`, never "includes PENDING": b-fit-api's `User.withRoles` refuses
 * PENDING beside any other role (ADR-0022 K2), so a token carrying PENDING and anything
 * else is one no writer produces and is not read as pending here. Middleware and the
 * sign-in handler use this to confine the session to /activate.
 */
export function isPendingOnly(token: string | null | undefined): boolean {
  if (!token) return false;
  const roles = decodeJwt(token)?.roles;
  return Array.isArray(roles) && roles.length === 1 && roles[0] === "PENDING";
}

/** True when the token is absent, unreadable, or expires within `skewSeconds`. */
export function isExpired(token: string | null | undefined, skewSeconds = 30): boolean {
  if (!token) return true;
  const exp = decodeJwt(token)?.exp;
  if (typeof exp !== "number") return true;
  return exp * 1000 - skewSeconds * 1000 <= Date.now();
}
