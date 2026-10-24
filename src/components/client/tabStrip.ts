/**
 * fix/coach-tabbar-mobile — the ONE routine that places the client tab strip, run in two places:
 *
 *   · as an inline script right after the server-rendered `<nav>` (`ClientTabs`, through
 *     `TAB_STRIP_SCRIPT`), DURING PARSING, so a document load paints the strip already scrolled
 *     and faded (BUG-933 criterion 2, "at first paint") — hydration comes 2 to 8+ frames later;
 *   · from `TabBar`'s effects, for client navigations (React inserts the script element but a
 *     browser never runs a script inserted that way), for scroll and resize, and after late fonts.
 *
 * It (1) optionally scrolls the strip — only the strip, by its own `scrollLeft`, never
 * `scrollIntoView`, which may move the window — so the `aria-current` tab is wholly visible and
 * at least `--tab-fade` (globals.css) clear of either edge, moving as little as possible; at an
 * end the clamp leaves that side with nothing hidden, hence no fade over the tab; and (2) writes
 * `data-fade` = "start" | "end" | "both" for the side(s) holding hidden tabs, removing it when
 * everything fits. Returns what it wrote.
 *
 * ⚠ SERIALIZED with `Function.prototype.toString` into the inline script, so it must stay
 * SELF-CONTAINED: no imports, no module-level names, no syntax a compiler would lower to a
 * helper (optional chaining, spread, for…of). `qa/client-tab-bar-overflow.spec.ts` (T5) runs the
 * script with every JS chunk blocked, so a reference that only exists in the bundle fails there.
 */
export function syncTabStrip(nav: HTMLElement, reveal: boolean): string | null {
  const max = nav.scrollWidth - nav.clientWidth;
  if (reveal && max > 0) {
    const tab = nav.querySelector('[aria-current="page"]');
    if (tab) {
      const pad = parseFloat(getComputedStyle(nav).getPropertyValue("--tab-fade")) || 0;
      const box = nav.getBoundingClientRect();
      const r = tab.getBoundingClientRect();
      const left = r.left - box.left - nav.clientLeft + nav.scrollLeft;
      const right = left + r.width;
      let target = nav.scrollLeft;
      if (left - pad < target) target = left - pad;
      else if (right + pad > target + nav.clientWidth) target = right + pad - nav.clientWidth;
      target = Math.max(0, Math.min(max, Math.round(target)));
      if (target !== nav.scrollLeft) nav.scrollLeft = target;
    }
  }
  let fade: string | null = null;
  if (max > 1) {
    const start = nav.scrollLeft > 1;
    const end = nav.scrollLeft < max - 1;
    fade = start && end ? "both" : start ? "start" : end ? "end" : null;
  }
  if (fade) {
    if (nav.getAttribute("data-fade") !== fade) nav.setAttribute("data-fade", fade);
  } else if (nav.hasAttribute("data-fade")) {
    nav.removeAttribute("data-fade");
  }
  return fade;
}

/**
 * The inline script `ClientTabs` renders immediately after the strip: it runs `syncTabStrip` on
 * the element just parsed (`document.currentScript.previousElementSibling`, the `<nav>`). A
 * parser-inserted script waits for the pending stylesheets, so `--tab-fade` and the layout are
 * known. The CSP is `frame-ancestors` only (next.config.mjs), so an inline script needs no nonce.
 */
export const TAB_STRIP_SCRIPT = `(${syncTabStrip.toString()})(document.currentScript.previousElementSibling,true);`;
