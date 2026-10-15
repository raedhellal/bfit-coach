import { createHash } from "node:crypto";
import { expect, type BrowserContext, type Locator, type Page, type Request } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm, type SignInLang } from "./sign-in";

/**
 * EV-341b — the intake interview page, sections 1–4, in fixture mode: B1–B16 and B19 (B17 is
 * the live api's: `qa/intake-token-expiry.live.spec.ts`; B18 is `qa/intake-autosave-unit.spec.ts`).
 *
 * The trainee's grant is `POST /api/fixture/intake` (EV-341w's affordance). Every section PUT
 * goes through the portal's OWN route handler (`PUT /api/clients/{id}/intake/{section}`), the
 * spec's seeds included, so the fixture's `intakePuts` journal (`GET /api/fixture/calls`) sees
 * exactly what the api would. "Another tab" is a second PUT from `page.request`, which sends no
 * Origin and is therefore a same-origin client to the handler.
 *
 * The expected sentences are LITERALS from the story, never read from `src/lib/copy.ts`. French
 * is compared with no-break spaces read as spaces.
 */

const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
const INTAKE = `/clients/${LINA}/intake`;
const OVERVIEW = `/clients/${LINA}`;

const T = {
  en: {
    locale: "en-US",
    tabs: ["Overview", "Routine", "Nutrition", "Intake"],
    nav: "Trainee sections",
    h2: "Intake interview",
    reads: "Lina can read this intake, notes included, in their app.",
    sections: ["Goals and motivation", "Training history", "Availability and equipment", "Lifestyle"],
    notStarted: "Not started",
    started: "Started",
    saving: "Saving…",
    saved: "Saved",
    retrying: "Not saved. Retrying…",
    failed: "Not saved. Check your connection: your answers are still on this page.",
    tryAgain: "Try again",
    conflict: "This intake was changed in another tab.",
    reload: "Reload",
    sessionEnded: "Your session has expired. Sign in again in a new tab: your answers are still on this page.",
    tooLong: "Too long: 1,000 characters at most.",
    grantMissing: "You can save the intake once Lina has allowed it in the app.",
    leave: "Leave with unsaved changes?",
    notes: "Notes",
    denied: "This trainee is not on your roster. They may have revoked access.",
  },
  fr: {
    locale: "fr-FR",
    tabs: ["Vue d'ensemble", "Programme", "Nutrition", "Entretien"],
    nav: "Sections du client",
    h2: "Entretien initial",
    reads: "Lina peut lire cet entretien, notes comprises, dans son application.",
    sections: ["Objectifs et motivation", "Historique sportif", "Disponibilités et matériel", "Mode de vie"],
    notStarted: "À faire",
    started: "Commencé",
    saving: "Enregistrement…",
    saved: "Enregistré",
    retrying: "Non enregistré. Nouvelle tentative…",
    failed: "Non enregistré. Vérifiez votre connexion : vos réponses restent sur cette page.",
    tryAgain: "Réessayer",
    conflict: "Cet entretien a été modifié dans un autre onglet.",
    reload: "Recharger",
    sessionEnded: "Votre session a expiré. Reconnectez-vous dans un nouvel onglet : vos réponses restent sur cette page.",
    tooLong: "Trop long : 1 000 caractères au maximum.",
    grantMissing: "L'entretien pourra être enregistré quand Lina l'aura autorisé dans l'app.",
    leave: "Quitter sans enregistrer ?",
    notes: "Notes",
    denied: "Ce client ne fait pas partie de votre liste. Il a peut-être révoqué l'accès.",
  },
} as const;
type Lang = keyof typeof T;

const plain = (text: string | null) => (text ?? "").replace(/[  ]/g, " ");

type IntakePut = { clientId: string; section: string; body: { version: number; values: Record<string, unknown> }; at: number };

async function fixtureCalls(page: Page): Promise<{ intakePuts: IntakePut[]; api: { op: string; arg: string | null }[] }> {
  const res = await page.request.get("/api/fixture/calls", { maxRedirects: 0 });
  expect(res.status(), "GET /api/fixture/calls (fixture mode only)").toBe(200);
  return (await res.json()) as { intakePuts: IntakePut[]; api: { op: string; arg: string | null }[] };
}

async function puts(page: Page, section?: string): Promise<IntakePut[]> {
  return (await fixtureCalls(page)).intakePuts.filter((p) => p.clientId === LINA && (!section || p.section === section));
}

/**
 * The header a save carries: the page's account, as `src/lib/sessionSubject.ts` derives it from
 * the access token's `sub` (ADR-0033 D33.14 point 4). Computed here from the context's own cookie,
 * so a spec's direct PUT is the same account's as the page's.
 */
async function subjectHeader(page: Page): Promise<Record<string, string>> {
  const token = (await page.context().cookies()).find((c) => c.name === "evoli_pro_at")?.value ?? "";
  const sub = (JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8") || "{}") as { sub?: string }).sub ?? "";
  return { "x-evoli-session-subject": createHash("sha256").update(`evoli-session-subject:${sub}`).digest("hex").slice(0, 32) };
}

async function grant(page: Page): Promise<void> {
  const res = await page.request.post("/api/fixture/intake", { data: { clientId: LINA, answer: "grant" }, maxRedirects: 0 });
  expect(res.status(), "the trainee's grant").toBe(200);
}

/** A write from "another tab": through the same route handler, same-origin (no Origin header). */
async function putFromElsewhere(page: Page, section: string, version: number, values: Record<string, unknown>) {
  const res = await page.request.put(`/api/clients/${LINA}/intake/${section}`, {
    data: { version, values },
    headers: { "Content-Type": "application/json", ...(await subjectHeader(page)) },
    maxRedirects: 0,
  });
  expect(res.status(), `PUT ${section} from elsewhere: ${await res.text()}`).toBe(200);
  return (await res.json()) as { version: number; updatedAt: string };
}

async function setSwitch(context: BrowserContext, page: Page, name: string, value: string | null) {
  const url = new URL("/", page.url()).href;
  if (value === null) {
    const kept = (await context.cookies()).filter((c) => c.name !== name);
    await context.clearCookies();
    await context.addCookies(kept);
  } else {
    await context.addCookies([{ name, value, url }]);
  }
}

async function signIn(page: Page, lang: Lang = "en") {
  await signInThroughForm(page, { lang: lang as SignInLang });
}

async function openIntake(page: Page, ready: "ready" | "disabled" = "ready") {
  await page.goto(INTAKE);
  await expect(page.locator("[data-nav-progress-ready]"), "the page hydrated").toHaveCount(1);
  await expect(page.locator(`[data-intake-ready="${ready}"]`)).toHaveCount(1);
}

function panel(page: Page, section: string): Locator {
  return page.locator(`[data-intake-panel="${section}"]`);
}

function tab(page: Page, section: string): Locator {
  return page.locator(`[data-intake-section="${section}"]`);
}

function notes(page: Page, section: string, lang: Lang = "en"): Locator {
  return panel(page, section).getByRole("textbox", { name: T[lang].notes, exact: true });
}

function status(page: Page): Locator {
  return page.locator("[data-intake-status]");
}

async function expectStatus(page: Page, text: string, timeout = 10_000) {
  await expect.poll(async () => plain(await status(page).textContent()), { timeout, intervals: [50] }).toBe(plain(text));
}

function alertOf(page: Page, kind: "failed" | "signedOut" | "conflict"): Locator {
  return page.locator(`[data-intake-alert="${kind}"]`);
}

/** The page's own requests (not the dev server's hot reload), with their headers. */
function recordRequests(page: Page): Request[] {
  const seen: Request[] = [];
  page.on("request", (r) => {
    const url = new URL(r.url());
    if (url.pathname.startsWith("/_next/webpack-hmr") || url.pathname.includes("hot-update")) return;
    seen.push(r);
  });
  return seen;
}

async function waitForPuts(page: Page, section: string, count: number, timeout = 10_000) {
  await expect.poll(async () => (await puts(page, section)).length, { timeout, intervals: [100] }).toBe(count);
}

/**
 * Staff r3 #1: a section other than the one under test saves first, so « Enregistré » WOULD be
 * the status line if a non-success state let it through. Returns to GOALS.
 */
async function saveAnotherSectionFirst(page: Page, lang: Lang = "en") {
  await tab(page, "LIFESTYLE").click();
  await notes(page, "LIFESTYLE", lang).fill("Saved first");
  await notes(page, "LIFESTYLE", lang).press("Tab");
  await settledSaved(page, lang);
  await tab(page, "GOALS").click();
}

/** No « Enregistré » / "Saved" beside a refusal, a conflict or a blocked field (staff r2 #2, r3 #1). */
async function expectNoSavedStatus(page: Page) {
  await expect(status(page)).toHaveAttribute("data-intake-status", "idle");
  expect(plain(await status(page).textContent())).toBe("");
}

/** Every save acknowledged: the guard's history entry is gone and the status says « Saved ». */
async function settledSaved(page: Page, lang: Lang = "en") {
  await expectStatus(page, T[lang].saved);
  await page.waitForFunction(() => window.history.state?.evoliUnsavedGuard !== true);
}

// ── B1 / B19 ─────────────────────────────────────────────────────────────────

for (const lang of ["en", "fr"] as const) {
  test.describe(`B1 / B19 the tab and the page frame (${lang.toUpperCase()})`, () => {
    test.use({ locale: T[lang].locale });

    test("four tabs in order, « Entretien » current; one h1, the h2, and B19's sentence under it", async ({ page }) => {
      await signIn(page, lang);
      await grant(page);
      await openIntake(page);
      const nav = page.getByRole("main").getByRole("navigation", { name: T[lang].nav, exact: true });
      await expect(nav.getByRole("link")).toHaveText([...T[lang].tabs]);
      await expect(nav.locator('[aria-current="page"]')).toHaveText(T[lang].tabs[3]);
      await expect(nav.locator('[aria-current="page"]')).toHaveAttribute("href", INTAKE);
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.locator("h1")).toHaveText("Lina M.");
      await expect(page.getByRole("heading", { level: 2, name: T[lang].h2, exact: true })).toBeVisible();
      expect(plain(await page.locator("[data-intake-reads]").textContent())).toBe(plain(T[lang].reads));
      // Under the h2: the sentence follows it in the document.
      expect(
        await page.locator("[data-intake-reads]").evaluate((el) => el.previousElementSibling?.tagName ?? "")
      ).toBe("H2");
    });

    test("the tab is rendered without the grant too (never filtered out)", async ({ page }) => {
      await signIn(page, lang);
      await page.goto(OVERVIEW);
      const nav = page.getByRole("main").getByRole("navigation", { name: T[lang].nav, exact: true });
      await expect(nav.getByRole("link", { name: T[lang].tabs[3], exact: true })).toHaveAttribute("href", INTAKE);
    });
  });
}

