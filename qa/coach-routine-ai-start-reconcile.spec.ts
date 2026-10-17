import { expect, type Page, type Route } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";
import { openEveryDay } from "./day-accordion";

/**
 * BUG-871 — a start (« Generate », « Try again », the Update box's « Generate ») whose answer was lost.
 * ADR-0036 § Amendment BUG-871 (Option B), in FIXTURE mode: every decision-table row the fixture can
 * reach. The pure table, F13(c)'s three cases included, is `qa/routine-ai-start-reconcile-unit.spec.ts`;
 * the live rig witnesses (S2, S4L, S4R, S4R-409, S5, S6 live, S9) and the fake model are senior-qa's.
 *
 * How each start outcome is produced:
 *   · `page.route` on the start's server action: `route.fetch()` then `abort("connectionreset")` — the
 *     start ran on the server (202, a RUNNING row) and the browser lost the answer (S1, the register's
 *     repro); or the reconcile READ's request is held / reset (S7, the read fails too);
 *   · `evoli_fixture_ai_start_lost=thrown` — the start writes its row, then its answer is lost;
 *     `thrown_before` — lost before anything is checked or written (S3); `late` — lost at once, the row
 *     written 3 s later (S4, S11). One start per test, then the next goes through;
 *   · S10.1–S10.5 as the final § Witnesses (hub main 9647a825) set them up in fixture mode:
 *     `evoli_fixture_ai=rate_link` (S10.1), a second tab's run with tab B closed before tab A's press
 *     (S10.2), `evoli_fixture_ai=busy|unavailable` (S10.3), a fence token `swap <coach_request>` in the
 *     Update box (S10.4), and Nils's draft discarded in a second tab (S10.5, COACH_PLAN_EMPTY).
 *
 * Every test sets `evoli_fixture_ai_caps=instruction` and `evoli_fixture_ai_delay_ms=30000`, the
 * final § Witnesses' fixture rig.
 *
 * Journal checks stand in for the DB: `aiPosts` is every start that reached the api (the counters),
 * `api` the proposal GETs.
 *
 * Sentences are LITERALS from the EV-186 copy table (senior-po, hub main 1f539414), never imported from
 * `src/lib/copy.ts`. FR keeps U+00A0 before « : ».
 */

const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
const NILS = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0002";
const ROUTE = `/clients/${LINA}/routine`;

const L = {
  en: {
    locale: null,
    open: "Regenerate with AI",
    updateOpen: "Update with AI",
    generate: "Generate",
    retry: "Try again",
    cancel: "Cancel",
    unconfirmed:
      "We couldn't confirm whether this suggestion was started. Try again: if it's already being prepared, it will show here.",
    startFailed: "We couldn't start this suggestion. Nothing was changed. Try again.",
    nothingChanged: "Nothing was changed",
    failed: "We couldn't prepare this suggestion. Nothing was changed. Try again.",
    stale: "Lina's programme changed after this suggestion was made. Try again to get a fresh one.",
    busy: "AI suggestions are busy right now. Try again in a minute.",
    unavailable: "AI suggestions are switched off on this server.",
    rateLink: "You've used today's 3 AI regenerations for Lina. You can still edit by hand, or try again tomorrow.",
    running409: "A suggestion is already being prepared for Lina.",
    instructionInvalid: "This request can't be sent: 500 characters at most, in plain text.",
    denied: "This trainee is not on your roster. They may have revoked access.",
  },
  fr: {
    locale: "fr",
    open: "Régénérer avec l'IA",
    updateOpen: "Modifier avec l'IA",
    generate: "Générer",
    retry: "Réessayer",
    cancel: "Annuler",
    unconfirmed:
      "Impossible de confirmer si cette suggestion a été lancée. Réessayez : si elle est déjà en préparation, elle s'affichera.",
    startFailed: "Impossible de lancer cette suggestion. Rien n'a été modifié. Réessayez.",
    nothingChanged: "Rien n'a été modifié",
    failed: "Impossible de préparer cette suggestion. Rien n'a été modifié. Réessayez.",
    stale: "Le programme de Lina a changé depuis cette suggestion. Réessayez pour en obtenir une nouvelle.",
    busy: "Les suggestions IA sont très demandées en ce moment. Réessayez dans une minute.",
    unavailable: "Les suggestions IA sont désactivées sur ce serveur.",
    rateLink: "Vous avez utilisé les 3 régénérations IA du jour pour Lina. Vous pouvez modifier à la main, ou réessayer demain.",
    running409: "Une suggestion est déjà en préparation pour Lina.",
    instructionInvalid: "Cette demande ne peut pas être envoyée : 500 caractères au maximum, en texte simple.",
    denied: "Ce client ne fait pas partie de votre liste. Il a peut-être révoqué l'accès.",
  },
} as const;
type Lang = keyof typeof L;
const LANGS: Lang[] = ["en", "fr"];

