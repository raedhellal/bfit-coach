"use client";

import { useEffect, useState } from "react";
import { API_READ_TIMEOUT_MS } from "./apiTimeouts";

/**
 * EV-356g — a roster read the page did NOT wait for.
 *
 * `/templates`, `/nutrition-templates` and `/challenges` read the roster only to fill a client
 * picker inside a dialog. `listClients` is the slowest read in the system (production
 * 2026-10-11: ≥ 8 s, at `API_READ_TIMEOUT_MS`), and awaiting it held the whole library. The
 * pages now START the read with the others and hand the UNRESOLVED promise to their client
 * island, so the list paints first and only the picker waits.
 *
 * The page's promise never rejects (it ends in `.catch(() => null)`: a failure is `null`, never
 * `[]`, BUG-738). This hook still reads it through BOTH callbacks of `then`, because what
 * arrives here is React Flight's thenable, not the server's promise: on a CLIENT navigation, a
 * stream cut mid-flight rejects it on this side (witnessed by senior-qa, s3n: the failure
 * sentence ~0.93 s after the cut). A rejected promise read with React's `use()` throws to the
 * route's error boundary and takes the library down with it, which is the one thing G.4
 * forbids.
 *
 * On a DOCUMENT load the same cut rejects nothing (QA-S3N-1). The answer travels in the HTML
 * as inline scripts, and Next closes that inline stream only when the document ends; a dropped
 * connection never ends it (`document.readyState` stays "loading", 30 s witnessed), so the
 * thenable stays pending forever and the picker said « Chargement de vos clients… » forever.
 * Hence a DEADLINE: past `deadlineMs` with no answer, the read is `failed`, and the picker says
 * BUG-738's sentence, which tells the coach to reload. So:
 *
 *   · no `use()` and no Suspense: a rejection becomes `failed`, said inside the dialog;
 *   · no answer by the deadline is `failed` too. The deadline is derived from the server's own
 *     bound (`rosterReadDeadlineMs`), so a slow read the server would still have answered is
 *     never called failed. No refetch and no new request: the coach is told to reload;
 *   · an answer that arrives AFTER the deadline still wins (true data: a list replaces the
 *     failure sentence, `null` or a rejection leaves it). Nothing optimistic either way: the
 *     picker offers only what the server sent;
 *   · and no suspending in a transition either. `use()` on a NEW promise (every library write
 *     revalidates the page and so re-creates the read) would hold the router's transition until
 *     the roster answered whenever the picker is mounted. G.3: a rename settles without it.
 *
 * Server HTML and the first client render are both `loading` (an effect never runs on the
 * server), so hydration matches whatever the promise's state.
 *
 * A NEW promise (a revalidated page) is `loading` again until it settles: the previous answer
 * described a roster read before the write, and the picker never offers from it.
 */
export type RosterRead<T> =
  | { state: "loading" }
  | { state: "failed" }
  | { state: "ready"; targets: T[] };

const LOADING = { state: "loading" } as const;
const FAILED = { state: "failed" } as const;

/**
 * QA-S3N-1 — what the wait adds to the server's bound, for the answer's DELIVERY.
 *
 * Once the server's calls have hit `API_READ_TIMEOUT_MS`, `apiFetch` has given up and the page's
 * `.catch` has turned the read into `null`. What is left is getting that `null` here: React
 * serialises the chunk and flushes it on the open stream, the network carries it, the browser
 * runs the inline script and Flight resolves the thenable. Measured, that is milliseconds (senior-qa s3n,
 * G.4: a read held 2 s then failed put the failure sentence up 2010–2125 ms into the load). 4 s covers what the measurement does
 * not: a slow mobile network, a server whose event loop is busy (`AbortSignal.timeout` itself
 * fires late under load), timer drift. The cost is that a coach on a dead connection reads
 * "loading" for 12 s (20 s on /challenges) before the reload sentence: better than forever,
 * and never a "could not be loaded" about a read the server could still have answered.
 *
 * Counted from the island's effect, which is LATER than the server's start of the read (the
 * island's HTML comes out of the render that started it, and the effect runs after hydration),
 * so the client's clock can only make the wait longer, never shorter. A background tab's timer
 * throttling does the same.
 */
export const ROSTER_DELIVERY_MARGIN_MS = 4_000;

/**
 * How long a picker may say it is loading: `rounds` sequential api calls, each bounded by
 * `API_READ_TIMEOUT_MS`, plus the delivery margin. One call for `/templates` and
 * `/nutrition-templates` (`listClients`); `WHOLE_ROSTER_READ_ROUNDS` for `/challenges`
 * (`readWholeRoster`: page 0, then the rest).
 */
export function rosterReadDeadlineMs(rounds = 1): number {
  return rounds * API_READ_TIMEOUT_MS + ROSTER_DELIVERY_MARGIN_MS;
}

export function useRosterRead<T>(
  read: PromiseLike<T[] | null>,
  deadlineMs: number = rosterReadDeadlineMs(1)
): RosterRead<T> {
  const [settledRead, setSettledRead] = useState<{ read: PromiseLike<T[] | null>; value: RosterRead<T> } | null>(null);

  useEffect(() => {
    let live = true;
    const settle = (value: RosterRead<T>) => {
      if (live) setSettledRead({ read, value });
    };
    // QA-S3N-1: no answer by the deadline is a failure. Cleared by an answer, so a read that
    // answered in time is never overwritten; per promise, so a NEW read gets its own full wait.
    const deadline = setTimeout(() => settle(FAILED), deadlineMs);
    const answered = (value: RosterRead<T>) => {
      clearTimeout(deadline);
      // After the deadline too: a late answer is the server's, and it replaces the failure.
      settle(value);
    };
    Promise.resolve(read).then(
      // Anything but an array is a failure: never "no clients" from a value we did not expect.
      (targets) => answered(Array.isArray(targets) ? { state: "ready", targets } : FAILED),
      () => answered(FAILED)
    );
    return () => {
      live = false;
      clearTimeout(deadline);
    };
  }, [read, deadlineMs]);

  return settledRead !== null && settledRead.read === read ? settledRead.value : LOADING;
}
