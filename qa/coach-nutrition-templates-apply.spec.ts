import { expect, type BrowserContext, type Page, type Request } from "@playwright/test";
import { test } from "./fixture-test";
import { expectNoEnglish, signInFrench } from "./french";
import { atEachWidth, expectNoSidewaysScroll, expectUnoccluded } from "./layout";

/**
 * EV-273b AC3, AC4, AC5 and AC7 — "Use on a trainee", in fixture mode on the POPULATED
 * scenario (`playwright.roster.config.ts`), because the picker is built from the roster.
 *
 * Two witnesses, and each proves something the other cannot:
 *
 *   · THE BROWSER'S NETWORK LOG. Every write is a server action, and ADR-0016b D16b.7
 *     rule 0 is about the browser: targets and week are TWO actions, and the second
 *     starts only after the first has answered. `actionTimeline` records each action's
 *     start and finish in the order the browser saw them. It also classifies each by
 *     its arguments: `["<id>", {calories…}]` is the targets step, `["<id>",
 *     "YYYY-MM-DD"]` the week, `["<id>"]` the dialog-open read.
 *   · THE FIXTURE'S CALL JOURNAL (`/api/fixture/calls`). What reached the api, with the
 *     body's KEY SET as serialised: `POST …/week/apply {weekStart}` is AC5's "keys
 *     exactly `weekStart`", read off the request.
 *
 * "No answer" is produced by ABORTING the browser's request for that step
 * (`route.abort()`), which AC5 names. The other outcomes use the fixture's cookie
 * switches (`evoli_fixture_targets`, `evoli_fixture_week`, `evoli_fixture_link`), which
 * are scoped to this browser context.
 *
 * Sentences are LITERALS, never imported from `src/lib/copy.ts`.
 *
 * Fixture facts used (`src/lib/coachApi.fixture.ts`):
 *   Petra L. — NUTRITION only, floor 1200, targets 1850 / 130 / 180 / 60.
 *   Tobias R. — all scopes, floor 1500, no targets ("Not set").
 *   Lina M.  — all scopes. Yusuf A. (WORKOUTS only), Sara P. (no NUTRITION) and Mara D.
 *             (no scopes) must NOT be offered.
 *   Templates — "Cut 1800" (with a meal structure stored through the api: edge case 9),
 *               "Lean 1300", "Reset 1100".
 */

const EMAIL = "coach@evoli.fit";
const PASSWORD = "Password123!";
const PETRA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0006";
const TOBIAS = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0009";

const CUT = "Cut 1800";
const LEAN = "Lean 1300";
const RESET = "Reset 1100";

/* ── AC sentences, verbatim ─────────────────────────────────────────────────── */
const confirmTitle = (t: string, first: string) => `Use “${t}” on ${first}?`;
const confirmBody = (first: string, weekStart: string) =>
  `${first}'s meals for this week (from ${weekStart}) are rebuilt to these targets straight away, with their own number of meals a day. Their allergies and dietary rules still apply. Meals they have locked or already eaten are kept.`;
const floorWarning = (first: string) =>
  `If this is below ${first}'s safe minimum, Evoli raises it to the minimum and tells you.`;
const applied = (t: string, first: string) => `“${t}” is now ${first}'s plan.`;
const floorRaised = (n: number) => `Calories raised to a safe minimum of ${n} kcal.`;
const weekRateLimited = (first: string) =>
  `${first}'s targets are updated. Their meals weren't rebuilt: a week has already been applied for them today. Try again tomorrow.`;
/** PB-5: the sentence quotes the week card's button by its own label, the FULL name. */
const weekFailed = (first: string, button: string) =>
  `${first}'s targets are updated. Their meals couldn't be rebuilt. Use “${button}” to try again.`;
const weekUnknown = (first: string) =>
  `${first}'s targets are updated. We couldn't confirm whether their meals were rebuilt. Check their nutrition page before you try again.`;
const targetsFailed = (first: string) => `Nothing was changed for ${first}. Try again.`;
const targetsUnknown = (first: string) =>
  `We couldn't confirm whether ${first}'s targets changed. Check their nutrition page before you try again.`;

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/");
}

async function calls(page: Page): Promise<string[]> {
  const res = await page.request.get("/api/fixture/calls", { maxRedirects: 0 });
  expect(res.status()).toBe(200);
  return ((await res.json()) as { calls: string[] }).calls;
}
const traineeWrites = (journal: string[]) =>
  journal.filter((c) => /^(PUT|POST) \/coach-portal\/clients\//.test(c));

/** The server's Monday, as the fixture computes `currentWeekStart`, formatted like the page. */
function weekStartLabel(): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  // BUG-210: the portal pins September to "Sep"; ICU 72+ writes "Sept" in en-GB.
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    .format(d)
    .replace(/\bSept\b/, "Sep");
}

type Step = "read" | "targets" | "week" | "other";

