import { expect, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { bundle, loadUnitPage } from "./unit-harness";

/**
 * EV-356g — `useRosterRead`, the hook that reads a roster promise the page did NOT await, in a
 * real browser with the React `next start` ships (`qa/unit-harness.ts`).
 *
 * The brief's invariant: "an unresolved promise passed to a client component must not leak a
 * rejected-promise crash to the error boundary." The page's promise never rejects (it ends in
 * `.catch(() => null)`), but what reaches the island is React Flight's thenable, which a stream
 * cut mid-flight rejects on the client. R1 is that case: a rejection is `failed`, said inside the
 * dialog, and the boundary above it never sees an error. With React's `use()` in its place the
 * boundary catches it (the mutant this file was checked against).
 *
 *   R1 a rejected promise, and a rejecting non-native thenable (Flight's shape) → `failed`, no
 *      error boundary, no unhandled rejection;
 *   R2 `null` → `failed` (BUG-738: never "no clients"); `undefined` or a non-array → `failed`;
 *      `[]` → ready, empty (the true "no clients");
 *   R3 pending → `loading` first (the server HTML's state), then the list;
 *   R4 a NEW promise (a revalidated page) → `loading` again, and the replaced promise settling
 *      late never overwrites the new one's answer.
 *
 * Not on the fixture server, but on its config: this file uses the resetting `test` only so
 * `qa/fixture-isolation.spec.ts` needs no exemption for it.
 */

const ENTRIES = {
  React: "react",
  ReactDOMClient: "react-dom/client",
  roster: "@/lib/useRosterRead",
};

const APP = `
window.__caught = [];
window.__unhandled = 0;
window.addEventListener("unhandledrejection", function () { window.__unhandled++; });
(function () {
  var U = window.__unit, R = U.React, h = R.createElement;
  class Boundary extends R.Component {
    constructor(p) { super(p); this.state = { error: null }; }
    static getDerivedStateFromError(error) { return { error: error }; }
    componentDidCatch(error) { window.__caught.push(String(error && error.message || error)); }
    render() { return this.state.error ? h("p", { id: "boundary" }, "boundary") : this.props.children; }
  }
  function Probe(p) {
    var read = U.roster.useRosterRead(p.read);
    var text = read.state === "ready" ? "ready:" + read.targets.map(function (t) { return t.id; }).join(",") : read.state;
    return h("output", { id: "state" }, text);
  }
  var root = U.ReactDOMClient.createRoot(document.getElementById("root"));
  window.__show = function (read) { root.render(h(Boundary, null, h(Probe, { read: read }))); };
  window.__deferred = function () {
    var d = {};
    d.promise = new Promise(function (res, rej) { d.resolve = res; d.reject = rej; });
    return d;
  };
})();
`;

async function load(page: Page) {
  await loadUnitPage(page, bundle(ENTRIES, {}));
  await page.addScriptTag({ content: APP });
}

const state = (page: Page) => page.locator("#state");

async function expectNoBoundary(page: Page) {
  await expect(page.locator("#boundary")).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __caught: string[] }).__caught)).toEqual([]);
  expect(await page.evaluate(() => (window as unknown as { __unhandled: number }).__unhandled)).toBe(0);
}

test.describe("EV-356g useRosterRead", () => {
  test("R1: a rejected promise is `failed` inside the island; the error boundary never sees it", async ({ page }) => {
    await load(page);
    await page.evaluate(() => {
      const w = window as unknown as { __show: (p: unknown) => void; __d: { promise: Promise<unknown>; reject: (e: unknown) => void }; __deferred: () => unknown };
      w.__d = w.__deferred() as typeof w.__d;
      w.__show(w.__d.promise);
    });
    await expect(state(page)).toHaveText("loading");
    await page.evaluate(() => (window as unknown as { __d: { reject: (e: unknown) => void } }).__d.reject(new Error("stream cut")));
    await expect(state(page)).toHaveText("failed");
    await page.waitForTimeout(100);
    await expectNoBoundary(page);
  });

  test("R1: a rejecting non-native thenable (React Flight's chunk shape) is `failed` too", async ({ page }) => {
    await load(page);
    await page.evaluate(() => {
      const w = window as unknown as { __show: (p: unknown) => void; __fail: () => void };
      const listeners: Array<(e: unknown) => void> = [];
      const thenable = {
        status: "pending",
        then(_ok: (v: unknown) => void, bad?: (e: unknown) => void) {
          if (bad) listeners.push(bad);
        },
      };
      w.__fail = () => listeners.forEach((l) => l(new Error("Connection closed.")));
      w.__show(thenable);
    });
    await expect(state(page)).toHaveText("loading");
    await page.evaluate(() => (window as unknown as { __fail: () => void }).__fail());
    await expect(state(page)).toHaveText("failed");
    await expectNoBoundary(page);
  });

  for (const [label, value, expected] of [
    ["null (the page's caught failure, BUG-738)", null, "failed"],
    ["undefined", undefined, "failed"],
    ["a non-array", { items: [] }, "failed"],
    ["[] (truly no clients)", [], "ready:"],
    ["two clients", [{ id: "a" }, { id: "b" }], "ready:a,b"],
  ] as const) {
    test(`R2: resolving to ${label} reads as ${expected}`, async ({ page }) => {
      await load(page);
      await page.evaluate((v) => (window as unknown as { __show: (p: unknown) => void }).__show(Promise.resolve(v)), value);
      await expect(state(page)).toHaveText(expected);
      await expectNoBoundary(page);
    });
  }

  test("R3: pending is `loading` first, then the list", async ({ page }) => {
    await load(page);
    await page.evaluate(() => {
      const w = window as unknown as { __show: (p: unknown) => void; __d: { promise: Promise<unknown> }; __deferred: () => unknown };
      w.__d = w.__deferred() as typeof w.__d;
      w.__show(w.__d.promise);
    });
    await expect(state(page)).toHaveText("loading");
    await page.waitForTimeout(150);
    await expect(state(page)).toHaveText("loading");
    await page.evaluate(() => (window as unknown as { __d: { resolve: (v: unknown) => void } }).__d.resolve([{ id: "lina" }]));
    await expect(state(page)).toHaveText("ready:lina");
  });

  test("R4: a new promise is `loading` again, and the replaced one settling late never overwrites it", async ({
    page,
  }) => {
    await load(page);
    await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown> & { __show: (p: unknown) => void; __deferred: () => unknown };
      w.__first = Promise.resolve([{ id: "old" }]);
      w.__show(w.__first);
    });
    await expect(state(page)).toHaveText("ready:old");
    await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown> & { __show: (p: unknown) => void; __deferred: () => unknown };
      w.__late = w.__deferred();
      w.__show((w.__late as { promise: Promise<unknown> }).promise);
    });
    await expect(state(page)).toHaveText("loading");
    await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown> & { __show: (p: unknown) => void; __deferred: () => unknown };
      w.__next = w.__deferred();
      w.__show((w.__next as { promise: Promise<unknown> }).promise);
    });
    await expect(state(page)).toHaveText("loading");
    // The replaced read answers first: it must not paint.
    await page.evaluate(() =>
      ((window as unknown as { __late: { resolve: (v: unknown) => void } }).__late).resolve([{ id: "stale" }])
    );
    await page.waitForTimeout(150);
    await expect(state(page)).toHaveText("loading");
    await page.evaluate(() =>
      ((window as unknown as { __next: { resolve: (v: unknown) => void } }).__next).resolve([{ id: "fresh" }])
    );
    await expect(state(page)).toHaveText("ready:fresh");
    await expectNoBoundary(page);
  });
});
