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
 * After each KEYBOARD focus — once the browser has done its own scroll — this measures the
 * sticky bars actually on screen and scrolls the window by exactly the overlap plus a
 * margin. Where the browser already honoured scroll-padding (Chromium) the overlap is zero
 * and nothing moves.
 *
 * A POINTER focus is left alone: the coach is looking at what they clicked. "Keyboard" is
 * this island's own record of the last input — a `keydown` vs a `pointerdown`, both caught
 * on the document in the capture phase — and NOT `:focus-visible`, which every engine also
 * matches on a text input focused by a click (staff B2: a click on a field peeking above the
 * tab bar scrolled the page 40 px). A focus with no input before it (autofocus, a script)
 * is treated as a pointer focus.
 *
 * Not handled here, on purpose: focus inside a modal (the dialog is a fixed overlay above
 * every bar), and focus on the bars themselves.
 *
 * Mounted once by the shell. Renders nothing.
 */
/**
 * `.action-bar` (EV-337i's `StickyActionBar`) rides ABOVE another bar — the tab bar or the
 * legal footer — so it is stuck at its own `bottom` offset, not at the viewport's edge.
 */
const BARS = ".shell-topbar, .shell-tabbar, .legal-footer, .action-bar";
const MARGIN = 8;

export function FocusClearOfBars() {
  useEffect(() => {
    let frame = 0;
    let keyboard = false;
    const onKeyDown = (event: KeyboardEvent) => {
      // A modifier alone (Shift before Shift+Tab) is still the keyboard.
      if (!event.metaKey && !event.ctrlKey) keyboard = true;
    };
    const onPointerDown = () => {
      keyboard = false;
    };
    function onFocusIn(event: FocusEvent) {
      const target = event.target;
      if (!keyboard || !(target instanceof HTMLElement)) return;
      cancelAnimationFrame(frame);
      // Two frames: WebKit's own scroll-into-view lands after the focus event.
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => clear(target));
      });
    }
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, []);
  return null;
}

function clear(el: HTMLElement) {
  if (document.activeElement !== el) return;
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
    // A bar stuck to the top edge, or one riding the bottom edge — at its own `bottom`
    // offset (0 for the tab bar and the footer; the bar under it for `.action-bar`). One
    // that has settled in the page's flow, above where it would stick, is content.
    const offset = parseFloat(style.bottom);
    const stuckAt = viewport - (Number.isFinite(offset) ? offset : 0);
    if (r.top <= 1 && r.bottom > top) top = Math.max(top, r.bottom);
    else if (r.bottom >= stuckAt - 1 && r.top < bottom) bottom = Math.min(bottom, r.top);
  }

  let delta = 0;
  if (box.bottom > bottom - MARGIN) delta = box.bottom - (bottom - MARGIN);
  // Never push the top of the element under the top bar to show its bottom: a field taller
  // than the clear band is aligned by its top.
  if (box.top - delta < top + MARGIN) delta = box.top - (top + MARGIN);
  if (Math.abs(delta) >= 1) window.scrollBy({ top: delta, behavior: "instant" as ScrollBehavior });
}