// ── B2 the section list ──────────────────────────────────────────────────────

test.describe("B2 the section list", () => {
  test("statuses « Not started » / « Started »; choosing a section makes no request and changes no URL", async ({ page }) => {
    await signIn(page);
    await grant(page);
    await putFromElsewhere(page, "HISTORY", 0, { level: "BEGINNER" });
    await openIntake(page);
    const tabs = page.getByRole("tablist").getByRole("tab");
    await expect(tabs).toHaveCount(4);
    for (const [i, section] of ["GOALS", "HISTORY", "AVAILABILITY", "LIFESTYLE"].entries()) {
      await expect(tab(page, section).locator(".intake-section-name")).toHaveText(T.en.sections[i]);
    }
    await expect(tab(page, "GOALS").locator(".intake-section-status")).toHaveText(T.en.notStarted);
    await expect(tab(page, "HISTORY").locator(".intake-section-status")).toHaveText(T.en.started);

    const url = page.url();
    const seen = recordRequests(page);
    for (const section of ["HISTORY", "LIFESTYLE", "AVAILABILITY", "GOALS"]) {
      await tab(page, section).click();
      await expect(panel(page, section)).toBeVisible();
      await expect(tab(page, section)).toHaveAttribute("aria-selected", "true");
    }
    await page.waitForTimeout(500);
    expect(seen.map((r) => `${r.method()} ${new URL(r.url()).pathname}`), "no request").toEqual([]);
    expect(page.url()).toBe(url);
  });

  test("a section turns « Started » as soon as one of its fields holds an answer", async ({ page }) => {
    await signIn(page);
    await grant(page);
    await openIntake(page);
    await expect(tab(page, "GOALS").locator(".intake-section-status")).toHaveText(T.en.notStarted);
    await panel(page, "GOALS").getByRole("radio", { name: "Lose fat", exact: true }).check();
    await expect(tab(page, "GOALS").locator(".intake-section-status")).toHaveText(T.en.started);
  });

  test("at 390 px the list is a <select>, and choosing in it shows the section with no request", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page);
    await grant(page);
    await openIntake(page);
    await expect(page.getByRole("tablist")).toBeHidden();
    const select = page.getByRole("combobox", { name: "Section", exact: true });
    await expect(select).toBeVisible();
    expect(await select.evaluate((el) => el.tagName)).toBe("SELECT");
    const seen = recordRequests(page);
    await select.selectOption("LIFESTYLE");
    await expect(panel(page, "LIFESTYLE")).toBeVisible();
    await expect(panel(page, "GOALS")).toBeHidden();
    await page.waitForTimeout(300);
    expect(seen.length).toBe(0);
    // The page itself never scrolls sideways at 390.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});

// ── B3 autosave ──────────────────────────────────────────────────────────────

test.describe("B3 autosave", () => {
  test("saved within 1.5 s of the last change, « Saving… » then « Saved »; a PUT to the route handler, no Next-Action, no ?_rsc= after", async ({
    page,
  }) => {
    await signIn(page);
    await grant(page);
    await openIntake(page);
    await setSwitch(page.context(), page, "evoli_fixture_intake_save_delay_ms", "600");
    const seen = recordRequests(page);
    await notes(page, "GOALS").pressSequentially("Runs twice a week", { delay: 20 });
    const typedAt = Date.now();
    await expectStatus(page, T.en.saving);
    await waitForPuts(page, "GOALS", 1);
    const [put] = await puts(page, "GOALS");
    expect(put.at - typedAt, "the save left within 1.5 s of the last change").toBeLessThan(1_500 + 400);
    expect(put.body).toEqual({
      version: 0,
      values: { primaryGoal: null, motivations: [], motivationScore: null, eventLabel: null, eventDate: null, notes: "Runs twice a week" },
    });
    await settledSaved(page);
    await page.waitForTimeout(800);
    const urls = seen.map((r) => `${r.method()} ${new URL(r.url()).pathname}${new URL(r.url()).search}`);
    expect(urls.filter((u) => u.startsWith("PUT "))).toEqual([`PUT /api/clients/${LINA}/intake/GOALS`]);
    for (const r of seen) expect(await r.headerValue("next-action"), `${r.method()} ${r.url()}`).toBeNull();
    expect(urls.filter((u) => u.includes("_rsc=")), "no RSC request follows a save").toEqual([]);
  });

  test("a field losing focus saves at once", async ({ page }) => {
    await signIn(page);
    await grant(page);
    await openIntake(page);
    await notes(page, "GOALS").fill("Blur me");
    const filledAt = Date.now();
    await notes(page, "GOALS").press("Tab");
    await waitForPuts(page, "GOALS", 1, 3_000);
    const [put] = await puts(page, "GOALS");
    expect(put.at - filledAt, "not the 1.5 s idle time").toBeLessThan(1_000);
  });

  test("a change in section 1 and one in section 2 within 1.5 s put TWO saves in flight at once", async ({ page }) => {
    await signIn(page);
    await grant(page);
    await openIntake(page);
    await setSwitch(page.context(), page, "evoli_fixture_intake_save_delay_ms", "2500");
    const spans: Record<string, { start: number; end: number }> = {};
    page.on("request", (r) => {
      const m = /\/intake\/(GOALS|HISTORY)$/.exec(new URL(r.url()).pathname);
      if (m && r.method() === "PUT") spans[m[1]] = { start: Date.now(), end: Infinity };
    });
    page.on("requestfinished", (r) => {
      const m = /\/intake\/(GOALS|HISTORY)$/.exec(new URL(r.url()).pathname);
      if (m && r.method() === "PUT") spans[m[1]].end = Date.now();
    });
    await panel(page, "GOALS").getByRole("radio", { name: "Lose fat", exact: true }).check();
    await tab(page, "HISTORY").click();
    await panel(page, "HISTORY").getByRole("radio", { name: "Beginner", exact: true }).check();
    await expect.poll(() => Object.keys(spans).sort(), { timeout: 5_000 }).toEqual(["GOALS", "HISTORY"]);
    await expect.poll(() => spans.GOALS.end !== Infinity && spans.HISTORY.end !== Infinity, { timeout: 10_000 }).toBe(true);
    expect(spans.HISTORY.start, "the second save started before the first ended").toBeLessThan(spans.GOALS.end);
    expect(spans.GOALS.start).toBeLessThan(spans.HISTORY.end);
    await settledSaved(page);
  });

  test("typed before hydration (BUG-687's class): the value is adopted and saved, not lost", async ({ page }) => {
    await signIn(page);
    await grant(page);
    // Hold every client chunk so the server HTML is on screen with no React behind it.
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(/\/_next\/static\/chunks\/.*\.js/, async (route) => {
      await held;
      await route.continue();
    });
    await page.goto(INTAKE, { waitUntil: "commit" });
    const field = notes(page, "GOALS");
    await expect(field).toBeVisible();
    await field.fill("Typed before React");
    release();
    await expect(page.locator("[data-nav-progress-ready]")).toHaveCount(1);
    await waitForPuts(page, "GOALS", 1);
    expect((await puts(page, "GOALS"))[0].body.values.notes).toBe("Typed before React");
    await expect(field).toHaveValue("Typed before React");
  });
});

// ── B4 failure ───────────────────────────────────────────────────────────────

for (const lang of ["en", "fr"] as const) {
  test.describe(`B4 failure (${lang.toUpperCase()})`, () => {
    test.use({ locale: T[lang].locale });

    test("a 500: « Retrying… », 3 retries (4 PUTs), then the connection sentence with « Try again »; the values stay; Try again saves", async ({
      page,
    }) => {
      test.setTimeout(90_000);
      await signIn(page, lang);
      await grant(page);
      await openIntake(page);
      await setSwitch(page.context(), page, "evoli_fixture_intake_save", "fail");
      await notes(page, "GOALS", lang).fill("Keep me");
      await notes(page, "GOALS", lang).press("Tab");
      await expectStatus(page, T[lang].retrying);
      await expect(alertOf(page, "failed")).toBeVisible({ timeout: 20_000 });
      expect(plain(await alertOf(page, "failed").locator("p").textContent())).toBe(plain(T[lang].failed));
      await page.waitForTimeout(6_000);
      expect((await puts(page, "GOALS")).length, "1 + 3 retries").toBe(4);
      await expect(notes(page, "GOALS", lang)).toHaveValue("Keep me");
      await setSwitch(page.context(), page, "evoli_fixture_intake_save", null);
      await alertOf(page, "failed").getByRole("button", { name: T[lang].tryAgain, exact: true }).click();
      await settledSaved(page, lang);
      await expect(alertOf(page, "failed")).toHaveCount(0);
      expect((await puts(page, "GOALS")).length).toBe(5);
    });
  });
}

test.describe("B4 failure, the other two causes", () => {
  test("a network cut is retried like a 500", async ({ page }) => {
    test.setTimeout(90_000);
    await signIn(page);
    await grant(page);
    await openIntake(page);
    let attempts = 0;
    await page.route(`**/api/clients/${LINA}/intake/GOALS`, (route) => {
      attempts += 1;
      return route.abort("internetdisconnected");
    });
    await notes(page, "GOALS").fill("Offline");
    await notes(page, "GOALS").press("Tab");
    await expectStatus(page, T.en.retrying);
    await expect(alertOf(page, "failed")).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(3_000);
    expect(attempts).toBe(4);
    await expect(notes(page, "GOALS")).toHaveValue("Offline");
  });

  test("a 400 is not retried: one request only, and a blur does not re-send it (staff r1 B2)", async ({ page }) => {
    await signIn(page);
    await grant(page);
    await openIntake(page);
    let attempts = 0;
    await page.route(`**/api/clients/${LINA}/intake/GOALS`, (route) => {
      attempts += 1;
      return route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ code: "INTAKE_FIELD_INVALID", field: "notes" }) });
    });
    await notes(page, "GOALS").fill("Refused");
    await notes(page, "GOALS").press("Tab");
    await expect(page.locator('[data-intake-refused="GOALS"]')).toBeVisible();
    // A later blur with no change sends nothing.
    await notes(page, "GOALS").focus();
    await notes(page, "GOALS").press("Tab");
    await page.waitForTimeout(9_000);
    expect(attempts).toBe(1);
    await expect(notes(page, "GOALS")).toHaveValue("Refused");
  });
});

