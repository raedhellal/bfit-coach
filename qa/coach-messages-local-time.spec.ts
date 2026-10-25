import { expect, type ConsoleMessage, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";

/**
 * BUG-934 — the Messages thread reads every message time in the COACH's zone (Raed, 2026-10-25:
 * « yes switch messages to local time »). Fixture mode, the default suite, like
 * `coach-messages.spec.ts`.
 *
 * The client's message is written through `POST /api/fixture/messages` with a pinned `sentAt`
 * (2026-10-24T14:50:00Z), and the BROWSER's zone is Playwright's `timezoneId`. The page is server
 * rendered with that message in it, so each test is also the hydration test: the server runs in
 * another zone than the browser, and a time formatted during render on both would be a React
 * text mismatch. Any hydration warning in the console fails the test.
 *
 * Closes on (BUG-934): Paris reads « 16:50 » and no « UTC » in the message's header; UTC reads
 * « 14:50 ». New York (EDT, 10:50) is the west-of-UTC case. Expected strings are LITERALS.
 */

const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
const THREAD = `/clients/${LINA}/messages`;
const AT = "2026-10-24T14:50:00Z";
const AT_WIRE = "2026-10-24T14:50:00.000Z";

const LANGS = {
  en: { locale: "en-US", log: "Messages with Lina" },
  fr: { locale: "fr-FR", log: "Messages avec Lina" },
} as const;

const ZONES = [
  { zone: "Europe/Paris", en: "24 Oct 2026, 16:50", fr: "24 oct. 2026, 16:50" },
  { zone: "America/New_York", en: "24 Oct 2026, 10:50", fr: "24 oct. 2026, 10:50" },
  { zone: "UTC", en: "24 Oct 2026, 14:50", fr: "24 oct. 2026, 14:50" },
] as const;

const plain = (text: string | null) => (text ?? "").replace(/[  ]/g, " ");

/** React's hydration complaints (dev build), as the console and as uncaught errors. */
const HYDRATION = /hydrat|did not match|does not match server|server-rendered/i;
function recordHydrationWarnings(page: Page): string[] {
  const seen: string[] = [];
  page.on("console", (m: ConsoleMessage) => {
    if ((m.type() === "error" || m.type() === "warning") && HYDRATION.test(m.text())) seen.push(m.text());
  });
  page.on("pageerror", (e) => {
    if (HYDRATION.test(e.message)) seen.push(e.message);
  });
  return seen;
}

async function clientWritesAt(page: Page, body: string, sentAt: string): Promise<void> {
  const res = await page.request.post("/api/fixture/messages", { data: { clientId: LINA, body, sentAt }, maxRedirects: 0 });
  expect(res.status(), "the client's message, at a pinned instant").toBe(200);
}

for (const lang of ["en", "fr"] as const) {
  for (const z of ZONES) {
    test.describe(`BUG-934 ${z.zone} (${lang.toUpperCase()})`, () => {
      test.use({ locale: LANGS[lang].locale, timezoneId: z.zone });

      test(`a message sent at 14:50 UTC reads « ${z[lang]} », no « UTC », no hydration warning`, async ({ page }, testInfo) => {
        await signInThroughForm(page, { lang });
        await clientWritesAt(page, "On se voit jeudi ?", AT);
        const warnings = recordHydrationWarnings(page);

        await page.goto(THREAD);
        await expect(page.locator("[data-nav-progress-ready]"), "the page hydrated").toHaveCount(1);
        const item = page.getByRole("log", { name: LANGS[lang].log, exact: true }).locator('li[data-author="TRAINEE"]');
        await expect(item).toHaveCount(1);

        const time = item.locator("time.msg-time");
        await expect(time).toHaveAttribute("datetime", AT_WIRE);
        await expect.poll(async () => plain(await time.textContent())).toBe(z[lang]);
        expect(plain(await item.locator(".msg-meta").textContent()), "no zone label in the header").not.toMatch(/UTC/);

        if (lang === "fr" && z.zone !== "UTC") {
          await page.locator("section.msg").screenshot({ path: testInfo.outputPath(`thread-${z.zone.replace("/", "-")}-${lang}.png`) });
        }
        // Let any late hydration report land before reading the list.
        await page.waitForTimeout(500);
        expect(warnings, "no hydration warning").toEqual([]);
      });
    });
  }
}

test.describe("BUG-934 the server render", () => {
  test.use({ locale: "fr-FR", timezoneId: "Europe/Paris" });

  test("prints no UTC time for the browser to replace: the instant is in `dateTime` only", async ({ page }) => {
    await signInThroughForm(page, { lang: "fr" });
    await clientWritesAt(page, "On se voit jeudi ?", AT);
    const res = await page.request.get(THREAD, { maxRedirects: 0 });
    expect(res.status()).toBe(200);
    const html = await res.text();
    const tag = /<time[^>]*class="msg-time"[^>]*>([\s\S]*?)<\/time>/.exec(html);
    expect(tag, "the message's <time> is in the server HTML").not.toBeNull();
    // HTML attribute names are case-insensitive; React writes this one as `dateTime`.
    expect(tag![0]).toMatch(new RegExp(`datetime="${AT_WIRE.replace(/\./g, "\\.")}"`, "i"));
    expect(tag![1], "no server-zone time to flash before hydration").not.toMatch(/\d{2}:\d{2}|UTC/);
  });

  test("a message that arrives by the poll, after hydration, reads local time too", async ({ page }) => {
    await signInThroughForm(page, { lang: "fr" });
    const warnings = recordHydrationWarnings(page);
    await page.goto(THREAD);
    await expect(page.locator("[data-nav-progress-ready]"), "the page hydrated").toHaveCount(1);
    await expect(page.getByRole("log", { name: LANGS.fr.log, exact: true })).toBeVisible();
    await clientWritesAt(page, "Arrivé par le poll", "2026-10-24T22:30:00Z");
    const item = page.locator('li[data-author="TRAINEE"]');
    // The idle cadence is 15 s (AC-B3).
    await expect(item).toHaveCount(1, { timeout: 25_000 });
    await expect.poll(async () => plain(await item.locator("time.msg-time").textContent())).toBe("25 oct. 2026, 00:30");
    expect(warnings).toEqual([]);
  });
});
