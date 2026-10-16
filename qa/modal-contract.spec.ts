import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { expect, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { bundle, loadUnitPage } from "./unit-harness";

/**
 * BUG-171 — the kit `Modal`'s keyboard contract (`src/components/ui/modalFocus.ts`), held in two
 * halves. `qa/modal-keyboard.spec.ts` drives the real dialogs on real pages; this file holds
 * what a page cannot reach.
 *
 * Static (reads `src/`, no browser):
 *   C1 every dialog in the portal IS the kit `Modal`: `role="dialog"`, `role="alertdialog"`,
 *      `aria-modal` and `<dialog>` appear in `src/` only in kit.tsx — so the contract, owned
 *      once there, covers every one;
 *   C2 every file that renders `<Modal` takes it from the kit, and the eight call sites BUG-171
 *      was filed against (`ca3c5fc`) are still among them.
 *
 * Unit (the real `Modal`, in a real browser, with the React `next start` ships, under
 * StrictMode as the portal runs — `next.config.mjs` `reactStrictMode: true`):
 *   U1 initial focus: a field's `autoFocus` > `data-autofocus` > the body's first stop > ×;
 *   U2 Tab / Shift+Tab wrap at both ends; focus resting on `<main>` (a click on the dialog's
 *      text) or moved behind the dialog by a script comes back inside;
 *   U3 Escape calls `onClose` once and focus returns to the opener — focused ONCE;
 *   U4 an `onClose` that refuses (a request in flight) refuses Escape too; a control inside
 *      that takes Escape itself (`preventDefault`) keeps it; a DIRTY dialog ignores Escape, as
 *      it ignores a backdrop click — every value kept, × and Cancel still close (senior-po
 *      ruling on BUG-171, after BUG-699/702);
 *   U5 a caller that moves focus itself in an effect of the closing commit (TrialSessionCard's
 *      `refocus`, a `returnFocus` effect) keeps it: the opener is never focused a second time
 *      (staff, EV-337g2 review N6). A negative assertion: it also passes with no restore at all,
 *      so it only means something NEXT TO U3, which proves the restore happens;
 *   U6 an opener removed while the dialog was open: its surviving container's first control,
 *      then `<main>`; a disabled opener: focused as soon as it is enabled;
 *   U6b the disabled opener's wait is bounded: never enabled, the fallback takes focus at
 *      RESTORE_WAIT_MS without scrolling, once — an opener enabled after that moves nothing;
 *   U6c the wait ends with NO focus move on a key press, a pointer press or a wheel turn (staff
 *      r1 S1), and never takes focus out of a dialog opened meanwhile;
 *   U4b the opt-in `escapeIgnoresDirty`: by default a dirty dialog refuses Escape; with the prop
 *      a dirty dialog closes on Escape; with the prop its backdrop STILL refuses a dirty dialog
 *      (BUG-699 unchanged) — the catalogue picker's ruling;
 *   U7 a dialog opened from a dialog takes Escape and the trap for itself and hands both back;
 *   U8 the stand-ins for an opener when nothing is focused at open: a Safari press (pointerdown
 *      + click, which does not focus the button), and an opener disabled by its own request
 *      before the dialog opens (RoutineEditor's « Publish » asks for a preview first).
 */

const ROOT = resolve(__dirname, "..");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.(tsx?|jsx?)$/.test(name) ? [path] : [];
  });
}

const SOURCES = files(join(ROOT, "src")).map((path) => ({ path: relative(ROOT, path), text: readFileSync(path, "utf8") }));
const KIT = "src/components/ui/kit.tsx";

/**
 * Dialog MARKUP — a JSX attribute, a `createElement` prop, a `setAttribute` or a `<dialog>`
 * element — not a selector that looks for one (FocusClearOfBars skips `[role="dialog"]`) or a
 * comment that names one.
 */
