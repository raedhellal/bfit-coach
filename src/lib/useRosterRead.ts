"use client";

import { useEffect, useState } from "react";

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
 * arrives here is React Flight's thenable, not the server's promise: a stream cut mid-flight
 * rejects it on this side. A rejected promise read with React's `use()` throws to the route's
 * error boundary and takes the library down with it, which is the one thing G.4 forbids. So:
 *
 *   · no `use()` and no Suspense: a rejection becomes `failed`, said inside the dialog;
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

export function useRosterRead<T>(read: PromiseLike<T[] | null>): RosterRead<T> {
  const [settledRead, setSettledRead] = useState<{ read: PromiseLike<T[] | null>; value: RosterRead<T> } | null>(null);

  useEffect(() => {
    let live = true;
    const settle = (value: RosterRead<T>) => {
      if (live) setSettledRead({ read, value });
    };
    Promise.resolve(read).then(
      // Anything but an array is a failure: never "no clients" from a value we did not expect.
      (targets) => settle(Array.isArray(targets) ? { state: "ready", targets } : FAILED),
      () => settle(FAILED)
    );
    return () => {
      live = false;
    };
  }, [read]);

  return settledRead !== null && settledRead.read === read ? settledRead.value : LOADING;
}
