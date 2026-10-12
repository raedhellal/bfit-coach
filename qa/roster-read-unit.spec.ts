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
 * QA-S3N-1 — a DOCUMENT load whose connection drops while the roster is pending leaves the
 * thenable pending FOREVER (Next never closes the inline stream), and the picker said it was
 * loading forever. The hook now has a deadline: the server's own bound (`API_READ_TIMEOUT_MS`,
 * 8 s, per sequential api call) plus 4 s for delivery. On page time (`page.clock`), from the
 * effect that subscribed:
 *
 *   R5 a promise that never settles is `loading` up to 1 ms before the deadline and `failed` at
 *      it: 12 s for one call (/templates, /nutrition-templates), 20 s for the whole-roster read
 *      (/challenges, two rounds); the exported deadlines are those, derived from 8 s;
 *   R6 an answer AFTER the deadline still wins: a list replaces `failed` (true data); `null` or a
 *      rejection leaves it `failed`, with no boundary and no unhandled rejection;
 *   R7 an answer BEFORE the deadline is never overwritten by it, `[]` (truly no clients) included;
 *   R8 a NEW promise gets its own full wait: the replaced read's deadline does not fail it.
 *
 * Red on 3c76491 (no deadline), 7 of these 9: R5 x3 (no exports; `loading` at the deadline),
 * R6 x3 (at their `failed` step), R8. R7 is green there by construction (no deadline to
 * overwrite anything): its witness is a mutant whose answer leaves the deadline running (2/2
 * red). Also killed: no delivery margin (R5 x2, R8), a late answer dropped (R6's list), one
 * deadline per mount instead of per promise (R8).
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
window.__effects = 0;
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
    var read = U.roster.useRosterRead(p.read, p.deadline);
    // Declared after the hook, so it runs after the hook's own effect: the deadline has started.
    R.useEffect(function () { window.__effects++; }, [p.read]);
    var text = read.state === "ready" ? "ready:" + read.targets.map(function (t) { return t.id; }).join(",") : read.state;
    return h("output", { id: "state" }, text);
  }
  var root = U.ReactDOMClient.createRoot(document.getElementById("root"));
  window.__show = function (read, deadline) { root.render(h(Boundary, null, h(Probe, { read: read, deadline: deadline }))); };
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

  // ── QA-S3N-1: the deadline, on page time ──────────────────────────────────────────────────

  /** 8 s (`API_READ_TIMEOUT_MS`) per sequential api call + 4 s delivery margin. Literals on purpose. */
  const ONE_CALL_MS = 12_000;
  const WHOLE_ROSTER_MS = 20_000;

  type W = Record<string, unknown> & {
    __show: (p: unknown, deadline?: number) => void;
    __deferred: () => { promise: Promise<unknown>; resolve: (v: unknown) => void; reject: (e: unknown) => void };
    __effects: number;
  };

  /**
   * Fake page time from before the bundle runs: every `setTimeout` the hook starts is the clock's.
   * PAUSED: an installed clock otherwise keeps flowing with real time, and the runner's own waits
   * would then move the deadline. From here on only `runFor` moves it.
   */
  async function loadOnPageTime(page: Page) {
    await page.clock.install({ time: 0 });
    await page.clock.pauseAt(1_000);
    await load(page);
  }

  /** Shows a never-settling (until told) promise as `name`, and waits until its effect has run. */
  async function showPending(page: Page, name: string, deadline?: number) {
    const before = await page.evaluate(() => (window as unknown as W).__effects);
    await page.evaluate(
      ([n, d]) => {
        const w = window as unknown as W;
        w[n as string] = w.__deferred();
        w.__show((w[n as string] as { promise: Promise<unknown> }).promise, d as number | undefined);
      },
      [name, deadline] as const
    );
    await expect.poll(() => page.evaluate(() => (window as unknown as W).__effects)).toBeGreaterThan(before);
    await expect(state(page)).toHaveText("loading");
  }

  /** Advances page time, then lets React commit whatever that fired (its scheduler is not faked). */
  async function advance(page: Page, ms: number) {
    await page.clock.runFor(ms);
    await page.waitForTimeout(100);
  }

  const settle = (page: Page, name: string, how: "resolve" | "reject", value?: unknown) =>
    page.evaluate(
      ([n, h, v]) => {
        const d = (window as unknown as W)[n as string] as { resolve: (v: unknown) => void; reject: (e: unknown) => void };
        if (h === "resolve") d.resolve(v);
        else d.reject(new Error("Connection closed."));
      },
      [name, how, value] as const
    );

  test("R5: the deadlines are the server's bound plus the delivery margin: 8 s + 4 s, and 2 × 8 s + 4 s", async ({ page }) => {
    await loadUnitPage(
      page,
      bundle({ roster: "@/lib/useRosterRead", timeouts: "@/lib/apiTimeouts", all: "@/lib/rosterAll" }, {})
    );
    const read = await page.evaluate(() => {
      const U = (window as unknown as { __unit: Record<string, Record<string, unknown>> }).__unit;
      const deadline = U.roster.rosterReadDeadlineMs as (rounds?: number) => number;
      return {
        api: U.timeouts.API_READ_TIMEOUT_MS,
        margin: U.roster.ROSTER_DELIVERY_MARGIN_MS,
        rounds: U.all.WHOLE_ROSTER_READ_ROUNDS,
        one: deadline(),
        whole: deadline(U.all.WHOLE_ROSTER_READ_ROUNDS as number),
      };
    });
    expect(read).toEqual({ api: 8_000, margin: 4_000, rounds: 2, one: ONE_CALL_MS, whole: WHOLE_ROSTER_MS });
  });

  for (const [label, deadline, expected] of [
    ["the default (one api call)", undefined, ONE_CALL_MS],
    ["the whole-roster read's (two rounds)", WHOLE_ROSTER_MS, WHOLE_ROSTER_MS],
  ] as const) {
    test(`R5: a promise that never settles is \`loading\` until ${label} deadline, ${expected} ms, then \`failed\``, async ({
      page,
    }) => {
      await loadOnPageTime(page);
      await showPending(page, "__d", deadline);
      // The server's own bound: a read it could still answer is never called failed.
      await advance(page, 8_000);
      await expect(state(page)).toHaveText("loading");
      await advance(page, expected - 8_000 - 1);
      await expect(state(page)).toHaveText("loading");
      await advance(page, 1);
      await expect(state(page)).toHaveText("failed");
      await expectNoBoundary(page);
    });
  }

  test("R6: a list that arrives AFTER the deadline replaces `failed` (it is the server's answer)", async ({ page }) => {
    await loadOnPageTime(page);
    await showPending(page, "__d");
    await advance(page, ONE_CALL_MS);
    await expect(state(page)).toHaveText("failed");
    await settle(page, "__d", "resolve", [{ id: "lina" }, { id: "petra" }]);
    await expect(state(page)).toHaveText("ready:lina,petra");
    await expectNoBoundary(page);
  });

  for (const [label, how, value] of [
    ["`null` (the server's own failure)", "resolve", null],
    ["a rejection (a cut stream)", "reject", undefined],
  ] as const) {
    test(`R6: ${label} arriving after the deadline leaves it \`failed\``, async ({ page }) => {
      await loadOnPageTime(page);
      await showPending(page, "__d");
      await advance(page, ONE_CALL_MS);
      await expect(state(page)).toHaveText("failed");
      await settle(page, "__d", how, value);
      await advance(page, 1_000);
      await expect(state(page)).toHaveText("failed");
      await expectNoBoundary(page);
    });
  }

  for (const [label, value, expected] of [
    ["a list", [{ id: "lina" }], "ready:lina"],
    ["[] (truly no clients)", [], "ready:"],
  ] as const) {
    test(`R7: ${label} answered before the deadline is never overwritten by it`, async ({ page }) => {
      await loadOnPageTime(page);
      await showPending(page, "__d");
      await advance(page, 1_000);
      await settle(page, "__d", "resolve", value);
      await expect(state(page)).toHaveText(expected);
      await advance(page, 60_000);
      await expect(state(page)).toHaveText(expected);
      await expectNoBoundary(page);
    });
  }

  test("R8: a new promise gets its own full wait; the replaced read's deadline does not fail it", async ({ page }) => {
    await loadOnPageTime(page);
    await showPending(page, "__first");
    await advance(page, 10_000);
    await expect(state(page)).toHaveText("loading");
    await showPending(page, "__second");
    // 13 s after the first read began: its deadline (12 s) has passed, the second's has not.
    await advance(page, 3_000);
    await expect(state(page)).toHaveText("loading");
    await advance(page, ONE_CALL_MS - 3_000 - 1);
    await expect(state(page)).toHaveText("loading");
    await advance(page, 1);
    await expect(state(page)).toHaveText("failed");
    // The replaced read answering now is not this read's answer.
    await settle(page, "__first", "resolve", [{ id: "stale" }]);
    await advance(page, 100);
    await expect(state(page)).toHaveText("failed");
    await expectNoBoundary(page);
  });
});
