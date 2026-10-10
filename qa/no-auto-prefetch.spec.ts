import { expect, type Browser, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { LINA_PATH, fmt, hydrated, launch, setSwitch, signedInContext, track, type Engine } from "./start-build";

/**
 * EV-356d P4 — ADR-0033 D33.13 point 2, invariant N: the portal sends no AUTO prefetch.
 *
 * Under `staleTimes { dynamic: 30, static: 30 }` a plain `<Link>`'s AUTO entry expires at 30 s;
 * the next mouse entry (every real click starts with one) or touch start makes a fresh
 * tree-only entry, and the click repaints whatever page the router's tree cache holds, with no
 * request — witnessed at +35 s and +70 s after a revoke on a client tab (P4, `ev356d-p4p5-
 * witness.md`). Every link now goes through `src/components/ui/Link.tsx` (`prefetch={false}`;
 * ESLint bans `next/link` elsewhere), so every click past 30 s reaches the server.
 *
 * Staff's Q5 and the runtime half of the invariant, in Chromium and WebKit, on `next start`
 * (`playwright.start.config.ts`).
 */

const ACTIVE_CHALLENGE = "c4a11e00-0000-4000-8000-000000000001";
const ROUTINE = `${LINA_PATH}/routine`;
const NUTRITION = `${LINA_PATH}/nutrition`;
/** The denial page's sentence, its one h1 (`copy.client.notFound`). */
const DENIAL = {
  en: "This trainee is not on your roster. They may have revoked access.",
  fr: "Ce client ne fait pas partie de votre liste. Il a peut-être révoqué l'accès.",
} as const;
const tab = (page: Page, href: string) => page.locator(`nav.client-tabs a[href="${href}"]`);

/** Hover every visible internal link on the page, then a quiet moment for anything they fire. */
async function hoverEveryLink(page: Page): Promise<number> {
  const links = await page.locator('a[href^="/"]').filter({ visible: true }).all();
  for (const link of links) {
    await link.hover({ timeout: 2_000 }).catch(() => undefined);
    await page.waitForTimeout(40);
  }
  await page.mouse.move(1, 1);
  await page.waitForTimeout(600);
  return links.length;
}

for (const engine of ["chromium", "webkit"] as Engine[]) {
  test.describe(`EV-356d invariant N, ${engine}`, () => {
    let browser: Browser;
    test.beforeAll(async () => {
      browser = await launch(engine);
    });
    test.afterAll(async () => {
      await browser?.close();
    });

    test("no request carries Next-Router-Prefetch: 1 — on load, or on hovering every link of every main page", async ({
      baseURL,
    }) => {
      test.setTimeout(120_000);
      const context = await signedInContext(browser, baseURL!);
      const seen = track(context);
      const page = await context.newPage();
      try {
        const visited: string[] = [];
        for (const path of [
          "/",
          LINA_PATH,
          ROUTINE,
          NUTRITION,
          "/templates",
          "/nutrition-templates",
          "/recipes",
          "/challenges",
          `/challenges/${ACTIVE_CHALLENGE}`,
        ]) {
          await hydrated(page, path);
          visited.push(`${path} (${await hoverEveryLink(page)} links)`);
        }
        // The positive control: a rest on a roster row is IntentLink's FULL prefetch, which the
        // counter sees — so an empty AUTO list is not a deaf listener.
        await hydrated(page, "/");
        const full = page.waitForResponse((r) => new URL(r.url()).pathname === LINA_PATH, { timeout: 10_000 });
        await page.locator(`a.roster-row[href="${LINA_PATH}"]`).hover();
        await full;
        test.info().annotations.push({ type: `walk ${engine}`, description: visited.join("; ") });
        expect(fmt(seen.filter((s) => s.kind === "AUTO")), "AUTO prefetches").toEqual([]);
        expect(fmt(seen.filter((s) => s.kind === "FULL" && s.path === LINA_PATH)).length, "the control's FULL prefetch was seen").toBeGreaterThan(0);
      } finally {
        await context.close();
      }
    });

    /**
     * Q5. One context, five tabs, one clock. Each tab leaves a page in its router's tree cache
     * (the routine, the overview), the link ends at t0 + 34 s, and at t0 + 35 s (and 70 s for
     * one tab) each goes back to that page by a different link: the client tab bar, an overview
     * card's links (OverviewSummaries: open programme, open nutrition), a challenge participant's link, and the tab bar by
     * keyboard. Each must land on /clients/denied, answered 403, with the denial sentence as its one
     * h1, in English and in French.
     * The keyboard case is the control: Enter makes no mouse entry, so it reached the server
     * before invariant N as well — the red of the others comes from the hover.
     */
    for (const lang of ["en", "fr"] as const) {
      test(`Q5 (P4, ${lang}): a client page left more than 30 s ago is fetched again by every kind of link (+35 s, +70 s)`, async ({
        baseURL,
      }) => {
        test.setTimeout(180_000);
        const context = await signedInContext(browser, baseURL!, lang === "fr" ? "fr-FR" : "en-US");
        await setSwitch(context, baseURL!, "evoli_pro_locale", lang);
        // A hang names its step (this config sets no action timeout).
        context.setDefaultTimeout(20_000);
        const step = (what: string) =>
          process.stdout.write(`Q5 ${engine} ${lang} ${new Date().toISOString().slice(11, 19)} ${what}\n`);
        const seen = track(context);
        const pages = {
          tab35: await context.newPage(),
          programmeCard35: await context.newPage(),
          nutritionCard35: await context.newPage(),
          participant35: await context.newPage(),
          keyboard35: await context.newPage(),
          tab70: await context.newPage(),
        };
        const results: string[] = [];
        try {
          // Leave the routine in the tree cache, back on the overview.
          for (const p of [pages.tab35, pages.keyboard35, pages.tab70]) {
            step("prep: tab page");
            await p.bringToFront();
            await hydrated(p, LINA_PATH);
            await tab(p, ROUTINE).click();
            await expect(p).toHaveURL(new RegExp(`${ROUTINE}$`));
            await tab(p, LINA_PATH).click();
            await expect(p).toHaveURL(new RegExp(`${LINA_PATH}$`));
            await p.mouse.move(1, 1);
          }
          // The same through the overview's two cards (OverviewSummaries): open programme, open nutrition.
          const card = (p: Page, href: string) => p.locator(`a.link-button[href="${href}"]`).first();
          for (const [p, href] of [
            [pages.programmeCard35, ROUTINE],
            [pages.nutritionCard35, NUTRITION],
          ] as const) {
            step(`prep: card page ${href}`);
            await p.bringToFront();
            await hydrated(p, LINA_PATH);
            await card(p, href).click();
            await expect(p).toHaveURL(new RegExp(`${href}$`));
            await tab(p, LINA_PATH).click();
            await expect(card(p, href)).toBeVisible();
            await p.mouse.move(1, 1);
          }
          // A participant's overview from the challenge page, then back to the challenge.
          step("prep: participant page");
          await pages.participant35.bringToFront();
          await hydrated(pages.participant35, `/challenges/${ACTIVE_CHALLENGE}`);
          const participant = pages.participant35.locator("a[data-participant-link]").first();
          const participantHref = (await participant.getAttribute("href"))!;
          await participant.click();
          await expect(pages.participant35).toHaveURL(new RegExp(`${participantHref}$`));
          await pages.participant35.goBack();
          await expect(participant).toBeVisible();
          await pages.participant35.mouse.move(1, 1);

          step("prep done");
          const t0 = Date.now();
          const at = (s: number) => new Promise((r) => setTimeout(r, Math.max(0, t0 + s * 1000 - Date.now())));
          await at(34);
          await setSwitch(context, baseURL!, "evoli_fixture_link", "ended");

          /** Where the revisit landed, its h1, and the status the denial document answered. */
          async function revisit(name: string, p: Page, go: () => Promise<void>) {
            step(`revisit: ${name}`);
            await p.bringToFront();
            const n = seen.length;
            await go();
            await p.waitForLoadState("networkidle").catch(() => undefined);
            await expect.poll(() => seen.slice(n).every((r) => r.status !== undefined)).toBe(true);
            await p.waitForTimeout(300);
            const url = new URL(p.url()).pathname;
            const h1 = await p.locator("h1").allTextContents();
            const denialDoc = seen.slice(n).find((r) => r.kind === "DOC" && r.path === "/clients/denied");
            results.push(
              `+${((Date.now() - t0) / 1000).toFixed(1)} s ${name}: ${url} h1=${JSON.stringify(h1)} ${JSON.stringify(fmt(seen.slice(n)))}`
            );
            return { url, h1, status: denialDoc?.status ?? null };
          }
          const viaMouse = (p: Page, l: ReturnType<Page["locator"]>) => async () => {
            await l.hover();
            await p.waitForTimeout(300);
            await l.click();
          };

          await at(35);
          const landed = {
            tab35: await revisit("tab bar", pages.tab35, viaMouse(pages.tab35, tab(pages.tab35, ROUTINE))),
            programmeCard35: await revisit(
              "overview card, open programme",
              pages.programmeCard35,
              viaMouse(pages.programmeCard35, card(pages.programmeCard35, ROUTINE))
            ),
            nutritionCard35: await revisit(
              "overview card, open nutrition",
              pages.nutritionCard35,
              viaMouse(pages.nutritionCard35, card(pages.nutritionCard35, NUTRITION))
            ),
            participant35: await revisit("participant", pages.participant35, viaMouse(pages.participant35, participant)),
            keyboard35: await revisit("tab bar, keyboard", pages.keyboard35, async () => {
              await tab(pages.keyboard35, ROUTINE).focus();
              await pages.keyboard35.keyboard.press("Enter");
            }),
          };
          await at(70);
          const tab70 = await revisit("tab bar", pages.tab70, viaMouse(pages.tab70, tab(pages.tab70, ROUTINE)));

          test.info().annotations.push({ type: `Q5 ${engine} ${lang}`, description: results.join("; ") });
          process.stdout.write(`Q5 ${engine} ${lang}:\n  ${results.join("\n  ")}\n`);
          const denied = { url: "/clients/denied", h1: [DENIAL[lang]], status: 403 };
          expect(
            { ...landed, tab70 },
            "every revisit past 30 s reached the server and was refused: the 403 page and its sentence"
          ).toEqual({
            tab35: denied,
            programmeCard35: denied,
            nutritionCard35: denied,
            participant35: denied,
            keyboard35: denied,
            tab70: denied,
          });
          expect(fmt(seen.filter((s) => s.kind === "AUTO")), "no AUTO prefetch during the run").toEqual([]);
        } finally {
          await context.close();
        }
      });
    }
  });
}
