"use client";

import { useEffect, useState } from "react";
import { formatLocalTime } from "@/lib/format";
import { useCopy } from "@/lib/i18n/client";

/**
 * "Updated at 14:42 · Updates every 45 seconds…" on a challenge page, in the COACH's
 * time zone.
 *
 * The server knows when it read the challenge but not where the coach is: a server
 * render can only say UTC ("Mis à jour à 12:42 UTC" to a coach in Paris at 14:42), which
 * is a sum the coach has to do. So the server hands over the instant and the browser
 * formats it. The time is left out of the server render and the first client render on
 * purpose: the two run in different zones, and rendering it on both would be a hydration
 * mismatch. It appears once the island mounts, which is before a coach can read it.
 *
 * `data-loaded-at` carries the instant (ISO, UTC) so the Refresh test can see a re-read.
 */
export function LoadedAt({ iso }: { iso: string }) {
  const copy = useCopy();
  const [time, setTime] = useState<string | null>(null);
  useEffect(() => {
    setTime(formatLocalTime(iso, copy.locale) || null);
  }, [iso, copy.locale]);
  return (
    <span data-loaded-at={iso}>
      {time !== null && <span data-local-time>{copy.challenges.loadedAt(time)} · </span>}
      {copy.challenges.autoRefresh}
    </span>
  );
}
