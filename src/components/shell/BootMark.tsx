"use client";

import { useEffect } from "react";

/**
 * EV-356d D.6 (ADR-0033 D33.13 point 8, R1-H) — has this document committed its first render?
 *
 * `src/app/error.tsx` reads this to tell two arrivals at the client load error apart:
 *   · during the document's first render (a document load of a 500, BUG-629): `false`. The
 *     notice is the server's fresh answer, so it is shown as it is;
 *   · in any later commit (a client-side navigation, Back/Forward): `true`. The error may be a
 *     replay from the router cache (a FULL prefetch, or a TEMPORARY entry, holds a page error
 *     as a 200 flight), so the boundary reloads the document once instead of showing it.
 *
 * MODULE memory, on purpose. A reload is a new document and starts at `false`, so a reload
 * whose answer is still an error shows the notice and stops: no loop, with no guard, clock or
 * counter. ⛔ Never move this flag to sessionStorage (or anything else that survives a
 * reload): that is the one way to build an endless reload.
 *
 * Mounted by `src/app/layout.tsx` OUTSIDE its `<Suspense>`: a dehydrated Suspense boundary
 * hydrates in a later commit, so a click made before it would still read `false`.
 */
let booted = false;

export const isBooted = (): boolean => booted;

export function BootMark() {
  useEffect(() => {
    booted = true;
  }, []);
  return null;
}
