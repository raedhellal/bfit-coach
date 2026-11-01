import { createRequire } from "node:module";
import { expect, test, type Locator, type Page, type Request } from "@playwright/test";
import { signInThroughForm } from "./sign-in";
import { freshCoach, PASSWORD, type Account } from "./notifications-live";
import { apiPreferences, apiPutPreferences, coachWhoTrains, emailValues } from "./notification-settings-live";

/**
 * EV-455k — the coach's notification settings page, AC-1 to AC-5 and the story's two edge cases,
 * against a REAL b-fit-api (`playwright.live.config.ts`), in English and in French. AC-6 is the
 * gates (lint, tsc, the existing suites). The rig is `qa/notification-settings-live.ts` on top of
 * EV-455f's `qa/notifications-live.ts`.
 *
 *   EV455F_PSQL='psql postgresql://bfit:bfit@127.0.0.1:5433/bfit' \
 *   COACH_LIVE_API_ORIGIN=http://localhost:8080 \
 *     npx playwright test --config playwright.live.config.ts qa/notification-settings.live.spec.ts --project=chromium
 *
 * Every test makes its OWN coach (a document never stored, so the api's defaults), so each value
 * is exact and the file re-runs on the same database. Expected sentences are LITERALS, never read
 * from `src/lib/copy.ts`.
 *
 * RED ON BASE (`main` 27b27b39): /settings/notifications is the portal's 404 there and the inbox
 * header has no « Réglages », so every test below fails at its first page assertion, except
 * AC-4's first step (signed out → /login), which the middleware's guard gives every path.
 */

const T = {
  en: {
    locale: "en-US",
    title: "Notification settings",
    inbox: "Notifications",
    settingsLink: "Settings",
    intro: "Notifications always stay in Evoli Pro. These settings only change emails.",
    switch: {
      CLIENT_MESSAGE: "Email when a client writes to you",
      CLIENT_JOINED: "Email when a client accepts your invitation",
      CLIENT_RED_FLAG: "Email when something needs a look",
      CLIENT_SESSION_COMPLETED: "Daily session summary (7 am)",
    },
    saveFailed: "The setting wasn't saved. Try again.",
    saved: "Saved",
    loadError: "Couldn't load your settings.",
    retry: "Try again",
  },
  fr: {
    locale: "fr-FR",
    title: "Réglages des notifications",
    inbox: "Notifications",
    settingsLink: "Réglages",
    intro: "Les notifications restent toujours visibles dans Evoli Pro. Ces réglages ne concernent que les e-mails.",
    switch: {
      CLIENT_MESSAGE: "E-mail quand un client vous écrit",
      CLIENT_JOINED: "E-mail quand un client accepte votre invitation",
      CLIENT_RED_FLAG: "E-mail quand un point est à vérifier",
      CLIENT_SESSION_COMPLETED: "Résumé quotidien des séances (7 h)",
    },
    saveFailed: "Le réglage n'a pas été enregistré. Réessayez.",
    saved: "Enregistré",
    loadError: "Impossible de charger vos réglages.",
    retry: "Réessayer",
  },
} as const;
type Lang = keyof typeof T;
const TYPES = ["CLIENT_MESSAGE", "CLIENT_JOINED", "CLIENT_RED_FLAG", "CLIENT_SESSION_COMPLETED"] as const;
type Type = (typeof TYPES)[number];

const BFF = "/api/bff/notification-preferences";
const PAGE = "/settings/notifications";

const switches = (page: Page): Locator => page.getByRole("switch");
const sw = (page: Page, lang: Lang, type: Type): Locator => page.getByRole("switch", { name: T[lang].switch[type], exact: true });
const item = (page: Page, type: Type): Locator => page.locator(`.prefs-item[data-type="${type}"]`);

async function signIn(page: Page, lang: Lang, coach: Account): Promise<void> {
  await signInThroughForm(page, { email: coach.email, password: PASSWORD, lang });
}

/** The page, read: no skeleton left (a bounded wait), and the read did not fail. */
async function openSettings(page: Page): Promise<void> {
  await page.goto(PAGE);
  await expect(page.locator('[data-prefs-state="loading"]')).toHaveCount(0, { timeout: 15_000 });
  await expect(page.locator('.prefs[data-prefs-state="ready"]')).toBeVisible();
}

/** Every PUT the PAGE sends to the BFF, with its body. */
function recordPuts(page: Page): { type: string; email: boolean }[] {
  const puts: { type: string; email: boolean }[] = [];
  page.on("request", (r: Request) => {
    if (r.method() === "PUT" && new URL(r.url()).pathname === BFF) puts.push(JSON.parse(r.postData() ?? "null"));
  });
  return puts;
}

