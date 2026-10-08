import { expect, type Page } from "@playwright/test";
import { test } from "./fixture-test";

/**
 * EV-350 (350.8, with 350.5's `/login` and 350.6's switch) — the dictionary chunk is
 * requested in the FIRST wave of a cold load.
 *
 * EV-342m fetches the page language's dictionary with an `import()` that only runs once the
 * first-wave scripts have run: one more round trip before hydration (~95 ms on HTTP/2 at
 * 100 ms RTT). The root layout now puts `<link rel="preload" as="script">` for that chunk in
 * the document (`src/lib/i18n/chunk.ts`), and next.config.mjs names the chunk so the server
 * can know its URL. The timing win is measured on EV-346's rig, not here; this spec guards
 * the mechanism, so that a change which breaks it (a renamed chunk, a Next upgrade, a
 * different prefix) goes red instead of silently costing the round trip again:
 *   · the document carries a hint whose URL IS the dictionary request's URL;
 *   · exactly one request for that language's dictionary (the hint was used, not doubled);
 *   · nothing names, or fetches, the other language.
 *
 * A dictionary is recognised by its CONTENT, never by its file name, as in
 * `locale-bundle.spec.ts`: "Ouvrir le plan" is French only, "Add a client" English only
 * (both are dictionary values found nowhere else in `src/`, comments included, because
 * `next dev` ships comments). So a build that renames the chunk still has to keep the hint
 * and the request on the same URL to pass.
 *
 * Mutants (QA records red and green):
 *   · delete the `preloadCopyChunk(locale)` line in `src/app/layout.tsx`: all five go red, the
 *     four cold loads on "the document hints this language's dictionary", the switch on
 *     "the only dictionary hint is the document's" (there is none);
 *   · delete the RSC / server-action early return in `preloadCopyChunk`: the switch test goes
 *     red on "after FR → EN, the only dictionary hint is the document's" (and
 *     `locale-bundle.spec.ts`'s two WebKit tests with it).
 */

const PROBE = { en: "Add a client", fr: "Ouvrir le plan" } as const;
type Lang = keyof typeof PROBE;
const other = (lang: Lang): Lang => (lang === "fr" ? "en" : "fr");

interface Seen {
  /** Every JavaScript response, URL → body (one entry per request, in order). */
  scripts: { url: string; body: Promise<string> }[];
  documents: number;
  /** Console lines of any level that mention a preload (350.9). */
  preloadMessages: string[];
  errors: string[];
}

function watch(page: Page): Seen {
  const seen: Seen = { scripts: [], documents: 0, preloadMessages: [], errors: [] };
  page.on("response", (response) => {
    if (/\.js(\?|$)/.test(new URL(response.url()).pathname)) {
      seen.scripts.push({ url: response.url(), body: response.text().catch(() => "") });
    }
  });
  page.on("request", (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) seen.documents += 1;
  });
  page.on("console", (message) => {
    if (/preload/i.test(message.text())) seen.preloadMessages.push(`${message.type()}: ${message.text()}`);
    if (message.type() === "error") seen.errors.push(message.text());
  });
  page.on("pageerror", (error) => seen.errors.push(error.message));
  return seen;
}

/** The URLs of every request whose body is `lang`'s dictionary. */
async function dictionaryRequests(seen: Seen, lang: Lang): Promise<string[]> {
  const bodies = await Promise.all(seen.scripts.map((s) => s.body));
  return seen.scripts.filter((_, i) => bodies[i].includes(PROBE[lang])).map((s) => s.url);
}

/** `<link rel="preload" as="script">` hrefs in the document AS THE SERVER SENT IT, absolute. */
async function scriptHints(page: Page, html: string): Promise<string[]> {
  const links = [...html.matchAll(/<link\b[^>]*>/g)].map((m) => m[0]);
  const hrefs = links
    .filter((l) => /\brel="preload"/.test(l) && /\bas="script"/.test(l))
    .map((l) => /\bhref="([^"]+)"/.exec(l)?.[1])
    .filter((h): h is string => Boolean(h))
    .map((h) => new URL(h.replace(/&amp;/g, "&"), page.url()).toString());
  return hrefs;
}

/** Which dictionaries a set of hinted URLs would fetch, by content. */
async function hintedLanguages(page: Page, hrefs: string[]): Promise<Lang[]> {
  const langs: Lang[] = [];
  for (const href of hrefs) {
    const body = await (await page.request.get(href)).text();
    for (const lang of ["fr", "en"] as const) if (body.includes(PROBE[lang])) langs.push(lang);
  }
  return langs;
}

