import { expect, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { isProductionBuild } from "./production-build";
import { launch, setSwitch, signedInContext, type Engine } from "./start-build";

/**
 * EV-356g (F6) — the library pages stop waiting on the roster read for their client picker.
 *
 * Production 2026-10-11 (1d655a4, Raed's browser): `/templates` 7.3–8.1 s, `/nutrition-templates`
 * and `/challenges` 8.08 s, `/recipes` (no roster read) about 0.7 s. `GET /coach-portal/clients`
 * took ≥ 8 s and hit `API_READ_TIMEOUT_MS`. The three pages awaited it only to fill a picker.
 *
 * `next start`, populated fixture, `evoli_fixture_roster_delay=2000` (this row's switch: it holds
 * `listClients` and nothing else). Chromium and WebKit, launched here (`playwright.start.config.ts`).
 *
 *   G.1 (staff's probe P4) — the three pages paint their lists in under 500 ms;
 *   G.2 — a picker opened before the roster answers shows a loading line inside the dialog,
 *         then the client list;
 *   G.3 — with the dialog closed, a rename settles in under 500 ms;
 *   G.4 — a failed roster read never takes the library down and never says the coach has no
 *         clients: BUG-738's sentence, as an alert, on all three pickers. /nutrition-templates used
 *         to say « Fermez cette fenêtre et réessayez. », untrue (closing re-reads nothing); retired
 *         by the coordinator under Raed's product delegation, 2026-10-11.
 *
 * Two ways in (`Arrival`): a DOCUMENT load of the URL, and a CLIENT navigation by the sidebar
 * link from `/recipes` (no roster read), the usual way in. Every timing is read IN THE PAGE
 * (`performance.now()`, from the navigation's start or from the click), so the runner's own
 * latency is not in it. Each timing carries a witness that the hold was real: the document's, the
 * RSC fetch's or the action's response ends ≥ 1.9 s after it started (Resource/Navigation Timing).
 * Without that witness a green G.1 could be a switch that holds nothing.
 *
 * Sentences are literals, never imports from `src/lib/copy*.ts`.
 *
 * Red on cf50637 (1d655a4 + this row's fixture switch, pages unchanged): G.1 paints at ≥ 2 s, G.2
 * never sees the loading line (the page arrives with the roster), G.3 settles at ≥ 2 s.
 */

const DELAY_MS = 2_000;
/** The hold, minus scheduling slack: a response that ends earlier was not held. */
const HELD_MS = 1_900;
const BUDGET_MS = 500;

type Lang = "en" | "fr";
type PageKey = "templates" | "nutrition" | "challenges";

const LOADING = { en: "Loading your clients…", fr: "Chargement de vos clients…" } as const;
const BOUNDARY = { en: "Something went wrong.", fr: "Une erreur est survenue." } as const;

interface LibraryPage {
  path: string;
  /** CSS for the first list row: the thing G.1 says is painted. */
  listRow: string;
  opener: (page: Page, lang: Lang) => Locator;
  dialogName: Record<Lang, string>;
  /** The client list once the roster has answered: names, in any order. */
  offered: (dialog: Locator) => Promise<string[]>;
  expectedOffered: string[];
  /** The control that acts on the pick: disabled while there is nobody to pick. */
  act: Record<Lang, string>;
  failed: Record<Lang, string>;
  /** How the failure is announced: an alert in the template pickers, the fieldset's status line in the challenge dialog. */
  failedRole: "alert" | "status";
  /** A failure sentence this picker must no longer say (EV-356g: the nutrition picker's untrue one). */
  retired?: Record<Lang, string>;
  none: Record<Lang, string>;
}

const PAGES: Record<PageKey, LibraryPage> = {
  templates: {
    path: "/templates",
    listRow: 'ul.tpl-list [role="group"][aria-label="Upper / Lower split"]',
    opener: (page, lang) =>
      page
        .getByRole("group", { name: "Upper / Lower split", exact: true })
        .getByRole("button", { name: lang === "en" ? "Use on a trainee" : "Appliquer à un client", exact: true }),
    dialogName: { en: "Use on a trainee", fr: "Appliquer à un client" },
    offered: (dialog) => dialog.locator("select option").evaluateAll((o) => o.map((x) => x.textContent?.trim() ?? "")),
    // ACTIVE + WORKOUTS (coach-library-apply.spec.ts AC3).
    expectedOffered: ["Lina M.", "Tobias R.", "Yusuf A."],
    act: { en: "Use this template", fr: "Appliquer" },
    failed: {
      en: "Your clients could not be loaded. Reload the page to try again.",
      fr: "Vos clients n'ont pas pu être chargés. Rechargez la page pour réessayer.",
    },
    failedRole: "alert",
    none: {
      en: "You have no trainees who have shared their workouts with you.",
      fr: "Aucun de vos clients n'a partagé ses séances avec vous.",
    },
  },
  nutrition: {
    path: "/nutrition-templates",
    listRow: '[role="group"][aria-label="Cut 1800"]',
    opener: (page, lang) =>
      page
        .getByRole("group", { name: "Cut 1800", exact: true })
        .getByRole("button", { name: lang === "en" ? "Use on a trainee" : "Utiliser pour un client", exact: true }),
    dialogName: { en: "Use on a trainee", fr: "Utiliser pour un client" },
    offered: (dialog) =>
      dialog.getByRole("list").getByRole("button").evaluateAll((b) => b.map((x) => x.textContent?.trim() ?? "")),
    // ACTIVE + NUTRITION (coach-nutrition-templates-apply.spec.ts AC3).
    expectedOffered: ["Lina M.", "Petra L.", "Tobias R."],
    act: { en: "", fr: "" },
    // EV-356g: BUG-738's sentence, as on the two other pickers (`retired` below must be gone).
    failed: {
      en: "Your clients could not be loaded. Reload the page to try again.",
      fr: "Vos clients n'ont pas pu être chargés. Rechargez la page pour réessayer.",
    },
    failedRole: "alert",
    retired: {
      en: "Your trainees could not be loaded. Close this and try again.",
      fr: "Vos clients n'ont pas pu être chargés. Fermez cette fenêtre et réessayez.",
    },
    none: {
      en: "You have no trainees who have shared their nutrition with you.",
      fr: "Aucun de vos clients n'a partagé sa nutrition avec vous.",
    },
  },
  challenges: {
    path: "/challenges",
    listRow: "ul.challenge-grid li[data-challenge-id]",
    opener: (page, lang) =>
      page.getByRole("button", { name: lang === "en" ? "New challenge" : "Nouveau défi", exact: true }),
    dialogName: { en: "New challenge", fr: "Nouveau défi" },
    offered: (dialog) =>
      dialog.getByRole("checkbox").evaluateAll((c) => c.map((x) => x.closest("label")?.textContent?.trim() ?? "")),
    // Every ACTIVE link: a STEPS invitation needs no data scope (EV-321b).
    expectedOffered: ["Lina M.", "Mara D.", "Petra L.", "Sara P.", "Tobias R.", "Yusuf A."],
    act: { en: "Create and invite", fr: "Créer et inviter" },
    failed: {
      en: "Your clients could not be loaded. Reload the page to try again.",
      fr: "Vos clients n'ont pas pu être chargés. Rechargez la page pour réessayer.",
    },
    failedRole: "status",
    none: {
      en: "You have no linked clients yet. Invite a client from the roster first.",
      fr: "Vous n'avez encore aucun client lié. Invitez d'abord un client depuis la liste des clients.",
    },
  },
};

/**
 * Records when `selector` first matches a box with height, at the next animation frame (the frame
 * that can paint it), into `window.__paintAt` (`performance.now()`). `null` = not yet.
 */
function paintWatcher(sel: string): void {
  const w = window as unknown as { __paintAt: number | null };
  w.__paintAt = null;
  let armed = false;
  const check = () => {
    if (armed || w.__paintAt !== null) return;
    const el = document.querySelector(sel);
    if (el && el.getBoundingClientRect().height > 0) {
      armed = true;
      requestAnimationFrame(() => {
        if (w.__paintAt === null) w.__paintAt = performance.now();
      });
    }
  };
  new MutationObserver(check).observe(document, { subtree: true, childList: true });
  check();
}

const paintAt = (page: Page) => page.evaluate(() => (window as unknown as { __paintAt: number | null }).__paintAt);

/**
 * When a fetch the page made (after `since`) finished, from the page's Resource Timing entry (it is
 * added when the body has ended). Playwright's `response.finished()` never settles for a streamed
 * RSC response in Chromium (witnessed: still pending 6 s after the stream ended), so the page's
 * own clock is the witness.
 */
async function fetchEndedAt(page: Page, path: string, rsc: boolean, since: number): Promise<number> {
  const read = () =>
    page.evaluate(
      ({ path, rsc, since }) => {
        const entries = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
        const entry = entries.find((e) => {
          const url = new URL(e.name);
          return e.startTime >= since && url.pathname === path && url.searchParams.has("_rsc") === rsc;
        });
        return entry ? entry.responseEnd : null;
      },
      { path, rsc, since }
    );
  await expect.poll(read, { timeout: 10_000 }).not.toBeNull();
  return (await read())!;
}

/** When the document's response ended, from navigation start (after `load`). */
async function documentEndedAt(page: Page): Promise<number> {
  await page.waitForLoadState("load");
  return page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    return nav ? nav.responseEnd : NaN;
  });
}

