/**
 * EV-341w — the « Entretien » card's vocabulary, client-safe and pure.
 *
 * No `server-only` import and no `coachApi` import at runtime: the card (a client island)
 * reads these types and functions, and `qa/intake-consent-unit.spec.ts` runs them in node
 * with no server and no browser. The api's codes are read in `intakeActions.ts` and the BFF
 * route only; this module never sees an `ApiError`.
 */

/** What the card shows a coach. Exactly the api's two booleans (`CoachIntakeConsentStatus`). */
export interface IntakeStatus {
  granted: boolean;
  pending: boolean;
}

/** W3 — the poll's period while the document is visible. */
export const INTAKE_POLL_MS = 3_000;

/** The api's TTL (EV-341p2): what the panel assumes when a 201 carries unusable instants. */
export const INTAKE_REQUEST_TTL_MS = 15 * 60 * 1000;

/**
 * A read's body, accepted only as EXACTLY the two booleans. Anything else (an older or newer
 * api, a proxy's page, a field the api's PR12 pin forbids) is a failed read: never a guess
 * that the trainee answered, and never a crash.
 */
export function asIntakeStatus(body: unknown): IntakeStatus | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  if (typeof record.granted !== "boolean" || typeof record.pending !== "boolean") return null;
  return { granted: record.granted, pending: record.pending };
}

/**
 * How long a request made just now stays live, from the 201's OWN two instants: both are the
 * server's clock, so their difference is immune to a browser clock that is minutes off. The
 * panel adds it to `Date.now()` when the answer arrives. A malformed or non-positive pair is
 * the api's documented 15 minutes.
 */
export function liveForMs(requestedAt: unknown, expiresAt: unknown): number {
  if (typeof requestedAt !== "string" || typeof expiresAt !== "string") return INTAKE_REQUEST_TTL_MS;
  const span = Date.parse(expiresAt) - Date.parse(requestedAt);
  return Number.isFinite(span) && span > 0 ? Math.min(span, INTAKE_REQUEST_TTL_MS) : INTAKE_REQUEST_TTL_MS;
}

/** `askIntakeConsentAction`'s answer. */
export type AskOutcome =
  /** 201: the request is live for `liveForMs` from now. */
  | { ok: true; liveForMs: number }
  /** 409 INTAKE_ALREADY_GRANTED, and what the re-read said (W7); `granted` true when it failed. */
  | { ok: false; code: "ALREADY_GRANTED"; granted: boolean }
  /** 429 INTAKE_REQUEST_LIMIT (W6). */
  | { ok: false; code: "LIMIT" }
  /** 403: the link ended (W8). */
  | { ok: false; code: "ACCESS_DENIED" }
  /** Anything else, including a lost answer and the release hold being off. */
  | { ok: false; code: "FAILED" };

/** `cancelIntakeConsentAction`'s answer. */
export type CancelOutcome = { ok: true } | { ok: false; code: "ACCESS_DENIED" | "FAILED" };

/**
 * One poll's outcome, as the card acts on it:
 *   · `status`     — the api answered (W4: granted, or no longer pending, or still waiting);
 *   · `denied`     — 403: the link ended, the overview's revoked-link path (W8);
 *   · `signedOut`  — the portal's middleware sent the read to /login (the session ended);
 *   · `failed`     — anything else: the wait goes on, nothing is shown as an answer.
 */
export type PollOutcome =
  | { kind: "status"; status: IntakeStatus }
  | { kind: "denied" }
  | { kind: "signedOut" }
  | { kind: "failed" };

/**
 * The BFF read's response, classified. `redirect: "manual"` makes the middleware's 307 to
 * /login an `opaqueredirect` (status 0) rather than the login page's HTML parsed as a 200.
 */
export function pollOutcome(status: number, type: string, body: unknown): PollOutcome {
  if (type === "opaqueredirect" || (status >= 300 && status < 400)) return { kind: "signedOut" };
  if (status === 403) return { kind: "denied" };
  if (status !== 200) return { kind: "failed" };
  const parsed = asIntakeStatus(body);
  return parsed ? { kind: "status", status: parsed } : { kind: "failed" };
}

/** The BFF path the card polls. The subject is the URL segment, as on every api path. */
export function intakeConsentPath(clientId: string): string {
  return `/api/bff/clients/${encodeURIComponent(clientId)}/intake-consent`;
}
