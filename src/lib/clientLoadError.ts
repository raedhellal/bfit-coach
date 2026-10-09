/**
 * BUG-629 — the trainee overview read failed with anything but a 403, and the page must SAY
 * so with a 5xx status, not a 200. "Anything but a 403" is wider than an api outage: an api
 * 5xx, no answer or a timeout, but also a 401 after a failed token refresh, a 429 or a 400
 * all land here and are served 500 (a 403 is the layout's denial page; a malformed id never
 * reaches the api, BUG-600).
 *
 * A Next 14 page cannot set its status; the only way a render answers 500 is to throw
 * before the first byte (no `loading.tsx` sits above `/clients/[id]`). So the overview page
 * throws THIS error, and the root error boundary (`src/app/error.tsx`) recognises it by its
 * `digest` and draws the page the coach saw before, unchanged: `ClientNoticeCard` with
 * `copy.client.loadError` as the one `h1` and the way back to the roster.
 *
 * The digest is the one property Next carries from a server error to the client boundary in
 * production (the message is stripped there), and Next keeps a digest the error already has
 * (`create-error-handler.js`: "If the error already has a digest, respect the original
 * digest"). Any OTHER thrown error keeps Next's hashed digest and gets the generic screen.
 *
 * No `server-only` import: the client error boundary imports this module.
 */
export const CLIENT_LOAD_ERROR_DIGEST = "EVOLI_CLIENT_OVERVIEW_UNAVAILABLE";

export function clientLoadError(): Error {
  const error = new Error("The trainee overview could not be read.") as Error & { digest: string };
  error.digest = CLIENT_LOAD_ERROR_DIGEST;
  return error;
}

export function isClientLoadError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { digest?: unknown }).digest === CLIENT_LOAD_ERROR_DIGEST
  );
}
