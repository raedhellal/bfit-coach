import { expect, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { bundle, loadUnitPage } from "./unit-harness";

/**
 * BUG-745, ADR-0033 D33.14 — the unit tests U1, U2, U3, U7, U8, U9 and U10 (ruling R9), the N5
 * seed case (staff S1) and the cleared-work re-decision (staff S2), in a real browser with the
 * React the portal ships (`qa/unit-harness.ts`). U4–U6 are about what the server writes and live
 * in `qa/session-epoch-cookie.spec.ts`; the witnesses W* are `qa/session-epoch.spec.ts`.
 *
 * Every test loads a fresh page: the guard reads the epoch the document was rendered under ONCE,
 * at its FIRST COMMIT, from `<html data-session-epoch>` (ruling R1: Next's error shell has no
 * attributes until React's commit applies them). Each page starts with `data-session-epoch="E1"`
 * and the cookie `evoli_pro_epoch=E1` (the development name: the harness runs React's
 * development build, where `IS_PROD` is false). A boundary in another tab is the cookie
 * becoming `E2`.
 *
 * The seams are stubs, nothing else: `@/lib/clientSession` records the `location.replace` a
 * real leave would make (it would unload the test page; U10 runs the REAL `clientSession.ts` and
 * stubs only `./documentLoad`, its one `location.replace`), `next/navigation` reads the URL from a
 * context the test drives inside `startTransition` (as the App Router does), and the copy, the
 * kit Button, the analytics call and the progress bar are inert.
 *
 * Not on the fixture server, but on its config: this file uses the resetting `test` only so
 * `qa/fixture-isolation.spec.ts` needs no exemption for it.
 */

const STUBS: Record<string, string> = {
  "next/navigation": `
    var React = require("react");
    var Ctx = React.createContext({ pathname: "/a", search: "" });
    window.__routerCalls = [];
    var router = {
      push: function (h) { window.__routerCalls.push(["push", h]); },
      replace: function (h) { window.__routerCalls.push(["replace", h]); },
      refresh: function () { window.__routerCalls.push(["refresh"]); },
      back: function () { window.__routerCalls.push(["back"]); },
      prefetch: function () {},
    };
    exports.NavContext = Ctx;
    exports.usePathname = function () { return React.useContext(Ctx).pathname; };
    exports.useSearchParams = function () {
      var s = React.useContext(Ctx).search;
      return React.useMemo(function () { return new URLSearchParams(s); }, [s]);
    };
    exports.useRouter = function () { return router; };
  `,
  "@/lib/clientSession": `
    window.__replaced = []; window.__cleared = 0; window.__crossed = [];
    exports.replaceDocument = function (href) { window.__replaced.push(href); };
    exports.clearClientSession = function () { window.__cleared++; };
    exports.crossSessionBoundary = function (path) { window.__crossed.push(path); };
    exports.sessionReloadTarget = function () { return window.location.href; };
  `,
  "@/lib/i18n/client": `
    exports.useCopy = function () {
      return { shell: { sessionEnded: "Your session has ended. Copy your changes, then sign in again.", sessionEndedSignIn: "Sign in again" } };
    };
  `,
  "@/components/ui/kit": `
    var React = require("react");
    exports.Button = function (p) {
      return React.createElement("button", { type: p.type || "button", onClick: p.onClick, "data-session-safe": p.sessionSafe ? "" : undefined }, p.children);
    };
  `,
  "./portalEvents": `exports.logPortalEvent = function () {};`,
  "@/components/shell/NavigationProgress": `exports.startNavigationProgress = function () {};`,
};

/** U10: the REAL clientSession.ts, with only its `location.replace` (./documentLoad) recorded. */
const REAL_SESSION_STUBS: Record<string, string> = Object.fromEntries([
  ...Object.entries(STUBS).filter(([k]) => k !== "@/lib/clientSession"),
  [
    "./documentLoad",
    `window.__replaced = window.__replaced || []; window.__cleared = 0; window.__crossed = [];
     exports.replaceDocument = function (href) { window.__replaced.push(href); };`,
  ],
]);

const ENTRIES = {
  React: "react",
  ReactDOM: "react-dom",
  ReactDOMClient: "react-dom/client",
  nav: "next/navigation",
  guard: "@/components/shell/SessionEpochGuard",
  hook: "@/lib/useUnsavedChanges",
  clientSession: "@/lib/clientSession",
};

/**
 * The app under test. `editor`: "none", "stays" (a dirty editor on every URL) or "leaves" (a
 * dirty editor on /a only, so a move to /b unmounts it in the same commit). A parent `Probe`
 * logs, from ITS layout effect, what the guard's layer (c) left behind: a parent's layout effect
 * runs after its children's, inside the same commit and before any passive effect.
 */
const APP = `
window.__spy = { link: 0, save: 0, submit: 0, toggle: 0, nested: 0 };
window.__log = [];
window.__mount = function (editorMode) {
  var U = window.__unit, R = U.React, h = R.createElement, nav = U.nav;
  function Editor() {
    var d = R.useState(true);
    window.__setDirty = d[1];
    U.hook.useUnsavedChanges(d[0]);
    return h("div", { id: "editor" }, "editor");
  }
  function Probe(p) {
    var n = R.useContext(nav.NavContext);
    R.useLayoutEffect(function () {
      var html = document.documentElement;
      window.__log.push({
        pathname: n.pathname,
        leaving: html.getAttribute("data-session-leaving"),
        ended: html.getAttribute("data-session-ended"),
        unsaved: U.hook.hasUnsavedWork(),
        replaced: window.__replaced.length,
      });
    }, [n.pathname, n.search]);
    return p.children;
  }
  function Root() {
    var st = R.useState({ pathname: "/a", search: "" });
    window.__setNav = st[1];
    var ed = R.useState(editorMode);
    window.__setEditor = ed[1];
    var mode = ed[0];
    var editorHere = mode === "stays" || (mode === "leaves" && st[0].pathname === "/a");
    var spy = window.__spy;
    return h(nav.NavContext.Provider, { value: st[0] }, h(Probe, null,
      h(U.guard.SessionEpochGuard),
      editorHere ? h(Editor) : null,
      h("a", { id: "link", href: "#next", onClick: function () { spy.link++; } }, "Next"),
      h("button", { id: "save", type: "button", onClick: function () { spy.save++; } }, "Save"),
      h("form", { id: "form", onSubmit: function (e) { e.preventDefault(); spy.submit++; } },
        h("input", { id: "field", name: "field" }),
        h("button", { id: "submit", type: "submit" }, "Send")),
      h("button", { id: "toggle", type: "button", "data-session-safe": "", onClick: function () { spy.toggle++; } },
        h("span", { id: "toggle-inner" }, "Day 1")),
      h("div", { id: "safe-box", "data-session-safe": "" },
        h("button", { id: "nested-save", type: "button", onClick: function () { spy.nested++; } }, "Save"))
    ));
  }
  var root = U.ReactDOMClient.createRoot(document.getElementById("root"));
  U.ReactDOM.flushSync(function () { root.render(h(Root)); });
};
/** A navigation as the App Router makes one: a transition. Resolves after the commit. */
window.__navigate = function (pathname) {
  var R = window.__unit.React;
  R.startTransition(function () { window.__setNav({ pathname: pathname, search: "" }); });
  return new Promise(function (r) { setTimeout(r, 50); });
};
`;

type Mode = "none" | "stays" | "leaves";

async function open(
  page: Page,
  mode: Mode,
  epochAtRender: string | null = "E1",
  opts: { cookieAtLoad?: string; realSession?: boolean } = {}
): Promise<void> {
  const cookie = opts.cookieAtLoad ?? epochAtRender;
  await loadUnitPage(page, bundle(ENTRIES, opts.realSession ? REAL_SESSION_STUBS : STUBS) + "\n" + APP, {
    htmlAttrs: { "data-session-epoch": epochAtRender ?? "" },
    cookies: cookie ? { evoli_pro_epoch: cookie } : {},
  });
  await page.evaluate((m) => (window as unknown as { __mount: (m: string) => void }).__mount(m), mode);
  // Let the mount's passive effects (the editor's sentinel push) settle.
  await page.evaluate(() => new Promise((r) => setTimeout(r, 50)));
}

/** Another tab crossed a boundary: a NEW epoch in the shared jar. */
async function boundary(page: Page, value = "E2"): Promise<void> {
  await page.evaluate((v) => (document.cookie = `evoli_pro_epoch=${v}; path=/`), value);
}

const state = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as {
      __spy: Record<string, number>;
      __replaced: string[];
      __crossed: string[];
      __cleared: number;
      __log: { pathname: string; leaving: string | null; ended: string | null; unsaved: boolean; replaced: number }[];
    };
    const html = document.documentElement;
    return {
      spy: { ...w.__spy },
      replaced: [...(w.__replaced ?? [])],
      crossed: [...(w.__crossed ?? [])],
      cleared: w.__cleared,
      log: w.__log.map((e) => ({ ...e })),
      leaving: html.getAttribute("data-session-leaving"),
      ended: html.getAttribute("data-session-ended"),
      banner: document.querySelector("[data-session-ended-banner]")?.textContent ?? null,
    };
  });

