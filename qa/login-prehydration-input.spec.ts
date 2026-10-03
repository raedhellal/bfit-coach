import { existsSync } from "node:fs";
import {
  chromium,
  expect,
  webkit,
  type Browser,
  type BrowserType,
  type Page,
  type Request,
  type Route,
} from "@playwright/test";
import { test } from "./fixture-test";

/**
 * BUG-686 — what a coach types into /login before React hydrates reaches the form's state.
 *
 * `LoginForm`'s inputs are controlled, and React 18 hydrates a controlled input without
 * touching its DOM value. So a value typed into the server HTML was in the field but not in
 * state, and « Se connecter » / "Sign in" (`disabled` while either value is empty) stayed
 * disabled on a visibly filled form until the coach edited a field.
 *
 * The race is forced, not waited for: every `/_next/static/chunks/*` request is HELD until
 * the named fields hold a value, then all are released (the method of
 * `qa/sign-in-hydration.spec.ts` on `chore/coach-test-hardening` 7d89a90). Each test asserts
 * that at least one chunk was held and that the field had no React fiber when it was typed
 * into, so a pass cannot come from typing after hydration.
 *
 * The typing is the raw pattern: fill, fill, click. No field is filled twice (the card
 * forbids the helper's re-fill as the witness). Red on e98a53f: the click waits on the
 * disabled button until its timeout.
 *
 * The matrix is the card's: Chromium and WebKit, FR and EN, 1440 and 390 px, for each of
 * (1) both fields before hydration → one click signs in with the typed credentials;
 * (2) the same with a wrong password → the invalid-credentials sentence, password cleared;
 * (3) only the email before hydration → disabled until a password is typed;
 * (4) typing after hydration → unchanged.
 *
 * Fixture mode signs in with any password, so (2)'s refusal is the api's, stubbed at
 * `/api/auth/login` with the route handler's own 401 body (`{ code: "INVALID_CREDENTIALS" }`).
 */

const COACH = { email: "coach@evoli.fit", password: "Password123!" };
const WRONG = "not-the-password";

const LANG = {
  en: {
    locale: "en-US",
    email: "Email",
    password: "Password",
    signIn: "Sign in",
    invalid: "Email or password is incorrect.",
  },
  fr: {
    locale: "fr-FR",
    email: "Adresse e-mail",
    password: "Mot de passe",
    signIn: "Se connecter",
    invalid: "E-mail ou mot de passe incorrect.",
  },
} as const;
type Lang = keyof typeof LANG;

const ENGINES = { chromium, webkit } as const;
type Engine = keyof typeof ENGINES;
const WIDTHS = [1440, 390] as const;

/** A click on a button that never enables fails here, well inside the test's 60 s. */
const CLICK_TIMEOUT = 20_000;

const launched: Partial<Record<Engine, Browser>> = {};
async function browserFor(engine: Engine): Promise<Browser> {
  const type: BrowserType = ENGINES[engine];
  expect(existsSync(type.executablePath()), `${engine} is not installed: npx playwright install ${engine}`).toBe(true);
  launched[engine] ??= await type.launch();
  return launched[engine]!;
}
test.afterAll(async () => {
  for (const b of Object.values(launched)) await b?.close();
});

async function openPage(engine: Engine, lang: Lang, width: number, baseURL: string | undefined): Promise<Page> {
  const browser = await browserFor(engine);
  const context = await browser.newContext({
    baseURL,
    locale: LANG[lang].locale,
    extraHTTPHeaders: { "Accept-Language": LANG[lang].locale },
    viewport: { width, height: 900 },
  });
  return context.newPage();
}

/**
 * Hold every JS chunk until each field named by `typedInto` holds a value, then release all.
 * `held()` is how many chunk requests were actually held.
 */
async function hydrateOnlyAfterTyping(page: Page, typedInto: string[]) {
  const held: Route[] = [];
  let heldCount = 0;
  let open = false;
  await page.route(/\/_next\/static\/chunks\//, async (route) => {
    if (open) return route.continue();
    heldCount += 1;
    held.push(route);
  });
  const released = page
    .waitForFunction(
      (selectors) =>
        selectors.every((sel) => {
          const field = document.querySelector<HTMLInputElement>(sel);
          return !!field && field.value.length > 0;
        }),
      typedInto,
      { timeout: 45_000 },
    )
    .then(async () => {
      open = true;
      for (const route of held.splice(0)) await route.continue();
    });
  return { released, held: () => heldCount };
}

const EMAIL_FIELD = 'input[autocomplete="username"]';
const PASSWORD_FIELD = 'input[autocomplete="current-password"]';

/** True once React has hydrated `selector`'s node (it attaches its fiber to the DOM node). */
function isHydrated(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const node = document.querySelector(sel);
    return !!node && Object.keys(node).some((k) => k.startsWith("__reactFiber$"));
  }, selector);
}
async function waitForHydration(page: Page) {
  await page.waitForFunction(() => {
    const button = document.querySelector('form button[type="submit"]');
    return !!button && Object.keys(button).some((k) => k.startsWith("__reactFiber$"));
  });
  // Let the hydration commit's passive effects (LoginForm's adoption of typed values) flush.
  await page.evaluate(() => new Promise((r) => setTimeout(r, 0)));
}

function loginBody(req: Request) {
  return JSON.parse(req.postData() || "{}") as { email?: string; password?: string };
}