async function cookie(page: Page, name: string, value: string) {
  await page.context().addCookies([{ name, value, domain: "localhost", path: "/" }]);
}
async function setLang(page: Page, lang: Lang) {
  const locale = L[lang].locale;
  if (locale) await cookie(page, "evoli_pro_locale", locale);
}

const panel = (page: Page) => page.getByTestId("routine-ai-panel");
const notice = (page: Page) => panel(page).getByTestId("routine-ai-notice");
const box = (page: Page) => panel(page).getByTestId("routine-ai-update");
/** The brief's « Generate » (the brief is the panel's only plain <form> besides the Update box). */
const briefGenerate = (page: Page, lang: Lang) =>
  panel(page).locator("form:not([data-testid])").getByRole("button", { name: L[lang].generate, exact: true });

type Journal = { api: { op: string; arg: string | null }[]; aiPosts: { outcome: string }[] };
async function calls(page: Page): Promise<Journal> {
  const res = await page.request.get("/api/fixture/calls", { maxRedirects: 0 });
  return res.json();
}
/** The proposal GETs after the LAST start that reached the fixture's method. */
function readsAfterLastStart(j: Journal): number {
  const at = j.api.map((e) => e.op).lastIndexOf("startRoutineAiProposal");
  expect(at, "a start reached the fixture").toBeGreaterThanOrEqual(0);
  return j.api.slice(at + 1).filter((e) => e.op === "getRoutineAiProposal" && e.arg === LINA).length;
}
function readsTotal(j: Journal): number {
  return j.api.filter((e) => e.op === "getRoutineAiProposal" && e.arg === LINA).length;
}

/** How many of the panel's lines read exactly `text` (BUG-867: never two). */
async function linesReading(page: Page, text: string): Promise<number> {
  const all = await panel(page).locator("p").allTextContents();
  return all.filter((t) => t.trim() === text).length;
}

/**
 * Arm a one-shot hook on the next server-action POSTs of this page. `steps[i]` handles the i-th one;
 * later ones go through untouched.
 */
function onActions(page: Page, steps: ((route: Route) => Promise<void>)[]) {
  let n = 0;
  return page.route(
    (url) => url.pathname === ROUTE,
    async (route) => {
      const req = route.request();
      if (req.method() !== "POST" || !req.headers()["next-action"] || n >= steps.length) return route.continue();
      await steps[n++](route);
    }
  );
}

/** `startUnconfirmed` on the current view: the notice, « Generate » live, never the refusal words. */
async function expectUnconfirmed(page: Page, lang: Lang, state: string) {
  const l = L[lang];
  await expect(notice(page)).toHaveText(l.unconfirmed);
  await expect(notice(page)).toHaveAttribute("role", "alert");
  await expect(panel(page)).toHaveAttribute("data-ai-state", state);
  await expect(panel(page)).not.toContainText(l.startFailed);
  expect(await linesReading(page, l.unconfirmed)).toBe(1);
}

