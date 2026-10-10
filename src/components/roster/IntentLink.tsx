"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, type ComponentProps, type MouseEvent } from "react";

/**
 * EV-356d (F4) — the client overview is ready by the click when the coach's pointer rests
 * on a roster row.
 *
 * `<Link prefetch={false}>` turns off all three of Link's own prefetches (viewport, hover,
 * touch). For `/clients/[id]` they were worth nothing: with no `loading.tsx` under `[id]`,
 * Next's AUTO prefetch sends the route tree and renders no component. In their place, one
 * `router.prefetch(href)` once the pointer or the keyboard focus has RESTED on the row for
 * `INTENT_DWELL_MS`. That is a FULL prefetch in 14.2.35 (`app-router.js`, `kind ?? FULL`):
 * the server renders the layout and the page, the router caches the payload, and the click
 * paints from it with no request.
 *
 * What it does not do, on purpose (ADR-0033 D33.8, staff round 1 §1d/§1e):
 *   · no `touchstart`, and a `pointerenter` from a finger or a pen is ignored: a touch that
 *     starts a scroll on a row would otherwise render that client's page (≈ 4 api reads)
 *     per scroll. Mouse and trackpad only;
 *   · roster rows only. Every other link, the client tab bar (the routine editor, the
 *     nutrition week) and the side menu included, is `@/components/ui/Link`, which makes no
 *     prefetch of any kind (ADR-0033 D33.13 invariant N): editor documents are out of cache
 *     speed-ups (D33.3), and an AUTO entry under `staleTimes.static: 30` replayed old pages (P4);
 *   · a pass-through costs nothing: the timer is cancelled when the pointer leaves, when the
 *     focus moves on, and at the click (the navigation does its own fetch, and a prefetch
 *     fired after it would be a second render).
 *
 * The cache window this opens is RULED, not incidental (Raed, 2026-10-10, option A; the
 * ADR-0033 amendment): a prefetched entry is reused for `staleTimes.static` (30 s) from
 * the prefetch, then for `staleTimes.dynamic` (30 s) from the first click, so a client's
 * overview can paint from the browser's cache for up to ~60 s after the trainee ended the
 * link — including the FIRST open after the revoke, if the row was hovered before it. The
 * api still refuses every request after the revoke; nothing here writes or logs anything.
 * `qa/intent-prefetch.spec.ts` D.5 is the witness of the bound.
 *
 * `router.prefetch` is a no-op under `next dev` (`app-router.js`): every test of this runs
 * on `next start` (`playwright.start.config.ts`).
 */
export const INTENT_DWELL_MS = 80;

type IntentLinkProps = Omit<
  ComponentProps<typeof Link>,
  "href" | "prefetch" | "onPointerEnter" | "onPointerLeave" | "onFocus" | "onBlur"
> & { href: string };

export function IntentLink({ href, onClick, ...rest }: IntentLinkProps) {
  const router = useRouter();
  const timer = useRef<number | null>(null);

  const cancel = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const arm = useCallback(() => {
    cancel();
    timer.current = window.setTimeout(() => {
      timer.current = null;
      router.prefetch(href);
    }, INTENT_DWELL_MS);
  }, [cancel, href, router]);

  // A row that unmounts mid-dwell (a sort, a search, a navigation) fires nothing.
  useEffect(() => cancel, [cancel]);

  return (
    <Link
      {...rest}
      href={href}
      prefetch={false}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") arm();
      }}
      onPointerLeave={cancel}
      onFocus={arm}
      onBlur={cancel}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        cancel();
        onClick?.(event);
      }}
    />
  );
}
