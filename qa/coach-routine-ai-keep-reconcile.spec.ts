import { expect, type Page, type Route } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";

/**
 * BUG-869 / BUG-870 — a Keep whose answer was lost, or a later Keep answered `409` for a suggestion
 * already kept. ADR-0036 § Amendment BUG-869/870, in FIXTURE mode: the decision-table rows the
 * fixture can reach. (The two A1 races are in `qa/routine-ai-keep-reconcile-unit.spec.ts`; W1–W9
 * live through the drop proxy are senior-qa's.)
 *
 * How each Keep outcome is produced:
 *   · `evoli_fixture_ai_keep_lost=thrown|500|502|503|504` — Keep writes the draft and deletes P, then
 *     its answer is lost (W1, W5, and A3's plain 500); `thrown_before` loses it before anything is
 *     checked or written (W3). One Keep per test, then the retry goes through.
 *   · two tabs in one context — tab B keeps P, tab A then keeps P: `409 COACH_PROPOSAL_STALE` (W2).
 *   · `page.route` on the server action — its request reaches the server and the browser's answer is
 *     reset (W7), or the reconcile READ's request is reset (W6's "the read fails too"), or a cookie is
 *     set between the Keep and the read so the read answers 403 / 404.
 *
 * Journal checks stand in for the DB: `keepRoutineAiProposal`, `getRoutineAiProposal` in the api
 * journal, and `aiPosts` for "no paid start" (the counters).
 *
 * Sentences are LITERALS from the EV-186 copy table (senior-po, hub b6be4c95), never imported from
 * `src/lib/copy.ts`. FR keeps U+00A0 before « : ».
 */

const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
const ROUTE = (id: string) => `/clients/${id}/routine`;

const L = {
  en: {
    locale: null,
    open: "Regenerate with AI",
    generate: "Generate",
    keep: "Keep",
    retry: "Try again",
    discard: "Discard",
    showSaved: "Show what's saved",
    planName: "Plan name",
    saveDraft: "Save draft",
    draftSaved: /^Draft saved /,
    unconfirmed: "We couldn't confirm whether this suggestion was kept. Show what's saved before you do anything else.",
    unsaved: "Showing what's saved replaces your unsaved changes.",
    stillHere: "We couldn't confirm this suggestion was kept. It's still here, so you can keep it.",
    nothingChanged: "Nothing was changed",
    programmeChanged: "changed after this suggestion",
    disclosure: /^Drafted with AI on .+\. Review it before you publish — you're the author\.$/,
    denied: "This trainee is not on your roster. They may have revoked access.",
  },
  fr: {
    locale: "fr",
    open: "Régénérer avec l'IA",
    generate: "Générer",
    keep: "Garder",
    retry: "Réessayer",
    discard: "Écarter",
    showSaved: "Afficher la version enregistrée",
    planName: "Nom du plan",
    saveDraft: "Enregistrer le brouillon",
    draftSaved: /^Brouillon enregistré /,
    unconfirmed:
      "Impossible de confirmer si cette suggestion a été gardée. Affichez la version enregistrée avant toute autre action.",
    unsaved: "Afficher la version enregistrée remplace vos modifications non enregistrées.",
    stillHere: "Impossible de confirmer que cette suggestion a été gardée. Elle est toujours là : vous pouvez la garder.",
    nothingChanged: "Rien n'a été modifié",
    programmeChanged: "a changé depuis cette suggestion",
    disclosure: /^Préparé avec l'IA le .+\. Relisez-le avant de publier\s: vous en êtes l'auteur\.$/,
    denied: "Ce client ne fait pas partie de votre liste. Il a peut-être révoqué l'accès.",
  },
} as const;
type Lang = keyof typeof L;
const LANGS: Lang[] = ["en", "fr"];

async function cookie(page: Page, name: string, value: string) {
  await page.context().addCookies([{ name, value, domain: "localhost", path: "/" }]);
}
const panel = (page: Page) => page.getByTestId("routine-ai-panel");

type Journal = { api: { op: string; arg: string | null }[]; aiPosts: { outcome: string }[] };
async function calls(page: Page): Promise<Journal> {
  const res = await page.request.get("/api/fixture/calls", { maxRedirects: 0 });
  return res.json();
}
/** The proposal GETs after the LAST Keep in the journal. */
function readsAfterLastKeep(j: Journal): number {
  const at = j.api.map((e) => e.op).lastIndexOf("keepRoutineAiProposal");
  expect(at, "a Keep reached the fixture").toBeGreaterThanOrEqual(0);
  return j.api.slice(at + 1).filter((e) => e.op === "getRoutineAiProposal" && e.arg === LINA).length;
}