/** The running view, no refusal words; returns the id it shows. */
async function expectRunning(page: Page, lang: Lang): Promise<string> {
  await expect(panel(page)).toHaveAttribute("data-ai-state", "running");
  await expect(notice(page)).toHaveCount(0);
  await expect(panel(page)).not.toContainText(L[lang].startFailed);
  await expect(panel(page)).not.toContainText(L[lang].unconfirmed);
  const id = await panel(page).getAttribute("data-proposal-id");
  expect(id).toMatch(/^[0-9a-f-]{36}$/);
  return id as string;
}

async function openBrief(page: Page, lang: Lang, navigate = true) {
  if (navigate) await page.goto(ROUTE);
  await page.getByRole("button", { name: L[lang].open, exact: true }).click();
  await expect(briefGenerate(page, lang)).toBeEnabled();
}

/** A Regenerate that settles `failed` (or `stale` with `expired`) at once; returns its id F. */
async function settledRun(page: Page, lang: Lang, how: "fail" | "expired"): Promise<string> {
  await cookie(page, "evoli_fixture_ai", how);
  await cookie(page, "evoli_fixture_ai_delay_ms", "0");
  await openBrief(page, lang);
  await briefGenerate(page, lang).click();
  await expect(panel(page)).toHaveAttribute("data-ai-state", how === "fail" ? "failed" : "stale", { timeout: 20_000 });
  const f = await panel(page).getAttribute("data-proposal-id");
  expect(f).toMatch(/^[0-9a-f-]{36}$/);
  // The next runs stay RUNNING (so "adopted" is visible) and settle READY.
  await cookie(page, "evoli_fixture_ai", "none");
  await cookie(page, "evoli_fixture_ai_delay_ms", "30000");
  return f as string;
}

test.beforeEach(async ({ page }) => {
  await signInThroughForm(page, { email: "coach@evoli.fit", password: "Password123!" });
  await cookie(page, "evoli_fixture_ai_caps", "instruction");
  // ADR fixture rig: a run stays RUNNING long enough to be seen and polled.
  await cookie(page, "evoli_fixture_ai_delay_ms", "30000");
});

test.describe("S1 — the start ran, its answer was lost → the run is adopted without a reload", () => {
  for (const lang of LANGS) {
    test(`S1 ${lang}: the browser loses the start's answer (route.fetch then reset) → running, polled; reload shows the same run`, async ({
      page,
    }) => {
      await setLang(page, lang);
      await openBrief(page, lang);
      // No running view is polling: the next server action is the start.
      await onActions(page, [
        async (route) => {
          await route.fetch();
          await route.abort("connectionreset");
        },
      ]);
      await briefGenerate(page, lang).click();
      const id = await expectRunning(page, lang);
      await expect(panel(page)).not.toContainText(L[lang].nothingChanged);
      const before = readsTotal(await calls(page));
      await page.waitForTimeout(5_000);
      expect(readsTotal(await calls(page)) - before, "polling continues").toBeGreaterThanOrEqual(2);
      expect((await calls(page)).aiPosts.map((p) => p.outcome)).toEqual(["202"]);
      await page.reload();
      await expect(panel(page)).toHaveAttribute("data-ai-state", "running");
      await expect(panel(page)).toHaveAttribute("data-proposal-id", id);
    });
  }

  test("S1/S5 en: the fixture writes the run then throws (evoli_fixture_ai_start_lost=thrown) → running, one read", async ({
    page,
  }) => {
    await openBrief(page, "en");
    await cookie(page, "evoli_fixture_ai_start_lost", "thrown");
    await briefGenerate(page, "en").click();
    const id = await expectRunning(page, "en");
    const j = await calls(page);
    expect(j.aiPosts.map((p) => p.outcome)).toEqual(["202"]);
    await page.reload();
    await expect(panel(page)).toHaveAttribute("data-proposal-id", id);
  });
});

