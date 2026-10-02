"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useCopy } from "@/lib/i18n/client";

/**
 * A thin bar at the top of the window while a page change is slow.
 *
 * Why it exists (perf/coach-fast-routes-no-skeleton): the client tabs and the challenge
 * page lost their `loading.tsx`. A committed `loading.tsx` fallback holds the page for
 * React's ~300 ms reveal throttle, so every first visit took ~310 ms even when the server
 * answered in 70 ms. Without a fallback, React keeps the OLD page on screen until the new
 * one is ready. That is what makes fast routes fast, but on a slow response nothing would
 * move. Next 14 has no "link pending" hook (`useLinkStatus` is Next 15), so this watches
 * the clicks itself:
 *
 *   · a same-document link click to another path or query STARTS a pending navigation;
 *   · the committed URL changing (`usePathname` / `useSearchParams`) ENDS it;
 *   · the bar becomes visible only if the navigation is still pending after
 *     NAV_PROGRESS_DELAY_MS, so a fast change (or a revisit served from the router cache)
 *     never flashes it;
 *   · a navigation that never commits (an error, a cancelled click) gives up after
 *     GIVE_UP_MS rather than leaving a bar on screen.
 *
 * It does not see a navigation that has no click: `router.push` from code, Back/Forward.
 * Those are either a button with its own pending label or a router-cache restore.
 * Clicks that the unsaved-changes guard intercepts never reach this listener: the guard
 * stops them in the capture phase, and this listens in the bubble phase.
 *
 * Accessibility: `role="progressbar"` with a name and no value (indeterminate), and
 * `aria-busy` on `#app-root` while it shows. It is `position: fixed` and 3 px tall, so
 * it never moves the layout. Under `prefers-reduced-motion` the bar stands still.
 */
export const NAV_PROGRESS_DELAY_MS = 400;
const GIVE_UP_MS = 20_000;

/**
 * Set through `dangerouslySetInnerHTML`, never as a text child: React's server render
 * escapes a `<style>` text child (`>` became `&gt;`), which broke the rule in the HTML
 * and made the hydration text differ — the dev overlay then painted over every page.
 */
const CSS = `
.nav-progress{position:fixed;top:0;left:0;right:0;height:3px;z-index:1000;pointer-events:none;overflow:hidden;background:rgba(79,124,255,.18)}
.nav-progress-fill{position:absolute;top:0;bottom:0;left:0;width:40%;background:var(--grad-energy,#4F7CFF);animation:nav-progress-slide 1.1s ease-in-out infinite}
@keyframes nav-progress-slide{0%{transform:translateX(-100%)}100%{transform:translateX(250%)}}
@media (prefers-reduced-motion: reduce){.nav-progress-fill{width:100%;animation:none;opacity:.6}}
`;

/** The path and query a click on this anchor would navigate to, or null if it would not. */
function navigationTarget(event: MouseEvent): string | null {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
  if (!anchor || (anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")) return null;
  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return null;
  const target = `${url.pathname}${url.search}`;
  // The same page (or only its #hash) is not a navigation Next waits for.
  return target === `${window.location.pathname}${window.location.search}` ? null : target;
}

export function NavigationProgress() {
  const copy = useCopy();
  const pathname = usePathname();
  const search = useSearchParams()?.toString() ?? "";
  const [visible, setVisible] = useState(false);
  const timers = useRef<number[]>([]);

  const stop = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    setVisible(false);
  }, []);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!navigationTarget(event)) return;
      stop();
      timers.current = [
        window.setTimeout(() => setVisible(true), NAV_PROGRESS_DELAY_MS),
        window.setTimeout(stop, GIVE_UP_MS),
      ];
    };
    document.addEventListener("click", onClick);
    window.addEventListener("popstate", stop);
    return () => {
      document.removeEventListener("click", onClick);
      window.removeEventListener("popstate", stop);
      stop();
    };
  }, [stop]);

  // The new URL committed: the navigation is over, however it ended.
  useEffect(() => stop(), [pathname, search, stop]);

  useEffect(() => {
    const root = document.getElementById("app-root");
    if (!root) return;
    if (visible) root.setAttribute("aria-busy", "true");
    else root.removeAttribute("aria-busy");
  }, [visible]);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      {visible && (
        <div className="nav-progress" role="progressbar" aria-label={copy.navProgress.label} data-nav-progress="visible">
          <span className="nav-progress-fill" />
        </div>
      )}
    </>
  );
}