async function setLang(page: Page, lang: Lang) {
  const locale = L[lang].locale;
  if (locale) await cookie(page, "evoli_pro_locale", locale);
}

/** On Lina's page: open the brief, Generate, wait for READY; returns P. */
async function ready(page: Page, lang: Lang, navigate = true): Promise<string> {
  const l = L[lang];
  if (navigate) await page.goto(ROUTE(LINA));
  await page.getByRole("button", { name: l.open, exact: true }).click();
  await panel(page).getByRole("button", { name: l.generate, exact: true }).click();
  await expect(panel(page)).toHaveAttribute("data-ai-state", "ready", { timeout: 10_000 });
  const p = await panel(page).getAttribute("data-proposal-id");
  expect(p).toMatch(/^[0-9a-f-]{36}$/);
  return p as string;
}

/** "Press Keep": the panel's button, then the dialog's when it asks (a saved draft or unsaved edits). */
async function pressKeep(page: Page, lang: Lang, confirm: boolean) {
  await panel(page).getByRole("button", { name: L[lang].keep, exact: true }).click();
  if (confirm) await page.getByRole("dialog").getByRole("button", { name: L[lang].keep, exact: true }).click();
}

/** A LIVE base (no draft) or a DRAFT base (a draft saved first, so Keep asks). */
async function base(page: Page, lang: Lang, kind: "LIVE" | "DRAFT") {
  await page.goto(ROUTE(LINA));
  if (kind === "DRAFT") {
    await page.getByLabel(L[lang].planName).fill("Coach draft");
    await page.getByRole("button", { name: L[lang].saveDraft, exact: true }).click();
    await expect(page.getByText(L[lang].draftSaved)).toBeVisible();
    await page.reload(); // the draft is on the server
    await expect(page.getByLabel(L[lang].planName)).toHaveValue("Coach draft");
  }
}

/** The `unconfirmed` view, exactly: one alert, one button, no Keep, no Try again, no refusal text. */
async function expectUnconfirmed(page: Page, lang: Lang, dirty = false) {
  const l = L[lang];
  await expect(panel(page)).toHaveAttribute("data-ai-state", "unconfirmed");
  await expect(panel(page).getByRole("alert")).toHaveText(dirty ? `${l.unconfirmed} ${l.unsaved}` : l.unconfirmed);
  // The unsaved-edits sentence only while the editor is dirty.
  if (!dirty) await expect(panel(page)).not.toContainText(l.unsaved);
  await expect(panel(page).getByRole("button", { name: l.keep, exact: true })).toHaveCount(0);
  await expect(panel(page).getByRole("button", { name: l.retry, exact: true })).toHaveCount(0);
  await expect(panel(page).getByRole("button", { name: l.discard, exact: true })).toHaveCount(0);
  await expect(panel(page).getByRole("button", { name: l.showSaved, exact: true })).toBeEnabled();
  await expect(panel(page)).not.toContainText(l.nothingChanged);
  await expect(panel(page)).not.toContainText(l.programmeChanged);
}

/** « Show what's saved »: the editor shows the kept draft's disclosure, and the panel is idle (GET NONE). */
async function showSavedLandsKept(page: Page, lang: Lang) {
  const l = L[lang];
  await panel(page).getByRole("button", { name: l.showSaved, exact: true }).click();
  await expect(page.getByTestId("routine-ai-drafted")).toHaveText(l.disclosure);
  await expect(panel(page)).toHaveAttribute("data-ai-state", "idle");
  const shown = await page.getByLabel(l.planName).inputValue();
  await page.reload();
  await expect(panel(page)).toHaveAttribute("data-ai-state", "idle");
  await expect(page.getByTestId("routine-ai-drafted")).toHaveText(l.disclosure);
  // What « Show what's saved » put in the editor is what the server holds.
  await expect(page.getByLabel(l.planName)).toHaveValue(shown);
}

/**
 * Arm a one-shot hook on the next server-action POSTs of this page. `steps[i]` handles the i-th one
 * (the Keep is 0, the reconcile read is 1); later ones go through untouched.
 */