const REFUSED = {
  en: {
    field: (label: string) => `Not saved: the answer “${label}” was refused. Change it to save again.`,
    section: "Not saved: an answer in this section was refused. Change it to save again.",
    event: "Event",
  },
  fr: {
    field: (label: string) => `Non enregistré : la réponse « ${label} » a été refusée. Modifiez-la pour enregistrer à nouveau.`,
    section: "Non enregistré : une réponse de cette section a été refusée. Modifiez-la pour enregistrer à nouveau.",
    event: "Événement",
  },
} as const;

for (const lang of ["en", "fr"] as const) {
  test.describe(`B4a a refused save (${lang.toUpperCase()})`, () => {
    test.use({ locale: T[lang].locale });

    test("its own sentence per section (the field's B9 label, or the section's), no B4 sentence, no « Réessayer »; the next change saves and the line goes on its 2xx; the guard asks meanwhile", async ({
      page,
    }) => {
      test.setTimeout(90_000);
      await signIn(page, lang);
      await grant(page);
      await openIntake(page);
      // A section saved BEFORE the refusals (staff r2 #2): « Enregistré » must not sit beside them.
      await tab(page, "LIFESTYLE").click();
      await notes(page, "LIFESTYLE", lang).fill("Saved first");
      await notes(page, "LIFESTYLE", lang).press("Tab");
      await settledSaved(page, lang);
      await tab(page, "GOALS").click();
      let refuse = true;
      await page.route(`**/api/clients/${LINA}/intake/GOALS`, (route) =>
        refuse
          ? route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ code: "INTAKE_FIELD_INVALID", field: "eventLabel" }) })
          : route.continue()
      );
      await page.route(`**/api/clients/${LINA}/intake/HISTORY`, (route) =>
        refuse ? route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ code: "COACH_FIELD_NOT_ACCEPTED" }) }) : route.continue()
      );
      await panel(page, "GOALS").getByRole("textbox", { name: REFUSED[lang].event, exact: true }).fill("Semi");
      await panel(page, "GOALS").getByRole("textbox", { name: REFUSED[lang].event, exact: true }).press("Tab");
      await tab(page, "HISTORY").click();
      await panel(page, "HISTORY").getByRole("radio").first().check();
      await tab(page, "LIFESTYLE").click(); // HISTORY loses focus: saved at once, and refused
      const lines = page.locator('[data-intake-alert="refused"]');
      await expect(lines).toHaveCount(2);
      expect((await lines.allTextContents()).map(plain)).toEqual([plain(REFUSED[lang].field(REFUSED[lang].event)), plain(REFUSED[lang].section)]);
      await expect(alertOf(page, "failed"), "never B4's sentences").toHaveCount(0);
      await expect(lines.getByRole("button"), "no « Réessayer » for a refusal").toHaveCount(0);
      await expectNoSavedStatus(page);
      expect(await page.evaluate(() => window.history.state?.evoliUnsavedGuard === true), "the leave guard asks while refused").toBe(true);
      // The next change to GOALS saves it; its line goes when that save answers 2xx.
      refuse = false;
      await tab(page, "GOALS").click();
      await panel(page, "GOALS").getByRole("textbox", { name: REFUSED[lang].event, exact: true }).fill("Semi-marathon");
      await panel(page, "GOALS").getByRole("textbox", { name: REFUSED[lang].event, exact: true }).press("Tab");
      await expect(page.locator('[data-intake-refused="GOALS"]')).toHaveCount(0);
      await expect(page.locator('[data-intake-refused="HISTORY"]'), "the other section's line stays until its own save").toHaveCount(1);
    });
  });
}

// ── B5 / B5a conflict ────────────────────────────────────────────────────────

for (const lang of ["en", "fr"] as const) {
  test.describe(`B5 / B5a conflict (${lang.toUpperCase()})`, () => {
    test.use({ locale: T[lang].locale });

    test("a 409 stops the section's saves; « Reload » shows the stored values with no navigation; the first PUT after one change is stored + that change", async ({
      page,
    }) => {
      test.setTimeout(90_000);
      await signIn(page, lang);
      await grant(page);
      await openIntake(page);
      await saveAnotherSectionFirst(page, lang);
      const goals = panel(page, "GOALS");
      // Saved once here: GOALS is at version 1 in this tab.
      await notes(page, "GOALS", lang).fill("Mine, first");
      await notes(page, "GOALS", lang).press("Tab");
      await settledSaved(page, lang);
      // Another tab writes GOALS: version 2.
      await putFromElsewhere(page, "GOALS", 1, { primaryGoal: "ENDURANCE", notes: "Theirs" });
      // This tab types on, with its stale version 1 → 409.
      await notes(page, "GOALS", lang).fill("Mine, typed before the conflict");
      await notes(page, "GOALS", lang).press("Tab");
      await expect(alertOf(page, "conflict")).toBeVisible();
      expect(plain(await alertOf(page, "conflict").locator("p").textContent())).toBe(plain(T[lang].conflict));
      await expectNoSavedStatus(page);
      await expect(notes(page, "GOALS", lang), "the unsaved values stay visible").toHaveValue("Mine, typed before the conflict");
      const afterConflict = (await puts(page, "GOALS")).length;
      // B5a: typing on queues nothing; 5 s later, still no PUT for the section.
      await goals.getByRole("radio").first().check();
      await page.waitForTimeout(5_000);
      expect((await puts(page, "GOALS")).length, "no PUT for GOALS until « Recharger »").toBe(afterConflict);

      const url = page.url();
      const seen = recordRequests(page);
      await alertOf(page, "conflict").getByRole("button", { name: T[lang].reload, exact: true }).click();
      await expect(alertOf(page, "conflict")).toHaveCount(0);
      await expect(notes(page, "GOALS", lang)).toHaveValue("Theirs");
      expect(page.url(), "no navigation").toBe(url);
      expect(seen.filter((r) => r.isNavigationRequest())).toEqual([]);
      // B5a: after « Recharger », nothing is sent until a field changes.
      await page.waitForTimeout(3_000);
      expect((await puts(page, "GOALS")).length).toBe(afterConflict);
      await goals.locator('input[type="checkbox"][value="HEALTH"]').check();
      await waitForPuts(page, "GOALS", afterConflict + 1);
      const first = (await puts(page, "GOALS"))[afterConflict];
      expect(first.body, "the stored values plus that one change, at the stored version").toEqual({
        version: 2,
        values: {
          primaryGoal: "ENDURANCE",
          motivations: ["HEALTH"],
          motivationScore: null,
          eventLabel: null,
          eventDate: null,
          notes: "Theirs",
        },
      });
      await settledSaved(page, lang);
    });
  });
}

// ── B6 resume ────────────────────────────────────────────────────────────────

