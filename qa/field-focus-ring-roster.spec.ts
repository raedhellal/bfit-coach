import { test } from "./fixture-test";
import {
  closeSweepBrowser,
  pointerFocusRoute,
  settled,
  signIn,
  sweepRoute,
  type PointerSearch,
  type Route,
} from "./focus-ring-sweep";

/**
 * BUG-724 — BUG-663's keyboard focus-ring sweep and the pointer-focus check, on the roster's
 * search (EV-337d). Populated scenario (`playwright.roster.config.ts`): the empty roster that
 * the default config serves draws no search box. The sweep is the one
 * `qa/field-focus-ring.spec.ts` runs, from `qa/focus-ring-sweep.ts`.
 *
 * The roster search, `/templates`' and `/recipes`' share `.roster-search`. Before BUG-724 its
 * `--ring` halo filled the keyboard outline's 2 px offset, so the pixel just inside the ring
 * read #D7E0FA (Chromium) / #D8E0FA (WebKit), 2.82:1 against it.
 */

const ROUTES: Route[] = [
  {
    name: "roster: search",
    open: async (page) => {
      await signIn(page);
      await settled(page, page.getByRole("searchbox", { name: "Search clients", exact: true }));
      return null;
    },
    expectNames: ["Search clients"],
  },
];

const POINTER_SEARCHES: PointerSearch[] = [
  {
    name: "roster: search",
    open: async (page) => {
      await signIn(page);
    },
    label: "Search clients",
  },
];

test.afterAll(closeSweepBrowser);

for (const engine of ["chromium", "webkit"] as const) {
  test.describe(`BUG-663 — keyboard focus ring on every text field (${engine})`, () => {
    for (const route of ROUTES) {
      test(`${route.name}`, async ({ page, baseURL }) => sweepRoute(engine, route, page, baseURL));
    }
  });
  test.describe(`BUG-724 — a click into a search turns its border blue and moves nothing (${engine})`, () => {
    for (const search of POINTER_SEARCHES) {
      test(`${search.name}`, async ({ page, baseURL }) => pointerFocusRoute(engine, search, page, baseURL));
    }
  });
}