test.describe("S3 — the start never reached the api → startUnconfirmed; the next press starts", () => {
  for (const lang of LANGS) {
    test(`S3 ${lang}: brief stays with startUnconfirmed, Generate enabled, nothing spent; Generate again → 202, adopted`, async ({
      page,
    }) => {
      await setLang(page, lang);
      await openBrief(page, lang);
      await cookie(page, "evoli_fixture_ai_start_lost", "thrown_before");
      await briefGenerate(page, lang).click();
      await expectUnconfirmed(page, lang, "brief");
      await expect(briefGenerate(page, lang)).toBeEnabled();
      let j = await calls(page);
      expect(j.aiPosts).toHaveLength(0); // the counters did not move
      expect(readsAfterLastStart(j)).toBe(1); // exactly one reconcile read
      // The second press pre-flights (NONE: nothing to adopt), then starts as usual.
      await briefGenerate(page, lang).click();
      await expectRunning(page, lang);
      j = await calls(page);
      expect(j.aiPosts.map((p) => p.outcome)).toEqual(["202"]);
    });
  }
});

test.describe("S4 / S11 — the run lands after the reconcile read → the next press adopts it, no second start", () => {
  for (const lang of LANGS) {
    test(`S4 ${lang}: late write; first press startUnconfirmed, second press (pre-flight) adopts the run with no POST`, async ({
      page,
    }) => {
      await setLang(page, lang);
      await openBrief(page, lang);
      await cookie(page, "evoli_fixture_ai_start_lost", "late");
      await briefGenerate(page, lang).click();
      await expectUnconfirmed(page, lang, "brief");
      await page.waitForTimeout(4_000);
      expect((await calls(page)).aiPosts.map((p) => p.outcome)).toEqual(["202"]); // the late write landed
      await briefGenerate(page, lang).click();
      const id = await expectRunning(page, lang);
      const j = await calls(page);
      expect(j.aiPosts, "no second start").toHaveLength(1);
      expect(j.api.filter((e) => e.op === "startRoutineAiProposal")).toHaveLength(1);
      await page.reload();
      await expect(panel(page)).toHaveAttribute("data-proposal-id", id);
    });

    test(`S11 ${lang}: the mark survives Cancel and reopening the brief between the presses`, async ({ page }) => {
      await setLang(page, lang);
      await openBrief(page, lang);
      await cookie(page, "evoli_fixture_ai_start_lost", "late");
      await briefGenerate(page, lang).click();
      await expectUnconfirmed(page, lang, "brief");
      await panel(page).getByRole("button", { name: L[lang].cancel, exact: true }).click();
      await expect(panel(page)).toHaveAttribute("data-ai-state", "idle");
      await openBrief(page, lang, false);
      await page.waitForTimeout(4_000);
      await briefGenerate(page, lang).click();
      await expectRunning(page, lang);
      expect((await calls(page)).aiPosts, "exactly one POST").toHaveLength(1);
    });
  }
});

test.describe("S7 — pending covers the reconcile read", () => {
  for (const lang of LANGS) {
    test(`S7 ${lang}: while the read is held, Generate is disabled and no sentence shows; after it, startUnconfirmed`, async ({
      page,
    }) => {
      const l = L[lang];
      await setLang(page, lang);
      await openBrief(page, lang);
      await cookie(page, "evoli_fixture_ai_start_lost", "thrown_before");
      let release!: () => void;
      const held = new Promise<void>((r) => (release = r));
      let readArrived!: () => void;
      const arrived = new Promise<void>((r) => (readArrived = r));
      await onActions(page, [
        (route) => route.continue(),
        async (route) => {
          readArrived();
          await held;
          await route.continue();
        },
      ]);
      await briefGenerate(page, lang).click();
      await arrived; // the start has answered; its reconcile read is on the wire, held
      await expect(briefGenerate(page, lang)).toBeDisabled();
      await page.waitForTimeout(500);
      await expect(briefGenerate(page, lang)).toBeDisabled();
      await expect(notice(page)).toHaveCount(0);
      await expect(panel(page)).not.toContainText(l.startFailed);
      await expect(panel(page)).not.toContainText(l.unconfirmed);
      release();
      await expectUnconfirmed(page, lang, "brief");
      await expect(briefGenerate(page, lang)).toBeEnabled();
    });
  }
});

