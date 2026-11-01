"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { countOutcome, UNREAD_COUNT_BFF, UNREAD_POLL_MS, type CountOutcome } from "@/lib/notifications";

/**
 * EV-455f — the bell's unread count, ONE reader for the whole shell.
 *
 * The shell draws the bell twice (the sidebar from 1024 px, the top bar below it; CSS hides one),
 * so the count lives here and both bells read it: one poll per tab, never one per bell.
 *
 * THE POLL (story In scope 5, AC-8, the cadence of EV-095b's thread poll):
 *   · one read when the page loads, if the tab is visible (a page loaded hidden reads when shown);
 *   · then one every 60 s while `document.visibilityState === "visible"`, never two at once;
 *   · none while hidden: hiding clears the timer, and a read still out when the tab hides does not
 *     schedule another;
 *   · one at once on becoming visible again, then every 60 s from it;
 *   · none after the shell unmounts (the read in flight is aborted, the timer cleared).
 * `refresh()` (the inbox, after a mark) reads now, or once more after the read in flight.
 *
 * WHAT A FAILURE SHOWS (AC-9). A failed read, a 502 or a body without a non-negative integer, is
 * `failed`: the bell draws NO badge and its name claims no number. It is never 0 and never the
 * last count as if it were current. A 307 / 401 (the session ended) is the existing sign-in
 * redirect: the page reloads, which the middleware sends to /login.
 */

export type UnreadState = { kind: "loading" } | { kind: "known"; count: number } | { kind: "failed" };

type NotificationsContextValue = {
  unread: UnreadState;
  /** Read the count now (after a mark), or once more after the read in flight. */
  refresh: () => void;
  /** The inbox's optimistic step: the count it just changed on the server, before the re-read. */
  settle: (next: (count: number) => number) => void;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

const visible = () => document.visibilityState === "visible";

async function readCount(signal: AbortSignal): Promise<CountOutcome> {
  try {
    const res = await fetch(UNREAD_COUNT_BFF, {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
      redirect: "manual",
      headers: { Accept: "application/json" },
      signal,
    });
    const body: unknown = res.status === 200 ? await res.json().catch(() => null) : null;
    return countOutcome(res.status, res.type, body);
  } catch {
    return { kind: "failed" };
  }
}

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const [unread, setUnread] = useState<UnreadState>({ kind: "loading" });
  const refreshRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inFlight: AbortController | null = null;
    let again = false;

    function schedule(delay: number) {
      clearTimeout(timer);
      timer = undefined;
      if (stopped || !visible()) return;
      timer = setTimeout(tick, delay);
    }

    async function tick() {
      timer = undefined;
      if (stopped) return;
      inFlight = new AbortController();
      const outcome = await readCount(inFlight.signal);
      inFlight = null;
      if (stopped) return;
      if (outcome.kind === "signedOut") {
        stopped = true;
        window.location.reload();
        return;
      }
      setUnread(outcome.kind === "count" ? { kind: "known", count: outcome.count } : { kind: "failed" });
      if (again) {
        again = false;
        return void tick();
      }
      schedule(UNREAD_POLL_MS);
    }

    function onVisibility() {
      if (stopped) return;
      if (!visible()) {
        clearTimeout(timer);
        timer = undefined;
        return;
      }
      // Back in view: one read now, unless one is out (it schedules the next itself).
      if (inFlight === null) {
        clearTimeout(timer);
        void tick();
      }
    }

    refreshRef.current = () => {
      if (stopped) return;
      if (inFlight !== null) {
        again = true;
        return;
      }
      clearTimeout(timer);
      void tick();
    };

    // A 0 ms timer, not a call: React's dev double effect cancels the first before it leaves, so
    // one page load is one read (as `MessageThread`'s first poll).
    schedule(0);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopped = true;
      clearTimeout(timer);
      inFlight?.abort();
      refreshRef.current = () => undefined;
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const refresh = useCallback(() => refreshRef.current(), []);
  const settle = useCallback(
    (next: (count: number) => number) =>
      setUnread((state) => (state.kind === "known" ? { kind: "known", count: Math.max(0, next(state.count)) } : state)),
    []
  );
  const value = useMemo(() => ({ unread, refresh, settle }), [unread, refresh, settle]);
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

/** The shell's count. Outside the provider (a page drawn without the shell) it is `loading`, inert. */
export function useNotifications(): NotificationsContextValue {
  return useContext(NotificationsContext) ?? INERT;
}

const INERT: NotificationsContextValue = {
  unread: { kind: "loading" },
  refresh: () => undefined,
  settle: () => undefined,
};
