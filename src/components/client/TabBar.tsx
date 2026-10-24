/** @jsxImportSource react */
// ↑ The default for Next's compiler, stated for Playwright's: its loader compiles JSX in any
// module a spec imports to its component-testing runtime (`playwright/jsx-runtime`), which
// React cannot render. With the pragma, `qa/client-tab-bar.spec.ts` renders this file as Next does.
"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "@/components/ui/Link";
import type { CoachAccessScope } from "@/lib/coachApi";
import { MIN_TOUCH_TARGET } from "@/components/ui/kit";

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
 * overflow the strip, and each tab page draws a fresh one, so two things happen in the
 * browser once it has mounted (the server markup is unchanged):
 *   · the current tab is scrolled into view by setting the strip's own `scrollLeft` —
 *     never `scrollIntoView`, which may also scroll the window — instantly on mount, smoothly
 *     on a later change unless `prefers-reduced-motion`;
 *   · `data-fade` names the side(s) holding hidden tabs ("start" | "end" | "both", absent when
 *     everything fits), kept current on scroll and resize. `globals.css` turns it into a mask
 *     on the strip itself, so nothing is laid over the tabs to catch a click, and drops the
 *     mask while a tab has keyboard focus so its ring is never faded.
 */
export function TabBar({ tabs, active, label }: { tabs: readonly TabDef[]; active: string; label: string }) {
  const ref = useRef<HTMLElement>(null);
  const [fade, setFade] = useState<Fade | undefined>(undefined);
  const mounted = useRef(false);

  // Keep the fade in step with the strip's scroll position and size.
  useEffect(() => {
    const nav = ref.current;
    if (!nav) return;
    const update = () => setFade(fadeOf(nav));
    update();
    nav.addEventListener("scroll", update, { passive: true });
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    ro?.observe(nav);
    // A late web font changes the tabs' widths without resizing the strip.
    document.fonts?.ready.then(update).catch(() => undefined);
    return () => {
      nav.removeEventListener("scroll", update);
      ro?.disconnect();
    };
  }, [tabs]);

  // Bring the current tab into view: before paint on mount, so the strip never shows at 0 first.
  useCommitEffect(() => {
    const nav = ref.current;
    if (!nav) return;
    const first = !mounted.current;
    mounted.current = true;
    const smooth = !first && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    revealCurrent(nav, smooth);
    setFade(fadeOf(nav));
  }, [active]);

  return (
    <nav
      aria-label={label}
      className="client-tabs"
      ref={ref}
      data-fade={fade}
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

type Fade = "start" | "end" | "both";

/** `useLayoutEffect` in the browser; nothing on the server, where it only warns (as in kit.tsx). */
const useCommitEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Which side(s) of the strip hide tabs; undefined when everything fits (no fade at all). */
function fadeOf(nav: HTMLElement): Fade | undefined {
  const max = nav.scrollWidth - nav.clientWidth;
  if (max <= 1) return undefined;
  const start = nav.scrollLeft > 1;
  const end = nav.scrollLeft < max - 1;
  return start && end ? "both" : start ? "start" : end ? "end" : undefined;
}

/**
 * Scroll the strip — and only the strip — so the `aria-current` tab is wholly visible and clear
 * of the fade (`--tab-fade`, globals.css), moving as little as possible ("nearest"). At either
 * end the clamp leaves that side with no hidden tabs, hence no fade over the current one.
 */
function revealCurrent(nav: HTMLElement, smooth: boolean) {
  const tab = nav.querySelector<HTMLElement>('[aria-current="page"]');
  if (!tab) return;
  const max = nav.scrollWidth - nav.clientWidth;
  if (max <= 0) return;
  const pad = parseFloat(getComputedStyle(nav).getPropertyValue("--tab-fade")) || 0;
  const box = nav.getBoundingClientRect();
  const r = tab.getBoundingClientRect();
  const left = r.left - box.left - nav.clientLeft + nav.scrollLeft;
  const right = left + r.width;
  let target = nav.scrollLeft;
  if (left - pad < nav.scrollLeft) target = left - pad;
  else if (right + pad > nav.scrollLeft + nav.clientWidth) target = right + pad - nav.clientWidth;
  target = Math.max(0, Math.min(max, Math.round(target)));
  if (target === nav.scrollLeft) return;
  if (smooth) nav.scrollTo({ left: target, behavior: "smooth" });
  else nav.scrollLeft = target;
}