test.describe("S8 — every start entry point", () => {
  for (const lang of LANGS) {
    test(`S8(b) ${lang}: the Update box — never reached → the box stays with startUnconfirmed; lost after 202 → adopted`, async ({
      page,
    }) => {
      const l = L[lang];
      await setLang(page, lang);
      await page.goto(ROUTE);
      await page.getByRole("button", { name: l.updateOpen, exact: true }).click();
      await box(page).getByRole("textbox").fill("swap");
      await cookie(page, "evoli_fixture_ai_start_lost", "thrown_before");
      await box(page).getByRole("button", { name: l.generate, exact: true }).click();
      await expectUnconfirmed(page, lang, "update");
      await expect(box(page).getByRole("textbox")).toHaveValue("swap");
      expect((await calls(page)).aiPosts).toHaveLength(0);
      // The next press: the pre-flight sees nothing new, so it starts; this one's answer is lost after 202.
      await onActions(page, [
        (route) => route.continue(), // the pre-flight read
        async (route) => {
          await route.fetch();
          await route.abort("connectionreset");
        },
      ]);
      await box(page).getByRole("button", { name: l.generate, exact: true }).click();
      await expectRunning(page, lang);
      expect((await calls(page)).aiPosts.map((p) => p.outcome)).toEqual(["202"]);
    });

    test(`S8(c) ${lang}: the stale view's Try again — never reached → stale stays, one stale sentence plus startUnconfirmed; again → adopted`, async ({
      page,
    }) => {
      const l = L[lang];
      await setLang(page, lang);
      const f = await settledRun(page, lang, "expired");
      const posts = (await calls(page)).aiPosts.length;
      await cookie(page, "evoli_fixture_ai_start_lost", "thrown_before");
      await panel(page).getByRole("button", { name: l.retry, exact: true }).click();
      // The read shows {F, EXPIRED}, F = knownId: not adopted (F13(c) case 2).
      await expectUnconfirmed(page, lang, "stale");
      await expect(panel(page)).toHaveAttribute("data-proposal-id", f);
      expect(await linesReading(page, l.stale)).toBe(1);
      expect((await calls(page)).aiPosts).toHaveLength(posts);
      await panel(page).getByRole("button", { name: l.retry, exact: true }).click();
      const id = await expectRunning(page, lang);
      expect(id).not.toBe(f);
      expect((await calls(page)).aiPosts).toHaveLength(posts + 1);
    });

    test(`S8(d) ${lang}: the failed view's Try again — never reached → failed stays with its own sentence once plus startUnconfirmed`, async ({
      page,
    }) => {
      const l = L[lang];
      await setLang(page, lang);
      const f = await settledRun(page, lang, "fail");
      const posts = (await calls(page)).aiPosts.length;
      await cookie(page, "evoli_fixture_ai_start_lost", "thrown_before");
      await panel(page).getByRole("button", { name: l.retry, exact: true }).click();
      await expectUnconfirmed(page, lang, "failed");
      await expect(panel(page).getByTestId("routine-ai-failed")).toHaveText(l.failed);
      expect(await linesReading(page, l.failed)).toBe(1);
      await expect(panel(page)).toHaveAttribute("data-proposal-id", f);
      expect((await calls(page)).aiPosts).toHaveLength(posts);
    });

    test(`S8(d) ${lang}: the failed view's Try again — lost after 202 → the new run is adopted`, async ({ page }) => {
      await setLang(page, lang);
      const f = await settledRun(page, lang, "fail");
      await cookie(page, "evoli_fixture_ai_start_lost", "thrown");
      await panel(page).getByRole("button", { name: L[lang].retry, exact: true }).click();
      const id = await expectRunning(page, lang);
      expect(id).not.toBe(f);
    });

    for (const how of ["fail", "expired"] as const) {
      test(`S8(e) ${lang} from ${how === "fail" ? "failed" : "stale"}: reload, Try again opens the brief, never reached → startUnconfirmed (not F's sentence); Generate → 202, adopted`, async ({
        page,
      }) => {
        const l = L[lang];
        await setLang(page, lang);
        const f = await settledRun(page, lang, how);
        await page.reload(); // lastBrief is gone; knownId = F from the page's read
        await expect(panel(page)).toHaveAttribute("data-ai-state", how === "fail" ? "failed" : "stale");
        await panel(page).getByRole("button", { name: l.retry, exact: true }).click();
        await expect(panel(page)).toHaveAttribute("data-ai-state", "brief");
        const posts = (await calls(page)).aiPosts.length;
        await cookie(page, "evoli_fixture_ai_start_lost", "thrown_before");
        await briefGenerate(page, lang).click();
        // The read is still {F, FAILED|EXPIRED} with F = knownId: not adopted (F13(c) case 3 for stale).
        await expectUnconfirmed(page, lang, "brief");
        await expect(panel(page)).not.toContainText(how === "fail" ? l.failed : l.stale);
        expect((await calls(page)).aiPosts).toHaveLength(posts);
        // The pre-flight sees {F, …}, not adoptable: it POSTs, gets 202, and the new run is adopted.
        await briefGenerate(page, lang).click();
        const id = await expectRunning(page, lang);
        expect(id).not.toBe(f);
        expect((await calls(page)).aiPosts).toHaveLength(posts + 1);
      });
    }
  }
});