async function openContext(browser: Browser, baseURL: string, lang: Lang, fail = false): Promise<BrowserContext> {
  const context = await signedInContext(browser, baseURL, lang === "en" ? "en-US" : "fr-FR");
  // The language as the switch's cookie (a hand-made context inherits the runner's en-US).
  await setSwitch(context, baseURL, "evoli_pro_locale", lang);
  await setSwitch(context, baseURL, "evoli_fixture_roster_delay", String(DELAY_MS));
  if (fail) await setSwitch(context, baseURL, "evoli_fixture_roster", "fail");
  context.setDefaultTimeout(10_000);
  return context;
}

/**
 * How the coach arrives on the library, and the clock the timings are read on:
 *   · `document` — a load or reload of the URL; times from the navigation's start; "the roster
 *     answered" = the document's response end (the roster's promise is the stream's last chunk);
 *   · `client` — the sidebar link from `/recipes` (no roster read), hydrated: the usual way in;
 *     times from the click; "the roster answered" = the end of the page's RSC response.
 */
type Arrival = "document" | "client";

interface Arrived {
  /** In-page `performance.now()` at the arrival's start (0 for a document). */
  origin: number;
  /** In-page `performance.now()` when the roster's answer had arrived (awaits it). */
  rosterAnswered: () => Promise<number>;
}

