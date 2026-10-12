import { existsSync } from "node:fs";
import { expect, webkit, type Browser, type Locator, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";
import { expectNoSidewaysScroll, expectUnoccluded } from "./layout";
import { expectNoEnglish } from "./french";

/**
 * EV-341w — « Demander l'accord »: the coach asks for the intake interview consent, waits,
 * and sees the answer, with no refusal stored. W1–W9 and W11's portal rules, in fixture mode
 * (the default suite turns the release hold on: `COACH_INTAKE_REQUEST=on`). W10 is the live
 * api's (a trainee's own `GET /me/my-coach` and dismiss): not here.
 *
 * The trainee's half (grant, « Pas maintenant », the 15 minutes passing) is
 * `POST /api/fixture/intake`; `evoli_fixture_intake_ttl_ms` shortens the 15 minutes for one
 * browser context. Every api call the fixture answered is in `GET /api/fixture/calls`
 * (`api`, the journal), which is how a GET is counted (W3).
 *
 * The expected sentences are LITERALS from the story's Copy section, never read from
 * `src/lib/copy.ts`. French is compared with no-break spaces read as spaces (the house rule
 * puts U+00A0 before « : »; the story's text has a plain space there).
 */

const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
const OVERVIEW = `/clients/${LINA}`;

const T = {
  en: {
    locale: "en-US",
    region: "Intake",
    noGrant: "Lina hasn't allowed the intake interview yet.",
    ask: "Ask for consent",
    waiting: "Ask Lina to open Evoli Fit. If the app is already open: Preferences, then Coaching.",
    cancel: "Cancel the request",
    granted: "Consent given",
    notNow: "No consent for now.",
    cap: "You have already asked 3 times in 24 hours. You can ask again later.",
    denied: "This trainee is not on your roster. They may have revoked access.",
  },
  fr: {
    locale: "fr-FR",
    region: "Entretien",
    noGrant: "Lina n'a pas encore autorisé l'entretien.",
    ask: "Demander l'accord",
    waiting: "Demandez à Lina d'ouvrir Evoli Fit. Si l'application est déjà ouverte : Préférences, puis Coaching.",
    cancel: "Annuler la demande",
    granted: "Accord donné",
    notNow: "Pas d'accord pour l'instant.",
    cap: "Vous avez déjà demandé 3 fois en 24 heures. Vous pourrez redemander plus tard.",
    denied: "Ce client ne fait pas partie de votre liste. Il a peut-être révoqué l'accès.",
  },
} as const;
type Lang = keyof typeof T;

const plain = (text: string | null) => (text ?? "").replace(/[\u00a0\u202f]/g, " ");

type Entry = { op: string; arg: string | null; start: number };

async function journal(page: Page): Promise<Entry[]> {
  const res = await page.request.get("/api/fixture/calls", { maxRedirects: 0 });
  expect(res.status(), "GET /api/fixture/calls (fixture mode only)").toBe(200);
  return ((await res.json()) as { api: Entry[] }).api;
}

async function count(page: Page, op: string): Promise<number> {
  return (await journal(page)).filter((e) => e.op === op && e.arg === LINA).length;
}

async function answer(page: Page, what: "grant" | "dismiss" | "expire"): Promise<void> {
  const res = await page.request.post("/api/fixture/intake", { data: { clientId: LINA, answer: what }, maxRedirects: 0 });
  expect(res.status(), `the trainee's ${what}`).toBe(200);
}

function card(page: Page, lang: Lang = "en"): Locator {
  return page.getByRole("region", { name: T[lang].region, exact: true });
}

function sentence(page: Page, lang: Lang = "en"): Locator {
  return card(page, lang).getByRole("status");
}

async function openOverview(page: Page, lang: Lang = "en"): Promise<void> {
  await page.goto(OVERVIEW);
  await expect(page.locator("[data-nav-progress-ready]"), "the overview hydrated").toHaveCount(1);
  await expect(card(page, lang)).toBeVisible();
}

async function expectSentence(page: Page, text: string, lang: Lang = "en", timeout?: number): Promise<void> {
  // Read every 100 ms: the default back-off (up to 1 s between reads) would add its own lag to
  // a "within one poll interval" measurement.
  await expect
    .poll(async () => plain(await sentence(page, lang).textContent()), { timeout: timeout ?? 10_000, intervals: [100] })
    .toBe(plain(text));
}

async function ask(page: Page, lang: Lang = "en"): Promise<void> {
  await card(page, lang).getByRole("button", { name: T[lang].ask, exact: true }).click();
  await expectSentence(page, T[lang].waiting, lang);
  await expect(card(page, lang).getByRole("button", { name: T[lang].cancel, exact: true })).toBeVisible();
}

/**
 * The document's visibility, as the card reads it. Headless Chromium keeps every page
 * "visible", so the property is overridden and the event the card listens to is dispatched:
 * what is under test is the card's response to the event, not the browser's tab machinery.
 */
async function setHidden(page: Page, hidden: boolean): Promise<void> {
  await page.evaluate((h) => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (h ? "hidden" : "visible") });
    Object.defineProperty(document, "hidden", { configurable: true, get: () => h });
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);
}

