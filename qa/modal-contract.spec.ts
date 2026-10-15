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
 *      that takes Escape itself (`preventDefault`) keeps it; a dirty dialog closes like ×;
 *   U5 a caller that moves focus itself when its dialog closes (TrialSessionCard's `refocus`, a
 *      local `returnFocus`) keeps it: the opener is never focused a second time (staff,
 *      EV-337g2 review N6);
 *   U6 an opener removed while the dialog was open: its surviving container's first control,
 *      then `<main>`; a disabled opener: focused as soon as it is enabled;
 *   U7 a dialog opened from a dialog takes Escape and the trap for itself and hands both back.
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

const ENTRIES = { React: "react", ReactDOMClient: "react-dom/client", kit: "@/components/ui/kit" };
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
        showOpener && h("button", { id: "opener", disabled: openerDisabled, onFocus: log("opener"), onClick: function () { setOpen(true); } }, "Open"),
        h("button", { id: "sibling", onFocus: log("sibling") }, "sibling")),
      h("button", { id: "other", onFocus: log("other") }, "other"),
      h(Modal, { open: open, dirty: !!p.dirty, title: "Outer title", onClose: close,
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

  test("U4: a refusing onClose refuses Escape; a control that takes Escape keeps it; a dirty dialog closes", async ({ page }) => {
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
    await expect(dialog, "Escape is × and Cancel, not the backdrop (BUG-699)").toHaveCount(0);
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