test.describe("B6 resume", () => {
  test("sections 1 and 2 answered: their values are shown and the open section is 3", async ({ page }) => {
    await signIn(page);
    await grant(page);
    await putFromElsewhere(page, "GOALS", 0, { primaryGoal: "GET_STRONGER", motivations: ["HEALTH", "ENERGY"], notes: "Goal notes" });
    await putFromElsewhere(page, "HISTORY", 0, { level: "INTERMEDIATE", currentSessionsPerWeek: 3 });
    await openIntake(page);
    await expect(tab(page, "AVAILABILITY")).toHaveAttribute("aria-selected", "true");
    await expect(panel(page, "AVAILABILITY")).toBeVisible();
    await expect(panel(page, "GOALS")).toBeHidden();
    await tab(page, "GOALS").click();
    await expect(panel(page, "GOALS").getByRole("radio", { name: "Get stronger", exact: true })).toBeChecked();
    await expect(panel(page, "GOALS").getByRole("checkbox", { name: "Health", exact: true })).toBeChecked();
    await expect(panel(page, "GOALS").getByRole("checkbox", { name: "Everyday energy", exact: true })).toBeChecked();
    await expect(notes(page, "GOALS")).toHaveValue("Goal notes");
    await tab(page, "HISTORY").click();
    await expect(panel(page, "HISTORY").getByRole("radio", { name: "Intermediate", exact: true })).toBeChecked();
    await expect(panel(page, "HISTORY").getByRole("textbox", { name: "Current sessions per week", exact: true })).toHaveValue("3");
    expect((await puts(page)).length, "opening the page wrote nothing").toBe(2);
  });
});

// ── B7 / B7a leave guard ─────────────────────────────────────────────────────

test.describe("B7 / B7a leave guard", () => {
  const leaveDialog = (page: Page) => page.getByRole("dialog", { name: T.en.leave, exact: true });
  const tabLink = (page: Page, name: string) =>
    page.getByRole("main").getByRole("navigation", { name: T.en.nav, exact: true }).getByRole("link", { name, exact: true });

  test("a save pending: following a link asks; with every save acknowledged it does not", async ({ page }) => {
    await signIn(page);
    await grant(page);
    await openIntake(page);
    await notes(page, "GOALS").fill("Pending");
    await page.waitForFunction(() => window.history.state?.evoliUnsavedGuard === true);
    await tabLink(page, "Overview").click();
    await expect(leaveDialog(page)).toBeVisible();
    await leaveDialog(page).getByRole("button", { name: "Stay on this page", exact: true }).click();
    await settledSaved(page);
    await tabLink(page, "Overview").click();
    await page.waitForURL(OVERVIEW);
    await expect(leaveDialog(page)).toHaveCount(0);
  });

  test("a save in flight: closing the tab raises the browser's own prompt", async ({ page }) => {
    await signIn(page);
    await grant(page);
    await openIntake(page);
    await setSwitch(page.context(), page, "evoli_fixture_intake_save_delay_ms", "5000");
    await notes(page, "GOALS").fill("In flight");
    await notes(page, "GOALS").press("Tab");
    await waitForPuts(page, "GOALS", 1);
    const seen = new Promise<string>((resolve) => {
      page.on("dialog", (d) => {
        resolve(d.type());
        void d.dismiss();
      });
    });
    await page.close({ runBeforeUnload: true });
    expect(await seen).toBe("beforeunload");
  });

  test("B7a: every field equal to its stored value, only a failed save outstanding: link, Back and close all ask", async ({ page }) => {
    test.setTimeout(90_000);
    await signIn(page);
    await grant(page);
    await page.goto(OVERVIEW);
    await openIntake(page);
    await setSwitch(page.context(), page, "evoli_fixture_intake_save", "fail");
    // Type, then take it back out: the field equals the stored (empty) note again…
    await notes(page, "GOALS").fill("x");
    await notes(page, "GOALS").fill("");
    await notes(page, "GOALS").press("Tab");
    await expect(notes(page, "GOALS")).toHaveValue("");
    // …while the autosave holds a save that keeps failing.
    await expect(alertOf(page, "failed")).toBeVisible({ timeout: 20_000 });
    await page.waitForFunction(() => window.history.state?.evoliUnsavedGuard === true);
    // A link.
    await tabLink(page, "Overview").click();
    await expect(leaveDialog(page)).toBeVisible();
    await leaveDialog(page).getByRole("button", { name: "Stay on this page", exact: true }).click();
    await expect(leaveDialog(page)).toHaveCount(0);
    // Back.
    await page.goBack({ timeout: 3_000 }).catch(() => null);
    await expect(leaveDialog(page)).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(INTAKE);
    await leaveDialog(page).getByRole("button", { name: "Stay on this page", exact: true }).click();
    // Close.
    const seen = new Promise<string>((resolve) => {
      page.on("dialog", (d) => {
        resolve(d.type());
        void d.dismiss();
      });
    });
    await page.close({ runBeforeUnload: true });
    expect(await seen).toBe("beforeunload");
  });
});

// ── B8 keyboard only ─────────────────────────────────────────────────────────

test.describe("B8 fast to fill", () => {
  test("every field of sections 1–4 by keyboard only: one Tab stop per single choice, checkboxes, typed digits; choices ≥ 44 px", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await signIn(page);
    await grant(page);
    await openIntake(page);
    const choices = page.locator(".intake-choice");
    const heights = await choices.evaluateAll((els) =>
      els.filter((el) => (el as HTMLElement).offsetParent !== null).map((el) => el.getBoundingClientRect().height)
    );
    expect(heights.length).toBeGreaterThan(10);
    for (const h of heights) expect(h).toBeGreaterThanOrEqual(44);

    const press = (key: string) => page.keyboard.press(key);
    const focusedName = () =>
      page.evaluate(() => {
        const el = document.activeElement as HTMLInputElement | null;
        return el ? `${el.type}:${el.value}` : "";
      });

    // Section 1. Start from the section's tab in the list (the one place a test puts the focus).
    await tab(page, "GOALS").focus();
    await press("Tab"); // primaryGoal radio group (one stop)
    expect(await focusedName()).toBe("radio:BUILD_MUSCLE");
    await press("ArrowRight"); // LOSE_WEIGHT
    await press("Tab"); // motivations: first checkbox
    expect(await focusedName()).toBe("checkbox:HEALTH");
    await press("Space"); // HEALTH
    await press("Tab");
    await press("Tab");
    await press("Tab");
    await press("Tab");
    expect(await focusedName()).toBe("checkbox:ENERGY");
    await press("Space"); // ENERGY
    await press("Tab"); // EVENT checkbox
    await press("Tab"); // motivationScore group
    expect(await focusedName()).toBe("radio:1");
    await press("ArrowRight");
    await press("ArrowRight");
    await press("ArrowRight"); // 4
    await press("Tab"); // eventLabel
    await page.keyboard.type("Semi-marathon");
    await press("Tab"); // eventDate: typed digits, month, day, year (en-US), each segment advancing itself
    expect(await focusedName()).toMatch(/^date:/);
    await page.keyboard.type("06152027");
    // The date control is ONE field with three segments: Tab walks them, then leaves for the notes.
    for (let i = 0; i < 4 && (await page.evaluate(() => document.activeElement?.tagName)) !== "TEXTAREA"; i++) {
      await press("Tab");
    }
    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe("TEXTAREA");
    await page.keyboard.type("Wants to run in spring.");

    /** Back to the section list by keyboard, and the next section with an arrow key. */
    const nextSection = async (section: string) => {
      for (let i = 0; i < 60 && (await page.evaluate(() => document.activeElement?.getAttribute("role"))) !== "tab"; i++) {
        await press("Shift+Tab");
      }
      await press("ArrowDown");
      await expect(tab(page, section)).toBeFocused();
      await expect(panel(page, section)).toBeVisible();
    };

    // Section 2.
    await nextSection("HISTORY");
    await press("Tab"); // level
    expect(await focusedName()).toBe("radio:BEGINNER");
    await press("ArrowRight"); // INTERMEDIATE
    await press("Tab"); // trainingAge
    await press("ArrowRight");
    await press("ArrowRight"); // M6_24
    await press("Tab"); // currentSessionsPerWeek
    await page.keyboard.type("3");
    await press("Tab"); // activities: STRENGTH
    await press("Space");
    await press("Tab"); // RUNNING
    await press("Space");

    // Section 3.
    await nextSection("AVAILABILITY");
    await press("Tab"); // sessionsPerWeek
    await page.keyboard.type("3");
    await press("Tab"); // sessionMinutes
    expect(await focusedName()).toBe("radio:30");
    await press("ArrowRight");
    await press("ArrowRight"); // 60
    await press("Tab"); // MONDAY
    await press("Space");
    await press("Tab");
    await press("Tab"); // WEDNESDAY
    await press("Space");
    await press("Tab");
    await press("Tab");
    await press("Tab");
    await press("Tab");
    await press("Tab"); // timeOfDay
    expect(await focusedName()).toBe("radio:MORNING");
    await press("ArrowRight");
    await press("ArrowRight"); // EVENING
    await press("Tab"); // GYM
    await press("Space");

    // Section 4.
    await nextSection("LIFESTYLE");
    await press("Tab"); // workActivity
    await press("ArrowRight"); // STANDING
    await press("Tab"); // sleepHours
    await press("ArrowRight");
    await press("ArrowRight"); // H7_8
    await press("Tab"); // stressScore
    await press("ArrowRight"); // 2
    await press("Tab"); // notes
    await page.keyboard.type("Shift work.");
    await press("Tab");

    await settledSaved(page);
    const read = await page.request.get(`/api/bff/clients/${LINA}/intake`);
    expect(read.status()).toBe(200);
    const body = (await read.json()) as { sections: Record<string, { values: Record<string, unknown> }> };
    expect(body.sections.GOALS.values).toEqual({
      primaryGoal: "LOSE_WEIGHT",
      motivations: ["HEALTH", "ENERGY"],
      motivationScore: 4,
      eventLabel: "Semi-marathon",
      eventDate: "2027-06-15",
      notes: "Wants to run in spring.",
    });
    expect(body.sections.HISTORY.values).toEqual({
      level: "INTERMEDIATE",
      trainingAge: "M6_24",
      currentSessionsPerWeek: 3,
      activities: ["STRENGTH", "RUNNING"],
      notes: null,
    });
    expect(body.sections.AVAILABILITY.values).toEqual({
      sessionsPerWeek: 3,
      sessionMinutes: 60,
      availableDays: ["MONDAY", "WEDNESDAY"],
      timeOfDay: "EVENING",
      trainingPlaces: ["GYM"],
      notes: null,
    });
    expect(body.sections.LIFESTYLE.values).toEqual({
      workActivity: "STANDING",
      sleepHours: "H7_8",
      stressScore: 2,
      notes: "Shift work.",
    });
  });
});

