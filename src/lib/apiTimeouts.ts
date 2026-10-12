/**
 * BUG-690 (audit A3) — how long a portal→api call may take before it is abandoned.
 *
 * Without a bound, a stalled api (a hung Railway instance, a lock wait) held the page's
 * server render until the Vercel function limit: the coach saw only the progress bar,
 * with no error and no retry. With one, the call fails like a lost connection and the
 * page draws the load-error state it already has for a failed read.
 *
 *   · READS (GET/HEAD): 8 s, the story's bound. Every coach read answers in tens of ms;
 *     the slowest measured endpoint, the roster at 106 links, has a p95 of 404 ms.
 *   · WRITES (everything else): 60 s. Longer on purpose: the meal-week apply, a day's
 *     regenerate and a swap are AI-backed when the api runs with AI on, and abandoning a
 *     slow write that then LANDS would tell the coach "failed" about a change that
 *     happened. 60 s bounds a truly stalled write without cutting a slow one (BUG-695
 *     tracks whether the platform's own function limit is lower).
 *
 * The bound covers the WHOLE call, the body included, and the 401 → refresh → replay of
 * `apiFetch` shares one deadline. Not covered, stated: `apiPost` (sign-in and the token
 * rotation) and `apiGetAs` (the sign-in activation check) are the session path, and
 * `middleware.ts`'s own `/auth/refresh` fetch; they are unchanged here.
 *
 * Not `server-only`: two plain numbers, no secret, no server API. `useRosterRead` (a client
 * module) reads `API_READ_TIMEOUT_MS` to bound how long a picker may say it is loading
 * (QA-S3N-1). `apiFetch.ts` is the only code that ENFORCES them.
 */
export const API_READ_TIMEOUT_MS = 8_000;
export const API_WRITE_TIMEOUT_MS = 60_000;