async function arrive(page: Page, lib: LibraryPage, how: Arrival): Promise<Arrived> {
  if (how === "document") {
    await page.addInitScript(paintWatcher, lib.listRow);
    const res = await page.goto(lib.path, { waitUntil: "commit" });
    expect(res?.status(), `${lib.path} answers`).toBe(200);
    return { origin: 0, rosterAnswered: () => documentEndedAt(page) };
  }
  await page.goto("/recipes");
  await expect(page.locator("[data-nav-progress-ready]")).toHaveCount(1);
  expect(await isProductionBuild(page), "run playwright.start.config.ts (next start)").toBe(true);
  await page.evaluate(paintWatcher, lib.listRow);
  const origin = await page.evaluate(() => performance.now());
  await page.locator(`nav.shell-side-nav a[href="${lib.path}"]`).click();
  return {
    origin,
    rosterAnswered: () => fetchEndedAt(page, lib.path, true, origin),
  };
}

/** G.1 — the list is painted under the budget, and the roster's answer came after the hold. */
async function expectListPainted(page: Page, lib: LibraryPage, at: Arrived): Promise<number> {
  await expect(page.locator(lib.listRow).first()).toBeVisible();
  await expect.poll(() => paintAt(page)).not.toBeNull();
  const painted = (await paintAt(page))! - at.origin;
  expect(painted, `${lib.path}: list painted ${Math.round(painted)} ms after the arrival began`).toBeLessThan(BUDGET_MS);
  return painted;
}

/** The witness that the hold was real: the roster's answer arrived ≥ 1.9 s after the arrival began. */
async function expectRosterHeld(at: Arrived): Promise<number> {
  const answered = (await at.rosterAnswered()) - at.origin;
  expect(answered, "the roster's answer arrives after its 2 s hold").toBeGreaterThanOrEqual(HELD_MS);
  return answered;
}

/** Opens the picker the moment the island can answer a click, before the roster has answered. */
async function openPickerEarly(page: Page, lib: LibraryPage, lang: Lang): Promise<Locator> {
  await expect(page.locator("[data-nav-progress-ready]")).toHaveCount(1);
  const dialog = page.getByRole("dialog", { name: lib.dialogName[lang], exact: true });
  await expect(async () => {
    if (!(await dialog.isVisible())) await lib.opener(page, lang).click({ timeout: 1_000 });
    await expect(dialog).toBeVisible({ timeout: 500 });
  }).toPass({ timeout: 5_000 });
  return dialog;
}

