import { existsSync } from "node:fs";
import { expect, webkit, type Browser, type Locator, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";
import { expectNoSidewaysScroll, expectUnoccluded } from "./layout";
import { expectNoEnglish } from "./french";
import { formatDate, formatInstant } from "../src/lib/format";

/**
 * EV-341j — the trial session on the Programme tab: J1 (prepare, from a template day), J2
 * (assign through the two phases, EV-184's repair dialog), J3 (assigned / done, no edit),
 * J3b (the withdraw dialog), the withdrawn J3c (a done session offers NO prepare path), and the portal rules
 * (French, widths, keyboard, WebKit). J4's roster pill is `trial-session-roster.spec.ts`
 * (populated roster); the pure parts are `trial-session-unit.spec.ts`.
 *
 * Fixture clients, from the seed: Nils (all scopes, no plan, no injury: AWAITING_PROGRAMME),
 * Dana (a shoulder injury and a plan the coach did not publish: AWAITING_PROGRAMME, and the
 * policy repairs a bench press and an overhead press), Lina (a plan this coach published:
 * PUBLISHED, no card), Omar (the catalogue is down for him: 503). The trainee finishing the
 * session is `POST /api/fixture/trial`. Every api call is counted in `/api/fixture/calls`.
 *
 * Sentences are LITERALS from the story; dates go through the portal's own formatter.
 */

const NILS = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0002";
const DANA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0004";
const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
const OMAR = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0005";

const T = {
  en: {
    locale: "en-US",
    region: "Trial session",
    prepare: "Prepare a trial session",
    fromTemplate: "Start from a template",
    assign: "Assign",
    withdraw: "Withdraw",
    cancel: "Cancel",
    needs: "Add at least one exercise.",
    addExercise: "Add exercise",
    search: "Search the catalog",
    done: "Done",
    withdrawTitle: "Withdraw the trial session?",
    withdrawBody:
      "Nils will no longer see it in the app. If Nils has already started it, it can still be finished and will count as done.",
    assignedOn: (d: string) => `Assigned on ${d}`,
    doneOn: (d: string) => `Done on ${d}`,
    repairs: "We changed 2 things to keep this safe",
    failed: "The trial session could not be assigned.",
    catalog: "The exercise catalog is unavailable. Try again shortly.",
    loadError: "This block could not be loaded. Reload the page to try again.",
    denied: "This trainee is not on your roster. They may have revoked access.",
  },
  fr: {
    locale: "fr-FR",
    region: "Séance d'essai",
    prepare: "Préparer une séance d'essai",
    fromTemplate: "Partir d'un modèle",
    assign: "Assigner",
    withdraw: "Retirer",
    cancel: "Annuler",
    needs: "Ajoutez au moins un exercice.",
    addExercise: "Ajouter un exercice",
    search: "Rechercher dans le catalogue",
    done: "Terminé",
    withdrawTitle: "Retirer la séance d'essai ?",
    withdrawBody:
      "Nils ne la verra plus dans l'app. Si Nils l'a déjà commencée, elle pourra être terminée et comptera comme faite.",
    assignedOn: (d: string) => `Assignée le ${d}`,
    doneOn: (d: string) => `Faite le ${d}`,
    repairs: "",
    failed: "",
    catalog: "",
    loadError: "",
    denied: "",
  },
} as const;
type Lang = keyof typeof T;

const plain = (text: string | null) => (text ?? "").replace(/[\u00a0\u202f]/g, " ");
const today = (lang: Lang) => formatInstant(new Date().toISOString(), lang);
const todayDate = (lang: Lang) => formatDate(new Date().toISOString().slice(0, 10), lang);

type Entry = { op: string; arg: string | null };
async function count(page: Page, op: string, id: string): Promise<number> {
  const res = await page.request.get("/api/fixture/calls", { maxRedirects: 0 });
  expect(res.status()).toBe(200);
  return ((await res.json()) as { api: Entry[] }).api.filter((e) => e.op === op && e.arg === id).length;
}

async function complete(page: Page, id: string): Promise<void> {
  const res = await page.request.post("/api/fixture/trial", { data: { clientId: id, action: "complete" }, maxRedirects: 0 });
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ changed: true });
}

