import { chromium, expect, webkit, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { isProductionBuild } from "./production-build";

/**
 * Shared by the specs that run on `next start` only (`playwright.start.config.ts`) and drive
 * Chromium AND WebKit themselves (EV-356d: `client-load-reload.spec.ts`, `no-auto-prefetch.spec.ts`).
 */

export const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
export const LINA_PATH = `/clients/${LINA}`;
export const LINA_NAME = "Lina M.";
export const ENGINES = { chromium, webkit } as const;
export type Engine = keyof typeof ENGINES;

export async function launch(engine: Engine): Promise<Browser> {
  return ENGINES[engine].launch();
}

/**
 * A signed-in context. A production build marks the session cookies `Secure`; WebKit (unlike
 * Chromium) will not send them back to http://localhost, so they are re-added without the flag
 * (in both engines, for one code path). That is what an https origin would send.
 * Exception: a `__Host-` cookie (BUG-745's `__Host-evoli_pro_epoch`) keeps `Secure`, or Chromium
 * refuses it ("Invalid cookie fields"). WebKit then stores it (from `context.request`) but does not
 * send it over http, so WebKit cells run with no epoch, which the guard reads as "not stale". No
 * start-config spec reads the epoch; BUG-745's witnesses use playwright.session.config.ts (https front).
 */
export async function signedInContext(browser: Browser, baseURL: string, locale = "en-US"): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL, locale, viewport: { width: 1280, height: 900 } });
  const login = await context.request.post("/api/auth/login", {
    data: { email: "coach@evoli.fit", password: "Password123!" },
    maxRedirects: 0,
  });
  expect(login.status(), "fixture sign-in").toBe(200);
  const cookies = await context.cookies();
  await context.addCookies(cookies.map((c) => ({ ...c, secure: c.name.startsWith("__Host-") })));
  return context;
}

export async function setSwitch(context: BrowserContext, baseURL: string, name: string, value: string): Promise<void> {
  await context.addCookies([{ name, value, url: baseURL }]);
}

export interface Seen {
  at: number;
  path: string;
  /** DOC: a document request. FULL: an RSC GET with no prefetch header (a navigation or a FULL prefetch). AUTO: `Next-Router-Prefetch: 1`. */
  kind: "DOC" | "FULL" | "AUTO";
  status?: number;
}

/** Every document and RSC request the context makes from now on, in every page, across reloads. */
export function track(context: BrowserContext): Seen[] {
  const seen: Seen[] = [];
  context.on("request", (req) => {
    const url = new URL(req.url());
    if (url.pathname.startsWith("/_next/") || url.pathname.startsWith("/api/")) return;
    const h = req.headers();
    const kind = req.isNavigationRequest() ? "DOC" : h["rsc"] === "1" ? (h["next-router-prefetch"] === "1" ? "AUTO" : "FULL") : null;
    if (!kind) return;
    const entry: Seen = { at: Date.now(), path: url.pathname, kind };
    seen.push(entry);
    req
      .response()
      .then((res) => (entry.status = res?.status()))
      .catch(() => undefined);
  });
  return seen;
}

export const fmt = (seen: Seen[]) => seen.map((s) => `${s.kind} ${s.path} ${s.status ?? "?"}`);

/** A page, hydrated, on a production build (FAILS on `next dev`: these witnesses need prefetching). */
export async function hydrated(page: Page, path: string): Promise<void> {
  const res = await page.goto(path);
  expect(res?.status(), `${path} loads`).toBe(200);
  await expect(page.locator("[data-nav-progress-ready]")).toHaveCount(1);
  expect(await isProductionBuild(page), "run playwright.start.config.ts (next start)").toBe(true);
  await page.waitForLoadState("networkidle");
  await page.mouse.move(1, 1);
}