const DIALOG_MARKUP = [
  /\srole=\{?["'](alert)?dialog["']/,
  /\saria-modal=/,
  /["']?\b(role|aria-modal)["']?\s*[:,]\s*["'](alert)?(dialog|true)["']/,
  /<dialog[\s>]/,
];

test.describe("BUG-171 static", () => {
  test("C1: the kit Modal is the only dialog in src/", () => {
    const offenders = SOURCES.filter((f) => f.path !== KIT)
      .filter((f) => DIALOG_MARKUP.some((re) => re.test(f.text)))
      .map((f) => f.path);
    expect(offenders, "a dialog not built on the kit Modal does not get its keyboard contract").toEqual([]);
  });

  test("C2: every <Modal comes from the kit, and the eight ca3c5fc call sites are among them", () => {
    const users = SOURCES.filter((f) => f.path !== KIT && /<Modal[\s>]/.test(f.text));
    const strays = users
      .filter((f) => !/import\s*\{[^}]*\bModal\b[^}]*\}\s*from\s*["']@\/components\/ui\/kit["']/.test(f.text))
      .map((f) => f.path);
    expect(strays, "imports Modal from somewhere other than the kit").toEqual([]);
    const sites = users.reduce((n, f) => n + (f.text.match(/<Modal[\s>]/g) ?? []).length, 0);
    expect(sites, "the portal's Modal call sites (30 at bfb4164)").toBeGreaterThanOrEqual(30);
    const paths = users.map((f) => f.path);
    for (const filed of [
      "src/components/client/RevokeMenu.tsx",
      "src/components/nutrition/NutritionTargetsCard.tsx",
      "src/components/nutrition/NutritionWeekCard.tsx",
      "src/components/roster/InviteButton.tsx",
      "src/components/routine/CatalogPicker.tsx",
      "src/components/routine/RoutineEditor.tsx",
    ]) {
      expect(paths, filed).toContain(filed);
    }
  });
});

const ENTRIES = {
  React: "react",
  ReactDOMClient: "react-dom/client",
  kit: "@/components/ui/kit",
  focus: "@/components/ui/modalFocus",
};
const STUBS = {
  "@/lib/i18n/client": `exports.useCopy = function () { return { common: { close: "Close" } }; };`,
};

/**
 * One page, one harness: an opener in a container, two buttons around it, and the Modal. Every
 * focus on a harness button is logged, so "focused once" is countable.
 */
const APP = `
(function () {
  var U = window.__unit, R = U.React, h = R.createElement, Modal = U.kit.Modal;
  window.__log = [];
  window.__closes = 0;
  function log(id) { return function () { window.__log.push(id); }; }
  function Harness(p) {
    var s = R.useState(false), open = s[0], setOpen = s[1];
    var i = R.useState(false), inner = i[0], setInner = i[1];
    var o = R.useState(true), showOpener = o[0], setShowOpener = o[1];
    var c = R.useState(true), showBox = c[0], setShowBox = c[1];
    var d = R.useState(false), openerDisabled = d[0], setOpenerDisabled = d[1];
    var r = R.useState(false), refuse = r[0], setRefuse = r[1];
    var closedOnce = R.useRef(false);
    window.__api = { setOpen: setOpen, setShowOpener: setShowOpener, setShowBox: setShowBox, setOpenerDisabled: setOpenerDisabled, setRefuse: setRefuse };
    R.useEffect(function () {
      if (open) { closedOnce.current = true; return; }
      if (closedOnce.current && p.selfFocus) document.getElementById("other").focus();
    }, [open]);
    function close() { window.__closes++; if (!refuse) setOpen(false); }
    var body;
    if (p.variant === "fields") body = [h("input", { key: 1, id: "f1", "aria-label": "f1" }), h("input", { key: 2, id: "f2", "aria-label": "f2" })];
    else if (p.variant === "marked") body = [h("input", { key: 1, id: "f1", "aria-label": "f1" }), h("input", { key: 2, id: "f2", "aria-label": "f2", "data-autofocus": "" })];
    else if (p.variant === "autoFocus") body = [h("input", { key: 1, id: "f1", "aria-label": "f1" }), h("input", { key: 2, id: "f2", "aria-label": "f2", autoFocus: true })];
    else if (p.variant === "ownsEscape") body = h("input", { id: "f1", "aria-label": "f1", onKeyDown: function (e) { if (e.key === "Escape") e.preventDefault(); } });
    else if (p.variant === "nested") body = [
      h("button", { key: 1, id: "openInner", onFocus: log("openInner"), onClick: function () { setInner(true); } }, "inner"),
      h(Modal, { key: 2, open: inner, dirty: false, title: "Inner", onClose: function () { setInner(false); },
        footer: h("button", { id: "innerCancel", onClick: function () { setInner(false); } }, "Inner cancel") },
        h("input", { id: "g1", "aria-label": "g1" })),
    ];
    else body = h("p", null, "Just text.");
    return h("main", { id: "main", tabIndex: -1 },
      h("button", { id: "before", onFocus: log("before") }, "before"),
      showBox && h("div", { id: "box" },
        showOpener && h("button", { id: "opener", disabled: openerDisabled, onFocus: log("opener"), onClick: function () {
          if (!p.deferred) return setOpen(true);
          // « Publish »: disabled while its request runs, the dialog opens with the answer.
          setOpenerDisabled(true);
          setTimeout(function () { setOpenerDisabled(false); setOpen(true); }, 50);
        } }, "Open"),
        h("button", { id: "sibling", onFocus: log("sibling") }, "sibling")),
      h("button", { id: "other", onFocus: log("other") }, "other"),
      h(Modal, { open: open, dirty: !!p.dirty, escapeIgnoresDirty: !!p.escapeIgnoresDirty, title: "Outer title", onClose: close,
        footer: h("button", { id: "cancel", onFocus: log("cancel"), onClick: function () { setOpen(false); } }, "Cancel") }, body));
  }
  var root = U.ReactDOMClient.createRoot(document.getElementById("root"));
  window.__show = function (props) { root.render(h(R.StrictMode, null, h(Harness, props))); };
})();
`;

async function harness(page: Page, props: Record<string, unknown> = {}) {
  await loadUnitPage(page, bundle(ENTRIES, STUBS) + "\n" + APP);
  await page.evaluate((p) => (window as unknown as { __show: (p: unknown) => void }).__show(p), props);
  await expect(page.locator("#opener")).toBeVisible();
}

/** Open from the keyboard, as a keyboard user does, and return the dialog. */
async function openIt(page: Page) {
  await expect(page.locator("#opener")).toBeEnabled();
  await page.locator("#opener").focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Outer title" });
  await expect(dialog).toBeVisible();
  return dialog;
}

const focusLog = (page: Page) => page.evaluate(() => (window as unknown as { __log: string[] }).__log.slice());
const resetLog = (page: Page) => page.evaluate(() => ((window as unknown as { __log: string[] }).__log.length = 0));
const closes = (page: Page) => page.evaluate(() => (window as unknown as { __closes: number }).__closes);
const api = (page: Page, call: string, value: boolean) =>
  page.evaluate(
    ([c, v]) => (window as unknown as { __api: Record<string, (v: boolean) => void> }).__api[c as string](v as boolean),
    [call, value] as const
  );
/** Two frames: a close is a state update, an effect, then the restore's microtask. */
const settle = (page: Page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

test.describe("BUG-171 unit", () => {
  test("U1: initial focus — autoFocus, then data-autofocus, then the body's first stop, then ×", async ({ page }) => {
    for (const [variant, expected] of [
      ["autoFocus", "#f2"],
      ["marked", "#f2"],
      ["fields", "#f1"],
      ["text", "button[aria-label='Close']"],
    ] as const) {
      await harness(page, { variant });
      const dialog = await openIt(page);
      await expect(dialog.locator(expected), variant).toBeFocused();
      await expect(dialog).toHaveAttribute("aria-modal", "true");
    }
  });

  test("U2: Tab and Shift+Tab wrap; focus on <main> or behind the dialog comes back inside", async ({ page }) => {
    await harness(page, { variant: "fields" });
    const dialog = await openIt(page);
    const close = dialog.getByRole("button", { name: "Close" });
    const cancel = dialog.locator("#cancel");
    await cancel.focus();
    await page.keyboard.press("Tab");
    await expect(close, "Tab from the last stop wraps to the first (×)").toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(cancel, "Shift+Tab from the first stop wraps to the last").toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(dialog.locator("#f2")).toBeFocused();

    // A click on the dialog's text focuses its nearest focusable ancestor (here <main>).
    await page.evaluate(() => document.getElementById("main")!.focus());
    await page.keyboard.press("Tab");
    await expect(close, "Tab from <main> enters the dialog, not the page").toBeFocused();
    await page.evaluate(() => document.getElementById("main")!.focus());
    await page.keyboard.press("Shift+Tab");
    await expect(cancel, "Shift+Tab from <main> enters the dialog at its end").toBeFocused();

    // A script focusing the page behind: brought back.
    await page.evaluate(() => document.getElementById("other")!.focus());
    await expect(dialog.locator("#f1"), "focus behind the dialog is brought back").toBeFocused();
  });

  test("U3: Escape calls onClose once; focus returns to the opener, focused exactly once", async ({ page }) => {
    await harness(page, { variant: "fields" });
    const dialog = await openIt(page);
    await expect(dialog.locator("#f1")).toBeFocused();
    expect(await focusLog(page), "opening (StrictMode mounts twice) never bounces focus to the opener").toEqual(["opener"]);
    await resetLog(page);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    expect(await closes(page)).toBe(1);
    await expect(page.locator("#opener")).toBeFocused();
    await settle(page);
    expect(await focusLog(page)).toEqual(["opener"]);

    // × and Cancel restore too.
    await openIt(page);
    await page.getByRole("button", { name: "Close" }).click();
    await expect(page.locator("#opener")).toBeFocused();
    await openIt(page);
    await page.locator("#cancel").press("Enter");
    await expect(page.locator("#opener")).toBeFocused();
  });

  test("U4: a refusing onClose refuses Escape; a control that takes Escape keeps it; a dirty dialog ignores it", async ({ page }) => {
    await harness(page, { variant: "fields" });
    let dialog = await openIt(page);
    await api(page, "setRefuse", true);
    await page.keyboard.press("Escape");
    await settle(page);
    expect(await closes(page)).toBe(1);
    await expect(dialog, "in flight: Escape asked, the dialog said no").toBeVisible();
    await expect(dialog.locator("#f1"), "and focus did not move").toBeFocused();

    await harness(page, { variant: "ownsEscape" });
    dialog = await openIt(page);
    await page.keyboard.press("Escape");
    await settle(page);
    expect(await closes(page), "a preventDefault-ed Escape is the control's").toBe(0);
    await expect(dialog).toBeVisible();

    await harness(page, { variant: "fields", dirty: true });
    dialog = await openIt(page);
    await dialog.locator("#f1").fill("typed");
    await page.keyboard.press("Escape");
    await settle(page);
    expect(await closes(page), "a dirty dialog does not even ask to close").toBe(0);
    await expect(dialog, "Escape on a changed dialog is a backdrop click (BUG-699/702)").toBeVisible();
    await expect(dialog.locator("#f1"), "what was typed is kept").toHaveValue("typed");
    await expect(dialog.locator("#f1"), "and focus stays in the field").toBeFocused();
    await page.getByRole("button", { name: "Close" }).click();
    await expect(dialog, "× still closes it").toHaveCount(0);
  });

  test("U4b: escapeIgnoresDirty — default refuses, opt-in closes on Escape, backdrop still refuses", async ({ page }) => {
    // (1) The default: dirty, no prop → Escape is refused.
    await harness(page, { variant: "fields", dirty: true });
    let dialog = await openIt(page);
    await page.keyboard.press("Escape");
    await settle(page);
    expect(await closes(page), "default: a dirty dialog refuses Escape").toBe(0);
    await expect(dialog).toBeVisible();

    // (2) The opt-in: dirty AND escapeIgnoresDirty → Escape closes, focus back on the opener.
    await harness(page, { variant: "fields", dirty: true, escapeIgnoresDirty: true });
    dialog = await openIt(page);
    await page.keyboard.press("Escape");
    await expect(dialog, "opted in: Escape closes the dirty dialog").toHaveCount(0);
    expect(await closes(page)).toBe(1);
    await expect(page.locator("#opener")).toBeFocused();

    // (3) The opt-in does not touch the backdrop: dirty → a backdrop click is still ignored.
    dialog = await openIt(page);
    await page.locator("[data-modal-backdrop]").click({ position: { x: 4, y: 4 } });
    await settle(page);
    expect(await closes(page), "the backdrop asked nothing: still governed by dirty").toBe(1);
    await expect(dialog, "BUG-699: the backdrop still refuses a dirty dialog").toBeVisible();
  });

  test("U5: a caller that places focus itself on close keeps it — no second restore", async ({ page }) => {
    await harness(page, { variant: "fields", selfFocus: true });
    const dialog = await openIt(page);
    await resetLog(page);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(page.locator("#other")).toBeFocused();
    await settle(page);
    expect(await focusLog(page), "the opener is never focused on the way").toEqual(["other"]);
  });

  test("U6: a removed opener falls back to its container, then <main>; a disabled one waits", async ({ page }) => {
    await harness(page, { variant: "fields" });
    let dialog = await openIt(page);
    await api(page, "setShowOpener", false);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(page.locator("#sibling"), "the first control of the opener's surviving container").toBeFocused();

    await harness(page, { variant: "fields" });
    dialog = await openIt(page);
    await api(page, "setShowBox", false);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(page.locator("#main"), "nothing of it survives: the main landmark").toBeFocused();

    await harness(page, { variant: "fields" });
    dialog = await openIt(page);
    await api(page, "setOpenerDisabled", true);
    await resetLog(page);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await settle(page);
    expect(await focusLog(page), "nothing is focused while the opener is disabled").toEqual([]);
    await api(page, "setOpenerDisabled", false);
    await expect(page.locator("#opener"), "enabled again: focus goes to it").toBeFocused();
    expect(await focusLog(page)).toEqual(["opener"]);
  });

  test("U6b: never enabled — the fallback takes focus at RESTORE_WAIT_MS, unscrolled, once", async ({ page }) => {
    await page.clock.install();
    await harness(page, { variant: "fields" });
    const wait = await page.evaluate(() => (window as unknown as { __unit: { focus: { RESTORE_WAIT_MS: number } } }).__unit.focus.RESTORE_WAIT_MS);
    const dialog = await openIt(page);
    await api(page, "setOpenerDisabled", true);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await resetLog(page);
    // Spy on the delayed focus: it must not scroll the page.
    await page.evaluate(() => {
      const w = window as unknown as { __scrolling: boolean[] };
      w.__scrolling = [];
      const sibling = document.getElementById("sibling")!;
      const real = sibling.focus.bind(sibling);
      sibling.focus = (o?: FocusOptions) => {
        w.__scrolling.push(!o?.preventScroll);
        real(o);
      };
    });
    await page.clock.runFor(wait - 100);
    expect(await focusLog(page), "nothing moves before the bound").toEqual([]);
    await page.clock.runFor(200);
    await expect(page.locator("#sibling"), "the opener's container's first control").toBeFocused();
    expect(await page.evaluate(() => (window as unknown as { __scrolling: boolean[] }).__scrolling)).toEqual([false]);
    await api(page, "setOpenerDisabled", false);
    await page.clock.runFor(wait);
    expect(await focusLog(page), "enabled after the bound: nothing more moves").toEqual(["sibling"]);
  });

  test("U6c: a key, a press, a wheel or another dialog ends the wait — focus never jumps", async ({ page }) => {
    await page.clock.install();
    await harness(page, { variant: "fields" });
    const wait = await page.evaluate(() => (window as unknown as { __unit: { focus: { RESTORE_WAIT_MS: number } } }).__unit.focus.RESTORE_WAIT_MS);
    const inputs: [string, string, () => Promise<void>][] = [
      ["a key press", "keydown", () => page.keyboard.press("Shift")],
      ["a pointer press on the page", "pointerdown", () => page.mouse.click(5, 300)],
      ["a wheel turn", "wheel", () => page.mouse.wheel(0, 120)],
    ];
    for (const [label, type, act] of inputs) {
      const dialog = await openIt(page);
      await api(page, "setOpenerDisabled", true);
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await resetLog(page);
      // The input is delivered to the page (a wheel turn arrives asynchronously) BEFORE the opener
      // is enabled: otherwise the enabling would win the race and the test would test nothing.
      await page.evaluate((t) => {
        const w = window as unknown as { __seen: boolean };
        w.__seen = false;
        document.addEventListener(t, () => (w.__seen = true), { capture: true, once: true });
      }, type);
      await act();
      await expect.poll(() => page.evaluate(() => (window as unknown as { __seen: boolean }).__seen)).toBe(true);
      await api(page, "setOpenerDisabled", false);
      await page.clock.runFor(wait + 1_000);
      expect(await focusLog(page), `${label}: neither the enabling nor the bound moves focus`).toEqual([]);
    }

    // Another dialog opening: the old wait never takes focus out of it. NOT a witness for the
    // cancel in `engageModal` — this block stays green without it, because focus inside an open
    // dialog is never "lost", and that dialog's own close places focus. No sequence that needs
    // the cancel was found; it is kept so a wait can never outlive the next dialog.
    let dialog = await openIt(page);
    await api(page, "setOpenerDisabled", true);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await page.evaluate(() => (window as unknown as { __api: { setOpen: (v: boolean) => void } }).__api.setOpen(true));
    dialog = page.getByRole("dialog", { name: "Outer title" });
    await expect(dialog.locator("#f1")).toBeFocused();
    await resetLog(page);
    await api(page, "setOpenerDisabled", false);
    await page.clock.runFor(wait + 1_000);
    expect(await focusLog(page), "the first dialog's wait did not reach past the second").toEqual([]);
    await expect(dialog.locator("#f1")).toBeFocused();
  });

  test("U8: nothing focused at open — a Safari press, and an opener its own request disabled", async ({ page }) => {
    await harness(page, { variant: "fields" });
    // Safari: a press dispatches pointerdown and click but does not focus the button.
    await page.evaluate(() => {
      (document.activeElement as HTMLElement | null)?.blur();
      const o = document.getElementById("opener")!;
      o.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      o.click();
    });
    let dialog = page.getByRole("dialog", { name: "Outer title" });
    await expect(dialog).toBeVisible();
    expect(await focusLog(page), "the opener was never focused before the close").not.toContain("opener");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(page.locator("#opener"), "the pressed control stands in for the opener").toBeFocused();

    await harness(page, { variant: "fields", deferred: true });
    await page.locator("#opener").focus();
    await page.keyboard.press("Enter");
    dialog = page.getByRole("dialog", { name: "Outer title" });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(page.locator("#opener"), "the last focused control stands in for the disabled opener").toBeFocused();
  });

  test("U7: a dialog opened from a dialog owns Escape and the trap, then hands them back", async ({ page }) => {
    await harness(page, { variant: "nested" });
    const outer = await openIt(page);
    await outer.locator("#openInner").focus();
    await page.keyboard.press("Enter");
    const inner = page.getByRole("dialog", { name: "Inner" });
    await expect(inner.locator("#g1")).toBeFocused();
    await inner.locator("#innerCancel").focus();
    await page.keyboard.press("Tab");
    await expect(inner.getByRole("button", { name: "Close" }), "the inner dialog's trap").toBeFocused();

    await page.keyboard.press("Escape");
    await expect(inner).toHaveCount(0);
    await expect(outer, "one Escape closes one dialog").toBeVisible();
    await expect(outer.locator("#openInner")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(outer).toHaveCount(0);
    await expect(page.locator("#opener")).toBeFocused();
  });
});