function onActions(page: Page, steps: ((route: Route) => Promise<void>)[]) {
  let n = 0;
  return page.route(
    (url) => url.pathname === ROUTE(LINA),
    async (route) => {
      const req = route.request();
      if (req.method() !== "POST" || !req.headers()["next-action"] || n >= steps.length) return route.continue();
      await steps[n++](route);
    }
  );
}

test.beforeEach(async ({ page }) => {
  await signInThroughForm(page, { email: "coach@evoli.fit", password: "Password123!" });
  await cookie(page, "evoli_fixture_ai_caps", "on");
  await cookie(page, "evoli_fixture_ai_delay_ms", "0");
});

test.describe("no answer, the read does not name P → unconfirmed (BUG-869)", () => {
  for (const lang of LANGS) {
    for (const kind of ["LIVE", "DRAFT"] as const) {
      test(`W1 ${lang} ${kind}: Keep committed, its answer thrown → unconfirmed; one read; Show what's saved lands the kept draft`, async ({
        page,
      }) => {
        await setLang(page, lang);
        await base(page, lang, kind);
        await ready(page, lang, false);
        const postsBefore = (await calls(page)).aiPosts.length;
        await cookie(page, "evoli_fixture_ai_keep_lost", "thrown");
        await pressKeep(page, lang, kind === "DRAFT");
        await expectUnconfirmed(page, lang);
        const j = await calls(page);
        expect(readsAfterLastKeep(j)).toBe(1);
        expect(j.aiPosts.length).toBe(postsBefore); // no paid start
        await showSavedLandsKept(page, lang);
        expect((await calls(page)).aiPosts.length).toBe(postsBefore);
      });
    }
  }

  for (const outcome of ["502", "503", "504", "500"] as const) {
    test(`W5 en: Keep committed, then ${outcome === "500" ? "W5b: an api 500 with an ApiError JSON body (INTERNAL_ERROR): reconciled, not read as a received failure" : `a code-less gateway ${outcome}`} → unconfirmed`, async ({
      page,
    }) => {
      await ready(page, "en");
      await cookie(page, "evoli_fixture_ai_keep_lost", outcome);
      await pressKeep(page, "en", false);
      await expectUnconfirmed(page, "en");
      expect(readsAfterLastKeep(await calls(page))).toBe(1);
      await showSavedLandsKept(page, "en");
    });
  }

  test("W5 fr: gateway 502 → unconfirmed, FR byte for byte", async ({ page }) => {
    await setLang(page, "fr");
    await ready(page, "fr");
    await cookie(page, "evoli_fixture_ai_keep_lost", "502");
    await pressKeep(page, "fr", false);
    await expectUnconfirmed(page, "fr");
    await showSavedLandsKept(page, "fr");
  });

  test("W7 en: the browser's answer is reset after the server ran the Keep (settled fallback) → unconfirmed", async ({
    page,
  }) => {
    await ready(page, "en");
    await onActions(page, [
      async (route) => {
        await route.fetch();
        await route.abort("connectionreset");
      },
    ]);
    await pressKeep(page, "en", false);
    await expectUnconfirmed(page, "en");
    // Two reads, not one: here the Keep action itself SUCCEEDED (only the browser lost its answer), so
    // its `revalidatePath` re-render read the proposal once inside that action, and the reconcile read
    // once more. W1's "exactly 1" holds where the action returns a failure (no revalidation).
    const j = await calls(page);
    expect(readsAfterLastKeep(j)).toBe(2);
    await showSavedLandsKept(page, "en");
  });

  for (const lang of LANGS) {
    test(`W9 ${lang}: a dirty editor adds the unsaved-edits sentence to the same alert`, async ({ page }) => {
      await setLang(page, lang);
      await page.goto(ROUTE(LINA));
      await page.getByLabel(L[lang].planName).fill("Unsaved edit");
      await ready(page, lang, false);
      await cookie(page, "evoli_fixture_ai_keep_lost", "thrown");
      await pressKeep(page, lang, true); // unsaved edits: Keep asks first
      await expectUnconfirmed(page, lang, true);
      // The press replaces them: the sentence goes with them.
      await showSavedLandsKept(page, lang);
      // « Show what's saved » replaced the unsaved edit with the server's draft, and the editor is clean.
      await expect(page.getByLabel(L[lang].planName)).not.toHaveValue("Unsaved edit");
      await expect(page.getByText(lang === "en" ? "Unsaved changes" : "Modifications non enregistrées", { exact: true })).toHaveCount(0);
    });
  }
});

