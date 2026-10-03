import { existsSync } from "node:fs";
import {
  chromium,
  expect,
  webkit,
  type Browser,
  type BrowserType,
  type Locator,
  type Page,
  type Route,
} from "@playwright/test";
import { en, type Copy } from "../src/lib/copy";
import { fr } from "../src/lib/copy.fr";

/**
 * The BUG-686 race, forced, for any form of the portal — the method of
 * `qa/login-prehydration-input.spec.ts`, shared.
 *
 * Every `/_next/static/chunks/*` request is HELD from the first navigation, so the page is
 * server HTML with no React until the test calls `release()`. A `fill()`, `selectOption()`
 * or click made before that lands in the server HTML. `expectServerHtml` proves it, per
 * field: React attaches a `__reactFiber$…` key to a node when it hydrates it, and it is
 * absent. `release()` returns how many chunks were held, which a test asserts is > 0, so a
 * pass cannot come from typing after hydration.
 *
 * The matrix is the login spec's: Chromium and WebKit, EN and FR, 1440 and 390 px. Each
 * test opens its own context (locale + `Accept-Language`, as the login spec), signed in
 * through `/api/auth/login` on the context's own cookie jar when the page needs a session.
 */

export const ENGINES = { chromium, webkit } as const;
export type Engine = keyof typeof ENGINES;
export const LANGS = ["en", "fr"] as const;
export type Lang = (typeof LANGS)[number];
export const WIDTHS = [1440, 390] as const;
export type { Copy };
export const COPY: Record<Lang, Copy> = { en, fr };
const LOCALE: Record<Lang, string> = { en: "en-US", fr: "fr-FR" };

/** A click on a control that never enables fails here, well inside the test's 60 s. */
export const CLICK_TIMEOUT = 20_000;

export const COACH = { email: "coach@evoli.fit", password: "Password123!" };
/** A PENDING coach of the fixture (`PENDING_ACCOUNTS`), un-activated at every test's reset. */
export const PENDING = { email: "new.coach@evoli.fit", password: "Temp-pass-2026" };

const launched: Partial<Record<Engine, Browser>> = {};
export async function browserFor(engine: Engine): Promise<Browser> {
  const type: BrowserType = ENGINES[engine];
  expect(existsSync(type.executablePath()), `${engine} is not installed: npx playwright install ${engine}`).toBe(true);
  launched[engine] ??= await type.launch();
  return launched[engine]!;
}
export async function closeBrowsers() {
  for (const engine of Object.keys(launched) as Engine[]) {
    await launched[engine]?.close();
    delete launched[engine];
  }
}

export async function openPage(
  engine: Engine,
  lang: Lang,
  width: number,
  baseURL: string | undefined,
  as: "anon" | "coach" | "pending" = "coach",
): Promise<Page> {
  const browser = await browserFor(engine);
  const context = await browser.newContext({
    baseURL,
    locale: LOCALE[lang],
    extraHTTPHeaders: { "Accept-Language": LOCALE[lang] },
    viewport: { width, height: 900 },
  });
  if (as !== "anon") {
    const login = await context.request.post("/api/auth/login", {
      data: as === "pending" ? PENDING : COACH,
      maxRedirects: 0,
    });
    expect(login.status(), `fixture sign-in as ${as}`).toBe(200);
  }
  return context.newPage();
}

/** Holds every JS chunk until `release()`; call before the first `goto`. */
export async function holdHydration(page: Page) {
  const held: Route[] = [];
  let count = 0;
  let open = false;
  await page.route(/\/_next\/static\/chunks\//, async (route) => {
    if (open) return route.continue();
    count += 1;
    held.push(route);
  });
  return {
    /** Lets every chunk through; returns how many were held. */
    async release(): Promise<number> {
      open = true;
      for (const route of held.splice(0)) await route.continue();
      return count;
    },
  };
}

/** The field has no React fiber: what was just typed went into server HTML. */
export async function expectServerHtml(field: Locator, what: string) {
  const hydrated = await field.evaluate((node) => Object.keys(node).some((k) => k.startsWith("__reactFiber$")));
  expect(hydrated, `${what} was typed into server HTML`).toBe(false);
}

/** React has hydrated `node` (its fiber is attached). */
export async function waitForFiber(node: Locator) {
  await expect
    .poll(() => node.evaluate((n) => Object.keys(n).some((k) => k.startsWith("__reactFiber$"))), {
      timeout: 45_000,
    })
    .toBe(true);
}

/**
 * Waits until React's controlled value for `field` (its `__reactProps$…`.value, or .checked
 * for a checkbox or radio, i.e. the
 * state the form rendered into it) equals what the field shows. Before the fix it never
 * does: the DOM keeps the typed text and the props keep the server's value. For a form whose
 * Save is not gated on the field, this is also the wait that keeps the click from landing
 * before hydration (a click on server HTML does nothing).
 */
export async function expectStateHoldsWhatIsShown(field: Locator, what: string) {
  await expect
    .poll(
      () =>
        field.evaluate((node) => {
          const el = node as HTMLInputElement;
          const key = Object.keys(el).find((k) => k.startsWith("__reactProps$"));
          if (!key) return "(not hydrated)";
          const props = (el as unknown as Record<string, { value?: unknown; checked?: unknown }>)[key];
          if (el.type === "checkbox" || el.type === "radio") {
            return props.checked === el.checked ? "same" : `shown ${el.checked}, held ${String(props.checked)}`;
          }
          return String(props.value) === el.value ? "same" : `shown ${JSON.stringify(el.value)}, held ${JSON.stringify(props.value)}`;
        }),
      { message: `${what}: React's value is the shown value`, timeout: 30_000 },
    )
    .toBe("same");
}