/** The four switches' positions as drawn, by type. */
async function drawn(page: Page, lang: Lang): Promise<Record<Type, boolean>> {
  const out = {} as Record<Type, boolean>;
  for (const type of TYPES) out[type] = (await sw(page, lang, type).getAttribute("aria-checked")) === "true";
  return out;
}

const allOn = { CLIENT_MESSAGE: true, CLIENT_JOINED: true, CLIENT_RED_FLAG: true, CLIENT_SESSION_COMPLETED: true };

for (const lang of ["en", "fr"] as const) {
  const L = T[lang];

  test.describe(`EV-455k notification settings, live api, ${lang.toUpperCase()}`, () => {
    test.use({ locale: L.locale });
    test.describe.configure({ timeout: 120_000 });

    test(`AC-1 [${lang}]: from the inbox header « ${L.settingsLink} », four switches, all on for a new account, with the story's copy`, async ({ page, request }) => {
      const coach = await freshCoach(request);
      expect(emailValues(await apiPreferences(request, coach)), "a new coach: the api's defaults").toEqual(allOn);
      await signIn(page, lang, coach);

      await page.goto("/notifications");
      await page.getByRole("main").getByRole("link", { name: L.settingsLink, exact: true }).click();
      await expect(page).toHaveURL(/\/settings\/notifications$/);
      await expect(page.locator('[data-prefs-state="loading"]')).toHaveCount(0, { timeout: 15_000 });

      await expect(page.getByRole("heading", { level: 1, name: L.title, exact: true })).toBeVisible();
      await expect(page.getByText(L.intro, { exact: true })).toBeVisible();
      await expect(switches(page)).toHaveCount(4);
      // In the story's order, each named by its label, each on.
      const names = await switches(page).evaluateAll((els) => els.map((e) => document.getElementById(e.getAttribute("aria-labelledby") ?? "")?.textContent));
      expect(names).toEqual(TYPES.map((t) => L.switch[t]));
      for (const type of TYPES) await expect(sw(page, lang, type)).toHaveAttribute("aria-checked", "true");
      // Nothing about time zones or quiet hours on the page (ruling 2026-10-27 (ar)).
      await expect(page.locator(".prefs input, .prefs select, .prefs textarea")).toHaveCount(0);
      // And the way back.
      await page.getByRole("main").getByRole("link", { name: L.inbox, exact: true }).click();
      await expect(page).toHaveURL(/\/notifications$/);
    });

    test(`AC-2 [${lang}]: turning CLIENT_MESSAGE off sends ONE PUT; reload shows it off; the api has email=false and kept the rest`, async ({ page, request }) => {
      const coach = await freshCoach(request);
      // Values the page never edits, made non-default first, so "kept" is not "reset to defaults".
      await apiPutPreferences(request, coach, { timezone: "America/Montreal", quietHours: { start: "21:30", end: "06:45" } });
      await signIn(page, lang, coach);
      const puts = recordPuts(page);
      await openSettings(page);

      await sw(page, lang, "CLIENT_MESSAGE").click();
      await expect(sw(page, lang, "CLIENT_MESSAGE")).toHaveAttribute("aria-checked", "false");
      await expect(item(page, "CLIENT_MESSAGE").getByRole("status")).toHaveText(L.saved);
      await expect(item(page, "CLIENT_MESSAGE")).toHaveAttribute("data-save-state", "saved");
      expect(puts).toEqual([{ type: "CLIENT_MESSAGE", email: false }]);

      await page.reload();
      await expect(page.locator('.prefs[data-prefs-state="ready"]')).toBeVisible({ timeout: 15_000 });
      expect(await drawn(page, lang)).toEqual({ ...allOn, CLIENT_MESSAGE: false });
      expect(puts, "a reload sends nothing").toHaveLength(1);

      const stored = await apiPreferences(request, coach);
      expect(emailValues(stored)).toEqual({ ...allOn, CLIENT_MESSAGE: false });
      expect(stored.timezone).toBe("America/Montreal");
      expect(stored.quietHours).toEqual({ start: "21:30", end: "06:45" });
    });

    test(`AC-3 [${lang}]: a PUT failing (503) → the switch returns to its position and the save-failed alert shows`, async ({ page, request }) => {
      const coach = await freshCoach(request);
      await signIn(page, lang, coach);
      await openSettings(page);
      await page.route(`**${BFF}`, (route) =>
        route.request().method() === "PUT"
          ? route.fulfill({ status: 503, contentType: "application/json", body: '{"code":"UNAVAILABLE"}' })
          : route.continue()
      );

      const target = sw(page, lang, "CLIENT_JOINED");
      await target.click();
      const alert = item(page, "CLIENT_JOINED").getByRole("alert");
      await expect(alert).toHaveText(L.saveFailed);
      await expect(target).toHaveAttribute("aria-checked", "true");
      await expect(item(page, "CLIENT_JOINED")).toHaveAttribute("data-save-state", "failed");
      await expect(target).toHaveAccessibleDescription(L.saveFailed);
      // Told apart from a success by more than the look: no « saved », and the api unchanged.
      await expect(item(page, "CLIENT_JOINED").getByRole("status")).toHaveText("");
      expect(emailValues(await apiPreferences(request, coach))).toEqual(allOn);
      // The other switches are untouched and show no failure.
      await expect(page.getByRole("alert")).toHaveCount(1);
      await expect(target).toBeFocused();
      await runAxe(page, "a failed save");

      // « Réessayez »: the api answers again, a new toggle saves, and the alert goes.
      await page.unrouteAll();
      await target.click();
      await expect(item(page, "CLIENT_JOINED").getByRole("status")).toHaveText(L.saved);
      await expect(page.getByRole("alert")).toHaveCount(0);
      expect(emailValues(await apiPreferences(request, coach))).toEqual({ ...allOn, CLIENT_JOINED: false });
    });

    test(`AC-3 [${lang}], the read: a GET failing (503) → the load-error alert and « ${L.retry} », never four switches; the retry reads in place`, async ({ page, request }) => {
      const coach = await freshCoach(request);
      await signIn(page, lang, coach);
      await page.route(`**${BFF}`, (route) =>
        route.request().method() === "GET"
          ? route.fulfill({ status: 503, contentType: "application/json", body: '{"code":"UNAVAILABLE"}' })
          : route.continue()
      );
      await page.goto(PAGE);
      const error = page.locator('[data-prefs-state="error"]');
      await expect(error).toHaveAttribute("role", "alert");
      await expect(error.getByText(L.loadError, { exact: true })).toBeVisible();
      await expect(switches(page)).toHaveCount(0);
      await runAxe(page, "a failed read");

      await page.unrouteAll();
      await page.getByRole("button", { name: L.retry, exact: true }).click();
      await expect(switches(page)).toHaveCount(4);
      // The button left the page: focus is on the island's region, never on <body>.
      expect(await page.evaluate(() => document.activeElement?.classList.contains("prefs") ?? false)).toBe(true);
    });

    test(`AC-5 [${lang}]: each switch's accessible name is its label; Space toggles it; axe finds no violation`, async ({ page, request }) => {
      const coach = await freshCoach(request);
      await signIn(page, lang, coach);
      await openSettings(page);
      for (const type of TYPES) {
        const label = page.locator(`#pref-${type}-label`);
        await expect(label).toHaveText(L.switch[type]);
        await expect(page.locator(`#pref-${type}`)).toHaveAccessibleName(L.switch[type]);
        await expect(page.locator(`#pref-${type}`)).toHaveAttribute("role", "switch");
      }
      await runAxe(page, "the switches");

      // The keyboard: Space on the focused switch saves it, as a click does.
      const digest = sw(page, lang, "CLIENT_SESSION_COMPLETED");
      await digest.focus();
      await page.keyboard.press("Space");
      await expect(digest).toHaveAttribute("aria-checked", "false");
      await expect(item(page, "CLIENT_SESSION_COMPLETED").getByRole("status")).toHaveText(L.saved);
      // The label is a <label for>: a click on the words toggles the switch too.
      await page.locator("#pref-CLIENT_RED_FLAG-label").click();
      await expect(sw(page, lang, "CLIENT_RED_FLAG")).toHaveAttribute("aria-checked", "false");
      await expect(item(page, "CLIENT_RED_FLAG").getByRole("status")).toHaveText(L.saved);
      await runAxe(page, "two saved");
      expect(emailValues(await apiPreferences(request, coach))).toEqual({ ...allOn, CLIENT_SESSION_COMPLETED: false, CLIENT_RED_FLAG: false });
    });
  });
}