/** `el.click()` in the page; returns whether the event's default was prevented. */
const click = (page: Page, selector: string) =>
  page.evaluate((s) => {
    const el = document.querySelector(s) as HTMLElement;
    const ev = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    return !el.dispatchEvent(ev);
  }, selector);

test.describe("BUG-745 D33.14 — the session-epoch guard, unit", () => {
  test("control: with no boundary every click reaches its handler and nothing leaves", async ({ page }) => {
    await open(page, "none");
    expect(await click(page, "#link")).toBe(false);
    expect(await click(page, "#save")).toBe(false);
    await page.evaluate(() => window.dispatchEvent(new PopStateEvent("popstate")));
    await page.evaluate(() => (window as unknown as { __navigate: (p: string) => Promise<void> }).__navigate("/b"));
    const s = await state(page);
    expect(s.spy.link).toBe(1);
    expect(s.spy.save).toBe(1);
    expect(s.replaced).toEqual([]);
    expect(s.leaving).toBeNull();
  });

  test("U1: (a), stale and no unsaved work, cancels the click; Link's onClick never runs", async ({ page }) => {
    await open(page, "none");
    await boundary(page);
    const prevented = await click(page, "#link");
    const s = await state(page);
    expect(prevented, "the click's default (the anchor's navigation) is cancelled").toBe(true);
    expect(s.spy.link, "React's onClick (where Link navigates) never ran").toBe(0);
    expect(s.leaving).toBe("a");
    expect(s.cleared).toBeGreaterThanOrEqual(1);
    expect(s.replaced).toEqual(["https://unit.evoli.test/a"]);
  });

  test("U2: (c) sets data-session-leaving inside the commit's layout phase on a URL change", async ({ page }) => {
    await open(page, "none");
    await boundary(page);
    await page.evaluate(() => (window as unknown as { __navigate: (p: string) => Promise<void> }).__navigate("/b"));
    const s = await state(page);
    const atB = s.log.find((e) => e.pathname === "/b");
    expect(atB, "the commit to /b ran the probe's layout effect").toBeTruthy();
    // The probe is the guard's PARENT: its layout effect runs after the guard's in the same
    // commit, before passive effects and before paint. A passive (c) would read null here.
    expect(atB!.leaving, "set by (c) before the commit's layout phase ended").toBe("c");
    expect(atB!.replaced).toBe(1);
  });

  test("U2: with a registered editor that survives the commit, (c) calls ended(), not leave()", async ({ page }) => {
    await open(page, "stays");
    await boundary(page);
    await page.evaluate(() => (window as unknown as { __navigate: (p: string) => Promise<void> }).__navigate("/b"));
    const s = await state(page);
    const atB = s.log.find((e) => e.pathname === "/b")!;
    expect(atB.unsaved).toBe(true);
    expect(atB.ended).toBe("c");
    expect(atB.leaving).toBeNull();
    expect(s.replaced, "the editor stays: no reload").toEqual([]);
    await expect(page.locator("[data-session-ended-banner]")).toHaveText(/Your session has ended\. Copy your changes, then sign in again\./);
  });

  test("U3: (b) sets data-session-leaving inside the popstate task", async ({ page }) => {
    await open(page, "none");
    await boundary(page);
    const inTask = await page.evaluate(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
      // Read synchronously, in the same task as the dispatch.
      return document.documentElement.getAttribute("data-session-leaving");
    });
    expect(inTask).toBe("b");
    const s = await state(page);
    expect(s.replaced).toEqual(["https://unit.evoli.test/a"]);
    // A popstate while leaving re-issues the reload (a queued traversal cannot strand the tab).
    await page.evaluate(() => window.dispatchEvent(new PopStateEvent("popstate")));
    expect((await state(page)).replaced).toHaveLength(2);
  });

  test("U7: an expired epoch (null) under a live session is not stale: nothing leaves", async ({ page }) => {
    await open(page, "none");
    await page.evaluate(() => (document.cookie = "evoli_pro_epoch=; path=/; max-age=0"));
    expect(await page.evaluate(() => document.cookie)).not.toContain("evoli_pro_epoch");
    expect(await click(page, "#link")).toBe(false);
    await page.evaluate(() => window.dispatchEvent(new PopStateEvent("popstate")));
    await page.evaluate(() => (window as unknown as { __navigate: (p: string) => Promise<void> }).__navigate("/b"));
    const s = await state(page);
    expect(s.spy.link).toBe(1);
    expect(s.leaving).toBeNull();
    expect(s.ended).toBeNull();
    expect(s.replaced).toEqual([]);
  });

  test("U7: a document rendered with no epoch (pre-deploy) still sees the first boundary", async ({ page }) => {
    await open(page, "none", null);
    expect(await click(page, "#link"), "no epoch anywhere: not stale").toBe(false);
    await boundary(page, "E9");
    expect(await click(page, "#link")).toBe(true);
    expect((await state(page)).leaving).toBe("a");
  });

  test("the error shell: an <html> with no epoch at script time, filled in by React's commit, is NOT stale", async ({ page }) => {
    // Next's error shell (a 500 before the first byte) is `<html id="__next_error__">` with no
    // attributes; the client render then applies the root layout's, epoch included. Here the
    // attribute is absent when the bundle evaluates and set before the guard's first commit.
    await loadUnitPage(page, bundle(ENTRIES, STUBS) + "\n" + APP, { htmlAttrs: { id: "__next_error__" }, cookies: { evoli_pro_epoch: "E1" } });
    await page.evaluate(() => document.documentElement.setAttribute("data-session-epoch", "E1"));
    await page.evaluate(() => (window as unknown as { __mount: (m: string) => void }).__mount("none"));
    await page.evaluate(() => new Promise((r) => setTimeout(r, 50)));
    expect(await click(page, "#link"), "the same session: the click goes through").toBe(false);
    const s = await state(page);
    expect(s.leaving, "no reload of an error page into itself").toBeNull();
    expect(s.replaced).toEqual([]);
    // And a real boundary afterwards is still seen.
    await boundary(page);
    expect(await click(page, "#link")).toBe(true);
    expect((await state(page)).leaving).toBe("a");
  });

  test("N5 (staff S1): a page rendered under E1 that loads with cookie E2 leaves at mount, layer c, with no event", async ({ page }) => {
    // The boundary was crossed after the server rendered this document and before its script ran.
    await open(page, "none", "E1", { cookieAtLoad: "E2" });
    const s = await state(page);
    expect(s.leaving, "caught at the first commit by (c)").toBe("c");
    expect(s.replaced).toEqual(["https://unit.evoli.test/a"]);
  });

  test("S2: a banner kept for unsaved work is not left over a clean editor: the work clearing re-decides, layer c", async ({ page }) => {
    await open(page, "stays");
    await boundary(page);
    // (b) decides while the editor is still dirty: the exception, not a reload.
    await page.evaluate(() => window.dispatchEvent(new PopStateEvent("popstate")));
    let s = await state(page);
    expect(s.ended).toBe("b");
    expect(s.leaving).toBeNull();
    // The save's clean commit, with no URL change after it (WebKit's order in staff's P3).
    await page.evaluate(async () => {
      const w = window as unknown as { __setDirty: (d: boolean) => void; __unit: { React: { startTransition: (f: () => void) => void } } };
      w.__unit.React.startTransition(() => w.__setDirty(false));
      await new Promise((r) => setTimeout(r, 50));
    });
    s = await state(page);
    expect(s.leaving, "nothing is unsaved any more: leave").toBe("c");
    expect(s.replaced).toEqual(["https://unit.evoli.test/a"]);
  });

  for (const trigger of ["focus", "click", "popstate"] as const) {
    test(`U10 (R9): after this tab's own crossSessionBoundary(p) and an epoch change, a ${trigger} reloads p, not location.href`, async ({ page }) => {
      await open(page, "none", "E1", { realSession: true });
      const target = "/login?error=expired";
      await page.evaluate((p) => (window as unknown as { __unit: { clientSession: { crossSessionBoundary: (p: string) => void } } }).__unit.clientSession.crossSessionBoundary(p), target);
      expect((await state(page)).replaced).toEqual([target]);
      await boundary(page);
      if (trigger === "focus") await page.evaluate(() => window.dispatchEvent(new FocusEvent("focus")));
      if (trigger === "click") expect(await click(page, "#link")).toBe(true);
      if (trigger === "popstate") {
        await page.evaluate(() => window.dispatchEvent(new PopStateEvent("popstate")));
        // And the re-issue of a popstate while leaving goes there too.
        await page.evaluate(() => window.dispatchEvent(new PopStateEvent("popstate")));
      }
      const s = await state(page);
      expect(s.leaving).not.toBeNull();
      expect(s.replaced.slice(1).length).toBeGreaterThan(0);
      expect(s.replaced, "every reload goes to the boundary's own target").toEqual(Array(s.replaced.length).fill(target));
    });
  }

  test("U10 control: with no boundary crossed in this tab, the reload goes to location.href", async ({ page }) => {
    await open(page, "none", "E1", { realSession: true });
    await boundary(page);
    expect(await click(page, "#link")).toBe(true);
    expect((await state(page)).replaced).toEqual(["https://unit.evoli.test/a"]);
  });

  test("U8: in the exception, (a) cancels a type=button Save, every submit, and a Save nested in a marked container", async ({ page }) => {
    await open(page, "stays");
    await boundary(page);

    expect(await click(page, "#save"), "Save (type=button, no form) is cancelled").toBe(true);
    const submitted = await page.evaluate(() => {
      const form = document.querySelector("#form") as HTMLFormElement;
      const ev = new SubmitEvent("submit", { bubbles: true, cancelable: true });
      return !form.dispatchEvent(ev);
    });
    expect(submitted, "every submit is cancelled").toBe(true);
    expect(await click(page, "#submit"), "the submit button's click is cancelled too").toBe(true);
    expect(await click(page, "#nested-save"), "a Save nested inside a [data-session-safe] CONTAINER is its own control").toBe(true);
    expect(await click(page, "#link"), "a link is cancelled").toBe(true);

    let s = await state(page);
    expect(s.spy.save).toBe(0);
    expect(s.spy.submit).toBe(0);
    expect(s.spy.nested).toBe(0);
    expect(s.spy.link).toBe(0);
    expect(s.ended).toBe("a");
    expect(s.leaving).toBeNull();
    expect(s.replaced).toEqual([]);

    // Let through: a span inside a marked control, and the banner's own subtree.
    expect(await click(page, "#toggle-inner"), "a span inside a [data-session-safe] button passes").toBe(false);
    await expect(page.locator("[data-session-ended-banner] button")).toBeVisible();
    expect(await click(page, "[data-session-ended-banner] button"), "the banner's button passes").toBe(false);
    expect(await click(page, "[data-session-ended-banner] p"), "anything in the banner passes").toBe(false);
    s = await state(page);
    expect(s.spy.toggle).toBe(1);
    expect(s.crossed, "the banner signs in again at this URL").toEqual(["/a"]);
  });

  test("U9: a commit that unmounts a dirty editor leaves hasUnsavedWork() false in a sibling's layout effect", async ({ page }) => {
    await open(page, "leaves");
    expect(await page.evaluate(() => (window as unknown as { __unit: { hook: { hasUnsavedWork: () => boolean } } }).__unit.hook.hasUnsavedWork())).toBe(true);
    await boundary(page);
    await page.evaluate(() => (window as unknown as { __navigate: (p: string) => Promise<void> }).__navigate("/b"));
    const s = await state(page);
    const atB = s.log.find((e) => e.pathname === "/b")!;
    expect(atB.unsaved, "the leaving editor is deregistered in the mutation phase (3a)").toBe(false);
    expect(atB.leaving, "so (c) leaves rather than keeping a page the editor already left").toBe("c");
    expect(atB.ended).toBeNull();
  });

  test("U9: with isSessionLeaving() true, unmounting a dirty editor calls no history.back()", async ({ page }) => {
    await open(page, "stays");
    const backs = await page.evaluate(async () => {
      const w = window as unknown as { __setEditor: (m: string) => void; __unit: { React: { startTransition: (f: () => void) => void } } };
      let calls = 0;
      history.back = () => {
        calls += 1;
      };
      document.documentElement.setAttribute("data-session-leaving", "c");
      w.__unit.React.startTransition(() => w.__setEditor("none"));
      await new Promise((r) => setTimeout(r, 100));
      return calls;
    });
    expect(backs, "3b: the sentinel goes with the document; no back() behind the replace").toBe(0);
  });

  test("U9 control: without the leaving mark, the same unmount does take the sentinel back", async ({ page }) => {
    await open(page, "stays");
    const backs = await page.evaluate(async () => {
      const w = window as unknown as { __setEditor: (m: string) => void; __unit: { React: { startTransition: (f: () => void) => void } } };
      let calls = 0;
      history.back = () => {
        calls += 1;
      };
      w.__unit.React.startTransition(() => w.__setEditor("none"));
      await new Promise((r) => setTimeout(r, 100));
      return calls;
    });
    expect(backs).toBe(1);
  });
});
