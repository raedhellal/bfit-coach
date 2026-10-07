import { expect, type Page } from "@playwright/test";
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

  async function setUp(page: Page, failures: number) {
    const login = await page.request.post("/api/auth/login", {
      data: { email: "coach@evoli.fit", password: "Password123!" },
      maxRedirects: 0,
    });
    expect(login.status()).toBe(200);
    const seen = { failed: 0, documents: 0 };
    await page.route("**/_next/static/chunks/**", async (route) => {
      const response = await route.fetch();
      const body = await response.text();
      if (seen.failed < failures && body.includes(FR_PROBE)) {
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
});