/** A session cookie with no page load: the first document of the test is the cold one. */
async function signInWithoutALoad(page: Page) {
  const login = await page.request.post("/api/auth/login", {
    data: { email: "coach@evoli.fit", password: "Password123!" },
    maxRedirects: 0,
  });
  expect(login.status()).toBe(200);
}

async function coldLoad(page: Page, path: string): Promise<{ seen: Seen; html: string }> {
  const seen = watch(page);
  const response = await page.goto(path, { waitUntil: "load" });
  expect(response, `${path} answered`).not.toBeNull();
  const html = await response!.text();
  await expect(page.locator("[data-nav-progress-ready]"), "the page hydrated").toHaveCount(1);
  await page.waitForLoadState("networkidle");
  return { seen, html };
}

async function expectFirstWaveHint(page: Page, lang: Lang, path: string) {
  const { seen, html } = await coldLoad(page, path);
  await expect(page.locator("html")).toHaveAttribute("lang", lang);

  const hints = await scriptHints(page, html);
  const requested = await dictionaryRequests(seen, lang);
  expect(requested, `exactly one request for the ${lang} dictionary`).toHaveLength(1);
  expect(hints, "the document hints this language's dictionary, at the URL it is fetched from").toContain(
    requested[0]
  );
  expect(await hintedLanguages(page, hints), `no hint names the ${other(lang)} dictionary`).toEqual([lang]);
  expect(await dictionaryRequests(seen, other(lang)), `the ${other(lang)} dictionary is not fetched`).toEqual([]);
  expect(seen.documents, "one document").toBe(1);
  expect(seen.preloadMessages, "no console message about a preload").toEqual([]);
  expect(seen.errors, "no page or console error").toEqual([]);
}

for (const lang of ["fr", "en"] as const) {
  test.describe(`a cold ${lang.toUpperCase()} load`, () => {
    test.use({ locale: lang === "fr" ? "fr-FR" : "en-US" });

    test(`/ hints the ${lang} dictionary chunk and fetches it once (350.8)`, async ({ page, context, baseURL }) => {
      await signInWithoutALoad(page);
      await context.addCookies([{ name: "evoli_pro_locale", value: lang, url: baseURL! }]);
      await expectFirstWaveHint(page, lang, "/");
    });

    test(`/login signed out follows <html lang> (${lang}) (350.5)`, async ({ page, context }) => {
      await context.clearCookies();
      await expectFirstWaveHint(page, lang, "/login");
    });
  });
}

test.describe("the switch", () => {
  test.use({ locale: "fr-FR" });

  test("FR → EN → FR: no document load, each dictionary requested at most once (350.6)", async ({ page }) => {
    await signInWithoutALoad(page);
    const { seen } = await coldLoad(page, "/");
    const languages = () => page.getByRole("radiogroup", { name: /^(Langue|Language)$/ });

    await languages().getByRole("radio", { name: /^EN/ }).check();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Roster");
    // The hint is the DOCUMENT's: the switch's re-render must not add one for English. A
    // hint in the switch's RSC payload becomes a <link rel="preload"> in <head>, and WebKit
    // then answers every later import() of that URL from the preload, a failed one
    // included: after a 404 on the switch the coach could never switch again (found on
    // locale-bundle.spec.ts's BUG-703 / 349.3 WebKit tests during EV-350).
    const domHints = await page.evaluate(() =>
      [...document.querySelectorAll('link[rel="preload"][as="script"]')].map((l) => (l as HTMLLinkElement).href)
    );
    expect(await hintedLanguages(page, domHints), "after FR → EN, the only dictionary hint is the document's").toEqual([
      "fr",
    ]);
    await languages().getByRole("radio", { name: /^FR/ }).check();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Clients");
    await page.waitForLoadState("networkidle");

    expect(seen.documents, "the switch never loads a document").toBe(1);
    expect(await dictionaryRequests(seen, "fr"), "French: the cold load's one request").toHaveLength(1);
    expect(await dictionaryRequests(seen, "en"), "English: the switch's one request").toHaveLength(1);
    expect(seen.preloadMessages).toEqual([]);
    expect(seen.errors).toEqual([]);
  });
});