// ── B9 labels ────────────────────────────────────────────────────────────────

const LABELS = {
  en: {
    GOALS: [
      ["Main goal", ["Build muscle", "Lose fat", "Get stronger", "General fitness", "Endurance"]],
      ["Motivations", ["Health", "Self-confidence", "Appearance", "Sports performance", "Everyday energy", "Preparing for an event"]],
      ["Motivation", ["1", "2", "3", "4", "5"]],
    ],
    HISTORY: [
      ["Level", ["Beginner", "Intermediate", "Advanced"]],
      ["Training experience", ["Never trained", "Less than 6 months", "6 months to 2 years", "2 to 5 years", "More than 5 years"]],
      [
        "Activities",
        ["Strength training", "Running", "Cycling", "Swimming", "Team sports", "Combat sports", "Yoga / Pilates", "CrossFit / HIIT", "Other"],
      ],
    ],
    AVAILABILITY: [
      ["Session length", ["30 min", "45 min", "60 min", "75 min", "90 min"]],
      ["Available days", ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]],
      ["Preferred time of day", ["Morning", "Midday", "Evening"]],
      ["Training places", ["Gym", "Home", "Outdoors", "Coach's studio"]],
    ],
    LIFESTYLE: [
      ["Activity at work", ["Sitting most of the time", "Standing or moving", "Physical work"]],
      ["Sleep per night", ["Less than 6 h", "6 to 7 h", "7 to 8 h", "More than 8 h"]],
      ["Stress", ["1", "2", "3", "4", "5"]],
    ],
  },
  fr: {
    GOALS: [
      ["Objectif principal", ["Prendre du muscle", "Perdre du gras", "Gagner en force", "Forme générale", "Endurance"]],
      ["Motivations", ["Santé", "Confiance en soi", "Apparence", "Performance sportive", "Énergie au quotidien", "Préparer un événement"]],
      ["Motivation", ["1", "2", "3", "4", "5"]],
    ],
    HISTORY: [
      ["Niveau", ["Débutant", "Intermédiaire", "Confirmé"]],
      ["Ancienneté d'entraînement", ["Jamais entraîné·e", "Moins de 6 mois", "6 mois à 2 ans", "2 à 5 ans", "Plus de 5 ans"]],
      [
        "Activités",
        ["Musculation", "Course à pied", "Vélo", "Natation", "Sports collectifs", "Sports de combat", "Yoga / Pilates", "CrossFit / HIIT", "Autre"],
      ],
    ],
    AVAILABILITY: [
      ["Durée d'une séance", ["30 min", "45 min", "60 min", "75 min", "90 min"]],
      ["Jours disponibles", ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"]],
      ["Moment de la journée", ["Matin", "Midi", "Soir"]],
      ["Lieux d'entraînement", ["Salle de sport", "Maison", "Extérieur", "Studio du coach"]],
    ],
    LIFESTYLE: [
      ["Activité au travail", ["Assis·e la plupart du temps", "Debout ou en mouvement", "Travail physique"]],
      ["Sommeil par nuit", ["Moins de 6 h", "6 à 7 h", "7 à 8 h", "Plus de 8 h"]],
      ["Stress", ["1", "2", "3", "4", "5"]],
    ],
  },
} as const;

const TEXT_LABELS = {
  en: {
    GOALS: ["Event", "Event date", "Notes"],
    HISTORY: ["Current sessions per week", "Notes"],
    AVAILABILITY: ["Sessions per week", "Notes"],
    LIFESTYLE: ["Notes"],
  },
  fr: {
    GOALS: ["Événement", "Date de l'événement", "Notes"],
    HISTORY: ["Séances actuelles par semaine", "Notes"],
    AVAILABILITY: ["Séances par semaine", "Notes"],
    LIFESTYLE: ["Notes"],
  },
} as const;

for (const lang of ["en", "fr"] as const) {
  test.describe(`B9 labels (${lang.toUpperCase()})`, () => {
    test.use({ locale: T[lang].locale });

    test("every field label and value reads exactly as the catalogue table", async ({ page }) => {
      await signIn(page, lang);
      await grant(page);
      await openIntake(page);
      for (const [i, section] of (["GOALS", "HISTORY", "AVAILABILITY", "LIFESTYLE"] as const).entries()) {
        await tab(page, section).click();
        const p = panel(page, section);
        await expect(p.getByRole("heading", { level: 3 })).toHaveText(T[lang].sections[i]);
        const groups = await p.locator("fieldset").evaluateAll((sets) =>
          sets.map((s) => [
            (s.querySelector("legend")?.textContent ?? "").replace(/[  ]/g, " "),
            Array.from(s.querySelectorAll("label")).map((l) => (l.textContent ?? "").replace(/[  ]/g, " ").trim()),
          ])
        );
        expect(groups, section).toEqual(LABELS[lang][section].map(([l, v]) => [l, [...v]]));
        const texts = await p.locator(".intake-field > label.intake-label").allTextContents();
        expect(texts, section).toEqual([...TEXT_LABELS[lang][section]]);
      }
    });
  });
}

// ── B10 read-only beside the coach's answer ──────────────────────────────────

test.describe("B10 read-only facts", () => {
  test("section 3 shows the trainee's stored equipment as read-only text, no control", async ({ page }) => {
    await signIn(page);
    await grant(page);
    await openIntake(page);
    await tab(page, "AVAILABILITY").click();
    const facts = panel(page, "AVAILABILITY").locator(".intake-readonly");
    await expect(facts.locator('[data-profile-group="Available equipment"] [data-profile-values]')).toBeVisible();
    await expect(facts.getByText("From the trainee's profile — you cannot change these here.", { exact: true })).toBeVisible();
    await expect(facts.locator("input, select, textarea, button")).toHaveCount(0);
  });
});

// ── B11 / B11a before the grant ──────────────────────────────────────────────

for (const lang of ["en", "fr"] as const) {
  test.describe(`B11 / B11a before the grant (${lang.toUpperCase()})`, () => {
    test.use({ locale: T[lang].locale });

    test("every field disabled, the sentence wired to each with aria-describedby, and EV-341w's card under it", async ({ page }) => {
      await signIn(page, lang);
      await openIntake(page, "disabled");
      const reason = page.locator("[data-intake-grant-missing]");
      expect(plain(await reason.textContent())).toBe(plain(T[lang].grantMissing));
      const id = await reason.getAttribute("id");
      expect(id).toBeTruthy();
      const fields = page.locator("[data-intake-panel] input, [data-intake-panel] textarea");
      const all = await fields.evaluateAll((els, rid) => els.map((el) => ({
        disabled: (el as HTMLInputElement).disabled,
        described: (el.getAttribute("aria-describedby") ?? "").split(/\s+/).includes(rid as string),
      })), id);
      expect(all.length).toBeGreaterThan(40);
      expect(all.every((f) => f.disabled), "every field disabled").toBe(true);
      expect(all.every((f) => f.described), "every field described by the sentence").toBe(true);
      // B11a: the « Entretien » card (EV-341w), below the sentence.
      const card = page.getByRole("region", { name: lang === "en" ? "Intake" : "Entretien", exact: true });
      await expect(card.getByRole("button", { name: lang === "en" ? "Ask for consent" : "Demander l'accord", exact: true })).toBeVisible();
      const [reasonBox, cardBox] = await Promise.all([reason.boundingBox(), card.boundingBox()]);
      expect(cardBox!.y).toBeGreaterThan(reasonBox!.y);
      // Nothing is sent from a disabled page.
      await page.waitForTimeout(500);
      expect((await puts(page)).length).toBe(0);
    });
  });
}

