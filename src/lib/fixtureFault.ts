import "server-only";
import { cookies } from "next/headers";
import { COACH_API_MODE } from "./env";
import { renderErrorSwitch } from "./coachApi.fixture";

/** BUG-689's switch cookie (fixture mode only). */
export const RENDER_ERROR_COOKIE = "evoli_fixture_render_error";

/**
 * BUG-704 — the render-error FAULT SEAM: throws when `evoli_fixture_render_error` says this
 * render must fail (see `renderErrorSwitch`). Fixture mode only; in live mode it returns
 * before reading anything, so production renders are unchanged.
 *
 * Called from exactly one place, the top of `CoachShell`, because every signed-in coach page
 * draws `CoachShell` (the roster, a client's overview / routine / nutrition, the denial page,
 * the invited page, the challenge, template, recipe and nutrition-template lists, editors and
 * detail pages — `qa/error-boundary-retry.spec.ts` walks them). It makes no api read and is
 * called by nothing that does, so a page dropping a read cannot silence it. NOT from the
 * root `not-found.tsx`, which also draws `CoachShell` but is built into every page's
 * payload: it opts out (`CoachShell`'s `faultSeam={false}`) so it can neither throw on a
 * healthy page nor spend a `once`.
 */
export function throwIfFixtureRenderError(): void {
  if (COACH_API_MODE !== "fixture") return;
  if (renderErrorSwitch(cookies().get(RENDER_ERROR_COOKIE)?.value ?? null)) {
    throw new Error("BUG-689 fixture: forced server render error");
  }
}