function stepOf(request: Request): Step | null {
  if (request.method() !== "POST" || request.headers()["next-action"] === undefined) return null;
  const body = request.postData() ?? "";
  if (body.includes('"calories"')) return "targets";
  if (/^\["[^"]+","\d{4}-\d{2}-\d{2}"\]$/.test(body)) return "week";
  if (/^\["[^"]+"\]$/.test(body)) return "read";
  return "other";
}

/**
 * Each server action's start and ANSWER, in the order the browser saw them.
 *
 * "end" is the RESPONSE event (status and headers in), not `requestfinished`: a server
 * action's body keeps streaming the revalidated page after its result, so the island
 * legitimately moves on before the body has finished. The result can only be read
 * after the headers, so "week:start after targets:end" is exactly "the second starts
 * only after the first has answered". A request that dies with no answer ends with
 * `requestfailed`.
 */
function actionTimeline(page: Page): string[] {
  const log: string[] = [];
  const answered = new Set<Request>();
  page.on("request", (r) => {
    const step = stepOf(r);
    if (step) log.push(`${step}:start`);
  });
  // The FIRST of the two per request: a body still streaming when the island navigates
  // away is cut off, and fails AFTER its response — that is not a second answer.
  const end = (r: Request) => {
    const step = stepOf(r);
    if (!step || answered.has(r)) return;
    answered.add(r);
    log.push(`${step}:end`);
  };
  page.on("response", (res) => end(res.request()));
  page.on("requestfailed", end);
  return log;
}

/** Abort the browser's request for ONE step — AC5's "no answer". */
async function abortStep(page: Page, step: Step) {
  await page.route(
    (url) => url.pathname === "/nutrition-templates",
    async (route) => {
      if (stepOf(route.request()) === step) await route.abort("connectionreset");
      else await route.continue();
    }
  );
}

async function setSwitch(context: BrowserContext, baseURL: string, name: string, value: string) {
  await context.addCookies([{ name, value, url: baseURL }]);
}

function row(page: Page, name: string) {
  return page.getByRole("group", { name, exact: true });
}

/** Library → "Use on a trainee" on `template` → choose `trainee`. Returns the confirm dialog. */
async function openConfirm(page: Page, template: string, trainee: string, first: string) {
  await page.goto("/nutrition-templates");
  const picker = page.getByRole("dialog", { name: "Use on a trainee" });
  await expect(async () => {
    await row(page, template).getByRole("button", { name: "Use on a trainee" }).click();
    await expect(picker).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  await picker.getByRole("button", { name: trainee, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: confirmTitle(template, first) });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Confirm" })).toBeEnabled();
  return dialog;
}

/** Cells of the Now | After table, by row label. */
async function tableRows(dialog: ReturnType<Page["getByRole"]>) {
  return dialog.locator("tbody tr").evaluateAll((trs) =>
    trs.map((tr) => [...tr.querySelectorAll("th,td")].map((c) => (c.textContent ?? "").trim()))
  );
}

function outcome(page: Page) {
  return page.getByTestId("template-use-outcome");
}

/* ═══════════════════════════════════════════════════════════════════════════ */

test.describe("AC3 — who it can be used on", () => {
  test("only ACTIVE links with NUTRITION are offered; the others are not offered at all", async ({ page }) => {
    await signIn(page);
    await page.goto("/nutrition-templates");
    await row(page, CUT).getByRole("button", { name: "Use on a trainee" }).click();
    const picker = page.getByRole("dialog", { name: "Use on a trainee" });
    const offered = await picker.getByRole("listitem").allInnerTexts();
    expect(offered.map((s) => s.trim()).sort()).toEqual(["Lina M.", "Petra L.", "Tobias R."]);
    for (const absent of ["Yusuf A.", "Sara P.", "Mara D."]) {
      await expect(picker.getByText(absent)).toHaveCount(0);
    }
  });

  test("AC1 / edge case 9 — a template with a structure stored through the api shows none", async ({ page }) => {
    await signIn(page);
    await page.goto("/nutrition-templates");
    const cut = row(page, CUT);
    await expect(cut.getByText("1800 kcal · P 150 g · C 170 g · F 60 g", { exact: true })).toBeVisible();
    expect(await page.locator("main").innerText()).not.toMatch(/meals? (a|per) day|snack|Meal \d|\b4 meals/i);
  });
});

test.describe("AC4 — the confirm dialog, from a read made when it opens", () => {
  test("opening it reads the trainee's nutrition THEN, and shows Now | After and the week", async ({ page }) => {
    await signIn(page);
    await page.goto("/nutrition-templates");
    await quietMs(page);
    const readPath = `GET /coach-portal/clients/${PETRA}/nutrition`;
    expect(await calls(page), "the library page reads no trainee's nutrition").not.toContain(readPath);

    const timeline = actionTimeline(page);
    const dialog = await openConfirm(page, CUT, "Petra L.", "Petra");
    expect(timeline.filter((e) => e === "read:start"), "one read, at open").toHaveLength(1);
    expect((await calls(page)).filter((c) => c === readPath)).toHaveLength(1);

    expect(await tableRows(dialog)).toEqual([
      ["Calories", "1850 kcal", "1800 kcal"],
      ["Protein", "130 g", "150 g"],
      ["Carbs", "180 g", "170 g"],
      ["Fat", "60 g", "60 g"],
    ]);
    await expect(dialog.getByRole("columnheader", { name: "Now" })).toBeVisible();
    await expect(dialog.getByRole("columnheader", { name: "After" })).toBeVisible();
    await expect(dialog.getByText(confirmBody("Petra", weekStartLabel()), { exact: true })).toBeVisible();
    // 1800 is not below 1500: no floor warning. And nothing about a meal structure,
    // although "Cut 1800" has one stored (edge case 9).
    await expect(dialog.getByText(floorWarning("Petra"), { exact: true })).toHaveCount(0);
    expect(await dialog.innerText()).not.toMatch(/Meal \d|snack|4 meals/i);
    // Cancel writes nothing.
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await quietMs(page);
    expect(traineeWrites(await calls(page))).toEqual([]);
  });

  test("a trainee with no targets reads Not set, and a template under 1500 kcal warns", async ({ page }) => {
    await signIn(page);
    const dialog = await openConfirm(page, LEAN, "Tobias R.", "Tobias");
    expect((await tableRows(dialog)).map((r) => r[1])).toEqual(["Not set", "Not set", "Not set", "Not set"]);
    await expect(dialog.getByText(floorWarning("Tobias"), { exact: true })).toBeVisible();
  });
});

test.describe("AC5 — targets, then the week, one server action each", () => {
  test("both 200: two actions IN ORDER, week body exactly {weekStart}, and the plan is said on the trainee's page", async ({ page }) => {
    await signIn(page);
    const dialog = await openConfirm(page, CUT, "Petra L.", "Petra");
    const timeline = actionTimeline(page);
    await dialog.getByRole("button", { name: "Confirm" }).click();
    await page.waitForURL(`/clients/${PETRA}/nutrition`);
    await expect(outcome(page)).toHaveText(applied(CUT, "Petra"));
    await expect(page.getByText(floorRaised(1200))).toHaveCount(0);

    // Rule 0: the week starts only after the targets have answered.
    expect(timeline.filter((e) => !e.startsWith("other") && !e.startsWith("read"))).toEqual([
      "targets:start",
      "targets:end",
      "week:start",
      "week:end",
    ]);
    // What reached the api, in order, with the key sets. Edge case 9: the template's
    // stored structure is NOT sent.
    expect(traineeWrites(await calls(page))).toEqual([
      `PUT /coach-portal/clients/${PETRA}/nutrition/targets {calories,carbsG,fatG,proteinG}`,
      `POST /coach-portal/clients/${PETRA}/nutrition/week/apply {weekStart}`,
    ]);
    // The new targets are rendered from the server's read.
    await expect(page.getByLabel("Calories", { exact: true })).toHaveValue("1800");
    await expect(page.getByLabel("Protein", { exact: true })).toHaveValue("150");
  });

  test("the floor: 1100 on Petra saves 1200, 1300 on Tobias saves 1500, each said in the engine's sentence", async ({ page }) => {
    await signIn(page);
    let dialog = await openConfirm(page, RESET, "Petra L.", "Petra");
    await expect(dialog.getByText(floorWarning("Petra"), { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "Confirm" }).click();
    await page.waitForURL(`/clients/${PETRA}/nutrition`);
    await expect(outcome(page)).toContainText(applied(RESET, "Petra"));
    await expect(outcome(page)).toContainText(floorRaised(1200));
    await expect(page.getByLabel("Calories", { exact: true })).toHaveValue("1200");

    dialog = await openConfirm(page, LEAN, "Tobias R.", "Tobias");
    await dialog.getByRole("button", { name: "Confirm" }).click();
    await page.waitForURL(`/clients/${TOBIAS}/nutrition`);
    await expect(outcome(page)).toContainText(applied(LEAN, "Tobias"));
    await expect(outcome(page)).toContainText(floorRaised(1500));
  });

  test("week 429: the targets stand, the week is untouched, and tomorrow is named", async ({ page, context, baseURL }) => {
    await signIn(page);
    // The week before, as the trainee's page shows it.
    await page.goto(`/clients/${PETRA}/nutrition`);
    const before = await page.locator("[data-meal-id]").evaluateAll((els) => els.map((e) => e.getAttribute("data-meal-id")));
    expect(before.length).toBeGreaterThan(0);

    const dialog = await openConfirm(page, CUT, "Petra L.", "Petra");
    await setSwitch(context, baseURL as string, "evoli_fixture_week", "rate_limited");
    await dialog.getByRole("button", { name: "Confirm" }).click();
    await page.waitForURL(`/clients/${PETRA}/nutrition`);
    await expect(outcome(page)).toHaveText(weekRateLimited("Petra"));
    await expect(page.getByLabel("Calories", { exact: true })).toHaveValue("1800");
    const after = await page.locator("[data-meal-id]").evaluateAll((els) => els.map((e) => e.getAttribute("data-meal-id")));
    expect(after, "the week is unchanged").toEqual(before);
  });

  test("week refused with anything else (400 COACH_WEEK_OUT_OF_RANGE): couldn't be rebuilt, use Apply", async ({ page, context, baseURL }) => {
    await signIn(page);
    const dialog = await openConfirm(page, CUT, "Petra L.", "Petra");
    await setSwitch(context, baseURL as string, "evoli_fixture_week", "out_of_range");
    await dialog.getByRole("button", { name: "Confirm" }).click();
    await page.waitForURL(`/clients/${PETRA}/nutrition`);
    await expect(outcome(page)).toHaveText(weekFailed("Petra", "Apply to Petra L."));
    // PB-5: the button the sentence names is on the page, labelled exactly so.
    await expect(page.getByRole("button", { name: "Apply to Petra L.", exact: true })).toBeVisible();
  });

  test("week NO ANSWER (aborted): targets updated, the week unconfirmed — not 'failed'", async ({ page }) => {
    await signIn(page);
    const dialog = await openConfirm(page, CUT, "Petra L.", "Petra");
    await abortStep(page, "week");
    await dialog.getByRole("button", { name: "Confirm" }).click();
    await page.waitForURL(`/clients/${PETRA}/nutrition`);
    await expect(outcome(page)).toHaveText(weekUnknown("Petra"));
  });

  test("targets refused (received): nothing was changed, and NO week request is sent", async ({ page, context, baseURL }) => {
    await signIn(page);
    const dialog = await openConfirm(page, CUT, "Petra L.", "Petra");
    await setSwitch(context, baseURL as string, "evoli_fixture_targets", "refused");
    const timeline = actionTimeline(page);
    await dialog.getByRole("button", { name: "Confirm" }).click();
    await page.waitForURL(`/clients/${PETRA}/nutrition`);
    await expect(outcome(page)).toHaveText(targetsFailed("Petra"));
    await quietMs(page);
    expect(timeline.filter((e) => e.startsWith("week"))).toEqual([]);
    expect(traineeWrites(await calls(page))).toEqual([
      `PUT /coach-portal/clients/${PETRA}/nutrition/targets {calories,carbsG,fatG,proteinG}`,
    ]);
  });

  test("targets NO ANSWER (aborted): 'couldn't confirm', never 'nothing was changed', and NO week request", async ({ page }) => {
    await signIn(page);
    const dialog = await openConfirm(page, CUT, "Petra L.", "Petra");
    await abortStep(page, "targets");
    const timeline = actionTimeline(page);
    await dialog.getByRole("button", { name: "Confirm" }).click();
    await page.waitForURL(`/clients/${PETRA}/nutrition`);
    await expect(outcome(page)).toHaveText(targetsUnknown("Petra"));
    await expect(page.getByText(targetsFailed("Petra"))).toHaveCount(0);
    await quietMs(page);
    expect(timeline.filter((e) => e.startsWith("week"))).toEqual([]);
    expect(traineeWrites(await calls(page))).toEqual([]);
  });

  test("403 on the targets: access-lost, and nothing further is sent", async ({ page, context, baseURL }) => {
    await signIn(page);
    const dialog = await openConfirm(page, CUT, "Petra L.", "Petra");
    await setSwitch(context, baseURL as string, "evoli_fixture_link", "ended");
    const timeline = actionTimeline(page);
    await dialog.getByRole("button", { name: "Confirm" }).click();
    await page.waitForURL("/clients/denied");
    await quietMs(page);
    expect(timeline.filter((e) => e.startsWith("week"))).toEqual([]);
    expect(await pendingHandOff(page), "access-lost hands no outcome to a trainee page").toBeNull();
  });

  test("403 on the week (revoked between the two): the targets stand, access-lost is shown", async ({ page, context, baseURL }) => {
    await signIn(page);
    const dialog = await openConfirm(page, CUT, "Petra L.", "Petra");
    // Edge case 4 — the link ends AFTER the targets answered and BEFORE the week.
    await page.route(
      (url) => url.pathname === "/nutrition-templates",
      async (route) => {
        if (stepOf(route.request()) === "week") {
          await setSwitch(context, baseURL as string, "evoli_fixture_link", "ended");
          const headers = { ...route.request().headers() };
          headers.cookie = `${headers.cookie ?? ""}; evoli_fixture_link=ended`;
          await route.continue({ headers });
        } else {
          await route.continue();
        }
      }
    );
    // Every browser request for the trainee's nutrition PAGE after Confirm (document or
    // RSC). Mutant M6 — hand off WEEK_FAILED and push to that page — is invisible to the
    // two checks below it: the trainee layout's overview 403 redirects to /clients/denied
    // before the page reads anything, and /clients/denied discards the hand-off. Measured
    // 2026-09-30: under M6 the journal still held exactly one `GET …/nutrition`. What M6
    // cannot hide is the navigation itself.
    const traineePage: string[] = [];
    page.on("request", (r) => {
      if (new URL(r.url()).pathname === `/clients/${PETRA}/nutrition`) traineePage.push(r.url());
    });
    await dialog.getByRole("button", { name: "Confirm" }).click();
    await page.waitForURL("/clients/denied");
    await quietMs(page);
    expect(traineePage, "a week 403 goes straight to access-lost, never via the trainee's page").toEqual([]);
    // Straight to access-lost, so no "couldn't be rebuilt" hand-off is left waiting.
    expect(await pendingHandOff(page), "access-lost hands no outcome to a trainee page").toBeNull();
    expect(traineeWrites(await calls(page))).toEqual([
      `PUT /coach-portal/clients/${PETRA}/nutrition/targets {calories,carbsG,fatG,proteinG}`,
      `POST /coach-portal/clients/${PETRA}/nutrition/week/apply {weekStart}`,
    ]);
    // One nutrition read: the dialog's, at open. (Necessary, NOT sufficient against M6 —
    // see `traineePage` above.)
    expect((await calls(page)).filter((c) => c === `GET /coach-portal/clients/${PETRA}/nutrition`)).toHaveLength(1);
  });
});

test.describe("staff review of EV-273b — the transport, the latch, the read, the week start", () => {
  test("targets: the API hop dies with no status (TypeError) → 'couldn't confirm', and no week request", async ({ page, context, baseURL }) => {
    await signIn(page);
    const dialog = await openConfirm(page, CUT, "Petra L.", "Petra");
    await setSwitch(context, baseURL as string, "evoli_fixture_targets", "no_answer");
    const timeline = actionTimeline(page);
    await dialog.getByRole("button", { name: "Confirm" }).click();
    await page.waitForURL(`/clients/${PETRA}/nutrition`);
    await expect(outcome(page)).toHaveText(targetsUnknown("Petra"));
    await quietMs(page);
    expect(timeline.filter((e) => e.startsWith("week"))).toEqual([]);
    expect(traineeWrites(await calls(page))).toEqual([
      `PUT /coach-portal/clients/${PETRA}/nutrition/targets {calories,carbsG,fatG,proteinG}`,
    ]);
  });

  test("week: the API hop dies with no status (TypeError) → targets updated, the week unconfirmed", async ({ page, context, baseURL }) => {
    await signIn(page);
    const dialog = await openConfirm(page, CUT, "Petra L.", "Petra");
    await setSwitch(context, baseURL as string, "evoli_fixture_week", "no_answer");
    await dialog.getByRole("button", { name: "Confirm" }).click();
    await page.waitForURL(`/clients/${PETRA}/nutrition`);
    await expect(outcome(page)).toHaveText(weekUnknown("Petra"));
  });

  test("two clicks on Confirm in ONE task run ONE chain", async ({ page }) => {
    await signIn(page);
    const dialog = await openConfirm(page, CUT, "Petra L.", "Petra");
    await dialog.getByRole("button", { name: "Confirm" }).evaluate((b: HTMLElement) => {
      b.click();
      b.click();
    });
    await page.waitForURL(`/clients/${PETRA}/nutrition`);
    await expect(outcome(page)).toHaveText(applied(CUT, "Petra"));
    await quietMs(page);
    expect(traineeWrites(await calls(page))).toEqual([
      `PUT /coach-portal/clients/${PETRA}/nutrition/targets {calories,carbsG,fatG,proteinG}`,
      `POST /coach-portal/clients/${PETRA}/nutrition/week/apply {weekStart}`,
    ]);
  });

  test("a 403 on the dialog-open read goes to access-lost, and nothing is written", async ({ page, context, baseURL }) => {
    await signIn(page);
    await page.goto("/nutrition-templates");
    await setSwitch(context, baseURL as string, "evoli_fixture_link", "ended");
    await row(page, CUT).getByRole("button", { name: "Use on a trainee" }).click();
    await page.getByRole("dialog", { name: "Use on a trainee" }).getByRole("button", { name: "Petra L.", exact: true }).click();
    await page.waitForURL("/clients/denied");
    expect((await calls(page)).filter((c) => c === `GET /coach-portal/clients/${PETRA}/nutrition`)).toHaveLength(1);
    expect(traineeWrites(await calls(page))).toEqual([]);
  });

  test("the apply sends the weekStart the dialog READ, even when it is not this UTC Monday", async ({ page, context, baseURL }) => {
    // The api's "current week" is the one it says it is. Next Monday is a date no clock
    // in the browser or the portal would compute today.
    const now = new Date();
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + 7);
    const served = d.toISOString().slice(0, 10);
    const label = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
      .format(d)
      .replace(/\bSept\b/, "Sep"); // BUG-210
    await signIn(page);
    await setSwitch(context, baseURL as string, "evoli_fixture_week_start", served);
    const dialog = await openConfirm(page, CUT, "Petra L.", "Petra");
    await expect(dialog.getByText(confirmBody("Petra", label), { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "Confirm" }).click();
    await page.waitForURL(`/clients/${PETRA}/nutrition`);
    // The fixture refuses any weekStart but the served one (400 → "couldn't be rebuilt").
    await expect(outcome(page)).toHaveText(applied(CUT, "Petra"));
  });
});

test.describe("staff review blocker 1 — the hand-off never outlives its landing", () => {
  test("a landing redirected to access-lost leaves nothing behind for a later visit", async ({ page, context, baseURL }) => {
    await signIn(page);
    const dialog = await openConfirm(page, CUT, "Petra L.", "Petra");
    await setSwitch(context, baseURL as string, "evoli_fixture_week", "rate_limited");
    // The link ends AFTER the week answered 429 and BEFORE the trainee page renders, so the
    // landing is redirected by the layout and the page never reads the hand-off.
    await page.route(
      (url) => url.pathname === `/clients/${PETRA}/nutrition`,
      async (route) => {
        await setSwitch(context, baseURL as string, "evoli_fixture_link", "ended");
        const headers = { ...route.request().headers() };
        headers.cookie = `${headers.cookie ?? ""}; evoli_fixture_link=ended`;
        await route.continue({ headers });
      }
    );
    await dialog.getByRole("button", { name: "Confirm" }).click();
    await page.waitForURL("/clients/denied");
    await expect(page.getByTestId("template-use-outcome")).toHaveCount(0);
    await expect.poll(() => pendingHandOff(page), { message: "access-lost discards the hand-off" }).toBeNull();

    // The link is back; the coach revisits the trainee later.
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await context.clearCookies({ name: "evoli_fixture_link" });
    await context.clearCookies({ name: "evoli_fixture_week" });
    await page.goto(`/clients/${PETRA}/nutrition`);
    await expect(page.getByLabel("Calories", { exact: true })).toBeVisible();
    await quietMs(page);
    await expect(outcome(page)).toHaveCount(0);
    await expect(page.getByText(weekRateLimited("Petra"))).toHaveCount(0);
  });

  test("an outcome for one trainee is never shown on another's page, and stays for its own", async ({ page }) => {
    await signIn(page);
    await page.goto("/nutrition-templates");
    await page.evaluate(
      ([clientId, template]) =>
        window.sessionStorage.setItem(
          "evoli.coach.nutritionTemplateOutcome",
          JSON.stringify({ clientId, template, kind: "APPLIED", floorCalories: null, at: Date.now() })
        ),
      [PETRA, CUT]
    );
    await page.goto(`/clients/${TOBIAS}/nutrition`);
    await expect(page.getByLabel("Calories", { exact: true })).toBeVisible();
    await quietMs(page);
    await expect(outcome(page)).toHaveCount(0);
    await page.goto(`/clients/${PETRA}/nutrition`);
    await expect(outcome(page)).toHaveText(applied(CUT, "Petra"));
  });

  test("an outcome older than two minutes is dropped unread", async ({ page }) => {
    await signIn(page);
    await page.goto("/nutrition-templates");
    await page.evaluate(
      ([clientId, template]) =>
        window.sessionStorage.setItem(
          "evoli.coach.nutritionTemplateOutcome",
          JSON.stringify({ clientId, template, kind: "WEEK_RATE_LIMITED", floorCalories: null, at: Date.now() - 180_000 })
        ),
      [PETRA, CUT]
    );
    await page.goto(`/clients/${PETRA}/nutrition`);
    await expect(page.getByLabel("Calories", { exact: true })).toBeVisible();
    await quietMs(page);
    await expect(outcome(page)).toHaveCount(0);
    expect(await pendingHandOff(page)).toBeNull();
  });
});

test.describe("AC7 — a snapshot", () => {
  test("editing the template to 2400 and deleting it changes nothing already applied", async ({ page }) => {
    await signIn(page);
    const dialog = await openConfirm(page, CUT, "Petra L.", "Petra");
    await dialog.getByRole("button", { name: "Confirm" }).click();
    await page.waitForURL(`/clients/${PETRA}/nutrition`);
    await expect(outcome(page)).toHaveText(applied(CUT, "Petra"));
    const meals = () =>
      page.locator("[data-meal-id]").evaluateAll((els) => els.map((e) => `${e.getAttribute("data-meal-id")}`));
    const weekBefore = await meals();

    await page.goto("/nutrition-templates");
    await row(page, CUT).getByRole("link", { name: "Edit" }).click();
    await page.waitForURL(/\/nutrition-templates\/[0-9a-f-]{36}$/);
    await page.getByLabel("Calories", { exact: true }).fill("2400");
    await page.getByRole("button", { name: "Save template" }).click();
    await expect(page.getByText("Template saved.", { exact: true })).toBeVisible();
    await page.goto("/nutrition-templates");
    await row(page, CUT).getByRole("button", { name: "Delete" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
    await expect(row(page, CUT)).toHaveCount(0);

    await page.goto(`/clients/${PETRA}/nutrition`);
    await expect(page.getByLabel("Calories", { exact: true })).toHaveValue("1800");
    expect(await meals()).toEqual(weekBefore);
    // The outcome is a one-time hand-off, not a URL anyone can replay.
    await expect(outcome(page)).toHaveCount(0);
  });
});

test.describe("AC8 — the dialog at 320 / 360 / 390 / 414", () => {
  test("no sideways scroll, Confirm reachable, the long title wraps", async ({ page }) => {
    await signIn(page);
    const dialog = await openConfirm(page, CUT, "Petra L.", "Petra");
    await atEachWidth(page, async (width) => {
      await expectNoSidewaysScroll(page, "the confirm dialog");
      const box = await dialog.boundingBox();
      expect(box && box.x >= 0 && box.x + box.width <= width + 0.5, `dialog inside ${width}px`).toBe(true);
      await expectUnoccluded(page, dialog.getByRole("button", { name: "Confirm" }), { label: "Confirm" });
    });
  });
});

/* ── EV-324 — "Utiliser pour un client" in a French browser ───────────────────
 * The same two writes and the same order as above; what changes is every word, the date
 * (fr-FR, "28 sept. 2026") and the numbers (U+202F grouping). Literals throughout. */
const NNBSP = " ";
const g = (text: string) => `« ${text} »`;
const frConfirmTitle = (t: string, first: string) => `Utiliser ${g(t)} pour ${first} ?`;

function frenchWeekStartLabel(): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  // BUG-491: the first of a month is "1er" in a French date; ICU writes "1".
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    .format(d)
    .replace(/^1 /, "1er ");
}

async function openConfirmFrench(page: Page, template: string, trainee: string, first: string) {
  await page.goto("/nutrition-templates");
  const picker = page.getByRole("dialog", { name: "Utiliser pour un client" });
  await expect(async () => {
    await row(page, template).getByRole("button", { name: "Utiliser pour un client" }).click();
    await expect(picker).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  await picker.getByRole("button", { name: trainee, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: frConfirmTitle(template, first) });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Confirmer" })).toBeEnabled();
  return dialog;
}

test.describe("EV-324 — use on a client, in a French browser (fr-FR)", () => {
  test.use({ locale: "fr-FR" });

  test("the dialog is French, grouped with U+202F, dated fr-FR; the plan and the floor are said in French", async ({ page }) => {
    await signInFrench(page);
    const dialog = await openConfirmFrench(page, RESET, "Petra L.", "Petra");
    expect(await tableRows(dialog)).toEqual([
      ["Calories", `1${NNBSP}850 kcal`, `1${NNBSP}100 kcal`],
      ["Protéines", "130 g", "90 g"],
      ["Glucides", "180 g", "110 g"],
      ["Lipides", "60 g", "35 g"],
    ]);
    await expect(dialog.getByRole("columnheader", { name: "Actuel" })).toBeVisible();
    await expect(dialog.getByRole("columnheader", { name: "Après" })).toBeVisible();
    await expect(
      dialog.getByText(
        `Les repas de Petra pour cette semaine (à partir du ${frenchWeekStartLabel()}) sont reconstruits immédiatement selon ces objectifs, avec son propre nombre de repas par jour. Ses allergies et ses règles alimentaires s'appliquent toujours. Les repas verrouillés ou déjà mangés par ce client sont conservés.`,
        { exact: true }
      )
    ).toBeVisible();
    await expect(
      dialog.getByText("Si c'est en dessous du minimum sûr de Petra, Evoli le relève à ce minimum et vous le signale.", {
        exact: true,
      })
    ).toBeVisible();
    await expectNoEnglish(page, "the French confirm dialog");

    await dialog.getByRole("button", { name: "Confirmer" }).click();
    await page.waitForURL(`/clients/${PETRA}/nutrition`);
    await expect(outcome(page)).toContainText(`${g(RESET)} est désormais le plan de Petra.`);
    await expect(outcome(page)).toContainText(`Calories relevées au minimum sûr de 1${NNBSP}200 kcal.`);
    expect(traineeWrites(await calls(page))).toEqual([
      `PUT /coach-portal/clients/${PETRA}/nutrition/targets {calories,carbsG,fatG,proteinG}`,
      `POST /coach-portal/clients/${PETRA}/nutrition/week/apply {weekStart}`,
    ]);
    await expectNoEnglish(page, "the French outcome on the trainee's page");
  });

  test("a client with no targets reads Non défini", async ({ page }) => {
    await signInFrench(page);
    const dialog = await openConfirmFrench(page, CUT, "Tobias R.", "Tobias");
    expect((await tableRows(dialog)).map((r) => r[1])).toEqual(["Non défini", "Non défini", "Non défini", "Non défini"]);
    // 1800 is not below 1500: no floor sentence.
    await expect(dialog.getByText(/minimum sûr/)).toHaveCount(0);
  });

  test("week 429: the targets are saved, and tomorrow is named, in French", async ({ page, context, baseURL }) => {
    await signInFrench(page);
    const dialog = await openConfirmFrench(page, CUT, "Tobias R.", "Tobias");
    await setSwitch(context, baseURL as string, "evoli_fixture_week", "rate_limited");
    await dialog.getByRole("button", { name: "Confirmer" }).click();
    await page.waitForURL(`/clients/${TOBIAS}/nutrition`);
    await expect(outcome(page)).toHaveText(
      "Les objectifs de Tobias sont mis à jour. Ses repas n'ont pas été reconstruits : une semaine a déjà été appliquée pour ce client aujourd'hui. Réessayez demain."
    );
    await expect(page.getByLabel("Calories", { exact: true })).toHaveValue("1800");
    expect(traineeWrites(await calls(page))).toEqual([
      `PUT /coach-portal/clients/${TOBIAS}/nutrition/targets {calories,carbsG,fatG,proteinG}`,
      `POST /coach-portal/clients/${TOBIAS}/nutrition/week/apply {weekStart}`,
    ]);
    await expectNoEnglish(page, "the French 429 outcome");
  });

  test("week refused otherwise, and targets refused: the French sentences", async ({ page, context, baseURL }) => {
    await signInFrench(page);
    let dialog = await openConfirmFrench(page, CUT, "Petra L.", "Petra");
    await setSwitch(context, baseURL as string, "evoli_fixture_week", "out_of_range");
    await dialog.getByRole("button", { name: "Confirmer" }).click();
    await page.waitForURL(`/clients/${PETRA}/nutrition`);
    await expect(outcome(page)).toHaveText(
      `Les objectifs de Petra sont mis à jour. Ses repas n'ont pas pu être reconstruits. Utilisez ${g("Appliquer à Petra L.")} pour réessayer.`
    );

    await context.clearCookies({ name: "evoli_fixture_week" });
    await setSwitch(context, baseURL as string, "evoli_fixture_targets", "refused");
    dialog = await openConfirmFrench(page, CUT, "Petra L.", "Petra");
    await dialog.getByRole("button", { name: "Confirmer" }).click();
    await page.waitForURL(`/clients/${PETRA}/nutrition`);
    await expect(outcome(page)).toHaveText("Rien n'a été modifié pour Petra. Réessayez.");
  });
});

/**
 * PB-4 / PB-5 — a client whose first name starts with a vowel, end to end in French.
 *
 * The populated roster has no such client, so Petra (NUTRITION only) is served as
 * "Inès Roux" for this context by the fixture's `evoli_fixture_display_name` switch, on
 * the roster, overview and nutrition reads alike. "Inès Roux" is QA's own repro: the
 * dialog speaks of "Inès", the week card's button reads the FULL name.
 */
test.describe("PB-4 / PB-5 — Inès Roux, in a French browser (fr-FR)", () => {
  test.use({ locale: "fr-FR" });

  test("the dialog elides (d'Inès), and the week-failed outcome quotes the button as it is labelled", async ({
    page,
    context,
    baseURL,
  }) => {
    await setSwitch(
      context,
      baseURL as string,
      "evoli_fixture_display_name",
      `${PETRA}:${encodeURIComponent("Inès Roux")}`
    );
    await signInFrench(page);
    // Reset 1100 is below Petra's floor, so the floor sentence is on the dialog.
    const dialog = await openConfirmFrench(page, RESET, "Inès Roux", "Inès");
    await expect(
      dialog.getByText(
        `Les repas d'Inès pour cette semaine (à partir du ${frenchWeekStartLabel()}) sont reconstruits immédiatement selon ces objectifs, avec son propre nombre de repas par jour. Ses allergies et ses règles alimentaires s'appliquent toujours. Les repas verrouillés ou déjà mangés par ce client sont conservés.`,
        { exact: true }
      )
    ).toBeVisible();
    await expect(
      dialog.getByText("Si c'est en dessous du minimum sûr d'Inès, Evoli le relève à ce minimum et vous le signale.", {
        exact: true,
      })
    ).toBeVisible();
    await expect(dialog.getByText(/\bde Inès/)).toHaveCount(0);

    await setSwitch(context, baseURL as string, "evoli_fixture_week", "out_of_range");
    await dialog.getByRole("button", { name: "Confirmer" }).click();
    await page.waitForURL(`/clients/${PETRA}/nutrition`);
    // Two paragraphs: the sentence, then the floor line (Reset 1100 is below Petra's floor).
    await expect(outcome(page).locator("p").first()).toHaveText(
      `Les objectifs d'Inès sont mis à jour. Ses repas n'ont pas pu être reconstruits. Utilisez ${g("Appliquer à Inès Roux")} pour réessayer.`
    );
    await expect(outcome(page).locator("p").nth(1)).toHaveText(`Calories relevées au minimum sûr de 1${NNBSP}200 kcal.`);
    await expect(page.getByRole("button", { name: "Appliquer à Inès Roux", exact: true })).toBeVisible();
  });

  test("the other outcomes elide too: applied, 429, unknown", async ({ page, context, baseURL }) => {
    await setSwitch(
      context,
      baseURL as string,
      "evoli_fixture_display_name",
      `${PETRA}:${encodeURIComponent("Inès Roux")}`
    );
    await signInFrench(page);
    let dialog = await openConfirmFrench(page, CUT, "Inès Roux", "Inès");
    await dialog.getByRole("button", { name: "Confirmer" }).click();
    await page.waitForURL(`/clients/${PETRA}/nutrition`);
    await expect(outcome(page)).toHaveText(`${g(CUT)} est désormais le plan d'Inès.`);

    await setSwitch(context, baseURL as string, "evoli_fixture_week", "rate_limited");
    dialog = await openConfirmFrench(page, LEAN, "Inès Roux", "Inès");
    await dialog.getByRole("button", { name: "Confirmer" }).click();
    await page.waitForURL(`/clients/${PETRA}/nutrition`);
    await expect(outcome(page)).toContainText("Les objectifs d'Inès sont mis à jour. Ses repas n'ont pas été reconstruits");

    await context.clearCookies({ name: "evoli_fixture_week" });
    dialog = await openConfirmFrench(page, CUT, "Inès Roux", "Inès");
    await abortStep(page, "week");
    await dialog.getByRole("button", { name: "Confirmer" }).click();
    await page.waitForURL(`/clients/${PETRA}/nutrition`);
    await expect(outcome(page)).toHaveText(
      "Les objectifs d'Inès sont mis à jour. Nous n'avons pas pu confirmer si ses repas ont été reconstruits. Vérifiez sa page nutrition avant de réessayer."
    );
  });
});

/** The outcome waiting for a trainee page, if any (`src/lib/nutritionTemplateUse.ts`). */
async function pendingHandOff(page: Page): Promise<string | null> {
  return page.evaluate(() => window.sessionStorage.getItem("evoli.coach.nutritionTemplateOutcome"));
}

async function quietMs(page: Page) {
  await page.waitForTimeout(400);
}
