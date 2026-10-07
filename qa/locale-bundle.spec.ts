import { existsSync } from "node:fs";
import { expect, webkit, type BrowserContext, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";

/**
 * EV-342m (audit A19) — only the coach's language ships to the browser.
 *
 * Until this slice `CopyProvider` (root layout, every signed-in page) imported both
 * dictionaries statically, so every page's JavaScript carried English AND French. Now
 * each dictionary is its own chunk, fetched by `import()` for the page's language only.
 *
 * The witness is what the browser actually downloads: every JavaScript response a page
 * load receives, searched for one probe per dictionary. Each probe is a dictionary VALUE
 * that appears nowhere else in `src/` (not in a comment either: `next dev` serves client
 * modules with their comments), so finding it means that dictionary was shipped:
 *   · English: "Add a client" (`copy.ts`, the roster's add-client button);
 *   · French: "Ouvrir le plan" (`copy.fr.ts`, the overview's programme card).
 * The story's own pair (« Ajouter un client » / "Add a client") is checked on the
 * production build's chunks in the merge record: « Ajouter un client » also appears in
 * code comments, which `next dev` ships and `next build` strips.
 *
 * M.3 (the switch still changes every string) and M.4 (key parity) are the existing
 * `coach-i18n.spec.ts` / `coach-french.spec.ts` / `pro-shell.spec.ts` tests, unchanged.
 */

const EN_PROBE = "Add a client";
const FR_PROBE = "Ouvrir le plan";

/** Every JavaScript body the page receives while `load` runs. */
async function javascriptDuring(page: Page, load: () => Promise<unknown>): Promise<string[]> {
  const bodies: Promise<string>[] = [];
  const onResponse = (response: import("@playwright/test").Response) => {
    const type = response.headers()["content-type"] ?? "";
    if (/javascript/.test(type) || /\.js(\?|$)/.test(new URL(response.url()).pathname)) {
      bodies.push(response.text().catch(() => ""));
    }
  };
  page.on("response", onResponse);
  try {
    await load();
    await page.waitForLoadState("networkidle");
  } finally {
    page.off("response", onResponse);
  }
  return Promise.all(bodies);
}

function shipped(bodies: string[], probe: string): boolean {
  return bodies.some((body) => body.includes(probe));
}

test.describe("a French page", () => {
  test.use({ locale: "fr-FR" });

  test("loads the French dictionary and not the English one (M.2)", async ({ page, context }) => {
    await signInThroughForm(page, { lang: "fr" });
    // A fresh document load with an empty cache: every chunk the page needs is fetched.
    await context.clearCookies({ name: "evoli_pro_locale" });
    const bodies = await javascriptDuring(page, () => page.goto("/", { waitUntil: "load" }));
    await expect(page.getByRole("button", { name: "Ajouter un client" })).toBeVisible();
    expect(shipped(bodies, FR_PROBE), "the French dictionary was downloaded").toBe(true);
    expect(shipped(bodies, EN_PROBE), "the English dictionary was NOT downloaded").toBe(false);
  });
});

test.describe("an English page", () => {
  test.use({ locale: "en-US" });

  test("loads the English dictionary and not the French one (M.2)", async ({ page }) => {
    await signInThroughForm(page);
    const bodies = await javascriptDuring(page, () => page.goto("/", { waitUntil: "load" }));
    await expect(page.getByRole("button", { name: "Add a client" })).toBeVisible();
    expect(shipped(bodies, EN_PROBE), "the English dictionary was downloaded").toBe(true);
    expect(shipped(bodies, FR_PROBE), "the French dictionary was NOT downloaded").toBe(false);
  });
});

test.describe("the switch", () => {
  test.use({ locale: "fr-FR" });

  test("FR → EN fetches English once and every client string changes; nothing falls back", async ({ page }) => {
    await signInThroughForm(page, { lang: "fr" });
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Ajouter un client" })).toBeVisible();

    const bodies = await javascriptDuring(page, async () => {
      await page.getByRole("radiogroup", { name: "Langue" }).getByRole("radio", { name: /^EN/ }).check();
      // A client island's string (the add-client button) and a server string (the h1).
      await expect(page.getByRole("button", { name: "Add a client" })).toBeVisible();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Roster");
    });
    expect(shipped(bodies, EN_PROBE), "the English dictionary arrived with the switch").toBe(true);
    await expect(page.getByRole("button", { name: "Ajouter un client" })).toHaveCount(0);
  });
});

test.describe("a dictionary chunk that fails to load", () => {
  /**
   * Staff should-fix on 4c48ba0. The provider sits in the ROOT layout, above
   * `app/error.tsx`, so a failed dictionary fetch (a deploy since the tab loaded: the old
   * hashed chunk is gone) used to end on Next's bare "Application error". Now the page
   * reloads ONCE, guarded by a sessionStorage flag so a chunk that keeps failing cannot
   * loop. The French chunk is recognised by its content (the probe), so this works on any
   * build's chunk names. Enabling `page.route` disables the HTTP cache, so every load
   * really asks for it.
   */
  test.use({ locale: "fr-FR" });

  async function setUp(page: Page, failures: number, probe: string = FR_PROBE) {
    const login = await page.request.post("/api/auth/login", {
      data: { email: "coach@evoli.fit", password: "Password123!" },
      maxRedirects: 0,
    });
    expect(login.status()).toBe(200);
    const seen = { failed: 0, documents: 0 };
    await page.route("**/_next/static/chunks/**", async (route) => {
      const response = await route.fetch();
      const body = await response.text();
      if (seen.failed < failures && body.includes(probe)) {
        seen.failed += 1;
        await route.fulfill({ status: 404, body: "" });
        return;
      }
      await route.fulfill({ response, body });
    });
    page.on("request", (request) => {
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) seen.documents += 1;
    });
    return seen;
  }

  test("a 404 once: one reload, then a working French page", async ({ page }) => {
    const seen = await setUp(page, 1);
    await page.goto("/");
    await expect(page.locator("[data-nav-progress-ready]"), "the page hydrated").toHaveCount(1);
    await expect(page.getByRole("button", { name: "Ajouter un client" })).toBeVisible();
    expect(seen).toEqual({ failed: 1, documents: 2 });
    // The flag is cleared by the dictionary that loaded, so a later deploy can reload again.
    expect(await page.evaluate(() => window.sessionStorage.getItem("evoli.copy.reloaded"))).toBeNull();
  });

  test("a 404 every time: exactly one reload, never a loop", async ({ page }) => {
    const seen = await setUp(page, Number.POSITIVE_INFINITY);
    await page.goto("/");
    await expect.poll(() => seen.documents).toBe(2);
    // Long enough for a third load to have started if the guard did not hold.
    await page.waitForTimeout(3_000);
    expect(seen.documents).toBe(2);
    expect(await page.evaluate(() => window.sessionStorage.getItem("evoli.copy.reloaded"))).toBe("1");
  });

  test("M.6: the English chunk fails once during the FR → EN switch: one reload, then the page in English", async ({
    page,
  }) => {
    const seen = await setUp(page, 1, EN_PROBE);
    await page.goto("/");
    await expect(page.locator("[data-nav-progress-ready]"), "the French page hydrated").toHaveCount(1);
    await expect(page.getByRole("button", { name: "Ajouter un client" })).toBeVisible();
    expect(seen).toEqual({ failed: 0, documents: 1 });

    await page.getByRole("radiogroup", { name: "Langue" }).getByRole("radio", { name: /^EN/ }).check();
    // The switch asked for the English chunk, it 404'd, the page reloaded once, and the
    // server drew the reload in English (the locale cookie was already set).
    await expect(page.getByRole("button", { name: "Add a client" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Roster");
    await expect(page.locator("[data-nav-progress-ready]"), "the English page hydrated").toHaveCount(1);
    expect(seen).toEqual({ failed: 1, documents: 2 });
    expect(await page.evaluate(() => window.sessionStorage.getItem("evoli.copy.reloaded"))).toBeNull();
  });

  /**
   * BUG-703 — QA's repro: unsaved work on /nutrition-templates/new, the English chunk 404s
   * once, the coach switches to EN. Before the fix the one-time reload raised "Leave site?";
   * "Stay" (a dismissed dialog) left a render suspended for good, and the next navigation
   * never finished. Every native dialog is dismissed here, which is "Stay".
   *
   * EV-349 349.3 (BUG-703 Expected (6)'s spec half, moved): besides "the URL reaches
   * /recipes and the progress bar stops", this asserts
   *   (1) « Quitter sans enregistrer » lands on /recipes WITH its h1 shown, within 5 s of the
   *       click;
   *   (3) after the abandoned switch, on /nutrition-templates/new and on the next page reached
   *       in-app, the h1 and the side-nav labels are in ONE language and the switch's checked
   *       option is that language;
   *   (4) « EN » again (the chunk now served) switches in place (or offers the reload again),
   *       and the tab still navigates.
   * Chromium (the config's project) and WebKit (launched here, as focus-clear-of-bars does).
   * Mutant: `hasUnsavedWork` → `return false` turns it red in both (the reload is attempted,
   * "Stay" is answered, and the abandon sentence never comes).
   */
  const NAV_FR = ["Clients", "Modèles", "Recettes", "Modèles nutrition", "Défis"];
  const NAV_EN = ["Roster", "Templates", "Recipes", "Nutrition templates", "Challenges"];

  /** h1, nav labels and the checked radio, all in `lang`. */
  async function expectOneLanguage(page: Page, lang: "fr" | "en", h1: string, where: string) {
    await expect(page.locator("html"), `${where}: html lang`).toHaveAttribute("lang", lang);
    await expect(page.getByRole("heading", { level: 1 }), `${where}: the h1`).toHaveText([h1]);
    const nav = page.getByRole("navigation", { name: lang === "fr" ? "Portail" : "Portal" });
    await expect(nav.getByRole("link"), `${where}: the side-nav labels`).toHaveText(lang === "fr" ? NAV_FR : NAV_EN);
    const switcher = page.getByRole("radiogroup", { name: lang === "fr" ? "Langue" : "Language" });
    await expect(switcher.getByRole("radio", { name: lang === "fr" ? /^FR/ : /^EN/ }), `${where}: checked`).toBeChecked();
    await expect(switcher.getByRole("radio", { name: lang === "fr" ? /^EN/ : /^FR/ })).not.toBeChecked();
  }

  async function refusedReload(page: Page, context: BrowserContext) {
    const seen = await setUp(page, 1, EN_PROBE);
    const prompts: string[] = [];
    page.on("dialog", (dialog) => {
      prompts.push(dialog.type());
      void dialog.dismiss();
    });
    await page.goto("/nutrition-templates/new");
    await expect(page.locator("[data-nav-progress-ready]")).toHaveCount(1);
    await page.getByLabel("Nom du modèle").fill("Sèche 1800");

    const languages = page.getByRole("radiogroup", { name: "Langue" });
    await languages.getByRole("radio", { name: /^EN/ }).check();
    // The switch is abandoned, said, and undone: French on screen, FR checked, cookie back.
    await expect(page.getByText("La langue n'a pas pu être changée. Réessayez.").first()).toBeVisible();
    await expect(page.getByLabel("Nom du modèle")).toHaveValue("Sèche 1800");
    const localeCookie = (await context.cookies()).find((c) => c.name === "evoli_pro_locale");
    expect(localeCookie?.value).toBe("fr");
    // (3) on the page where it happened.
    await expectOneLanguage(page, "fr", "Nouveau modèle nutrition", "/nutrition-templates/new after the abandon");

    // (1) The tab still navigates: the in-app guard asks, and leaving lands, h1 shown, in 5 s.
    await page.getByRole("link", { name: "Recettes" }).first().click();
    const leave = page.getByRole("dialog").getByRole("button", { name: "Quitter sans enregistrer" });
    await expect(leave).toBeVisible();
    const clicked = Date.now();
    await leave.click();
    await page.waitForURL(/\/recipes$/, { timeout: 5_000 });
    await expect(page.getByRole("heading", { level: 1, name: "Recettes" })).toBeVisible({
      timeout: Math.max(1, 5_000 - (Date.now() - clicked)),
    });
    expect(Date.now() - clicked, "« Quitter sans enregistrer » to the /recipes h1").toBeLessThanOrEqual(5_000);
    await expect(page.locator('[data-nav-progress="visible"]'), "the progress bar stopped").toHaveCount(0);
    // (3) on the next page reached in-app.
    await expectOneLanguage(page, "fr", "Recettes", "/recipes after the abandon");

    // (4) EN again, the chunk now served: English in place, no reload, no prompt.
    await page.getByRole("radiogroup", { name: "Langue" }).getByRole("radio", { name: /^EN/ }).check();
    await expectOneLanguage(page, "en", "Recipes", "/recipes after EN again");
    expect((await context.cookies()).find((c) => c.name === "evoli_pro_locale")?.value).toBe("en");
    // ...and the tab still navigates afterwards.
    await page.getByRole("navigation", { name: "Portal" }).getByRole("link", { name: "Challenges", exact: true }).click();
    await page.waitForURL(/\/challenges$/, { timeout: 5_000 });
    await expectOneLanguage(page, "en", "Challenges", "/challenges, reached in-app after EN");

    expect(prompts, "no native Leave-site prompt").toEqual([]);
    expect(seen).toEqual({ failed: 1, documents: 1 });
  }

  /**
   * 349.3 (4) where the work is still unsaved (staff's probe `zz-staff-703.spec.ts.probe`,
   * its first test): after the abandon, « EN » again on the SAME page, the chunk now served,
   * switches in place and keeps what was typed; then the tab still navigates.
   */
  async function enAgainOverUnsavedWork(page: Page, context: BrowserContext) {
    const seen = await setUp(page, 1, EN_PROBE);
    const prompts: string[] = [];
    page.on("dialog", (dialog) => {
      prompts.push(dialog.type());
      void dialog.dismiss();
    });
    await page.goto("/nutrition-templates/new");
    await expect(page.locator("[data-nav-progress-ready]")).toHaveCount(1);
    await page.getByLabel("Nom du modèle").fill("Sèche 1800");
    await page.getByRole("radiogroup", { name: "Langue" }).getByRole("radio", { name: /^EN/ }).check();
    await expect(page.getByText("La langue n'a pas pu être changée. Réessayez.").first()).toBeVisible();
    await expectOneLanguage(page, "fr", "Nouveau modèle nutrition", "/nutrition-templates/new after the abandon");

    await page.getByRole("radiogroup", { name: "Langue" }).getByRole("radio", { name: /^EN/ }).check();
    await expectOneLanguage(page, "en", "New nutrition template", "/nutrition-templates/new after EN again");
    await expect(page.getByLabel("Template name")).toHaveValue("Sèche 1800");
    expect((await context.cookies()).find((c) => c.name === "evoli_pro_locale")?.value).toBe("en");

    await page.getByRole("navigation", { name: "Portal" }).getByRole("link", { name: "Recipes", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Leave without saving" }).click();
    await page.waitForURL(/\/recipes$/, { timeout: 5_000 });
    await expectOneLanguage(page, "en", "Recipes", "/recipes, reached in-app after EN again");
    expect(prompts, "no native Leave-site prompt").toEqual([]);
    expect(seen).toEqual({ failed: 1, documents: 1 });
  }

  test("349.3 (4): « EN » again over the still-unsaved work switches in place and keeps it", async ({
    page,
    context,
  }) => {
    await enAgainOverUnsavedWork(page, context);
  });

  test("349.3 (4) in WebKit", async ({ baseURL }) => {
    expect(existsSync(webkit.executablePath()), "WebKit is not installed: npx playwright install webkit").toBe(true);
    const browser = await webkit.launch();
    try {
      const context = await browser.newContext({ baseURL, locale: "fr-FR" });
      await enAgainOverUnsavedWork(await context.newPage(), context);
      await context.close();
    } finally {
      await browser.close();
    }
  });

  test("BUG-703: the switch's chunk fails over unsaved work — no prompt, the switch is abandoned, the tab keeps working", async ({
    page,
    context,
  }) => {
    await refusedReload(page, context);
  });

  test("BUG-703 / 349.3 in WebKit: the same refused reload", async ({ baseURL }) => {
    expect(existsSync(webkit.executablePath()), "WebKit is not installed: npx playwright install webkit").toBe(true);
    const browser = await webkit.launch();
    try {
      const context = await browser.newContext({ baseURL, locale: "fr-FR" });
      await refusedReload(await context.newPage(), context);
      await context.close();
    } finally {
      await browser.close();
    }
  });
});
