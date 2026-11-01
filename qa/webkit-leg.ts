import { devices, type Project } from "@playwright/test";

/**
 * BUG-1089 — a WebKit leg is tagged `@webkit` and runs in the `webkit` project, never in `chromium`.
 *
 * The coach's WebKit legs launch WebKit themselves (`webkit.launch()` inside the spec), so
 * until BUG-1089 they ran in the configs' one project, `chromium`. On a machine without
 * WebKit they failed there, and the Chromium verdict was lost among them: `npx playwright
 * test --project=chromium` exited 1 however the Chromium tests did. Worse, a file-level
 * WebKit `beforeAll` (`focus-clear-of-bars.spec.ts`) stopped that file's Chromium test from
 * running at all.
 *
 * Now every config that holds such a leg declares the two projects below:
 *
 * - `chromium` runs every test that is NOT tagged `@webkit`. Nothing tagged runs in
 *   `chromium`; specs not yet tagged (README « WebKit legs ») still launch WebKit inside
 *   `chromium` and fail there where it is missing. Its exit code is therefore the Chromium
 *   verdict alone only for runs restricted to the tagged specs.
 * - `webkit` runs ONLY the tests tagged `@webkit`. The leg still launches WebKit itself and
 *   still ASSERTS that it is installed: without it, every leg FAILS with « WebKit is not
 *   installed: npx playwright install webkit ». A missing WebKit is never a pass and never a
 *   skip. The project's own browser stays Desktop Chrome on purpose: the legs were written
 *   against a Chromium `page` fixture (the store reset in `qa/fixture-test.ts` uses it), and
 *   BUG-1089 moves them, it does not rewrite them.
 *
 * A plain `npx playwright test` still runs both projects: it is the full run, and on a
 * machine without WebKit it is red, as it always was. The gate's Chromium command, with
 * the tagged files spelled out, is in README « WebKit legs ».
 *
 * To add a WebKit leg: pass `{ tag: WEBKIT_LEG }` (or `engineTag(engine)`) to the `test` or
 * `test.describe` that holds it. An untagged WebKit leg lands in `chromium` and makes that
 * project fail on a machine without WebKit — the defect this file exists to stop.
 *
 * Note: this `webkit` project is Desktop Chrome whose legs launch WebKit themselves. It is
 * not the real Desktop Safari `webkit` project of playwright.start.config.ts and
 * playwright.session.config.ts.
 */
export const WEBKIT_LEG = "@webkit";

/** `{ tag: "@webkit" }` for the WebKit engine, `{}` for Chromium: for `test.describe(title, engineTag(e), …)`. */
export function engineTag(engine: "chromium" | "webkit"): { tag?: string } {
  return engine === "webkit" ? { tag: WEBKIT_LEG } : {};
}

/**
 * The tag as the projects' filter. Playwright matches `grep` against the project name, file
 * path, titles and tags joined by spaces, so the `@` is what keeps the project named `webkit`,
 * or a title that says "WebKit", from matching it.
 */
const WEBKIT_LEG_GREP = /(^|\s)@webkit(\s|$)/;

/** The two projects of a config that holds WebKit legs. */
export function engineProjects(): Project[] {
  const chrome = { ...devices["Desktop Chrome"] };
  return [
    { name: "chromium", grepInvert: WEBKIT_LEG_GREP, use: chrome },
    { name: "webkit", grep: WEBKIT_LEG_GREP, use: chrome },
  ];
}
