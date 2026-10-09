import { ApiError } from "./apiFetch";

/**
 * The portal's ONE "was there an answer?" policy for a WRITE (BUG-523, BUG-711).
 *
 * senior-po's rulings (2026-09-30 for the template apply, 2026-10-09 for the client
 * nutrition page), both extending BUG-248's rule for a lost answer: when a write's answer
 * is lost, nobody knows whether it landed, so the portal says "We couldn't confirm …" and
 * never reports a refusal. Lost means either of two things:
 *
 *   · anything thrown that is not an `ApiError` — the connection to b-fit-api failed,
 *     `fetch` threw, a timeout: b-fit-api did not answer at all;
 *   · a received `502`, `503` or `504` — a status, but from whatever stands in front of
 *     b-fit-api (a gateway, a proxy), which may have written behind it.
 *
 * A plain `500` is NOT lost: it is b-fit-api's own answer
 * (`RestExceptionHandler.handleUnexpected`) and reads as a failure. None of the three
 * gateway statuses is a refusal b-fit-api itself sends on these writes (trace on b-fit-api
 * origin/main, 2026-10-09, in `nutritionTemplateActions.ts`).
 *
 * A plain module, NOT `"use server"`: a server-action file may export only async
 * functions, and both action files import this. Reached only from server code
 * (`apiFetch` is `server-only`).
 *
 * The browser-side twin — a server action whose REQUEST failed — is not decided here:
 * each island's `settled()` fallback for a write is that write's no-answer code.
 */
export const GATEWAY_STATUSES: ReadonlySet<number> = new Set([502, 503, 504]);

/** True when a write's answer was lost: not an `ApiError`, or a gateway 502/503/504. */
export function isLostAnswer(err: unknown): boolean {
  return !(err instanceof ApiError) || GATEWAY_STATUSES.has(err.status);
}
