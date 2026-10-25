"use client";

import { useSyncExternalStore } from "react";
import { formatLocalDateTime } from "@/lib/format";
import { useCopy } from "@/lib/i18n/client";

/**
 * BUG-934 — a message's time in the thread, in the COACH's zone (« 24 oct. 2026, 16:50 » for
 * 14:50 UTC in Paris), with no zone label. Raed, 2026-10-25: « yes switch messages to local time ».
 *
 * The server does not know the coach's zone (it runs in UTC on Vercel), so only the browser can
 * format this. `useSyncExternalStore` with a server snapshot of `false` gives the two renders
 * React needs:
 *   · the server render AND the hydrating render print no text, only `<time dateTime>`, so they
 *     are identical (no hydration mismatch) and no UTC time is ever painted for the browser to
 *     replace (the pattern `LoadedAt` uses for the challenge page's clock);
 *   · React re-renders right after hydration with `true`, and the local text appears before a
 *     coach can read it. A message mounted later (a poll, a send, a client-side navigation) is
 *     not hydrating, reads `true` at once, and is never blank.
 * An empty fallback rather than the date alone: a UTC date is the wrong day near midnight in
 * every zone that is not UTC, so it would be a wrong value painted for a frame.
 * Before hydration the `<time>` is empty, and so it stays for a reader without JavaScript (a
 * screen reader in that window hears no time). That is accepted because the portal requires
 * JavaScript anyway: the thread polls and sends from the browser.
 *
 * `dateTime` always carries the api's instant, for assistive tech and for tests.
 */
const noSubscribe = () => () => {};
const inBrowser = () => true;
const onServer = () => false;

export function MessageTime({ iso }: { iso: string }) {
  const copy = useCopy();
  const local = useSyncExternalStore(noSubscribe, inBrowser, onServer);
  return (
    <time className="msg-time" dateTime={iso}>
      {local ? formatLocalDateTime(iso, copy.locale) : null}
    </time>
  );
}