test.describe("B11 on /invited/[userId]", () => {
  test("the same sentence, worded for an account not activated yet, beside a disabled « Entretien » control; no button to ask", async ({
    page,
  }) => {
    await signIn(page);
    await page.getByRole("button", { name: "Add a client", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Add a client" });
    await dialog.getByLabel("Name", { exact: true }).fill("Inès Ouali");
    await dialog.getByLabel("Email address", { exact: true }).fill("ines@example.com");
    await dialog.getByRole("button", { name: "Add client", exact: true }).click();
    const done = page.getByRole("dialog", { name: "Account set up" });
    await done.getByRole("button", { name: "Done", exact: true }).click();
    await page.locator("[data-invited-section]").getByRole("group", { name: "Inès Ouali", exact: true }).getByRole("link").click();
    await page.waitForURL(/\/invited\/[0-9a-f-]{36}$/);
    const section = page.locator("[data-invited-intake]");
    await expect(section.getByRole("heading", { level: 2, name: "Intake", exact: true })).toBeVisible();
    const control = section.getByRole("button", { name: "Intake", exact: true });
    await expect(control).toBeDisabled();
    await expect(control).toHaveAccessibleDescription(
      "You can save the intake once Inès has activated their account and allowed the intake in the app."
    );
    await expect(section.getByRole("button", { name: "Ask for consent" })).toHaveCount(0);
  });
});

// ── B12 the revoke dialog ────────────────────────────────────────────────────

const REVOKE = {
  en: {
    more: "More",
    revoke: "Revoke access",
    title: "Revoke access?",
    body: "Lina M. will be removed from your roster and you will no longer see their training data. If you recorded an intake interview with Lina M., it will be permanently deleted. They keep their Evoli Fit account and all of their training history.",
  },
  fr: {
    more: "Plus",
    revoke: "Révoquer l'accès",
    title: "Révoquer l'accès ?",
    body: "Lina M. sera retiré de votre liste de clients et vous ne verrez plus ses données d'entraînement. Si vous avez mené un entretien avec Lina M., il sera supprimé définitivement. Son compte Evoli Fit et tout son historique d'entraînement sont conservés.",
  },
} as const;

for (const lang of ["en", "fr"] as const) {
  test.describe(`B12 the revoke dialog (${lang.toUpperCase()})`, () => {
    test.use({ locale: T[lang].locale });

    test("the body names the intake's permanent deletion; title and buttons unchanged", async ({ page }) => {
      await signIn(page, lang);
      await page.goto(OVERVIEW);
      await page.locator(".client-head").getByRole("button", { name: REVOKE[lang].more, exact: true }).click();
      await page.getByRole("menuitem", { name: REVOKE[lang].revoke, exact: true }).click();
      const dialog = page.getByRole("dialog", { name: REVOKE[lang].title, exact: true });
      await expect(dialog).toBeVisible();
      await expect.poll(async () => plain(await dialog.locator("p").first().textContent())).toBe(plain(REVOKE[lang].body));
      for (const name of lang === "en" ? ["Cancel", "Revoke access"] : ["Annuler", "Révoquer l'accès"]) {
        await expect(dialog.getByRole("button", { name, exact: true })).toBeVisible();
      }
    });
  });
}

// ── B13 / B13a the route handler ─────────────────────────────────────────────

test.describe("B13 / B13a the route handler", () => {
  const PATH = `/api/clients/${LINA}/intake/GOALS`;
  const BODY = { version: 0, values: { notes: "x" } };

  async function saveOps(page: Page): Promise<number> {
    return (await fixtureCalls(page)).api.filter((e) => e.op === "saveIntakeSection").length;
  }

  test("a foreign Origin, a body that is not JSON, and any method but PUT are refused, and the fixture backend receives nothing", async ({
    page,
  }) => {
    await signIn(page);
    await grant(page);
    const before = await saveOps(page);
    const foreign = await page.request.put(PATH, {
      data: BODY,
      headers: { Origin: "https://evil.example", "Content-Type": "application/json" },
      maxRedirects: 0,
    });
    expect(foreign.status()).toBe(403);
    expect(await foreign.json()).toEqual({ code: "CROSS_ORIGIN" });
    const nullOrigin = await page.request.put(PATH, { data: BODY, headers: { Origin: "null", "Content-Type": "application/json" }, maxRedirects: 0 });
    expect(nullOrigin.status()).toBe(403);
    const crossSite = await page.request.put(PATH, {
      data: BODY,
      headers: { "Sec-Fetch-Site": "cross-site", "Content-Type": "application/json" },
      maxRedirects: 0,
    });
    expect(crossSite.status()).toBe(403);
    for (const type of ["text/plain", "application/x-www-form-urlencoded", "multipart/form-data; boundary=x"]) {
      const res = await page.request.put(PATH, { data: JSON.stringify(BODY), headers: { "Content-Type": type }, maxRedirects: 0 });
      expect(res.status(), type).toBe(415);
    }
    for (const method of ["GET", "POST", "PATCH", "DELETE"]) {
      const res = await page.request.fetch(PATH, {
        method,
        data: method === "GET" ? undefined : BODY,
        headers: { "Content-Type": "application/json" },
        maxRedirects: 0,
      });
      expect(res.status(), method).toBe(405);
    }
    expect(await saveOps(page), "the fixture backend received no request").toBe(before);
    expect((await puts(page)).length).toBe(0);
  });

  test("N1-N3: a section this page does not save is 400, a body over 64 KB is 413, both before any session work or api call", async ({
    page,
  }) => {
    await signIn(page);
    await grant(page);
    const before = await saveOps(page);
    const subject = await subjectHeader(page);
    const health = await page.request.put(`/api/clients/${LINA}/intake/HEALTH`, {
      data: BODY,
      headers: { "Content-Type": "application/json", ...subject },
    });
    expect(health.status()).toBe(400);
    expect(await health.json()).toEqual({ code: "INVALID_REQUEST", field: "section" });
    const big = await page.request.put(PATH, {
      data: { version: 0, values: { notes: "x".repeat(70 * 1024) } },
      headers: { "Content-Type": "application/json", ...subject },
    });
    expect(big.status()).toBe(413);
    // Refused on its own, even with no account named: the session is resolved only after.
    const noSubject = await page.request.put(`/api/clients/not-a-uuid/intake/GOALS`, { data: BODY, headers: { "Content-Type": "application/json" } });
    expect(noSubject.status()).toBe(403);
    expect(await saveOps(page)).toBe(before);
  });

  test("every 2xx is application/json with exactly { version, updatedAt }", async ({ page }) => {
    await signIn(page);
    await grant(page);
    const subject = await subjectHeader(page);
    for (const version of [0, 1, 2]) {
      const res = await page.request.put(PATH, {
        data: { version, values: { notes: `n${version}` } },
        headers: { "Content-Type": "application/json", ...subject },
      });
      expect(res.status()).toBe(200);
      expect(res.headers()["content-type"]).toMatch(/^application\/json/);
      const body = (await res.json()) as Record<string, unknown>;
      expect(Object.keys(body).sort()).toEqual(["updatedAt", "version"]);
      expect(body.version).toBe(version + 1);
      expect(typeof body.updatedAt).toBe("string");
      // ADR-0034 A34.1 (C1): the step that served the bearer; a live access cookie is "cookie".
      expect(res.headers()["x-evoli-token-source"]).toBe("cookie");
    }
  });

  test("C1 (ADR-0034 A34.1): the BFF read and the consent poll name the step too; a request refused before the session names none", async ({
    page,
  }) => {
    await signIn(page);
    await grant(page);
    for (const path of [`/api/bff/clients/${LINA}/intake`, `/api/bff/clients/${LINA}/intake-consent`]) {
      const res = await page.request.get(path);
      expect(res.status(), path).toBe(200);
      expect(res.headers()["x-evoli-token-source"], path).toBe("cookie");
      expect(res.headers()["x-evoli-token-source"]).not.toMatch(/ey[A-Za-z0-9_-]{10,}/);
    }
    const refused = await page.request.put(`/api/clients/${LINA}/intake/HEALTH`, { data: BODY, headers: { "Content-Type": "application/json" } });
    expect(refused.status()).toBe(400);
    expect(refused.headers()["x-evoli-token-source"]).toBeUndefined();
    // "refreshed" needs a refresh the fixture cannot answer (the middleware's own rotation calls the
    // real api): it is read live, in the B17 run (`rotated`), and by A34.1's post-deploy check.
  });

  test("a stale version is 409 with the stored version, and never a value", async ({ page }) => {
    await signIn(page);
    await grant(page);
    await putFromElsewhere(page, "GOALS", 0, { notes: "Secret note" });
    const res = await page.request.put(PATH, {
      data: { version: 0, values: { notes: "late" } },
      headers: { "Content-Type": "application/json", ...(await subjectHeader(page)) },
    });
    expect(res.status()).toBe(409);
    const text = await res.text();
    expect(JSON.parse(text)).toMatchObject({ code: "INTAKE_VERSION_CONFLICT", version: 1 });
    expect(text).not.toContain("Secret note");
  });

  test("without the grant a save is 403 and stores nothing", async ({ page }) => {
    await signIn(page);
    const res = await page.request.put(PATH, { data: BODY, headers: { "Content-Type": "application/json", ...(await subjectHeader(page)) } });
    expect(res.status()).toBe(403);
    expect(await res.json()).toEqual({ code: "COACH_ACCESS_DENIED" });
  });

  test("ADR-0033 D33.14 point 4: a save naming another account than the cookies', or none, is 401 SESSION_CHANGED and reaches no api", async ({
    page,
  }) => {
    await signIn(page);
    await grant(page);
    const before = await saveOps(page);
    for (const headers of [{}, { "x-evoli-session-subject": "0".repeat(32) }] as Record<string, string>[]) {
      const res = await page.request.put(PATH, { data: BODY, headers: { "Content-Type": "application/json", ...headers } });
      expect(res.status(), JSON.stringify(headers)).toBe(401);
      expect(await res.json()).toEqual({ code: "SESSION_CHANGED" });
    }
    expect(await saveOps(page)).toBe(before);
  });

  test("a signed-out save is the middleware's redirect to /login, never a 2xx", async ({ playwright, baseURL }) => {
    const anonymous = await playwright.request.newContext({ baseURL });
    try {
      const res = await anonymous.put(PATH, { data: BODY, headers: { "Content-Type": "application/json" }, maxRedirects: 0 });
      expect(res.status()).toBe(307);
      expect(res.headers().location).toMatch(/\/login/);
    } finally {
      await anonymous.dispose();
    }
  });
});

// ── B14 access ended ─────────────────────────────────────────────────────────

test.describe("B14 access ended", () => {
  test("a 403 on a save (revoked mid-interview): saves stop, the denied page shows, and leaving it asks nothing", async ({ page }) => {
    await signIn(page);
    await grant(page);
    await page.goto(OVERVIEW);
    await openIntake(page);
    await notes(page, "GOALS").fill("Before the revoke");
    await notes(page, "GOALS").press("Tab");
    await settledSaved(page);
    await setSwitch(page.context(), page, "evoli_fixture_link", "ended");
    // ONE save meets the 403 (the blur sends it at once); nothing else is touched until the
    // denied page (staff r1 B1: a second interaction raced the 403's navigation).
    await notes(page, "GOALS").fill("After the revoke");
    await notes(page, "GOALS").press("Tab");
    await page.waitForURL("/clients/denied", { timeout: 15_000 });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(T.en.denied);
    const count = (await puts(page)).length;
    let dialogs = 0;
    page.on("dialog", (d) => {
      dialogs += 1;
      void d.dismiss();
    });
    await page.locator("nav.shell-side-nav").getByRole("link").first().click();
    await page.waitForURL((u) => u.pathname !== "/clients/denied");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(dialogs).toBe(0);
    await page.waitForTimeout(2_000);
    expect((await puts(page)).length, "no save after access ended").toBe(count);
  });
});

test.describe("B14 access ended, before the denied page lands (staff r1 S2)", () => {
  test("the fields are disabled the moment access ends, and typing cannot make the form unsaved again", async ({ page }) => {
    await signIn(page);
    await grant(page);
    await openIntake(page);
    // Hold the refresh that carries the page to /clients/denied, so the ended page can be read.
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(`**${INTAKE}**`, async (route) => {
      if (route.request().headers()["rsc"] === "1") await held;
      await route.continue();
    });
    await setSwitch(page.context(), page, "evoli_fixture_link", "ended");
    await notes(page, "GOALS").fill("After the revoke");
    await notes(page, "GOALS").press("Tab");
    await expect(page.locator('[data-intake-ready="disabled"]')).toHaveCount(1);
    await expect(notes(page, "GOALS")).toBeDisabled();
    await expect(panel(page, "GOALS").getByRole("radio").first()).toBeDisabled();
    expect(await page.evaluate(() => window.history.state?.evoliUnsavedGuard === true), "no guard entry").toBe(false);
    release();
    await page.waitForURL("/clients/denied", { timeout: 15_000 });
  });
});

// ── B15 session ended ────────────────────────────────────────────────────────

test.describe("B15 session ended", () => {
  test("a save redirected to /login: saves stop, the sentence with « Try again », the leave prompt still asks; after signing in elsewhere, Try again saves", async ({
    page,
    context,
  }) => {
    test.setTimeout(90_000);
    await signIn(page);
    await grant(page);
    await openIntake(page);
    // The session ends (signed out in another tab): no cookie reaches the middleware any more.
    const epoch = (await context.cookies()).filter((c) => c.name === "evoli_pro_epoch");
    await context.clearCookies();
    await context.addCookies(epoch);
    await notes(page, "GOALS").fill("Typed after the session ended");
    await notes(page, "GOALS").press("Tab");
    await expect(alertOf(page, "signedOut")).toBeVisible();
    expect(plain(await alertOf(page, "signedOut").locator("p").textContent())).toBe(plain(T.en.sessionEnded));
    await expect(notes(page, "GOALS")).toHaveValue("Typed after the session ended");
    // The leave prompt still appears.
    await page.getByRole("main").getByRole("navigation", { name: T.en.nav, exact: true }).getByRole("link", { name: "Overview", exact: true }).click();
    await expect(page.getByRole("dialog", { name: T.en.leave, exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Stay on this page", exact: true }).click();
    // Sign in again in a new tab.
    const other = await context.newPage();
    await signInThroughForm(other, { lang: "en" });
    await other.close();
    const before = (await puts(page, "GOALS")).length;
    // The other tab's sign-in is a new session epoch: SessionEpochGuard (ADR-0033 D33.14) keeps
    // this tab, which holds unsaved work, and stops every unmarked click. « Try again » is marked.
    await alertOf(page, "signedOut").getByRole("button", { name: T.en.tryAgain, exact: true }).click();
    await waitForPuts(page, "GOALS", before + 1);
    expect((await puts(page, "GOALS")).at(-1)!.body.values.notes).toBe("Typed after the session ended");
    // Saved (200): nothing is unsaved any more, so the guard lets the stale document go and the
    // page reloads under the new session, showing the stored note.
    // Resumed on the first section with no answer (B6), so GOALS is chosen to read it.
    await expect(tab(page, "HISTORY")).toHaveAttribute("aria-selected", "true", { timeout: 15_000 });
    await expect(page.locator("[data-nav-progress-ready]"), "the reloaded page hydrated").toHaveCount(1);
    await tab(page, "GOALS").click();
    await expect(notes(page, "GOALS")).toHaveValue("Typed after the session ended");
    const read = await page.request.get(`/api/bff/clients/${LINA}/intake`);
    expect(((await read.json()) as { sections: { GOALS: { values: { notes: string } } } }).sections.GOALS.values.notes).toBe(
      "Typed after the session ended"
    );
  });
});

// ── B16 section notes ────────────────────────────────────────────────────────

for (const lang of ["en", "fr"] as const) {
  test.describe(`B16 section notes (${lang.toUpperCase()})`, () => {
    test.use({ locale: T[lang].locale });

    test("a live counter in code points, no maxLength; over 1,000 the error shows and no save is sent until it is back under", async ({ page }) => {
      await signIn(page, lang);
      await grant(page);
      await openIntake(page);
      const field = notes(page, "LIFESTYLE", lang);
      await tab(page, "LIFESTYLE").click();
      expect(await field.getAttribute("maxlength")).toBeNull();
      const counter = panel(page, "LIFESTYLE").locator(".intake-counter");
      await field.fill("\u{1F600}");
      await expect.poll(async () => plain(await counter.textContent())).toBe(lang === "en" ? "1 / 1,000" : "1 / 1 000");
      await field.press("Tab");
      await waitForPuts(page, "LIFESTYLE", 1);
      await settledSaved(page, lang);

      await field.fill("\u{1F600}".repeat(1001));
      await expect.poll(async () => plain(await counter.textContent())).toBe(lang === "en" ? "1,001 / 1,000" : "1 001 / 1 000");
      await expect(counter).toHaveAttribute("data-over", "true");
      await expectNoSavedStatus(page); // blocked (B16): its section saved before, « Enregistré » must not stay
      const error = panel(page, "LIFESTYLE").locator('[data-intake-error="notes"]');
      expect(plain(await error.textContent())).toBe(plain(T[lang].tooLong));
      expect(await counter.evaluate((el) => getComputedStyle(el).color)).toBe(await error.evaluate((el) => getComputedStyle(el).color));
      await field.press("Tab");
      await page.waitForTimeout(3_000);
      expect((await puts(page, "LIFESTYLE")).length, "no save over 1,000").toBe(1);

      await field.fill("\u{1F600}".repeat(1000));
      await expect(error).toHaveCount(0);
      await field.press("Tab");
      await waitForPuts(page, "LIFESTYLE", 2);
      expect((await puts(page, "LIFESTYLE"))[1].body.values.notes).toBe("\u{1F600}".repeat(1000));
    });
  });
}

// ── Staff round 1 ────────────────────────────────────────────────────────────

test.describe("staff r1 S3: a key the portal does not know is never cleared by its whole-section save", () => {
  test("a stored unknown key (EV-341y1's emphasis, an api ahead of this build) survives a save, and « Recharger » refreshes it", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await signIn(page);
    await grant(page);
    await setSwitch(page.context(), page, "evoli_fixture_intake_extra", "on");
    await putFromElsewhere(page, "GOALS", 0, { primaryGoal: "LOSE_WEIGHT", emphasis: ["glutes"] });
    await openIntake(page);
    await tab(page, "GOALS").click();
    await notes(page, "GOALS").fill("Mine");
    await notes(page, "GOALS").press("Tab");
    await settledSaved(page);
    const sent = (await puts(page, "GOALS")).at(-1)!;
    expect(sent.body.values.emphasis, "sent back as stored").toEqual(["glutes"]);
    expect(sent.body.values.notes).toBe("Mine");
    const read = await page.request.get(`/api/bff/clients/${LINA}/intake`);
    expect(((await read.json()) as { sections: { GOALS: { values: Record<string, unknown> } } }).sections.GOALS.values.emphasis).toEqual([
      "glutes",
    ]);

    // Another tab changes it; this tab's next save conflicts; « Recharger » takes the new stored keys too.
    await putFromElsewhere(page, "GOALS", 2, { primaryGoal: "LOSE_WEIGHT", notes: "Mine", emphasis: ["hamstrings"] });
    await notes(page, "GOALS").fill("Mine, again");
    await notes(page, "GOALS").press("Tab");
    await expect(alertOf(page, "conflict")).toBeVisible();
    await alertOf(page, "conflict").getByRole("button", { name: T.en.reload, exact: true }).click();
    await expect(alertOf(page, "conflict")).toHaveCount(0);
    const before = (await puts(page, "GOALS")).length;
    await panel(page, "GOALS").getByRole("checkbox", { name: "Health", exact: true }).check();
    await waitForPuts(page, "GOALS", before + 1);
    expect((await puts(page, "GOALS")).at(-1)!.body.values.emphasis, "the stored value after « Recharger »").toEqual(["hamstrings"]);
  });
});

test.describe("B16a (staff r1 S4): GOALS' event, counted in code points", () => {
  test("no maxLength; over 80 code points the sentence shows and the section is not sent", async ({ page }) => {
    await signIn(page);
    await grant(page);
    await openIntake(page);
    await saveAnotherSectionFirst(page);
    const field = panel(page, "GOALS").getByRole("textbox", { name: "Event", exact: true });
    expect(await field.getAttribute("maxlength")).toBeNull();
    await field.fill("\u{1F600}".repeat(80));
    await field.press("Tab");
    await waitForPuts(page, "GOALS", 1);
    expect((await puts(page, "GOALS"))[0].body.values.eventLabel, "80 emoji are 80 code points").toBe("\u{1F600}".repeat(80));
    await settledSaved(page);
    await field.fill("\u{1F600}".repeat(81));
    await expect(panel(page, "GOALS").locator('[data-intake-error="eventLabel"]')).toHaveText("Too long: 80 characters at most.");
    await expect(field).toHaveAccessibleDescription("Too long: 80 characters at most.");
    await expect(panel(page, "GOALS").locator(".intake-counter"), "no counter on the event (B16a)").toHaveCount(1); // the notes' own
    await expect(field).toHaveAttribute("aria-invalid", "true");
    await expectNoSavedStatus(page);
    await field.press("Tab");
    await page.waitForTimeout(3_000);
    expect((await puts(page, "GOALS")).length, "nothing sent over 80").toBe(1);
  });
});

test.describe("staff r1 S5: « Recharger » never fails in silence", () => {
  async function conflict(page: Page) {
    await signIn(page);
    await grant(page);
    await openIntake(page);
    await notes(page, "GOALS").fill("Mine");
    await notes(page, "GOALS").press("Tab");
    await settledSaved(page);
    await putFromElsewhere(page, "GOALS", 1, { notes: "Theirs" });
    await notes(page, "GOALS").fill("Mine again");
    await notes(page, "GOALS").press("Tab");
    await expect(alertOf(page, "conflict")).toBeVisible();
  }

  test("busy while the read is out; a failed read says so with the block's load sentence, and the conflict stays", async ({ page }) => {
    await conflict(page);
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(`**/api/bff/clients/${LINA}/intake`, async (route) => {
      await held;
      await route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ code: "UPSTREAM" }) });
    });
    const button = alertOf(page, "conflict").getByRole("button", { name: T.en.reload, exact: true });
    await button.click();
    await expect(button, "busy while the read is out").toBeDisabled();
    release();
    await expect(alertOf(page, "conflict").locator("[data-intake-reload-failed]")).toHaveText(
      "This block could not be loaded. Reload the page to try again."
    );
    await expect(button).toBeEnabled();
    await expect(notes(page, "GOALS")).toHaveValue("Mine again");
  });

  test("a read sent to /login is B15's state: the session sentence and « Try again »", async ({ page }) => {
    await conflict(page);
    await page.route(`**/api/bff/clients/${LINA}/intake`, (route) =>
      route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ code: "SESSION_EXPIRED" }) })
    );
    await alertOf(page, "conflict").getByRole("button", { name: T.en.reload, exact: true }).click();
    await expect(alertOf(page, "signedOut")).toBeVisible();
    expect(plain(await alertOf(page, "signedOut").locator("p").textContent())).toBe(plain(T.en.sessionEnded));
  });
});