test.describe("no answer, the read names P READY → still here, Keep enabled (W3)", () => {
  for (const lang of LANGS) {
    test(`W3 ${lang}: the Keep never reached the api → keepUnconfirmedStillHere; Keep again → 200`, async ({ page }) => {
      const l = L[lang];
      await setLang(page, lang);
      const p = await ready(page, lang);
      await cookie(page, "evoli_fixture_ai_keep_lost", "thrown_before");
      await pressKeep(page, lang, false);
      await expect(panel(page).getByTestId("routine-ai-notice")).toHaveText(l.stillHere);
      await expect(panel(page)).toHaveAttribute("data-ai-state", "ready");
      await expect(panel(page)).toHaveAttribute("data-proposal-id", p);
      await expect(panel(page).getByRole("button", { name: l.keep, exact: true })).toBeEnabled();
      await expect(panel(page)).not.toContainText(l.nothingChanged);
      await expect(page.getByTestId("routine-ai-drafted")).toHaveCount(0); // nothing was written
      expect(readsAfterLastKeep(await calls(page))).toBe(1);
      await pressKeep(page, lang, false);
      await expect(panel(page)).toHaveAttribute("data-ai-state", "idle");
      await expect(page.getByTestId("routine-ai-drafted")).toHaveText(l.disclosure);
      await expect(panel(page).getByTestId("routine-ai-notice")).toHaveCount(0);
    });
  }
});

test.describe("409 with P gone reconciles (BUG-870, W2)", () => {
  for (const lang of LANGS) {
    test(`W2 ${lang}: tab B keeps P, tab A's Keep is 409 STALE → unconfirmed, never a paid Try again`, async ({ page }) => {
      const l = L[lang];
      await setLang(page, lang);
      const p = await ready(page, lang);
      const b = await page.context().newPage();
      await b.goto(ROUTE(LINA));
      await expect(panel(b)).toHaveAttribute("data-ai-state", "ready");
      await expect(panel(b)).toHaveAttribute("data-proposal-id", p);
      await pressKeep(b, lang, false);
      await expect(b.getByTestId("routine-ai-drafted")).toHaveText(l.disclosure);
      const postsBefore = (await calls(page)).aiPosts.length;
      await pressKeep(page, lang, false); // A still shows P, and has no draft on screen: no confirm
      await expectUnconfirmed(page, lang);
      await panel(page).getByRole("button", { name: l.showSaved, exact: true }).click();
      await expect(page.getByTestId("routine-ai-drafted")).toHaveText(l.disclosure);
      await expect(panel(page)).toHaveAttribute("data-ai-state", "idle");
      expect((await calls(page)).aiPosts.length).toBe(postsBefore);
      await b.close();
    });
  }
});

test.describe("the reconcile read fails too", () => {
  test("W6 en: the read's request is reset → unconfirmed; Show what's saved recovers", async ({ page }) => {
    await ready(page, "en");
    await cookie(page, "evoli_fixture_ai_keep_lost", "thrown");
    await onActions(page, [(route) => route.continue(), (route) => route.abort("connectionreset")]);
    await pressKeep(page, "en", false);
    await expectUnconfirmed(page, "en");
    await showSavedLandsKept(page, "en");
  });

  test("en: the read is 404 (the routes went off) → the panel is hidden", async ({ page }) => {
    await ready(page, "en");
    await cookie(page, "evoli_fixture_ai_keep_lost", "thrown");
    await onActions(page, [
      async (route) => {
        const response = await route.fetch();
        await cookie(page, "evoli_fixture_ai", "off");
        await route.fulfill({ response });
      },
    ]);
    await pressKeep(page, "en", false);
    await expect(panel(page)).toHaveCount(0);
  });

  for (const lang of LANGS) {
    test(`${lang}: the read is 403 (the link ended) → the access-lost page`, async ({ page }) => {
      await setLang(page, lang);
      await ready(page, lang);
      await cookie(page, "evoli_fixture_ai_keep_lost", "thrown");
      await onActions(page, [
        async (route) => {
          const response = await route.fetch();
          await cookie(page, "evoli_fixture_link", "ended");
          await route.fulfill({ response });
        },
      ]);
      await pressKeep(page, lang, false);
      await expect(page).toHaveURL(/\/clients\/denied/);
      await expect(page.getByRole("heading", { name: L[lang].denied })).toBeVisible();
    });
  }
});

