import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "@playwright/test";

/**
 * ADR-0033 D33.0 step 2 / D33.12, amended by EV-356d — the client router cache's
 * lifetimes are written in `next.config.mjs`, not inherited.
 *
 * `dynamic: 30` is what a revisit buys: the 2a baseline measured a return inside 30 s
 * painting in 2-16 ms against ~310 ms for a first visit. Next 15's default for `dynamic`
 * is 0, so an upgrade would take that away without a line changing here.
 *
 * `static: 30` is EV-356d's ruled value (Raed, 2026-10-10, option A). Next 14.2.35's
 * default is 300, and with the roster rows' intent prefetch (a FULL prefetch of the
 * client's overview) that would let a hovered client's page paint from the browser's
 * cache for up to five minutes, including after the trainee ended the link. At 30 the
 * bound is ~60 s (30 fresh from the prefetch, then 30 reusable from the first use);
 * `qa/intent-prefetch.spec.ts` D.5 witnesses it on a production build.
 *
 * Changing either number is a decision with a measurement and a ruling behind it, not a
 * side effect. A pure check: it imports the config and starts nothing.
 */
const CONFIG = resolve(__dirname, "..", "next.config.mjs");

test("next.config.mjs sets experimental.staleTimes to { dynamic: 30, static: 30 } (EV-356d D.7)", async () => {
  const config = (await import(pathToFileURL(CONFIG).href)).default as { experimental?: { staleTimes?: unknown } };
  expect(config.experimental?.staleTimes).toEqual({ dynamic: 30, static: 30 });
});

/**
 * D.7's second half: the comment above the value told the reader "These ARE Next
 * 14.2.35's defaults". With `static: 30` that is false, and a reader who trusts it would
 * think 300 can come back by deleting the line. Any sentence calling the values the
 * defaults, in either spelling, fails here.
 */
test("the next.config.mjs comment no longer calls the staleTimes Next's defaults (EV-356d D.7)", () => {
  const source = readFileSync(CONFIG, "utf8");
  expect(source).not.toMatch(/\b(these|they)\s+(are|ARE)\s+Next[^.\n]*default/i);
  expect(source).toMatch(/NOT Next's defaults/);
});
