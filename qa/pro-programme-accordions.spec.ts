import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, webkit, type Browser, type Locator, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";
import { expectNoSidewaysScroll, expectUnoccluded } from "./layout";

/**
 * EV-337f2 — day accordions in the shared routine editor (`RoutineDocumentEditor`), on the
 * programme page and on the training-template editor (story § Split of EV-337f, g and j:
 * F2.1–F2.5).
 *
 * Every label and sentence is a LITERAL (a spec derived from copy.ts cannot witness it).
 * The programme subject is Lina's seeded plan: Monday « Upper Body A » 4 exercises,
 * Wednesday « Lower Body » 3, Friday « Upper Body B » 3. F2.2's unbindable exception is
 * reached through `evoli_fixture_unbindable_day=<clientId>` (coachApi.fixture.ts
 * `withUnbindableDaySwitch`): a draft with « Zercher Carry » appended to her LAST day.
 *
 * Screenshots (1440 and 390, each language) go to `$EV337F2_EVIDENCE` when it is set.
 */

const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
/** Behind `evoli_fixture_long_plan`: six days of six exercises, no injuries (no repairs). */
const YUSUF = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0007";
const UPPER_LOWER = "7c2d0a11-0000-4000-8000-0000000000b1";

type Lang = "en" | "fr";
const LOCALE: Record<Lang, string> = { en: "en-US", fr: "fr-FR" };
const L = {
  en: {
    day: (n: number) => `Day ${n}`,
    lina: [
      { head: "Day 1 · Monday", focus: "Upper Body A", count: "4 exercises" },
      { head: "Day 2 · Wednesday", focus: "Lower Body", count: "3 exercises" },
      { head: "Day 3 · Friday", focus: "Upper Body B", count: "3 exercises" },
    ],
    upperLower: [
      { head: "Day 1 · Monday", focus: "Upper body", count: "3 exercises" },
      { head: "Day 2 · Thursday", focus: "Lower body", count: "3 exercises" },
    ],
    sets: "Sets",
    rest: "Rest",
    region: "Routine actions",
    publish: "Publish",
    published: /^Published\. /,
    save: "Save draft",
    saved: /^Draft saved /,
    unsaved: "Unsaved changes",
    addDay: "Add day",
    notReady: "This plan is not ready to save yet:",
    restRequired: "Day 2: Barbell Back Squat needs a rest time.",
    templateDay2Empty: "To do: Day 2 has no exercises.",
    notInCatalogue: "Not found in the catalogue",
  },
  fr: {
    day: (n: number) => `Jour ${n}`,
    lina: [
      { head: "Jour 1 · lundi", focus: "Upper Body A", count: "4 exercices" },
      { head: "Jour 2 · mercredi", focus: "Lower Body", count: "3 exercices" },
      { head: "Jour 3 · vendredi", focus: "Upper Body B", count: "3 exercices" },
    ],
    upperLower: [
      { head: "Jour 1 · lundi", focus: "Upper body", count: "3 exercices" },
      { head: "Jour 2 · jeudi", focus: "Lower body", count: "3 exercices" },
    ],
    sets: "Séries",
    rest: "Repos",
    region: "Actions du programme",
    publish: "Publier",
    published: /^Publié\. /,
    save: "Enregistrer le brouillon",
    saved: /^Brouillon enregistré à /,
    unsaved: "Modifications non enregistrées",
    addDay: "Ajouter un jour",
    notReady: "Ce plan n'est pas encore prêt à être enregistré :",
    restRequired: "Jour 2 : indiquez un temps de repos pour Barbell Back Squat.",
    templateDay2Empty: "À faire : Le jour 2 n'a aucun exercice.",
    notInCatalogue: "Introuvable dans le catalogue",
  },
} as const;

const EVIDENCE = process.env.EV337F2_EVIDENCE;
async function shot(page: Page, name: string) {
  if (!EVIDENCE) return;
  mkdirSync(EVIDENCE, { recursive: true });
  await page.screenshot({ path: join(EVIDENCE, `${name}.png`), fullPage: true });
}