function card(page: Page, lang: Lang = "en"): Locator {
  return page.getByRole("region", { name: T[lang].region, exact: true });
}

async function openProgramme(page: Page, id: string): Promise<void> {
  await page.goto(`/clients/${id}/routine`);
  await expect(page.locator("[data-nav-progress-ready]"), "the Programme tab hydrated").toHaveCount(1);
}

async function prepare(page: Page, lang: Lang = "en"): Promise<void> {
  await card(page, lang).getByRole("button", { name: T[lang].prepare, exact: true }).click();
  await expect(card(page, lang).getByRole("button", { name: T[lang].fromTemplate, exact: true })).toBeVisible();
}

async function addExercise(page: Page, name: string, lang: Lang = "en"): Promise<void> {
  await card(page, lang).getByRole("button", { name: T[lang].addExercise, exact: true }).click();
  const picker = page.getByRole("dialog");
  await picker.getByLabel(T[lang].search).fill(name);
  await picker.getByRole("button", { name: new RegExp(`^${name}`) }).click();
  await picker.getByRole("button", { name: T[lang].done, exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(card(page, lang).getByRole("group", { name, exact: true })).toBeVisible();
}

/** « Partir d'un modèle » → "Upper / Lower split" → its first day (Upper body: bench, row, overhead press). */
async function fromTemplateDay(page: Page, lang: Lang = "en"): Promise<void> {
  await card(page, lang).getByRole("button", { name: T[lang].fromTemplate, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: T[lang].fromTemplate });
  await dialog.getByRole("button", { name: "Upper / Lower split", exact: true }).click();
  await dialog.getByRole("button", { name: /Upper body/ }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

async function assigned(page: Page, lang: Lang = "en"): Promise<void> {
  await expect(card(page, lang).getByText(T[lang].assignedOn(today(lang)), { exact: true })).toBeVisible();
}

test.describe("EV-341j (EN)", () => {
  test.use({ locale: "en-US" });

  test.describe("J1 prepare", () => {
    test("AWAITING_PROGRAMME: the card, « Préparer », and the empty day editor with Assign off and why", async ({ page }) => {
      await signInThroughForm(page);
      await openProgramme(page, NILS);
      await expect(card(page)).toBeVisible();
      await prepare(page);
      await expect(card(page).getByRole("group")).toHaveCount(0);
      const assign = card(page).getByRole("button", { name: T.en.assign, exact: true });
      await expect(assign).toBeDisabled();
      await expect(assign).toHaveAccessibleDescription(T.en.needs);
      // J1 names no title, date or note field, so none is offered.
      await expect(card(page).getByRole("textbox")).toHaveCount(0);
    });

    test("« Partir d'un modèle » fills the editor with the picked template day's rows", async ({ page }) => {
      await signInThroughForm(page);
      await openProgramme(page, NILS);
      await prepare(page);
      await fromTemplateDay(page);
      for (const name of ["Barbell Bench Press", "Barbell Overhead Press"]) {
        await expect(card(page).getByRole("group", { name, exact: true })).toBeVisible();
      }
      await expect(card(page).getByRole("group")).toHaveCount(3);
      await expect(card(page).getByRole("button", { name: T.en.assign, exact: true })).toBeEnabled();
    });

    test("PUBLISHED with nothing assigned: no card", async ({ page }) => {
      await signInThroughForm(page);
      await openProgramme(page, LINA);
      await expect(page.locator("#plan-name")).toBeVisible();
      await expect(card(page)).toHaveCount(0);
    });

    test("an api without the route (404): no card; a failed read (500): the block's load-error line", async ({ page, baseURL }) => {
      await signInThroughForm(page);
      await page.context().addCookies([{ name: "evoli_fixture_trial_read", value: "missing", url: baseURL! }]);
      await openProgramme(page, NILS);
      await expect(page.getByRole("heading", { name: "Nils K." })).toBeVisible();
      await expect(card(page)).toHaveCount(0);
      await page.context().addCookies([{ name: "evoli_fixture_trial_read", value: "fail", url: baseURL! }]);
      await openProgramme(page, NILS);
      await expect(card(page).getByText(T.en.loadError, { exact: true })).toBeVisible();
      await expect(card(page).getByRole("button")).toHaveCount(0);
    });
  });

  test.describe("J2 assign", () => {
    test("no repairs: one preview, one assign, no dialog", async ({ page }) => {
      await signInThroughForm(page);
      await openProgramme(page, NILS);
      await prepare(page);
      await addExercise(page, "Goblet Squat");
      await card(page).getByRole("button", { name: T.en.assign, exact: true }).click();
      await assigned(page);
      await expect(page.getByRole("dialog")).toHaveCount(0);
      expect(await count(page, "previewTrialSession", NILS)).toBe(1);
      expect(await count(page, "assignTrialSession", NILS)).toBe(1);
    });

    test("repairs: EV-184's dialog; Cancel writes nothing, Assign echoes the digest", async ({ page }) => {
      await signInThroughForm(page);
      await openProgramme(page, DANA);
      await prepare(page);
      await fromTemplateDay(page);
      await card(page).getByRole("button", { name: T.en.assign, exact: true }).click();
      const dialog = page.getByRole("dialog", { name: T.en.repairs });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole("listitem")).toHaveCount(2);
      await dialog.getByRole("button", { name: T.en.cancel, exact: true }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      expect(await count(page, "assignTrialSession", DANA), "Cancel assigns nothing").toBe(0);

      await card(page).getByRole("button", { name: T.en.assign, exact: true }).click();
      await page.getByRole("dialog", { name: T.en.repairs }).getByRole("button", { name: T.en.assign, exact: true }).click();
      await assigned(page);
      expect(await count(page, "previewTrialSession", DANA)).toBe(2);
      expect(await count(page, "assignTrialSession", DANA)).toBe(1);
    });

    test("a stale digest (409) previews again and never retries the digest blind", async ({ page, baseURL }) => {
      await signInThroughForm(page);
      await page.context().addCookies([{ name: "evoli_fixture_trial_assign", value: "stale", url: baseURL! }]);
      // With repairs: the 409 shows the dialog again, from a new preview.
      await openProgramme(page, DANA);
      await prepare(page);
      await fromTemplateDay(page);
      await card(page).getByRole("button", { name: T.en.assign, exact: true }).click();
      await page.getByRole("dialog", { name: T.en.repairs }).getByRole("button", { name: T.en.assign, exact: true }).click();
      await expect.poll(() => count(page, "previewTrialSession", DANA)).toBe(2);
      await expect(page.getByRole("dialog", { name: T.en.repairs })).toBeVisible();
      expect(await count(page, "assignTrialSession", DANA)).toBe(1);
      // Without repairs: one more preview and assign, then the failure sentence.
      await openProgramme(page, NILS);
      await prepare(page);
      await addExercise(page, "Goblet Squat");
      await card(page).getByRole("button", { name: T.en.assign, exact: true }).click();
      await expect(card(page).getByRole("alert")).toHaveText(T.en.failed);
      expect(await count(page, "previewTrialSession", NILS)).toBe(2);
      expect(await count(page, "assignTrialSession", NILS)).toBe(2);
      await expect(card(page).getByRole("group", { name: "Goblet Squat" }), "the editor keeps its rows").toBeVisible();
    });

    test("the catalogue down (503): its sentence, the editor kept", async ({ page }) => {
      await signInThroughForm(page);
      await openProgramme(page, OMAR);
      await prepare(page);
      await fromTemplateDay(page);
      await card(page).getByRole("button", { name: T.en.assign, exact: true }).click();
      await expect(card(page).getByRole("alert")).toHaveText(T.en.catalog);
      expect(await count(page, "assignTrialSession", OMAR)).toBe(0);
    });

    /**
     * Staff r2 N4: the ACTION accepts a preview only whole (`asTrialPreview`), not just the
     * function. Nils has no repairs, so a preview whose extra repair is not a sentence, or whose
     * `repairCount` disagrees with its list, would, with the odd repair dropped, leave nothing to
     * show and assign straight on with a valid digest: a repair acknowledged that the coach never
     * saw. Red control: the r1 inline `.filter(string)` in `previewTrialSessionAction` assigns.
     */
    for (const sw of ["object_repair", "count_mismatch"] as const) {
      test(`a preview the card cannot show whole (${sw}): the error line, no dialog, no assign`, async ({ page, baseURL }) => {
        await signInThroughForm(page);
        await page.context().addCookies([{ name: "evoli_fixture_trial_preview", value: sw, url: baseURL! }]);
        await openProgramme(page, NILS);
        await prepare(page);
        await addExercise(page, "Goblet Squat");
        await card(page).getByRole("button", { name: T.en.assign, exact: true }).click();
        await expect(card(page).getByRole("alert")).toHaveText(T.en.failed);
        await expect(page.getByRole("dialog")).toHaveCount(0);
        expect(await count(page, "previewTrialSession", NILS)).toBe(1);
        expect(await count(page, "assignTrialSession", NILS), "nothing is assigned").toBe(0);
        await expect(card(page).getByRole("group", { name: "Goblet Squat" }), "the editor keeps its rows").toBeVisible();
        await expect(card(page).getByText(T.en.assignedOn(today("en")), { exact: true })).toHaveCount(0);
      });
    }

    test("assigned in another tab meanwhile (409 already open): the editor closes on the assigned one", async ({ page, context }) => {
      await signInThroughForm(page);
      await openProgramme(page, NILS);
      await prepare(page);
      await addExercise(page, "Goblet Squat");
      const other = await context.newPage();
      await openProgramme(other, NILS);
      await prepare(other);
      await addExercise(other, "Goblet Squat");
      await card(other).getByRole("button", { name: T.en.assign, exact: true }).click();
      await assigned(other);
      await card(page).getByRole("button", { name: T.en.assign, exact: true }).click();
      await assigned(page);
      await expect(card(page).getByRole("group")).toHaveCount(0);
      expect(await count(page, "assignTrialSession", NILS)).toBe(2);
    });

    test("the link ended: the overview's denial page", async ({ page, baseURL }) => {
      await signInThroughForm(page);
      await openProgramme(page, NILS);
      await prepare(page);
      await addExercise(page, "Goblet Squat");
      await page.context().addCookies([{ name: "evoli_fixture_link", value: "ended", url: baseURL! }]);
      await card(page).getByRole("button", { name: T.en.assign, exact: true }).click();
      await expect(page).toHaveURL(/\/clients\/denied$/, { timeout: 10_000 });
      await expect(page.getByText(T.en.denied, { exact: true })).toBeVisible();
    });
  });

  test.describe("J3 / J3b", () => {
    async function assignGoblet(page: Page) {
      await openProgramme(page, NILS);
      await prepare(page);
      await addExercise(page, "Goblet Squat");
      await card(page).getByRole("button", { name: T.en.assign, exact: true }).click();
      await assigned(page);
    }

    test("J3 assigned: the date and « Retirer », and no edit control", async ({ page }) => {
      await signInThroughForm(page);
      await assignGoblet(page);
      await page.reload();
      await assigned(page);
      await expect(card(page).getByRole("button")).toHaveCount(1);
      await expect(card(page).getByRole("button", { name: T.en.withdraw, exact: true })).toBeVisible();
      for (const role of ["textbox", "spinbutton", "combobox", "group"] as const) {
        await expect(card(page).getByRole(role), `no ${role} on an assigned session`).toHaveCount(0);
      }
      await expect(card(page).getByText(/^(Edit|Modifier)\b/)).toHaveCount(0);
    });

    test("J3b: the dialog's words; Cancel keeps it, Withdraw withdraws", async ({ page }) => {
      await signInThroughForm(page);
      await assignGoblet(page);
      await card(page).getByRole("button", { name: T.en.withdraw, exact: true }).click();
      const dialog = page.getByRole("dialog", { name: T.en.withdrawTitle });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText(T.en.withdrawBody, { exact: true })).toBeVisible();
      await expect(dialog.getByRole("button", { name: T.en.withdraw, exact: true })).toBeVisible();
      await dialog.getByRole("button", { name: T.en.cancel, exact: true }).click();
      await assigned(page);
      expect(await count(page, "withdrawTrialSession", NILS)).toBe(0);

      await card(page).getByRole("button", { name: T.en.withdraw, exact: true }).click();
      await page.getByRole("dialog", { name: T.en.withdrawTitle }).getByRole("button", { name: T.en.withdraw, exact: true }).click();
      await expect(card(page).getByRole("button", { name: T.en.prepare, exact: true })).toBeVisible();
      expect(await count(page, "withdrawTrialSession", NILS)).toBe(1);
    });

    test("J3b, the link ended: the withdraw's 403 is the overview's denial page (staff r1 N3)", async ({ page, baseURL }) => {
      await signInThroughForm(page);
      await assignGoblet(page);
      await card(page).getByRole("button", { name: T.en.withdraw, exact: true }).click();
      const dialog = page.getByRole("dialog", { name: T.en.withdrawTitle });
      await expect(dialog).toBeVisible();
      // The link ends while the dialog is open: the withdraw is the call that meets it.
      await page.context().addCookies([{ name: "evoli_fixture_link", value: "ended", url: baseURL! }]);
      await dialog.getByRole("button", { name: T.en.withdraw, exact: true }).click();
      await expect(page).toHaveURL(/\/clients\/denied$/, { timeout: 10_000 });
      await expect(page.getByText(T.en.denied, { exact: true })).toBeVisible();
      expect(await count(page, "withdrawTrialSession", NILS), "the withdraw reached the api and was refused").toBe(1);
    });

    test("J3 done: « Faite le » links to the history, and the card holds no control (J3c withdrawn)", async ({ page }) => {
      await signInThroughForm(page);
      await assignGoblet(page);
      await complete(page, NILS);
      await page.reload();
      const link = card(page).getByRole("link", { name: T.en.doneOn(todayDate("en")), exact: true });
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute("href", `/clients/${NILS}#ov-activity`);
      // TRIAL_DONE has no prepare path in this release: no « Préparer » of any kind, no button at all.
      await expect(card(page).getByRole("button")).toHaveCount(0);
      await expect(page.getByRole("button", { name: /^(Prepare|Préparer)/ })).toHaveCount(0);
    });

    test("J3 done: also when it was withdrawn before it was finished (DONE wins, I3b)", async ({ page }) => {
      await signInThroughForm(page);
      await assignGoblet(page);
      await card(page).getByRole("button", { name: T.en.withdraw, exact: true }).click();
      await page.getByRole("dialog", { name: T.en.withdrawTitle }).getByRole("button", { name: T.en.withdraw, exact: true }).click();
      await expect(card(page).getByRole("button", { name: T.en.prepare, exact: true })).toBeVisible();
      // A player that was already open finishes the withdrawn session.
      await complete(page, NILS);
      await page.reload();
      await expect(card(page).getByRole("link", { name: T.en.doneOn(todayDate("en")), exact: true })).toBeVisible();
      await expect(card(page).getByRole("button")).toHaveCount(0);
    });
  });

  test.describe("the portal rules", () => {
    test("keyboard only: prepare, add from a template, assign, withdraw", async ({ page }) => {
      await signInThroughForm(page);
      await openProgramme(page, NILS);
      await card(page).getByRole("button", { name: T.en.prepare, exact: true }).focus();
      await page.keyboard.press("Enter");
      await expect(card(page).getByRole("button", { name: T.en.fromTemplate, exact: true })).toBeFocused();
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog", { name: T.en.fromTemplate });
      await dialog.getByRole("button", { name: "Upper / Lower split", exact: true }).focus();
      await page.keyboard.press("Enter");
      await dialog.getByRole("button", { name: /Lower body/ }).focus();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await card(page).getByRole("button", { name: T.en.assign, exact: true }).focus();
      await page.keyboard.press("Enter");
      await assigned(page);
      await expect(card(page).getByRole("button", { name: T.en.withdraw, exact: true })).toBeFocused();
      await page.keyboard.press("Enter");
      await page.getByRole("dialog", { name: T.en.withdrawTitle }).getByRole("button", { name: T.en.withdraw, exact: true }).focus();
      await page.keyboard.press("Enter");
      await expect(card(page).getByRole("button", { name: T.en.prepare, exact: true })).toBeFocused();
    });

    for (const width of [1440, 1024, 768, 390]) {
      test(`${width} px: the card's controls on screen, unoccluded, ≥ 44 px, no sideways scroll`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await signInThroughForm(page);
        await openProgramme(page, NILS);
        const check = async (name: string) => {
          const control = card(page).getByRole("button", { name, exact: true });
          await expectUnoccluded(page, control, { label: name });
          const box = await control.boundingBox();
          expect(box?.height ?? 0, `${name}: touch target height`).toBeGreaterThanOrEqual(44);
          await expectNoSidewaysScroll(page, name);
        };
        await check(T.en.prepare);
        await prepare(page);
        await fromTemplateDay(page);
        await check(T.en.fromTemplate);
        await check(T.en.assign);
        await card(page).getByRole("button", { name: T.en.assign, exact: true }).click();
        await assigned(page);
        await check(T.en.withdraw);
      });
    }
  });
});

test.describe("EV-341j (FR, the default language)", () => {
  test.use({ locale: "fr-FR" });

  test("every state of the card in French, and no English on the page", async ({ page }) => {
    await signInThroughForm(page, { lang: "fr" });
    await openProgramme(page, NILS);
    await expect(card(page, "fr").getByRole("button", { name: T.fr.prepare, exact: true })).toBeVisible();
    await prepare(page, "fr");
    await expect(card(page, "fr").getByRole("button", { name: T.fr.assign, exact: true })).toHaveAccessibleDescription(T.fr.needs);
    await expectNoEnglish(page, "the trial editor");
    await fromTemplateDay(page, "fr");
    await card(page, "fr").getByRole("button", { name: T.fr.assign, exact: true }).click();
    await assigned(page, "fr");
    await card(page, "fr").getByRole("button", { name: T.fr.withdraw, exact: true }).click();
    const dialog = page.getByRole("dialog");
    // The dialog's title is what names it (aria-labelledby); read it as printed, NBSP and all.
    const title = await dialog.evaluate((el) => document.getElementById(el.getAttribute("aria-labelledby") ?? "")?.textContent ?? "");
    expect(plain(title)).toBe(T.fr.withdrawTitle);
    await expect.poll(async () => plain(await dialog.locator("p").first().textContent())).toBe(T.fr.withdrawBody);
    await expectNoEnglish(page, "the withdraw dialog");
    await dialog.getByRole("button", { name: T.fr.cancel, exact: true }).click();
    await complete(page, NILS);
    await page.reload();
    await expect(card(page, "fr").getByRole("link", { name: T.fr.doneOn(todayDate("fr")), exact: true })).toBeVisible();
    await expect(card(page, "fr").getByRole("button"), "J3c withdrawn: no control on a done session").toHaveCount(0);
    await expectNoEnglish(page, "a done trial session");
  });
});

/* The default config's project is Chromium; WebKit is launched here, like pro-roster-unnamed-client.spec.ts. */
test.describe("EV-341j in WebKit", () => {
  let browser: Browser;
  test.beforeAll(async () => {
    expect(existsSync(webkit.executablePath()), "WebKit is not installed: npx playwright install webkit").toBe(true);
    browser = await webkit.launch();
  });
  test.afterAll(async () => {
    await browser?.close();
  });

  for (const lang of ["en", "fr"] as const) {
    test(`prepare from a template, assign, withdraw: WebKit, ${lang}`, async ({ baseURL }) => {
      const context = await browser.newContext({ baseURL, locale: T[lang].locale });
      await context.addCookies([{ name: "evoli_pro_locale", value: lang, url: baseURL as string }]);
      const page = await context.newPage();
      try {
        await signInThroughForm(page, { lang });
        await openProgramme(page, NILS);
        await prepare(page, lang);
        await fromTemplateDay(page, lang);
        await card(page, lang).getByRole("button", { name: T[lang].assign, exact: true }).click();
        await assigned(page, lang);
        await card(page, lang).getByRole("button", { name: T[lang].withdraw, exact: true }).click();
        await page.getByRole("dialog").getByRole("button", { name: T[lang].withdraw, exact: true }).click();
        await expect(card(page, lang).getByRole("button", { name: T[lang].prepare, exact: true })).toBeVisible();
      } finally {
        await context.close();
      }
    });
  }
});