/** Every request the PAGE sends, except the dev server's own hot-reload traffic. */
function recordRequests(page: Page): string[] {
  const seen: string[] = [];
  page.on("request", (r) => {
    const url = new URL(r.url());
    if (url.pathname.startsWith("/_next/webpack-hmr") || url.pathname.includes("hot-update")) return;
    seen.push(`${r.method()} ${url.pathname}`);
  });
  return seen;
}

async function signIn(page: Page, lang: Lang = "en"): Promise<void> {
  await signInThroughForm(page, { lang });
}

test.describe("EV-341w (EN)", () => {
  test.use({ locale: "en-US" });

  test.describe("W1 the card", () => {
    test("no grant, no live request: the no-grant line and « Demander l'accord »", async ({ page }) => {
      await signIn(page);
      await openOverview(page);
      await expectSentence(page, T.en.noGrant);
      await expect(card(page).getByRole("button")).toHaveCount(1);
      await expect(card(page).getByRole("button", { name: T.en.ask, exact: true })).toBeEnabled();
      // The read is made once by the page's render, and nothing polls on an idle card.
      expect(await count(page, "getIntakeConsent")).toBe(1);
      await page.waitForTimeout(4_000);
      expect(await count(page, "getIntakeConsent"), "an idle card does not poll").toBe(1);
    });

    test("granted: « Accord donné » and no button", async ({ page }) => {
      await signIn(page);
      await answer(page, "grant");
      await openOverview(page);
      await expectSentence(page, T.en.granted);
      await expect(card(page).getByRole("button")).toHaveCount(0);
    });

    test("pending on load (asked in another tab): the waiting panel, polling with no deadline until it is answered (N4)", async ({ page }) => {
      await signIn(page);
      await openOverview(page);
      await ask(page);
      await page.reload();
      await expect(page.locator("[data-nav-progress-ready]")).toHaveCount(1);
      await expectSentence(page, T.en.waiting);
      await expect(card(page).getByRole("button", { name: T.en.cancel, exact: true })).toBeVisible();
      const before = await count(page, "getIntakeConsent");
      await page.waitForTimeout(3_600);
      expect(await count(page, "getIntakeConsent"), "the loaded panel polls").toBeGreaterThan(before);
      await answer(page, "dismiss");
      await expectSentence(page, T.en.notNow, "en", 4_000);
    });
  });

  test("W2 ask: one POST, then the waiting panel with « Annuler la demande »", async ({ page }) => {
    await signIn(page);
    await openOverview(page);
    await ask(page);
    expect(await count(page, "requestIntakeConsent")).toBe(1);
  });

  test("W3 the poll: 9–11 GETs in 30 s visible, none in 30 s hidden, and no other request", async ({ page }) => {
    test.setTimeout(150_000);
    await signIn(page);
    await openOverview(page);
    const requests = recordRequests(page);
    await ask(page);

    const askedAt = await count(page, "getIntakeConsent");
    const journalFrom = (await journal(page)).length;
    requests.length = 0;
    await page.waitForTimeout(30_000);
    const visibleGets = (await count(page, "getIntakeConsent")) - askedAt;
    expect(visibleGets, "GETs over 30 s visible").toBeGreaterThanOrEqual(9);
    expect(visibleGets, "GETs over 30 s visible").toBeLessThanOrEqual(11);
    // No other api call and no other browser request while the card waits.
    const calls = (await journal(page)).slice(journalFrom).map((e) => e.op);
    expect(new Set(calls), "the api calls made while waiting").toEqual(new Set(["getIntakeConsent"]));
    expect(
      requests.filter((r) => r !== `GET /api/bff/clients/${LINA}/intake-consent`),
      "the browser's requests while waiting"
    ).toEqual([]);
    expect(requests.length).toBe(visibleGets);

    await setHidden(page, true);
    await page.waitForTimeout(1_000); // a read already out when the page hid may still land
    const hiddenFrom = await count(page, "getIntakeConsent");
    await page.waitForTimeout(30_000);
    expect((await count(page, "getIntakeConsent")) - hiddenFrom, "GETs over 30 s hidden").toBe(0);

    await setHidden(page, false);
    await expect.poll(() => count(page, "getIntakeConsent"), { timeout: 2_000 }).toBeGreaterThan(hiddenFrom);
    await expectSentence(page, T.en.waiting);
  });

  test("W3 the poll stops at expiresAt: the answer shows, and no GET after it", async ({ page, baseURL }) => {
    test.setTimeout(60_000);
    await signIn(page);
    await page.context().addCookies([{ name: "evoli_fixture_intake_ttl_ms", value: "6000", url: baseURL! }]);
    await openOverview(page);
    const before = await count(page, "getIntakeConsent");
    await ask(page);
    await expectSentence(page, T.en.notNow, "en", 9_000);
    const atAnswer = await count(page, "getIntakeConsent");
    expect(atAnswer - before, "GETs while the 6 s request was live").toBeLessThanOrEqual(2);
    await page.waitForTimeout(8_000);
    expect(await count(page, "getIntakeConsent"), "GETs after expiresAt").toBe(atAnswer);
    await expect(card(page).getByRole("button", { name: T.en.ask, exact: true })).toBeEnabled();
  });

  test("W3/W4 granted: « Accord donné » within one poll interval, then no GET", async ({ page }) => {
    await signIn(page);
    await openOverview(page);
    await ask(page);
    await answer(page, "grant");
    const grantedAt = Date.now();
    await expectSentence(page, T.en.granted, "en", 5_000);
    // One poll interval (3 s ± 0.5 s) plus the read's own round trip through the dev server.
    expect(Date.now() - grantedAt, "ms from the trainee's grant to « Accord donné »").toBeLessThanOrEqual(4_000);
    await expect(card(page).getByRole("button")).toHaveCount(0);
    const after = await count(page, "getIntakeConsent");
    await page.waitForTimeout(6_500);
    expect(await count(page, "getIntakeConsent"), "GETs after the answer").toBe(after);
  });

  test("W4 a decline, an expiry and a cancel in another tab render the same DOM", async ({ page, context }) => {
    test.setTimeout(90_000);
    await signIn(page);
    await openOverview(page);
    const outer = () => card(page).evaluate((el) => el.outerHTML);

    await ask(page);
    await answer(page, "dismiss");
    await expectSentence(page, T.en.notNow, "en", 4_000);
    const declined = await outer();

    await ask(page);
    await answer(page, "expire");
    await expectSentence(page, T.en.notNow, "en", 4_000);
    const expired = await outer();

    await ask(page);
    const other = await context.newPage();
    await other.goto(OVERVIEW);
    await expect(other.locator("[data-nav-progress-ready]")).toHaveCount(1);
    await expectSentence(other, T.en.waiting);
    await card(other).getByRole("button", { name: T.en.cancel, exact: true }).click();
    // W5 in the tab that cancelled; W4 in the one that was waiting.
    await expectSentence(other, T.en.noGrant);
    await expectSentence(page, T.en.notNow, "en", 4_000);
    const cancelledElsewhere = await outer();

    expect(expired, "an expiry renders as a decline does").toBe(declined);
    expect(cancelledElsewhere, "a cancel in another tab renders as a decline does").toBe(declined);
    expect(declined).toContain(T.en.notNow);
    await expect(card(page).getByRole("button", { name: T.en.ask, exact: true })).toBeEnabled();
  });

  test("W5 cancel: one DELETE, the poll stops, the card is back to the no-grant state", async ({ page }) => {
    await signIn(page);
    await openOverview(page);
    await ask(page);
    await card(page).getByRole("button", { name: T.en.cancel, exact: true }).click();
    await expectSentence(page, T.en.noGrant);
    await expect(card(page).getByRole("button", { name: T.en.ask, exact: true })).toBeEnabled();
    expect(await count(page, "cancelIntakeConsentRequest")).toBe(1);
    const after = await count(page, "getIntakeConsent");
    await page.waitForTimeout(6_500);
    expect(await count(page, "getIntakeConsent"), "GETs after the cancel").toBe(after);
  });

  test("W6 the cap: the sentence beside a disabled button, and nothing else changes", async ({ page }) => {
    await signIn(page);
    await openOverview(page);
    for (let i = 0; i < 3; i++) {
      await ask(page);
      await card(page).getByRole("button", { name: T.en.cancel, exact: true }).click();
      await expectSentence(page, T.en.noGrant);
    }
    await card(page).getByRole("button", { name: T.en.ask, exact: true }).click();
    const capLine = card(page).getByText(T.en.cap, { exact: true });
    await expect(capLine).toBeVisible();
    const button = card(page).getByRole("button", { name: T.en.ask, exact: true });
    await expect(button).toBeDisabled();
    await expect(button).toHaveAccessibleDescription(T.en.cap);
    await expectSentence(page, T.en.noGrant);
    expect(await count(page, "requestIntakeConsent")).toBe(4);
    const after = await count(page, "getIntakeConsent");
    await page.waitForTimeout(3_500);
    expect(await count(page, "getIntakeConsent"), "a capped card does not poll").toBe(after);
  });

  test("W7 already granted: the 409 re-reads the status and shows « Accord donné »", async ({ page }) => {
    await signIn(page);
    await openOverview(page);
    await expectSentence(page, T.en.noGrant);
    await answer(page, "grant"); // granted from the app's settings, after this page loaded
    const reads = await count(page, "getIntakeConsent");
    await card(page).getByRole("button", { name: T.en.ask, exact: true }).click();
    await expectSentence(page, T.en.granted);
    await expect(card(page).getByRole("button")).toHaveCount(0);
    expect(await count(page, "requestIntakeConsent")).toBe(1);
    expect(await count(page, "getIntakeConsent"), "the re-read").toBe(reads + 1);
  });

  test.describe("W8 a revoked link, on each of the three calls: the overview's denial page", () => {
    async function ended(page: Page, baseURL: string | undefined) {
      await page.context().addCookies([{ name: "evoli_fixture_link", value: "ended", url: baseURL! }]);
    }
    async function expectDenied(page: Page) {
      await expect(page).toHaveURL(/\/clients\/denied$/, { timeout: 10_000 });
      await expect(page.getByText(T.en.denied, { exact: true })).toBeVisible();
    }

    test("the ask (POST)", async ({ page, baseURL }) => {
      await signIn(page);
      await openOverview(page);
      await ended(page, baseURL);
      await card(page).getByRole("button", { name: T.en.ask, exact: true }).click();
      await expectDenied(page);
    });

    test("the poll (GET)", async ({ page, baseURL }) => {
      await signIn(page);
      await openOverview(page);
      await ask(page);
      await ended(page, baseURL);
      await expectDenied(page);
    });

    test("the cancel (DELETE)", async ({ page, baseURL }) => {
      await signIn(page);
      await openOverview(page);
      await ask(page);
      await setHidden(page, true); // the poll is quiet, so the DELETE is the call that meets the end
      await ended(page, baseURL);
      await card(page).getByRole("button", { name: T.en.cancel, exact: true }).click();
      await expectDenied(page);
      expect(await count(page, "cancelIntakeConsentRequest")).toBe(1);
    });
  });

  test("W9 no refusal stored or shown: storage and cookies unchanged by the answer; a reload shows W1", async ({ page, context }) => {
    await signIn(page);
    await openOverview(page);
    const storage = () =>
      page.evaluate(() => ({
        local: Object.entries(localStorage),
        session: Object.entries(sessionStorage),
      }));
    const cookies = async () => (await context.cookies()).map((c) => `${c.name}=${c.value}`).sort();
    const beforeStorage = await storage();
    const beforeCookies = await cookies();

    await ask(page);
    await answer(page, "dismiss");
    await expectSentence(page, T.en.notNow, "en", 4_000);
    expect(await storage(), "localStorage and sessionStorage after a decline").toEqual(beforeStorage);
    expect(await cookies(), "cookies after a decline").toEqual(beforeCookies);
    const everything = JSON.stringify([await storage(), await context.cookies()]);
    for (const word of ["DISMISS", "declin", "refus", "notNow", "No consent", "intake"]) {
      expect(everything.toLowerCase(), `nothing stored mentions ${word}`).not.toContain(word.toLowerCase());
    }

    await page.reload();
    await expect(page.locator("[data-nav-progress-ready]")).toHaveCount(1);
    await expectSentence(page, T.en.noGrant);
    await expect(card(page).getByText(T.en.notNow)).toHaveCount(0);
  });

  test.describe("W11 the portal rules", () => {
    test("keyboard only: Enter asks, focus stays on the control, Enter cancels", async ({ page }) => {
      await signIn(page);
      await openOverview(page);
      const control = card(page).getByRole("button");
      await control.focus();
      await page.keyboard.press("Enter");
      await expectSentence(page, T.en.waiting);
      await expect(card(page).getByRole("button", { name: T.en.cancel, exact: true })).toBeFocused();
      await page.keyboard.press("Enter");
      await expectSentence(page, T.en.noGrant);
      await expect(card(page).getByRole("button", { name: T.en.ask, exact: true })).toBeFocused();
    });

    for (const width of [1440, 1024, 768, 390]) {
      test(`${width} px: the card and its control on screen, unoccluded, ≥ 44 px, no sideways scroll`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await signIn(page);
        await openOverview(page);
        for (const state of ["idle", "waiting"] as const) {
          if (state === "waiting") await ask(page);
          const control = card(page).getByRole("button");
          await expectUnoccluded(page, control, { label: `the ${state} control` });
          const box = await control.boundingBox();
          expect(box?.height ?? 0, "touch target height").toBeGreaterThanOrEqual(44);
          expect(box?.width ?? 0, "touch target width").toBeGreaterThanOrEqual(44);
          await expectUnoccluded(page, sentence(page), { label: `the ${state} sentence` });
          await expectNoSidewaysScroll(page, `the overview, ${state}`);
        }
      });
    }
  });
});

