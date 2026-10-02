import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "@playwright/test";

/**
 * ADR-0033 D33.0 step 2 / D33.12 — the client router cache's lifetimes are written in
 * `next.config.mjs`, not inherited.
 *
 * 30 s / 300 s are Next 14.2.35's own defaults. The 2a baseline measured what the
 * dynamic one buys: a revisit inside 30 s painted in 2-16 ms against ~310 ms for a
 * first visit. Next 15's default for `dynamic` is 0, so an upgrade would take that away
 * without a line changing here. This pins the two numbers; changing either is a
 * decision with a measurement behind it, not a side effect.
 *
 * A pure check: it imports the config and starts nothing.
 */
test("next.config.mjs sets experimental.staleTimes to { dynamic: 30, static: 300 }", async () => {
  const url = pathToFileURL(resolve(__dirname, "..", "next.config.mjs")).href;
  const config = (await import(url)).default as { experimental?: { staleTimes?: unknown } };
  expect(config.experimental?.staleTimes).toEqual({ dynamic: 30, static: 300 });
});