test.describe("pending and the stale read (QA additions)", () => {
  for (const lang of LANGS) {
    test(`W10 ${lang}: Keep and Discard stay disabled until the reconcile read is adopted`, async ({ page }) => {
      const l = L[lang];
      await setLang(page, lang);
      await ready(page, lang);
      await cookie(page, "evoli_fixture_ai_keep_lost", "thrown_before");
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
      await pressKeep(page, lang, false);
      await arrived; // the Keep has answered; its reconcile read is on the wire, held
      await expect(panel(page)).toHaveAttribute("data-ai-state", "ready");
      await expect(panel(page).getByRole("button", { name: l.keep, exact: true })).toBeDisabled();
      await expect(panel(page).getByRole("button", { name: l.discard, exact: true })).toBeDisabled();
      await page.waitForTimeout(500);
      await expect(panel(page).getByRole("button", { name: l.keep, exact: true })).toBeDisabled();
      await expect(panel(page).getByTestId("routine-ai-notice")).toHaveCount(0);
      release();
      await expect(panel(page).getByTestId("routine-ai-notice")).toHaveText(l.stillHere);
      await expect(panel(page).getByRole("button", { name: l.keep, exact: true })).toBeEnabled();
      await expect(panel(page).getByRole("button", { name: l.discard, exact: true })).toBeEnabled();
    });
  }

  test("W10 en, confirm dialog: its Keep stays disabled until the reconcile read is adopted", async ({ page }) => {
    await base(page, "en", "DRAFT");
    await ready(page, "en", false);
    await cookie(page, "evoli_fixture_ai_keep_lost", "thrown");
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
    await panel(page).getByRole("button", { name: "Keep", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Keep", exact: true }).click();
    await arrived;
    await expect(panel(page).getByRole("button", { name: "Keep", exact: true })).toBeDisabled();
    await expect(panel(page).getByRole("button", { name: "Discard", exact: true })).toBeDisabled();
    release();
    await expectUnconfirmed(page, "en");
  });

  for (const lang of LANGS) {
    test(`${lang}: no answer and the read names P stale (A1) → unconfirmed; Show what's saved reaches the honest stale view`, async ({
      page,
    }) => {
      const l = L[lang];
      await setLang(page, lang);
      const p = await ready(page, lang);
      // Another tab saves a draft: P's LIVE base moved, so the read answers {P, EXPIRED, COACH_PROPOSAL_STALE}.
      const b = await page.context().newPage();
      await b.goto(ROUTE(LINA));
      await b.getByLabel(l.planName).fill("Saved in tab B");
      await b.getByRole("button", { name: l.saveDraft, exact: true }).click();
      await expect(b.getByText(l.draftSaved)).toBeVisible();
      await b.close();
      // The Keep never reaches the api, so it cannot be refused: only the read speaks.
      await cookie(page, "evoli_fixture_ai_keep_lost", "thrown_before");
      await pressKeep(page, lang, false);
      await expectUnconfirmed(page, lang);
      await panel(page).getByRole("button", { name: l.showSaved, exact: true }).click();
      await expect(page.getByLabel(l.planName)).toHaveValue("Saved in tab B");
      await expect(page.getByTestId("routine-ai-drafted")).toHaveCount(0); // nothing was kept
      await expect(panel(page)).toHaveAttribute("data-ai-state", "stale");
      await expect(panel(page)).toHaveAttribute("data-proposal-id", p);
      await expect(panel(page).getByRole("alert")).toHaveText(
        lang === "en"
          ? "Lina's programme changed after this suggestion was made. Try again to get a fresh one."
          : "Le programme de Lina a changé depuis cette suggestion. Réessayez pour en obtenir une nouvelle."
      );
    });
  }
});

test.describe("unchanged rows", () => {
  test("409 with P still there: today's stale view with the 409's own code and Try again (W8 c)", async ({ page }) => {
    await ready(page, "en");
    await page.getByLabel("Plan name").fill("Saved after the suggestion");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText(/^Draft saved /)).toBeVisible();
    await pressKeep(page, "en", true);
    await expect(panel(page)).toHaveAttribute("data-ai-state", "stale");
    await expect(panel(page).getByRole("alert")).toHaveText(
      "Your draft for Lina changed after this suggestion was made. Try again to get a fresh one."
    );
    await expect(panel(page).getByRole("button", { name: "Try again", exact: true })).toBeVisible();
    expect(readsAfterLastKeep(await calls(page))).toBe(1); // the 409 reconciled, and the read named P
  });

});
