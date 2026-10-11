/** @jsxImportSource react */
// ↑ As in TabBar.tsx: `qa/client-tab-bar.spec.ts` renders TabBar (and so this file) outside
// Next, through Playwright's loader, which would otherwise compile the JSX for its own runtime.
import NextLink from "next/link";
import type { ComponentProps } from "react";

/**
 * EV-356d — invariant N of ADR-0033 D33.13: the portal sends NO automatic (AUTO) prefetch.
 * Every link in `src` is this one; `next/link` is banned elsewhere by ESLint
 * (`no-restricted-imports`, `.eslintrc.json`), except in `roster/IntentLink.tsx`, which sets
 * its own `prefetch={false}` and makes the one ruled FULL prefetch.
 *
 * Why. No route in this portal has a `loading.tsx`, so Next's AUTO prefetch (on sight, on
 * every mouse entry, on every touch start) carries the route TREE only and buys no latency: a
 * click after it costs one round trip, as a click with no entry does. What it did buy, under
 * `staleTimes { dynamic: 30, static: 30 }` (D33.13 point 2), was a replay: past 30 s the entry
 * expires, the next hover makes a fresh tree-only entry, and the click repaints whatever page
 * the router's tree cache still holds, however old, with no request — witnessed at +35 s and
 * +70 s after a revoke on a client tab (P4, Chromium and WebKit). With no AUTO entry every
 * entry the router applies carries data, and a revisit is bounded by `dynamic` (30 s).
 *
 * The `prefetch` prop is not accepted. `qa/no-auto-prefetch.spec.ts` asserts at runtime that no
 * request carries `Next-Router-Prefetch: 1`.
 */
// No `ref` either: this is a plain function component, and a ref passed to it would be
// dropped without a word. A caller that needs one is a reason to add `forwardRef` here.
export type LinkProps = Omit<ComponentProps<typeof NextLink>, "prefetch" | "ref">;

export default function Link(props: LinkProps) {
  return <NextLink {...props} prefetch={false} />;
}