for (const engine of Object.keys(ENGINES) as Engine[]) {
  for (const lang of Object.keys(LANG) as Lang[]) {
    for (const width of WIDTHS) {
      const t = LANG[lang];
      test.describe(`${engine} · ${lang} · ${width} px`, () => {
        test("(1) both fields typed before hydration: one click signs in with the typed credentials", async ({
          baseURL,
        }) => {
          const page = await openPage(engine, lang, width, baseURL);
          try {
            const race = await hydrateOnlyAfterTyping(page, [EMAIL_FIELD, PASSWORD_FIELD]);
            await page.goto("/login", { waitUntil: "domcontentloaded" });
            await page.getByLabel(t.email, { exact: true }).fill(COACH.email);
            expect(await isHydrated(page, EMAIL_FIELD), "the email was typed into server HTML").toBe(false);
            await page.getByLabel(t.password, { exact: true }).fill(COACH.password);
            await race.released;
            expect(race.held(), "at least one JS chunk was held until both fields had a value").toBeGreaterThan(0);

            const login = page.waitForRequest((r) => r.url().endsWith("/api/auth/login") && r.method() === "POST");
            await page.getByRole("button", { name: t.signIn, exact: true }).click({ timeout: CLICK_TIMEOUT });
            expect(loginBody(await login)).toEqual(COACH);
            await expect(page).toHaveURL(new URL("/", baseURL).href);
            await expect(page.getByRole("button", { name: t.signIn, exact: true })).toHaveCount(0);
          } finally {
            await page.context().close();
          }
        });

        test("(2) the same with a wrong password: the invalid-credentials sentence, and the password is cleared", async ({
          baseURL,
        }) => {
          const page = await openPage(engine, lang, width, baseURL);
          try {
            await page.route("**/api/auth/login", (route) =>
              route.fulfill({
                status: 401,
                contentType: "application/json",
                body: JSON.stringify({ code: "INVALID_CREDENTIALS" }),
              }),
            );
            const race = await hydrateOnlyAfterTyping(page, [EMAIL_FIELD, PASSWORD_FIELD]);
            await page.goto("/login", { waitUntil: "domcontentloaded" });
            await page.getByLabel(t.email, { exact: true }).fill(COACH.email);
            expect(await isHydrated(page, EMAIL_FIELD), "the email was typed into server HTML").toBe(false);
            await page.getByLabel(t.password, { exact: true }).fill(WRONG);
            await race.released;
            expect(race.held(), "at least one JS chunk was held until both fields had a value").toBeGreaterThan(0);

            const login = page.waitForRequest((r) => r.url().endsWith("/api/auth/login") && r.method() === "POST");
            await page.getByRole("button", { name: t.signIn, exact: true }).click({ timeout: CLICK_TIMEOUT });
            expect(loginBody(await login)).toEqual({ email: COACH.email, password: WRONG });
            // Scoped to the form: Next's route announcer is a second, empty role=alert.
            await expect(page.locator("form").getByRole("alert")).toHaveText(t.invalid);
            await expect(page.getByLabel(t.password, { exact: true })).toHaveValue("");
            await expect(page.getByLabel(t.email, { exact: true })).toHaveValue(COACH.email);
            await expect(page.getByRole("button", { name: t.signIn, exact: true })).toBeDisabled();
            await expect(page).toHaveURL(/\/login$/);
          } finally {
            await page.context().close();
          }
        });

        test("(3) only the email typed before hydration: disabled until a password is typed", async ({ baseURL }) => {
          const page = await openPage(engine, lang, width, baseURL);
          try {
            const race = await hydrateOnlyAfterTyping(page, [EMAIL_FIELD]);
            await page.goto("/login", { waitUntil: "domcontentloaded" });
            await page.getByLabel(t.email, { exact: true }).fill(COACH.email);
            expect(await isHydrated(page, EMAIL_FIELD), "the email was typed into server HTML").toBe(false);
            await race.released;
            expect(race.held(), "at least one JS chunk was held until the email had a value").toBeGreaterThan(0);

            await waitForHydration(page);
            const button = page.getByRole("button", { name: t.signIn, exact: true });
            await expect(button).toBeDisabled();

            await page.getByLabel(t.password, { exact: true }).fill(COACH.password);
            await expect(button).toBeEnabled();
            const login = page.waitForRequest((r) => r.url().endsWith("/api/auth/login") && r.method() === "POST");
            await button.click({ timeout: CLICK_TIMEOUT });
            // The email typed before hydration is the one sent: it was adopted, not lost.
            expect(loginBody(await login)).toEqual(COACH);
            await expect(page).toHaveURL(new URL("/", baseURL).href);
          } finally {
            await page.context().close();
          }
        });

        test("(4) typing after hydration is unchanged", async ({ baseURL }) => {
          const page = await openPage(engine, lang, width, baseURL);
          try {
            await page.goto("/login");
            await waitForHydration(page);
            const button = page.getByRole("button", { name: t.signIn, exact: true });
            await expect(button).toBeDisabled();
            await page.getByLabel(t.email, { exact: true }).fill(COACH.email);
            await expect(button).toBeDisabled();
            await page.getByLabel(t.password, { exact: true }).fill(COACH.password);
            await expect(button).toBeEnabled();
            const login = page.waitForRequest((r) => r.url().endsWith("/api/auth/login") && r.method() === "POST");
            await button.click({ timeout: CLICK_TIMEOUT });
            expect(loginBody(await login)).toEqual(COACH);
            await expect(page).toHaveURL(new URL("/", baseURL).href);
          } finally {
            await page.context().close();
          }
        });
      });
    }
  }
}
