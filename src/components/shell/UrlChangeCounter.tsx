"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { countUrlChange } from "@/lib/rosterReturn";

/**
 * BUG-691 — counts every committed path-or-query change of this tab, whatever caused it (a
 * link, a `router.push`, a `history.replaceState`, Back or Forward). « Retour aux clients »
 * compares the count with the roster's note to know whether the previous history entry is
 * the roster (`cameStraightFromRoster` in `src/lib/rosterReturn.ts`).
 *
 * Mounted once, in the root layout, because a count kept by any narrower layout would miss
 * the changes made while it is not mounted (roster → client → templates → Back would read as
 * "straight from the roster"). The first render counts nothing: a reload is not a change,
 * and React's StrictMode second effect sees the same URL and counts nothing either.
 */
export function UrlChangeCounter() {
  const pathname = usePathname();
  const search = useSearchParams()?.toString() ?? "";
  const last = useRef<string | null>(null);
  useEffect(() => {
    const key = `${pathname}?${search}`;
    if (last.current !== null && last.current !== key) countUrlChange();
    last.current = key;
  }, [pathname, search]);
  return null;
}
