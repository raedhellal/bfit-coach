/** @jsxImportSource react */
// ↑ The default for Next's compiler, stated for Playwright's: its loader compiles JSX in any
// module a spec imports to its component-testing runtime (`playwright/jsx-runtime`), which
// React cannot render. With the pragma, `qa/client-tab-bar.spec.ts` renders this file as Next does.
"use client";
import { useEffect, useLayoutEffect, useRef } from "react";
import Link from "@/components/ui/Link";
import type { CoachAccessScope } from "@/lib/coachApi";
import { MIN_TOUCH_TARGET } from "@/components/ui/kit";
import { syncTabStrip } from "./tabStrip";

/**
 * EV-342e — the client tab bar's markup, apart from `ClientTabs` so that it imports nothing
 * server-only (`getCopy` reads the request): `qa/client-tab-bar.spec.ts` renders it with a
 * four-entry array outside Next (E.2). `ClientTabs` builds the client's entries and passes
 * them here.
 */

/** One tab of a bar: where it goes, what it says, and (for the reader) the scope behind it. */
export interface TabDef {
  key: string;
  href: string;
  label: string;
  scope?: CoachAccessScope;
}

/**
 * The bar itself, from any array of tabs: no copy lookup and no request, so a unit test can
 * render it with four entries (E.2). At 390 px it scrolls sideways inside itself
 * (`overflow-x: auto`, tabs never wrap), never the page (E.3).
 *
 * fix/coach-tabbar-mobile (`qa/client-tab-bar-overflow.spec.ts`). At 390 px the five tabs
 * overflow the strip, and each tab page draws a fresh one. `syncTabStrip` (`./tabStrip.ts`)
 * scrolls the strip so the current tab is in view and writes `data-fade` for the side(s)
 * holding hidden tabs; `globals.css` turns that into a mask on the strip itself (no overlay to
 * catch a click), dropped while a tab has keyboard focus. On a DOCUMENT load it first runs
 * from `ClientTabs`' inline script, during parsing, so the first paint is already right; here
 * it runs for a client navigation, then on scroll, resize and late fonts.
 *
 * `data-fade` is written to the DOM by that one routine and never rendered by React, so the
 * script's attribute and React's tree cannot disagree; `suppressHydrationWarning` covers the
 * attribute the script added before hydration (this element only).
 */
export function TabBar({ tabs, active, label }: { tabs: readonly TabDef[]; active: string; label: string }) {
  const ref = useRef<HTMLElement>(null);
  /** The scrollLeft the strip was last placed at; a different one means the coach scrolled. */
  const placedAt = useRef<number | null>(null);

  // Place the strip before paint. On a document load the inline script already did, so this
  // finds nothing to move; on a client navigation (no script runs) this is what places it.
  useCommitEffect(() => {
    const nav = ref.current;
    if (!nav) return;
    syncTabStrip(nav, true);
    placedAt.current = nav.scrollLeft;
  }, [active]);

  // Keep the fade in step with scrolling. A resize or a late web font changes the geometry: the
  // strip is placed again unless the coach has scrolled it since, else only the fade is updated.
  useEffect(() => {
    const nav = ref.current;
    if (!nav) return;
    const onScroll = () => syncTabStrip(nav, false);
    const replace = () => {
      const untouched = placedAt.current === null || nav.scrollLeft === placedAt.current;
      syncTabStrip(nav, untouched);
      if (untouched) placedAt.current = nav.scrollLeft;
    };
    nav.addEventListener("scroll", onScroll, { passive: true });
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(replace);
    ro?.observe(nav);
    let live = true;
    document.fonts?.ready.then(() => live && replace()).catch(() => undefined);
    return () => {
      live = false;
      nav.removeEventListener("scroll", onScroll);
      ro?.disconnect();
    };
  }, [tabs, active]);

  return (
    <nav
      aria-label={label}
      className="client-tabs"
      ref={ref}
      suppressHydrationWarning
      style={{
        display: "flex",
        gap: 4,
        marginTop: 16,
        borderBottom: "1px solid var(--border)",
        overflowX: "auto",
      }}
    >
      {tabs.map((tab) => {
        const on = tab.key === active;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={on ? "page" : undefined}
            style={{
              // The 44 px floor applies to a link that behaves like a control
              // (BUG-146): these are thumb targets at the 390 px viewport EV-183 demos.
              minHeight: MIN_TOUCH_TARGET,
              display: "inline-flex",
              alignItems: "center",
              padding: "0 14px",
              fontSize: 14,
              fontWeight: 600,
              whiteSpace: "nowrap",
              flex: "none",
              color: on ? "var(--blue-600)" : "var(--ink-3)",
              borderBottom: `2px solid ${on ? "var(--blue-500)" : "transparent"}`,
              marginBottom: -1,
            }}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** `useLayoutEffect` in the browser; nothing on the server, where it only warns (as in kit.tsx). */
const useCommitEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;