test.describe("staff r1 S7: another account signs in, in another tab", () => {
  test("the next save is refused SESSION_CHANGED: B15's state stays, « Try again » cannot write, and the fixture records no write", async ({
    page,
    context,
  }) => {
    test.setTimeout(90_000);
    await signIn(page);
    await grant(page);
    await openIntake(page);
    await notes(page, "GOALS").fill("Coach A");
    await notes(page, "GOALS").press("Tab");
    await settledSaved(page);
    const written = (await puts(page)).length;
    // Tab 1 holds unsaved work when the account changes (a note over 1,000: blocked, nothing sent),
    // so SessionEpochGuard keeps it on screen rather than reloading it under coach B (D33.14 point 4).
    await notes(page, "GOALS").fill("\u{1F600}".repeat(1001));
    await page.waitForFunction(() => window.history.state?.evoliUnsavedGuard === true);

    // Another tab signs coach B in: the browser's cookies are now B's (a signed-in /login page
    // would send that tab to the roster, so the sign-in is the auth route's own POST).
    const login = await context.request.post("/api/auth/login", {
      data: { email: "second.coach@evoli.fit", password: "Password123!" },
      maxRedirects: 0,
    });
    expect(login.status()).toBe(200);

    const answers: { status: number; code: string | null }[] = [];
    page.on("response", async (res) => {
      if (res.request().method() === "PUT" && new URL(res.url()).pathname.includes("/intake/")) {
        answers.push({ status: res.status(), code: ((await res.json().catch(() => null)) as { code?: string } | null)?.code ?? null });
      }
    });
    await notes(page, "GOALS").fill("Typed under coach B's cookies");
    await notes(page, "GOALS").press("Tab");
    await expect(alertOf(page, "signedOut")).toBeVisible();
    await alertOf(page, "signedOut").getByRole("button", { name: T.en.tryAgain, exact: true }).click();
    await expect.poll(() => answers.length).toBe(2);
    expect(answers).toEqual([
      { status: 401, code: "SESSION_CHANGED" },
      { status: 401, code: "SESSION_CHANGED" },
    ]);
    await expect(alertOf(page, "signedOut")).toBeVisible();
    await expect(notes(page, "GOALS")).toHaveValue("Typed under coach B's cookies");
    expect((await puts(page)).length, "no write reached the fixture").toBe(written);
  });
});