test.describe("EV-341w (FR, the default language)", () => {
  test.use({ locale: "fr-FR" });

  test("every state of the card in French, and no English on the page", async ({ page }) => {
    await signIn(page, "fr");
    await openOverview(page, "fr");
    await expectSentence(page, T.fr.noGrant, "fr");
    await expectNoEnglish(page, "the overview, idle card");
    await ask(page, "fr");
    await expectNoEnglish(page, "the overview, waiting");
    await answer(page, "dismiss");
    await expectSentence(page, T.fr.notNow, "fr", 4_000);
    await ask(page, "fr");
    await card(page, "fr").getByRole("button", { name: T.fr.cancel, exact: true }).click();
    await expectSentence(page, T.fr.noGrant, "fr");
    await ask(page, "fr");
    await card(page, "fr").getByRole("button", { name: T.fr.cancel, exact: true }).click();
    await card(page, "fr").getByRole("button", { name: T.fr.ask, exact: true }).click();
    await expect(card(page, "fr").getByText(T.fr.cap, { exact: true })).toBeVisible();
    await expectNoEnglish(page, "the overview, capped");
    await answer(page, "grant");
    await page.reload();
    await expectSentence(page, T.fr.granted, "fr");
    await expectNoEnglish(page, "the overview, granted");
  });
});