function escape(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function dayGroup(page: Page, lang: Lang, n: number) {
  return page.getByRole("group", { name: L[lang].day(n), exact: true });
}

/** F2.1: the day's header button — its accessible name STARTS with « Jour {n} » / "Day {n}". */
function header(page: Page, lang: Lang, n: number) {
  return dayGroup(page, lang, n).getByRole("button", { name: new RegExp(`^${escape(L[lang].day(n))}(\\s|$)`) });
}

/** The region the header controls, found through its `aria-controls` (never by class). */
async function controlled(page: Page, button: Locator) {
  const id = await button.getAttribute("aria-controls");
  expect(id, "the header names the region it controls").toBeTruthy();
  const region = page.locator(`[id="${id}"]`);
  await expect(region, "aria-controls points at one element").toHaveCount(1);
  return region;
}

/** Opens or closes a day, retried: a press before hydration toggles nothing. */
async function setOpen(button: Locator, open: boolean) {
  await expect(async () => {
    if ((await button.getAttribute("aria-expanded")) !== String(open)) await button.click();
    await expect(button).toHaveAttribute("aria-expanded", String(open), { timeout: 1_000 });
  }).toPass();
}

async function expectStates(page: Page, lang: Lang, states: boolean[], where: string) {
  for (const [i, open] of states.entries()) {
    const button = header(page, lang, i + 1);
    await expect(button, `${where}: day ${i + 1}`).toHaveAttribute("aria-expanded", String(open));
    const region = await controlled(page, button);
    if (open) await expect(region, `${where}: day ${i + 1}'s fields are shown`).toBeVisible();
    else await expect(region, `${where}: day ${i + 1}'s fields are hidden`).toBeHidden();
  }
}

/* ─── The checks, shared by the Chromium tests and the real-WebKit ones ──────────────── */

/** F2.1 on Lina's plan: name, visible text, heading, aria wiring, Enter and Space, 44 px. */
async function checkControl(page: Page, lang: Lang, where: string) {
  for (const [i, day] of L[lang].lina.entries()) {
    const button = header(page, lang, i + 1);
    await expect(button, `${where}: one header for day ${i + 1}`).toHaveCount(1);
    await expect(button).toHaveAttribute("aria-expanded", /^(true|false)$/);
    // The visible text: weekday, focus, count.
    await expect(button.getByText(day.head, { exact: true })).toBeVisible();
    await expect(button.getByText(day.focus, { exact: true })).toBeVisible();
    await expect(button.getByText(day.count, { exact: true })).toBeVisible();
    // The name starts with the day, then says what the day holds.
    await expect(button, `${where}: the name starts with the day`).toHaveAccessibleName(
      new RegExp(`^${escape(day.head)}\\s+${escape(day.focus)}.*${escape(day.count)}$`)
    );
    // A button in a heading (WAI-ARIA accordion).
    expect(await button.evaluate((el) => el.parentElement?.tagName), `${where}: inside an h3`).toBe("H3");
    await controlled(page, button);
  }
  // Keyboard: Enter opens day 2, Space closes it, focus stays on the header.
  const day2 = header(page, lang, 2);
  await setOpen(day2, false); // hydrated (a toggle answers) before the keys are pressed
  await day2.focus();
  await page.keyboard.press("Enter");
  await expect(day2, `${where}: Enter opens`).toHaveAttribute("aria-expanded", "true");
  await expect(await controlled(page, day2)).toBeVisible();
  await expect(day2).toBeFocused();
  await page.keyboard.press("Space");
  await expect(day2, `${where}: Space closes`).toHaveAttribute("aria-expanded", "false");
  await expect(await controlled(page, day2)).toBeHidden();
  await expect(day2).toBeFocused();
}

/** F2.3: a value typed on day 2 survives a collapse, keeps « unsaved », and a save sends it. */
async function checkNothingLost(page: Page, lang: Lang, where: string) {
  const day2 = header(page, lang, 2);
  await setOpen(day2, true);
  const squat = dayGroup(page, lang, 2).getByRole("group", { name: "Barbell Back Squat", exact: true });
  const sets = squat.getByLabel(L[lang].sets, { exact: true });
  await expect(async () => {
    await sets.fill("7");
    await expect(page.getByText(L[lang].unsaved, { exact: true })).toBeVisible({ timeout: 1_000 });
  }).toPass();
  // The very node, kept across the collapse: hidden, NOT unmounted (no re-render replaced it).
  const node = await sets.elementHandle();
  await setOpen(day2, false);
  await expect(sets, `${where}: the closed day's field is out of the accessibility tree`).toHaveCount(0);
  expect(
    await node!.evaluate((el) => ({
      connected: el.isConnected,
      value: (el as HTMLInputElement).value,
      rendered: el.getClientRects().length > 0,
    })),
    `${where}: the closed day's field is the same node, still in the document, holding 7, not rendered`
  ).toEqual({ connected: true, value: "7", rendered: false });
  await expect(page.getByText(L[lang].unsaved, { exact: true }), `${where}: still unsaved`).toBeVisible();
  await setOpen(day2, true);
  await expect(sets, `${where}: the value is there after re-opening`).toHaveValue("7");
  expect(await node!.evaluate((el) => el.isConnected), `${where}: and it is the same node`).toBe(true);
  await expect(sets).toBeVisible();
  expect(await sets.evaluate((el, n) => el === n, node), `${where}: the visible field IS the node typed into`).toBe(true);
  await setOpen(day2, false);

  // Saved with day 2 CLOSED, then read back from the server after a reload.
  await page.getByRole("region", { name: L[lang].region, exact: true }).getByRole("button", { name: L[lang].save, exact: true }).click();
  await expect(page.getByText(L[lang].saved)).toBeVisible();
  await page.reload();
  const reopened = header(page, lang, 2);
  await expect(reopened, `${where}: after a reload day 2 is closed again`).toHaveAttribute("aria-expanded", "false");
  await setOpen(reopened, true);
  await expect(
    dayGroup(page, lang, 2).getByRole("group", { name: "Barbell Back Squat", exact: true }).getByLabel(L[lang].sets, { exact: true }),
    `${where}: the save sent the closed day's value`
  ).toHaveValue("7");
}

/** F2.3's second half: a closed day's validation problem is still listed, naming the day. */
async function checkProblemListed(page: Page, lang: Lang, where: string) {
  const day2 = header(page, lang, 2);
  await setOpen(day2, true);
  const rest = dayGroup(page, lang, 2)
    .getByRole("group", { name: "Barbell Back Squat", exact: true })
    .getByLabel(L[lang].rest, { exact: true });
  await expect(async () => {
    await rest.fill("");
    await expect(page.getByText(L[lang].restRequired, { exact: true })).toBeVisible({ timeout: 1_000 });
  }).toPass();
  await setOpen(day2, false);
  await expect(page.getByText(L[lang].notReady, { exact: true }), where).toBeVisible();
  await expect(page.getByText(L[lang].restRequired, { exact: true }), `${where}: listed while day 2 is closed`).toBeVisible();
}

/** F2.4 on the template editor: the same header, day 1 open, day 2 closed, toggles. */
async function checkTemplate(page: Page, lang: Lang, where: string) {
  await page.goto(`/templates/${UPPER_LOWER}`);
  for (const [i, day] of L[lang].upperLower.entries()) {
    const button = header(page, lang, i + 1);
    await expect(button.getByText(day.head, { exact: true }), where).toBeVisible();
    await expect(button.getByText(day.focus, { exact: true }), where).toBeVisible();
    await expect(button.getByText(day.count, { exact: true }), where).toBeVisible();
  }
  await expectStates(page, lang, [true, false], `${where} on load`);
  await setOpen(header(page, lang, 2), true);
  await expectStates(page, lang, [true, true], `${where} after opening day 2`);
  await setOpen(header(page, lang, 1), false);
  await expectStates(page, lang, [false, true], `${where} after closing day 1`);

  // A blank template: day 2 closed, and its unmet line is still in « Avant d'enregistrer ».
  await page.goto("/templates/new");
  await expectStates(page, lang, [true, false], `${where} /templates/new`);
  await expect(page.getByRole("complementary").getByRole("listitem").filter({ hasText: L[lang].templateDay2Empty })).toHaveCount(1);
}

/* ═══ Chromium ════════════════════════════════════════════════════════════════════════ */

for (const lang of ["en", "fr"] as const) {
  test.describe(`EV-337f2 Chromium (${lang})`, () => {
    test.use({ locale: LOCALE[lang] });

    test("F2.1: each day's header is a named button with aria-expanded; Enter and Space toggle it", async ({ page }) => {
      await signInThroughForm(page, { lang });
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(`/clients/${LINA}/routine`);
      await checkControl(page, lang, "Chromium");
    });

    test("F2.1 + X1/X3: at 320, 390, 768 and 1280 the headers are ≥ 44 px, unoccluded, no sideways scroll", async ({
      page,
    }) => {
      await signInThroughForm(page, { lang });
      for (const width of [320, 390, 768, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`/clients/${LINA}/routine`);
        await expect(header(page, lang, 3)).toBeVisible();
        await expectNoSidewaysScroll(page, `programme at ${width} (${lang})`);
        for (const n of [1, 2, 3]) {
          const button = header(page, lang, n);
          const box = await button.boundingBox();
          expect(box!.height, `day ${n} header at ${width}: ≥ 44 px tall`).toBeGreaterThanOrEqual(44);
          await expectUnoccluded(page, button, { label: `day ${n} header at ${width} (${lang})` });
        }
        await page.goto(`/templates/${UPPER_LOWER}`);
        await expect(header(page, lang, 2)).toBeVisible();
        await expectNoSidewaysScroll(page, `template at ${width} (${lang})`);
        const box = await header(page, lang, 2).boundingBox();
        expect(box!.height, `template day 2 header at ${width}: ≥ 44 px tall`).toBeGreaterThanOrEqual(44);
      }
    });

    test("F2.2: day 1 open and the rest closed on load; an added day opens", async ({ page }) => {
      await signInThroughForm(page, { lang });
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`/clients/${LINA}/routine`);
        await expectStates(page, lang, [true, false, false], `on load at ${width}`);
        await page.evaluate(() => window.scrollTo(0, 0));
        await shot(page, `programme-${lang}-${width}`);
      }
      await page.setViewportSize({ width: 1280, height: 900 });
      page.on("dialog", (dialog) => dialog.accept());
      const add = page.getByRole("button", { name: L[lang].addDay, exact: true });
      await expect(async () => {
        await add.click();
        await expect(header(page, lang, 4)).toHaveCount(1, { timeout: 1_000 });
      }).toPass();
      await expectStates(page, lang, [true, false, false, true], "after « Ajouter un jour »");
    });

    test("F2.2: a day holding an unbindable exercise (not day 1) is open on load too", async ({ page, context, baseURL }) => {
      await context.addCookies([{ name: "evoli_fixture_unbindable_day", value: LINA, url: baseURL! }]);
      await signInThroughForm(page, { lang });
      await page.goto(`/clients/${LINA}/routine`);
      await expectStates(page, lang, [true, false, true], "unbindable on day 3");
      const carry = dayGroup(page, lang, 3).getByRole("group", { name: "Zercher Carry", exact: true });
      await expect(carry.getByText(L[lang].notInCatalogue, { exact: true })).toBeVisible();
    });

    test("F2.3: a value typed on a day survives its collapse, stays unsaved, and a save sends it", async ({ page }) => {
      page.on("dialog", (dialog) => dialog.accept());
      await signInThroughForm(page, { lang });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/clients/${LINA}/routine`);
      await checkNothingLost(page, lang, "Chromium");
    });

    test("F2.3: a closed day's validation problem is still in the « pas encore prêt » list", async ({ page }) => {
      page.on("dialog", (dialog) => dialog.accept());
      await signInThroughForm(page, { lang });
      await page.goto(`/clients/${LINA}/routine`);
      await checkProblemListed(page, lang, "Chromium");
    });

    test("a publish re-seeds the document and leaves the coach's open days open (day 6 at 390)", async ({
      page,
      context,
      baseURL,
    }) => {
      await context.addCookies([{ name: "evoli_fixture_long_plan", value: YUSUF, url: baseURL! }]);
      await signInThroughForm(page, { lang });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/clients/${YUSUF}/routine`);
      await expectStates(page, lang, [true, false, false, false, false, false], "long plan on load");
      await setOpen(header(page, lang, 6), true);
      const sets = dayGroup(page, lang, 6).getByRole("group", { name: "Goblet Squat", exact: true }).getByLabel(L[lang].sets, { exact: true });
      await sets.fill("5");
      await expect(page.getByText(L[lang].unsaved, { exact: true })).toBeVisible();
      const bar = page.getByRole("region", { name: L[lang].region, exact: true });
      await bar.getByRole("button", { name: L[lang].publish, exact: true }).click();
      await page.getByRole("dialog").getByRole("button", { name: L[lang].publish, exact: true }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(page.getByText(L[lang].published)).toBeVisible();
      // The re-seed remounted the editor (BUG-490's `loads`); the open days are the parent's.
      await expectStates(page, lang, [true, false, false, false, false, true], "after the publish");
      await expect(sets).toHaveValue("5");
    });

    test("F2.4: the same accordions on /templates/{id} and /templates/new", async ({ page }) => {
      page.on("dialog", (dialog) => dialog.accept());
      await signInThroughForm(page, { lang });
      await page.setViewportSize({ width: 1440, height: 900 });
      await checkTemplate(page, lang, "Chromium");
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`/templates/${UPPER_LOWER}`);
        await expect(header(page, lang, 2)).toBeVisible();
        await shot(page, `template-${lang}-${width}`);
      }
    });

    test("F2.5: no « Tout déplier » / expand-all control on either editor", async ({ page }) => {
      await signInThroughForm(page, { lang });
      for (const path of [`/clients/${LINA}/routine`, `/templates/${UPPER_LOWER}`, "/templates/new"]) {
        await page.goto(path);
        await expect(header(page, lang, 2)).toHaveCount(1);
        await expect(
          page.getByRole("button", { name: /tout (dé|re)plier|(expand|collapse|open|close) all/i }),
          path
        ).toHaveCount(0);
      }
    });
  });
}