for (const lang of ["en", "fr"] as const) {
  test.describe(`staff r1 N4 / B8a: the section select's name and the motivations limit (${lang.toUpperCase()})`, () => {
    test.use({ locale: T[lang].locale });

    test("the select is « Section »; the hint describes the motivations group and each of its boxes", async ({ page }) => {
      await signIn(page, lang);
      await grant(page);
      await openIntake(page);
      const hintText = lang === "en" ? "Up to 3." : "3 au maximum.";
      const hint = panel(page, "GOALS").locator('[data-intake-hint="motivations"]');
      await expect(hint).toHaveText(hintText);
      await expect(panel(page, "GOALS").getByRole("group", { name: "Motivations", exact: true })).toHaveAccessibleDescription(hintText);
      await expect(panel(page, "GOALS").getByRole("checkbox", { name: lang === "en" ? "Health" : "Santé", exact: true })).toHaveAccessibleDescription(hintText);
      expect(await page.locator("select.intake-select").getAttribute("aria-label")).toBe("Section");
    });
  });
}

/*
 * Staff r2 S1 — BUG-704's render-error switch on the intake page WITH THE FLAG ON. The every-route
 * spec (`render-error-every-route.spec.ts`) runs on the roster server, where the page is dark, so
 * it lists the page in NO_SHELL; this is that route's case on the server that draws it.
 */
for (const lang of ["en", "fr"] as const) {
  test.describe(`BUG-704 on the intake page, flag on (${lang.toUpperCase()})`, () => {
    test.use({ locale: T[lang].locale });

    test("the switch off: the page's own h1; on: the root error page, inside the shell", async ({ page }) => {
      const sentence = lang === "en" ? "Something went wrong." : "Une erreur est survenue.";
      await signIn(page, lang);
      await grant(page);
      await page.goto(INTAKE);
      await expect(page.locator("h1").first()).toBeVisible();
      expect(await page.locator("h1").allTextContents()).not.toContain(sentence);
      await page.context().addCookies([{ name: "evoli_fixture_render_error", value: "always", url: new URL("/", page.url()).href }]);
      await page.goto(INTAKE);
      await expect(page.locator("h1").first()).toBeVisible();
      expect(await page.locator("h1").allTextContents()).toEqual([sentence]);
      await expect(page.locator(".app-shell")).toHaveCount(1);
    });
  });
}
