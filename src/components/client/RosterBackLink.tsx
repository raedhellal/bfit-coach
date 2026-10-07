"use client";

import { useEffect, useState } from "react";
import { BackLink } from "@/components/ui/BackLink";
import { cameStraightFromRoster, readRosterReturn, requestScrollRestore } from "@/lib/rosterReturn";

/**
 * BUG-691 — « Retour aux clients » on every client page.
 *
 * When the previous history entry is the roster the coach left (`cameStraightFromRoster`),
 * a click is the browser's Back: the roster comes back from the router cache with its URL,
 * so its filter and its search, and the history does not grow (Back from the roster then
 * leaves the roster, as the bug's Expected requires). Otherwise it is a link to the roster's
 * noted URL (`/?filter=alerts&q=lin`), which restores the same view as a new entry. Either
 * way the roster is asked to scroll back to where the coach was.
 *
 * The server renders `href="/"`: before hydration, or with no note (a client opened from a
 * bookmark), it is the plain roster, as before. The noted URL replaces it after mount, so a
 * middle-click, « open in a new tab » and the unsaved-changes guard's « Leave » (which reads
 * the anchor's href) all carry the filter too.
 */
export function RosterBackLink({ label }: { label: string }) {
  const [href, setHref] = useState("/");
  useEffect(() => {
    const note = readRosterReturn();
    if (note) setHref(note.href);
  }, []);
  return (
    <BackLink
      href={href}
      label={label}
      flush
      onClick={(event) => {
        // A click that opens elsewhere (new tab, new window, download) is the browser's.
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const note = readRosterReturn();
        if (!note) return;
        requestScrollRestore();
        if (cameStraightFromRoster(note)) {
          event.preventDefault();
          window.history.back();
        }
      }}
    />
  );
}
