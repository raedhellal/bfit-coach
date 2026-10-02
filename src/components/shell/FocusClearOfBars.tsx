"use client";

import { useEffect } from "react";

/**
 * WCAG 2.4.11 (focus not obscured) — QA NB-1, branch 1 (2026-10-02).
 *
 * `html { scroll-padding-* }` (globals.css) keeps keyboard focus clear of the sticky top bar,
 * the bottom tab bar and the sticky legal footer in Chromium. **WebKit ignores scroll-padding
 * when it scrolls a newly focused element into view**, so in Safari a field reached with Tab
 * below 1024 px landed partly under the tab bar (33 of 68 stops on the routine editor at
 * 390 × 700), and a few under the legal footer at 1440.
 *
 * After each KEYBOARD focus (`:focus-visible`) — once the browser has done its own scroll —
 * this measures the sticky bars actually on screen and scrolls the window by exactly the
 * overlap plus a margin. Where the browser already honoured scroll-padding (Chromium) the
 * overlap is zero and nothing moves. A pointer focus is left alone: the coach is looking at
 * what they clicked.
 *
 * Not handled here, on purpose: focus inside a modal (the dialog is a fixed overlay above
 * every bar), and focus on the bars themselves.
 *
 * Mounted once by the shell. Renders nothing.
 */
const BARS = ".shell-topbar, .shell-tabbar, .legal-footer";
const MARGIN = 8;

export function FocusClearOfBars() {
  useEffect(() => {
    let frame = 0;
    function onFocusIn(event: FocusEvent) {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      cancelAnimationFrame(frame);
      // Two frames: WebKit's own scroll-into-view lands after the focus event.
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => clear(target));
      });
    }
    document.addEventListener("focusin", onFocusIn);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, []);
  return null;
}

function clear(el: HTMLElement) {
  if (document.activeElement !== el) return;
  if (!safeMatches(el, ":focus-visible")) return;
  if (el.closest(`${BARS}, [aria-modal="true"], [role="dialog"]`)) return;

  const box = el.getBoundingClientRect();
  if (box.width === 0 && box.height === 0) return;
  const viewport = window.innerHeight;
  let top = 0;
  let bottom = viewport;
  for (const bar of Array.from(document.querySelectorAll<HTMLElement>(BARS))) {
    const style = getComputedStyle(bar);
    if (style.display === "none" || (style.position !== "sticky" && style.position !== "fixed")) continue;
    const r = bar.getBoundingClientRect();
    if (r.height === 0) continue;
    // A bar stuck to the top edge, or one riding the bottom edge.
    if (r.top <= 1 && r.bottom > top) top = Math.max(top, r.bottom);
    else if (r.bottom >= viewport - 1 && r.top < bottom) bottom = Math.min(bottom, r.top);
  }

  let delta = 0;
  if (box.bottom > bottom - MARGIN) delta = box.bottom - (bottom - MARGIN);
  // Never push the top of the element under the top bar to show its bottom: a field taller
  // than the clear band is aligned by its top.
  if (box.top - delta < top + MARGIN) delta = box.top - (top + MARGIN);
  if (Math.abs(delta) >= 1) window.scrollBy({ top: delta, behavior: "instant" as ScrollBehavior });
}

function safeMatches(el: Element, selector: string): boolean {
  try {
    return el.matches(selector);
  } catch {
    return true; // an engine without :focus-visible: treat every focus as keyboard focus
  }
}