test("S8e-stale en (the final witness form): READY = P, publish, reload → stale; Try again opens the brief; never reached → startUnconfirmed; Generate → 202, adopted", async ({
  page,
}) => {
  const l = L.en;
  await cookie(page, "evoli_fixture_ai_delay_ms", "0");
  await openBrief(page, "en");
  await briefGenerate(page, "en").click();
  await expect(panel(page)).toHaveAttribute("data-ai-state", "ready", { timeout: 10_000 });
  const p = await panel(page).getAttribute("data-proposal-id");
  await page.getByLabel("Plan name").fill("Republished meanwhile");
  const bar = page.getByRole("region", { name: "Routine actions", exact: true });
  await bar.getByRole("button", { name: "Publish", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText("Published. The trainee sees it next time they open the app.")).toBeVisible();
  await cookie(page, "evoli_fixture_ai_delay_ms", "30000");
  await page.reload(); // {P, EXPIRED, COACH_PROPOSAL_STALE}; lastBrief null; knownId = P
  await expect(panel(page)).toHaveAttribute("data-ai-state", "stale");
  await panel(page).getByRole("button", { name: l.retry, exact: true }).click();
  await expect(panel(page)).toHaveAttribute("data-ai-state", "brief");
  const posts = (await calls(page)).aiPosts.length;
  await cookie(page, "evoli_fixture_ai_start_lost", "thrown_before");
  await briefGenerate(page, "en").click();
  await expectUnconfirmed(page, "en", "brief");
  await expect(panel(page)).not.toContainText(l.stale);
  expect((await calls(page)).aiPosts).toHaveLength(posts);
  await briefGenerate(page, "en").click(); // the pre-flight sees {P, EXPIRED} = knownId: not adoptable, so it POSTs
  const id = await expectRunning(page, "en");
  expect(id).not.toBe(p);
  expect((await calls(page)).aiPosts).toHaveLength(posts + 1);
});

test.describe("the reconcile read and the pre-flight read", () => {
  test("S6 en: the start's answer and its read are both lost → startUnconfirmed; the next press adopts the committed run with no POST", async ({
    page,
  }) => {
    await openBrief(page, "en");
    await cookie(page, "evoli_fixture_ai_start_lost", "thrown");
    await onActions(page, [(route) => route.continue(), (route) => route.abort("connectionreset")]);
    await briefGenerate(page, "en").click();
    await expectUnconfirmed(page, "en", "brief");
    await briefGenerate(page, "en").click();
    await expectRunning(page, "en");
    expect((await calls(page)).aiPosts, "0 further POSTs").toHaveLength(1);
  });

  test("en: the reconcile read is 404 (the routes went off) → the panel is hidden", async ({ page }) => {
    await openBrief(page, "en");
    await cookie(page, "evoli_fixture_ai_start_lost", "thrown_before");
    await onActions(page, [
      async (route) => {
        const response = await route.fetch();
        await cookie(page, "evoli_fixture_ai", "off");
        await route.fulfill({ response });
      },
    ]);
    await briefGenerate(page, "en").click();
    await expect(panel(page)).toHaveCount(0);
  });

  test("en: the reconcile read is 403 (the link ended) → the access-lost page", async ({ page }) => {
    await openBrief(page, "en");
    await cookie(page, "evoli_fixture_ai_start_lost", "thrown_before");
    await onActions(page, [
      async (route) => {
        const response = await route.fetch();
        await cookie(page, "evoli_fixture_link", "ended");
        await route.fulfill({ response });
      },
    ]);
    await briefGenerate(page, "en").click();
    await expect(page).toHaveURL(/\/clients\/denied/);
    await expect(page.getByRole("heading", { name: L.en.denied })).toBeVisible();
  });

  test("en: a pre-flight read 404 → hidden, and no POST", async ({ page }) => {
    await openBrief(page, "en");
    await cookie(page, "evoli_fixture_ai_start_lost", "thrown_before");
    await briefGenerate(page, "en").click();
    await expectUnconfirmed(page, "en", "brief");
    await cookie(page, "evoli_fixture_ai", "off");
    const starts = (await calls(page)).api.filter((e) => e.op === "startRoutineAiProposal").length;
    await briefGenerate(page, "en").click();
    await expect(panel(page)).toHaveCount(0);
    const j = await calls(page);
    expect(j.api.filter((e) => e.op === "startRoutineAiProposal")).toHaveLength(starts);
    expect(j.aiPosts).toHaveLength(0);
  });

  for (const lang of LANGS) {
    test(`${lang}: a pre-flight read 403 → the access-lost page, and no POST`, async ({ page }) => {
      await setLang(page, lang);
      await openBrief(page, lang);
      await cookie(page, "evoli_fixture_ai_start_lost", "thrown_before");
      await briefGenerate(page, lang).click();
      await expectUnconfirmed(page, lang, "brief");
      const starts = (await calls(page)).api.filter((e) => e.op === "startRoutineAiProposal").length;
      await cookie(page, "evoli_fixture_link", "ended");
      await briefGenerate(page, lang).click();
      await expect(page).toHaveURL(/\/clients\/denied/);
      await expect(page.getByRole("heading", { name: L[lang].denied })).toBeVisible();
      expect((await calls(page)).api.filter((e) => e.op === "startRoutineAiProposal")).toHaveLength(starts);
    });
  }
});

test.describe("S10 — coded refusals are unchanged: their own sentence, no reconcile read", () => {
  for (const lang of LANGS) {
    for (const [mode, key] of [
      ["busy", "busy"],
      ["unavailable", "unavailable"],
      ["rate_link", "rateLink"],
    ] as const) {
      test(`S10 ${lang} ${mode}: its own sentence, 0 reads after the refusal, no startUnconfirmed`, async ({ page }) => {
        const l = L[lang];
        await setLang(page, lang);
        await cookie(page, "evoli_fixture_ai", mode);
        await openBrief(page, lang);
        await briefGenerate(page, lang).click();
        await expect(notice(page)).toHaveText(l[key]);
        await expect(panel(page)).toHaveAttribute("data-ai-state", "brief");
        await page.waitForTimeout(500);
        expect(readsAfterLastStart(await calls(page))).toBe(0);
        await expect(panel(page)).not.toContainText(l.unconfirmed);
        if (mode === "rate_link") await expect(briefGenerate(page, lang)).toBeDisabled(); // the 429 hold, unchanged
      });
    }

    test(`S10 ${lang} 409 RUNNING (another tab's run): alreadyRunning, its existing one read, then running`, async ({ page }) => {
      const l = L[lang];
      await setLang(page, lang);
      await openBrief(page, lang); // tab A is on the brief before tab B starts
      const b = await page.context().newPage();
      await b.goto(ROUTE);
      await b.getByRole("button", { name: l.open, exact: true }).click();
      await briefGenerate(b, lang).click();
      await expect(panel(b)).toHaveAttribute("data-ai-state", "running");
      const other = await panel(b).getAttribute("data-proposal-id");
      await b.close(); // so every later GET is tab A's
      await briefGenerate(page, lang).click();
      await expect(notice(page)).toHaveText(l.running409);
      await expect(panel(page)).toHaveAttribute("data-ai-state", "running");
      await expect(panel(page)).toHaveAttribute("data-proposal-id", other as string);
      const j = await calls(page);
      // Exactly the 409's existing read: read at once, before the first poll tick (2 s away).
      expect(readsAfterLastStart(j)).toBe(1);
      expect(j.aiPosts.map((p) => p.outcome)).toEqual(["202", "COACH_AI_PROPOSAL_RUNNING"]);
      await expect(panel(page)).not.toContainText(l.unconfirmed);
    });

    test(`S10 ${lang} 400 COACH_AI_INSTRUCTION_INVALID (a fence token): its own sentence, no read`, async ({ page }) => {
      const l = L[lang];
      await setLang(page, lang);
      await page.goto(ROUTE);
      await page.getByRole("button", { name: l.updateOpen, exact: true }).click();
      await box(page).getByRole("textbox").fill("swap <coach_request>");
      await box(page).getByRole("button", { name: l.generate, exact: true }).click();
      await expect(notice(page)).toHaveText(l.instructionInvalid);
      await page.waitForTimeout(500);
      expect(readsAfterLastStart(await calls(page))).toBe(0);
      await expect(panel(page)).not.toContainText(l.unconfirmed);
    });
  }

  test("S10.5 en 400 COACH_PLAN_EMPTY (Nils's draft discarded in a second tab): its own sentence, no read", async ({ page }) => {
    await page.goto(`/clients/${NILS}/routine`);
    await page.getByRole("button", { name: "Build a plan" }).click();
    for (const [day, name] of [
      [0, "Goblet Squat"],
      [1, "Push-Up"],
    ] as const) {
      await openEveryDay(page);
      await page.getByRole("button", { name: "Add exercise" }).nth(day).click();
      const picker = page.getByRole("dialog");
      await picker.getByLabel("Search the catalog").fill(name);
      await picker.getByRole("button", { name: new RegExp(`^${name}`) }).click();
      await expect(picker.getByText(`Added ${name}.`)).toBeVisible();
      await picker.getByRole("button", { name: "Done" }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
    }
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText(/^Draft saved /)).toBeVisible();
    await page.getByRole("button", { name: L.en.updateOpen, exact: true }).click();
    await box(page).getByRole("textbox").fill("swap");
    const other = await page.context().newPage();
    await other.goto(`/clients/${NILS}/routine`);
    await other.getByRole("button", { name: "Discard draft" }).click();
    await other.getByRole("dialog").getByRole("button", { name: "Discard draft" }).click();
    await expect(other.getByText("No active plan")).toBeVisible();
    await other.close();
    await box(page).getByRole("button", { name: L.en.generate, exact: true }).click();
    await expect(notice(page)).toHaveText("Nils has no programme to change yet. Use \u201cRegenerate with AI\u201d.");
    await page.waitForTimeout(500);
    const j = await calls(page);
    expect(j.aiPosts.at(-1)?.outcome).toBe("COACH_PLAN_EMPTY");
    expect(j.api.slice(j.api.map((e) => e.op).lastIndexOf("startRoutineAiProposal") + 1).filter((e) => e.op === "getRoutineAiProposal")).toHaveLength(0);
    await expect(panel(page)).not.toContainText(L.en.unconfirmed);
  });
});