test.describe("EV-455k edge cases and AC-4, live api", () => {
  test.use({ locale: "en-US" });
  test.describe.configure({ timeout: 120_000 });

  test("edge: a fast double toggle — the last position wins on reload, and the api agrees", async ({ page, request }) => {
    const coach = await freshCoach(request);
    await signIn(page, "en", coach);
    const puts = recordPuts(page);
    await openSettings(page);

    const message = sw(page, "en", "CLIENT_MESSAGE");
    await message.click();
    await message.click(); // off then on: on is the last position
    const joined = sw(page, "en", "CLIENT_JOINED");
    await joined.click();
    await joined.click();
    await joined.click(); // off, on, off: off is the last position
    await expect(item(page, "CLIENT_MESSAGE")).toHaveAttribute("data-save-state", "saved");
    await expect(item(page, "CLIENT_JOINED")).toHaveAttribute("data-save-state", "saved");
    // One request of a pair at a time: at most one per click, never more.
    expect(puts.filter((p) => p.type === "CLIENT_MESSAGE").length).toBeLessThanOrEqual(2);
    expect(puts.filter((p) => p.type === "CLIENT_JOINED").length).toBeLessThanOrEqual(3);

    await page.reload();
    await expect(page.locator('.prefs[data-prefs-state="ready"]')).toBeVisible({ timeout: 15_000 });
    expect(await drawn(page, "en")).toEqual({ ...allOn, CLIENT_MESSAGE: true, CLIENT_JOINED: false });
    expect(emailValues(await apiPreferences(request, coach))).toEqual({ ...allOn, CLIENT_MESSAGE: true, CLIENT_JOINED: false });
  });

  test("edge: an api answer listing types the page does not know → not shown (a coach who also trains)", async ({ page, request }) => {
    const coach = await coachWhoTrains(request, "Coach Who Trains");
    const doc = await apiPreferences(request, coach);
    // The witness that the api really lists more than the page shows: the trainee push pairs.
    expect(Object.keys(doc.channels).sort()).toEqual(
      ["CLIENT_JOINED", "CLIENT_MESSAGE", "CLIENT_RED_FLAG", "CLIENT_SESSION_COMPLETED", "COACH_MEALS_UPDATED", "COACH_MESSAGE", "COACH_PLAN_PUBLISHED", "WORKOUT_DAY_REMINDER"]
    );
    await signIn(page, "en", coach);
    const bff = page.waitForResponse((r) => new URL(r.url()).pathname === BFF && r.request().method() === "GET");
    await openSettings(page);
    // The BFF passes the four coach pairs only, and the page draws exactly those four.
    expect(await (await bff).json()).toEqual({ channels: Object.fromEntries(TYPES.map((t) => [t, { email: true }])) });
    await expect(switches(page)).toHaveCount(4);

    // A toggle leaves the push pairs as they were.
    await sw(page, "en", "CLIENT_RED_FLAG").click();
    await expect(item(page, "CLIENT_RED_FLAG").getByRole("status")).toHaveText(T.en.saved);
    const after = await apiPreferences(request, coach);
    expect(after.channels).toEqual({ ...doc.channels, CLIENT_RED_FLAG: { email: false } });
  });

  test("AC-4: signed out, /settings/notifications redirects to sign-in; signed in, the page is there", async ({ page, request }) => {
    const coach = await freshCoach(request);
    await page.goto(PAGE);
    await expect(page).toHaveURL(/\/login$/);
    await signIn(page, "en", coach);
    await openSettings(page);
    await expect(switches(page)).toHaveCount(4);
  });

  /**
   * AC-4's second half, « and back after it (the existing redirect) », does not hold on any
   * `main`: no such redirect exists. `toLogin` (`src/middleware.ts`) sets no return path, and the
   * sign-in handler lands on a closed set (`type Landing = "/" | "/activate"`,
   * `src/app/api/auth/login/route.ts`, "never a value taken from the request"). Adding one is a
   * change to the sign-in redirect, an auth change, so it is not built here; the question is with
   * the PO. `test.fail`: the day a return path lands, this goes red and must be turned into a
   * plain test.
   */
  test("AC-4, second half: after signing in from the redirect, the coach is back on /settings/notifications", async ({ page, request }) => {
    test.fail(true, "EV-455k AC-4: no return-after-sign-in redirect exists; building one is an auth change (owed a PO/Raed ruling)");
    const coach = await freshCoach(request);
    await page.goto(PAGE);
    await expect(page).toHaveURL(/\/login/);
    await signInThroughForm(page, { email: coach.email, password: PASSWORD, lang: "en", landing: null });
    await expect(page).toHaveURL(/\/settings\/notifications$/, { timeout: 15_000 });
  });
});

/** axe-core, the package this repo pins, injected into the page; every rule axe runs by default. */
async function runAxe(page: Page, state: string): Promise<void> {
  const require_ = createRequire(__filename);
  await page.addScriptTag({ path: require_.resolve("axe-core/axe.min.js") });
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (ctx: Document) => Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } }).axe;
    const result = await axe.run(document);
    return result.violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target.join(" ")) }));
  });
  expect(violations, `axe on /settings/notifications (${state})`).toEqual([]);
}