/**
 * WebKit runs a page's async scripts only once the document has finished streaming (witnessed
 * 2026-10-11 on a bare node server: an async script in <head> had not run 800 ms into a held
 * document in WebKit, and ran at 10 ms in Chromium). The library's HTML paints at once, but in
 * WebKit the page hydrates when the roster's answer ends the document, so no click can reach the
 * picker before it on a DOCUMENT load. G.2 and G.4 therefore open the picker after a client
 * navigation in both engines (the usual way in), and after a document load in Chromium as well.
 */
const PICKER_ARRIVALS: Record<Engine, Arrival[]> = { chromium: ["client", "document"], webkit: ["client"] };

for (const engine of ["chromium", "webkit"] as Engine[]) {
  test.describe(`EV-356g, ${engine}`, () => {
    let browser: Browser;
    test.beforeAll(async () => {
      browser = await launch(engine);
    });
    test.afterAll(async () => {
      await browser?.close();
    });

    for (const key of ["templates", "nutrition", "challenges"] as PageKey[]) {
      const lib = PAGES[key];

      for (const how of ["document", "client"] as Arrival[]) {
        test(`G.1 ${lib.path} (${how}): with the roster held 2 s, the list paints in under 500 ms`, async ({ baseURL }) => {
          const context = await openContext(browser, baseURL!, "en");
          const page = await context.newPage();
          try {
            const at = await arrive(page, lib, how);
            const painted = await expectListPainted(page, lib, at);
            const answered = await expectRosterHeld(at);
            test.info().annotations.push({
              type: `G.1 ${engine} ${how} ${lib.path}`,
              description: `list painted ${Math.round(painted)} ms, roster answered ${Math.round(answered)} ms`,
            });
          } finally {
            await context.close();
          }
        });
      }

      for (const how of PICKER_ARRIVALS[engine]) {
        test(`G.2 ${lib.path} (${how}): the picker opened before the roster answers says it is loading, then lists the clients`, async ({
          baseURL,
        }) => {
          const context = await openContext(browser, baseURL!, "en");
          const page = await context.newPage();
          try {
            const at = await arrive(page, lib, how);
            await expect(page.locator(lib.listRow).first()).toBeVisible();
            const dialog = await openPickerEarly(page, lib, "en");
            const loading = dialog.getByRole("status").filter({ hasText: LOADING.en });
            await expect(loading).toHaveText(LOADING.en);
            const seenAt = (await page.evaluate(() => performance.now())) - at.origin;
            if (lib.act.en) await expect(dialog.getByRole("button", { name: lib.act.en, exact: true })).toBeDisabled();
            await expect(dialog.getByText(lib.none.en, { exact: false })).toHaveCount(0);
            await expect(dialog.getByText(lib.failed.en, { exact: false })).toHaveCount(0);

            // Then the list, and the loading line is gone.
            await expect.poll(() => lib.offered(dialog).then((names) => [...names].sort())).toEqual(lib.expectedOffered);
            await expect(dialog.getByText(LOADING.en, { exact: false })).toHaveCount(0);
            if (key === "templates") await expect(dialog.getByRole("button", { name: lib.act.en, exact: true })).toBeEnabled();
            // The witness: the loading line was on screen BEFORE the roster's answer arrived.
            const answered = await expectRosterHeld(at);
            expect(seenAt, `loading line seen at ${Math.round(seenAt)} ms, roster answered at ${Math.round(answered)} ms`).toBeLessThan(
              answered
            );
            test.info().annotations.push({
              type: `G.2 ${engine} ${how} ${lib.path}`,
              description: `loading line at ${Math.round(seenAt)} ms, roster answered ${Math.round(answered)} ms`,
            });
          } finally {
            await context.close();
          }
        });

        test(`G.4 ${lib.path} (${how}): a failed roster read (held, then 500) leaves the library up and never says "no clients"`, async ({
          baseURL,
        }) => {
          for (const lang of ["en", "fr"] as Lang[]) {
            const context = await openContext(browser, baseURL!, lang, true);
            const page = await context.newPage();
            try {
              const at = await arrive(page, lib, how);
              await expectListPainted(page, lib, at);
              const dialog = await openPickerEarly(page, lib, lang);
              // Held: the loading line, never the failure before it has happened.
              await expect(dialog.getByText(LOADING[lang], { exact: true })).toBeVisible();
              await expect(dialog.getByRole(lib.failedRole).filter({ hasText: lib.failed[lang] })).toHaveText(lib.failed[lang]);
              if (lib.retired) await expect(dialog.getByText(lib.retired[lang], { exact: false })).toHaveCount(0);
              // "Close this and try again" is the retired sentence's half: no picker says it.
              await expect(dialog.getByText(/Close this and try again|Fermez cette fenêtre/)).toHaveCount(0);
              await expect(dialog.getByText(LOADING[lang], { exact: false })).toHaveCount(0);
              await expect(dialog.getByText(lib.none[lang], { exact: false })).toHaveCount(0);
              if (lib.act[lang]) await expect(dialog.getByRole("button", { name: lib.act[lang], exact: true })).toBeDisabled();
              await expectRosterHeld(at);
              // The library is still there, and no error boundary replaced it.
              await expect(page.locator(lib.listRow).first()).toBeVisible();
              await expect(page.getByText(BOUNDARY[lang], { exact: false })).toHaveCount(0);
            } finally {
              await context.close();
            }
          }
        });
      }
    }

    const RENAME = {
      templates: {
        row: "Legacy strength",
        open: async (page: Page, row: Locator) => {
          const more = row.getByRole("button", { name: "More actions", exact: true });
          await expect(async () => {
            if ((await more.getAttribute("aria-expanded")) !== "true") await more.click({ timeout: 1_000 });
            await expect(more).toHaveAttribute("aria-expanded", "true", { timeout: 500 });
          }).toPass({ timeout: 5_000 });
          await row.getByRole("button", { name: "Rename", exact: true }).click();
        },
      },
      nutrition: {
        row: "Lean 1300",
        open: async (_page: Page, row: Locator) => {
          await row.getByRole("button", { name: "Rename", exact: true }).click();
        },
      },
    } as const;

    for (const key of ["templates", "nutrition"] as const) {
      const lib = PAGES[key];
      const r = RENAME[key];

      test(`G.3 ${lib.path}: with the dialog closed and the roster held, a rename settles in under 500 ms`, async ({
        baseURL,
      }) => {
        const context = await openContext(browser, baseURL!, "en");
        const page = await context.newPage();
        try {
          await page.goto(lib.path);
          await expect(page.locator("[data-nav-progress-ready]")).toHaveCount(1);
          const renamed = `G3 ${engine} ${key}`;
          const row = page.getByRole("group", { name: r.row, exact: true });
          await r.open(page, row);
          const dialog = page.getByRole("dialog", { name: "Rename template", exact: true });
          await dialog.getByLabel("Template name").fill(renamed);

          await page.evaluate((name: string) => {
            const w = window as unknown as { __clickAt: number | null; __settledAt: number | null };
            w.__clickAt = null;
            w.__settledAt = null;
            document.addEventListener(
              "click",
              (e) => {
                const b = (e.target as Element).closest("button");
                if (w.__clickAt === null && b?.closest('[role="dialog"]') && b.textContent?.trim() === "Rename") {
                  w.__clickAt = performance.now();
                }
              },
              true
            );
            const check = () => {
              if (w.__clickAt === null || w.__settledAt !== null) return;
              const there = Array.from(document.querySelectorAll('[role="group"]')).some(
                (g) => g.getAttribute("aria-label") === name
              );
              if (there && document.querySelector('[role="dialog"]') === null) w.__settledAt = performance.now();
            };
            new MutationObserver(check).observe(document.body, {
              subtree: true,
              childList: true,
              attributes: true,
              attributeFilter: ["aria-label", "role", "open"],
            });
          }, renamed);

          await dialog.getByRole("button", { name: "Rename", exact: true }).click();
          await expect(page.getByRole("group", { name: renamed, exact: true })).toBeVisible();
          await expect(page.getByRole("dialog")).toHaveCount(0);
          await expect
            .poll(() => page.evaluate(() => (window as unknown as { __settledAt: number | null }).__settledAt))
            .not.toBeNull();
          const { clickAt, settledAt } = await page.evaluate(() => {
            const w = window as unknown as { __clickAt: number; __settledAt: number };
            return { clickAt: w.__clickAt, settledAt: w.__settledAt };
          });
          // The witness: the action's response (the revalidated page) was itself held by the roster.
          const actionBody = Math.round((await fetchEndedAt(page, lib.path, false, clickAt)) - clickAt);
          expect(actionBody, "the action's response ends after the roster's 2 s hold").toBeGreaterThanOrEqual(HELD_MS);
          const took = settledAt - clickAt;
          test.info().annotations.push({
            type: `G.3 ${engine} ${lib.path}`,
            description: `rename settled ${Math.round(took)} ms after the click; action body ended ${actionBody} ms`,
          });
          expect(took, `${lib.path}: rename settled ${Math.round(took)} ms after the click`).toBeLessThan(BUDGET_MS);
        } finally {
          await context.close();
        }
      });
    }
  });
}