/* ═══ The same ACs in real WebKit ═════════════════════════════════════════════════════ */

test.describe("EV-337f2 WebKit", () => {
  let browser: Browser;
  test.beforeAll(async () => {
    expect(existsSync(webkit.executablePath()), "WebKit is not installed: npx playwright install webkit").toBe(true);
    browser = await webkit.launch();
  });
  test.afterAll(async () => {
    await browser?.close();
  });

  for (const lang of ["en", "fr"] as const) {
    test(`WebKit (${lang}): F2.1 control and 44 px at 390, F2.2 open on load, F2.3 nothing lost, F2.4 templates`, async ({
      baseURL,
    }) => {
      const context = await browser.newContext({
        baseURL,
        locale: LOCALE[lang],
        extraHTTPHeaders: { "Accept-Language": LOCALE[lang] },
      });
      const page = await context.newPage();
      page.on("dialog", (dialog) => dialog.accept());
      await signInThroughForm(page, { lang, landing: `${baseURL}/` });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/clients/${LINA}/routine`);
      await expectStates(page, lang, [true, false, false], "WebKit on load");
      for (const n of [1, 2, 3]) {
        const box = await header(page, lang, n).boundingBox();
        expect(box!.height, `WebKit day ${n} header at 390: ≥ 44 px`).toBeGreaterThanOrEqual(44);
      }
      await checkControl(page, lang, "WebKit");
      await checkNothingLost(page, lang, "WebKit");
      await checkProblemListed(page, lang, "WebKit");
      await checkTemplate(page, lang, "WebKit");
      await context.close();
    });
  }

  test("WebKit: an unbindable exercise on day 3 opens day 3 on load", async ({ baseURL }) => {
    const context = await browser.newContext({ baseURL, locale: "en-US", extraHTTPHeaders: { "Accept-Language": "en-US" } });
    await context.addCookies([{ name: "evoli_fixture_unbindable_day", value: LINA, url: baseURL! }]);
    const page = await context.newPage();
    await signInThroughForm(page, { lang: "en", landing: `${baseURL}/` });
    await page.goto(`/clients/${LINA}/routine`);
    await expectStates(page, "en", [true, false, true], "WebKit unbindable on day 3");
    await context.close();
  });
});