/* The default config's project is Chromium; WebKit is launched here, like pro-roster-unnamed-client.spec.ts. */
test.describe("EV-341w in WebKit", () => {
  let browser: Browser;
  test.beforeAll(async () => {
    expect(existsSync(webkit.executablePath()), "WebKit is not installed: npx playwright install webkit").toBe(true);
    browser = await webkit.launch();
  });
  test.afterAll(async () => {
    await browser?.close();
  });

  for (const lang of ["en", "fr"] as const) {
    test(`ask, wait, decline, ask again, granted, keyboard: WebKit, ${lang}`, async ({ baseURL }) => {
      const context = await browser.newContext({ baseURL, locale: T[lang].locale });
      await context.addCookies([{ name: "evoli_pro_locale", value: lang, url: baseURL as string }]);
      const page = await context.newPage();
      try {
        await signIn(page, lang);
        await openOverview(page, lang);
        await expectSentence(page, T[lang].noGrant, lang);
        const control = card(page, lang).getByRole("button");
        await control.focus();
        await page.keyboard.press("Enter");
        await expectSentence(page, T[lang].waiting, lang);
        await answer(page, "dismiss");
        await expectSentence(page, T[lang].notNow, lang, 4_000);
        await ask(page, lang);
        await answer(page, "grant");
        await expectSentence(page, T[lang].granted, lang, 4_000);
        await expect(card(page, lang).getByRole("button")).toHaveCount(0);
      } finally {
        await context.close();
      }
    });
  }
});
