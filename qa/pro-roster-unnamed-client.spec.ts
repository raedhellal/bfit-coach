import { expect, type Locator, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { webkit, type Browser } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";
import { openTargetsForm } from "./targets-card";

/**
 * BUG-714 (ruling 714-R1) — a trainee whose name is NULL, or blank.
 *
 * The api's `displayNameOf` returns `users.full_name` as stored, and a trainee registered with
 * no name has NULL there (BUG-581). The portal typed the field `string` and used it as one:
 * the roster's `Avatar` called `null.split(" ")`, which took the ROSTER down (the coach's way
 * into every client), the overview threw in its header, and sentences printed the word "null".
 *
 * The label is "Unnamed client" / « Client sans nom » (`copy.challenges.unnamed`, shipped). It
 * shows when the read that carries the name SUCCEEDED and the name is null or blank, and never
 * when that read failed: there the name is unknown and BUG-713's state stands.
 *
 * The fixture's `evoli_fixture_display_name=<clientId>:__null__` serves the name as JSON null on
 * the roster, overview and nutrition reads; `<clientId>:%20%20` serves "  ". Both run here, EN
 * and FR. Runs on the POPULATED roster (`playwright.roster.config.ts`): the pickers are built
 * from it. Every sentence is a literal, never an import from `src/lib/copy.ts`.
 *
 * Expected items, by test: (1) roster row; (2) search; (3) the three client pages; (4) the
 * revoke dialog; (5) no `null`/`undefined` (every test, plus the pickers); (6) the outage.
 * (7) and (8) are run outside this file; their evidence is in the hub,
 * `b-fit-mobile/docs/qa/evidence/2026-10-09-bug714/`: (7) the control screenshots with no switch,
 * roster/overview/routine/nutrition at 1280 and 390, EN and FR, 16/16 byte-identical to the base
 * (and the script that takes them); (8) the mutant `<Avatar name={c.traineeDisplayName}>` in
 * `RosterRows`, 8/8 of the (1) tests red on the glyph. (9) is QA's live run.
 */

const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
/** Mara shares nothing: her overview is the one that says `client.noData.body`. */
const MARA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0008";
const USER_GLYPH = "M12 12.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8M5 20.5a7 7 0 0 1 14 0";

const T = {
  en: {
    locale: "en-US",
    label: "Unnamed client",
    rosterTitle: "Roster",
    search: "Search clients",
    searchLabel: "unnamed",
    more: "More",
    revoke: "Revoke access",
    revokeBody:
      "Unnamed client will be removed from your roster and you will no longer see their training data. They keep their Evoli Fit account and all of their history.",
    noDataBody:
      "Unnamed client has not shared their sessions, progress, weigh-ins or nutrition with you. This is not a zero: it is what they chose to share.",
    routineError: "This trainee's routine could not be loaded.",
    nutritionError: "This trainee's nutrition could not be loaded.",
    apply: "Apply to Unnamed client",
    saveTargets: "Save targets",
    seesStraightAway: "Unnamed client will see this straight away.",
    templateUse: "Use on a trainee",
    template: "Upper / Lower split",
    useConfirm: /^Put “Upper \/ Lower split” on Unnamed client\?$/,
    guardrails: "Unnamed client's injuries and equipment are applied when you publish.",
    nutritionUse: "Use on a trainee",
    nutritionTemplate: "Cut 1800",
    newChallenge: "New challenge",
  },
  fr: {
    locale: "fr-FR",
    label: "Client sans nom",
    rosterTitle: "Clients",
    search: "Rechercher un client",
    searchLabel: "sans nom",
    more: "Plus",
    revoke: "Révoquer l'accès",
    revokeBody:
      "Client sans nom sera retiré de votre liste de clients et vous ne verrez plus ses données d'entraînement. Son compte Evoli Fit et tout son historique sont conservés.",
    noDataBody:
      "Client sans nom n'a partagé ni ses séances, ni sa progression, ni ses pesées, ni sa nutrition avec vous. Ce n'est pas un zéro : c'est son choix de partage.",
    routineError: "Le programme de ce client n'a pas pu être chargé.",
    nutritionError: "La nutrition de ce client n'a pas pu être chargée.",
    apply: "Appliquer à Client sans nom",
    saveTargets: "Enregistrer les objectifs",
    seesStraightAway: "Client sans nom le verra immédiatement.",
    templateUse: "Appliquer à un client",
    template: "Upper / Lower split",
    // « Appliquer «\u00a0modèle\u00a0» à Client sans nom ? »: the guillemets' inner spaces are NBSP.
    useConfirm: /^Appliquer «\s?Upper \/ Lower split\s?» à Client sans nom \?$/,
    guardrails: "Les blessures et le matériel de Client sans nom sont pris en compte à la publication.",
    nutritionUse: "Utiliser pour un client",
    nutritionTemplate: "Cut 1800",
    newChallenge: "Nouveau défi",
  },
} as const;

type Lang = keyof typeof T;

/** `__null__` is the api's NULL; `%20%20` a name of two spaces. */
const SENTINELS = [
  { name: "null", value: "__null__" },
  { name: "blank", value: "%20%20" },
] as const;

const WIDTHS = [
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
] as const;

/** At the ROOT: `url: page.url()` would scope the cookie to the page's own path. */
async function setSwitch(page: Page, name: string, value: string) {
  await page.context().addCookies([{ name, value, url: new URL("/", page.url()).href }]);
}

async function nameless(page: Page, id: string, value: string) {
  await setSwitch(page, "evoli_fixture_display_name", `${id}:${value}`);
}

async function openHydrated(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator("[data-nav-progress-ready]"), `${path} hydrated`).toHaveCount(1);
}

/** Expected 5: no visible text in `scope` says `null` or `undefined`. */
async function expectNoNullText(scope: Locator, where: string) {
  const text = await scope.innerText();
  expect(text, `${where}: visible text`).not.toMatch(/\bnull\b|\bundefined\b/i);
}

/** The person glyph and no letters: the challenge table's precedent (`ParticipantAvatar`). */
async function expectGlyphAvatar(avatar: Locator, where: string) {
  await expect(avatar, `${where}: one avatar`).toHaveCount(1);
  await expect(avatar.locator("svg path"), `${where}: the person glyph`).toHaveAttribute("d", USER_GLYPH);
  expect(((await avatar.textContent()) ?? "").trim(), `${where}: no letters`).toBe("");
}

function rosterRow(page: Page, id: string): Locator {
  return page.locator(`a.roster-row[href="/clients/${id}"]`);
}

/** Every roster row's visible text, by client href, but `except`'s. */
async function otherRowTexts(page: Page, except: string): Promise<Record<string, string>> {
  return page.locator("a.roster-row").evaluateAll(
    (rows, skip) =>
      Object.fromEntries(
        rows
          .filter((r) => r.getAttribute("href") !== `/clients/${skip}`)
          .map((r) => [r.getAttribute("href") ?? "", (r as HTMLElement).innerText])
      ),
    except
  );
}

/** Expected 3: one h1, the label, its title the label; the header avatar is the glyph. */
async function expectNamelessHead(page: Page, lang: Lang, where: string) {
  const t = T[lang];
  await expect(page.getByRole("heading", { level: 1 }), `${where}: every h1`).toHaveText([t.label]);
  expect(await page.locator("h1").count(), `${where}: h1 elements in the DOM`).toBe(1);
  await expect(page.locator(".client-head h1"), `${where}: h1 title`).toHaveAttribute("title", t.label);
  await expectGlyphAvatar(page.locator(".client-head-id > :first-child"), `${where}: header avatar`);
  await expectNoNullText(page.locator("body"), where);
}

for (const lang of ["en", "fr"] as const) {
  const t = T[lang];

  test.describe(`BUG-714 (${lang})`, () => {
    test.use({ locale: t.locale });

    for (const sentinel of SENTINELS) {
      test.describe(`a ${sentinel.name} name`, () => {
        for (const size of WIDTHS) {
          test(`(1) the roster at ${size.width}: the row says the label, the glyph, the others unchanged, it opens`, async ({
            page,
          }) => {
            await page.setViewportSize(size);
            await signInThroughForm(page, { lang });
            await openHydrated(page, "/");
            const before = await otherRowTexts(page, LINA);
            expect(Object.keys(before).length, "the other rows, read with no switch").toBeGreaterThan(1);

            await nameless(page, LINA, sentinel.value);
            await openHydrated(page, "/");
            await expect(page.getByRole("heading", { level: 1 })).toHaveText([t.rosterTitle]);
            const row = rosterRow(page, LINA);
            await expect(row, "Lina's row").toHaveCount(1);
            await expect(row.locator(".roster-name")).toHaveText(t.label);
            await expect(row.locator(".roster-name")).toHaveAttribute("title", t.label);
            // The row's accessible name is its name slot (`aria-labelledby`).
            await expect(page.getByRole("link", { name: t.label, exact: true })).toHaveCount(1);
            await expectGlyphAvatar(row.locator(".roster-id > :first-child"), "roster row avatar");
            expect(await otherRowTexts(page, LINA), "every other row").toEqual(before);
            await expectNoNullText(page.locator("body"), "roster");

            await row.click();
            await page.waitForURL(`/clients/${LINA}`);
            await expectNamelessHead(page, lang, "overview, opened from the row");
          });
        }

        test("(2) search finds the row by the label, and not by 'null'", async ({ page }) => {
          await signInThroughForm(page, { lang });
          await nameless(page, LINA, sentinel.value);
          await openHydrated(page, "/");
          const search = page.getByRole("searchbox", { name: t.search });
          await search.fill(t.searchLabel);
          await expect(page.locator("a.roster-row .roster-name")).toHaveText([t.label]);
          await search.fill("null");
          await expect(rosterRow(page, LINA)).toHaveCount(0);
          await search.fill("");
          await expect(rosterRow(page, LINA)).toHaveCount(1);
        });

        for (const size of WIDTHS) {
          test(`(3) the overview, routine and nutrition at ${size.width}: one h1, the label, the glyph`, async ({
            page,
          }) => {
            await page.setViewportSize(size);
            await signInThroughForm(page, { lang });
            await nameless(page, LINA, sentinel.value);
            for (const path of [`/clients/${LINA}`, `/clients/${LINA}/routine`, `/clients/${LINA}/nutrition`]) {
              await openHydrated(page, path);
              await expectNamelessHead(page, lang, path);
            }
          });
        }

        test("(4) the revoke dialog says the label, verbatim", async ({ page }) => {
          await signInThroughForm(page, { lang });
          await nameless(page, LINA, sentinel.value);
          await openHydrated(page, `/clients/${LINA}`);
          await page.getByRole("button", { name: t.more, exact: true }).click();
          await page.getByRole("menuitem", { name: t.revoke }).click();
          const dialog = page.getByRole("dialog");
          await expect(dialog.getByText(t.revokeBody, { exact: true })).toBeVisible();
          await expectNoNullText(dialog, "revoke dialog");
        });

        test("(4) the overview's no-data sentence says the label", async ({ page }) => {
          await signInThroughForm(page, { lang });
          await nameless(page, MARA, sentinel.value);
          await openHydrated(page, `/clients/${MARA}`);
          await expect(page.getByText(t.noDataBody, { exact: true })).toBeVisible();
          await expectNamelessHead(page, lang, "Mara's overview");
        });

        test("(5) the nutrition tab's full-name sentences say the label", async ({ page }) => {
          await signInThroughForm(page, { lang });
          await nameless(page, LINA, sentinel.value);
          await openHydrated(page, `/clients/${LINA}/nutrition`);
          await expect(page.getByRole("button", { name: t.apply, exact: true })).toBeVisible();
          await openTargetsForm(page);
          await page.getByRole("button", { name: t.saveTargets, exact: true }).click();
          const confirm = page.getByRole("dialog");
          await expect(confirm.getByText(t.seesStraightAway, { exact: true })).toBeVisible();
          await expectNoNullText(page.locator("body"), "nutrition with the confirm open");
        });

        test("(5) the routine template picker offers the label, and its sentences say it", async ({ page }) => {
          await signInThroughForm(page, { lang });
          await nameless(page, LINA, sentinel.value);
          await openHydrated(page, "/templates");
          await page
            .getByRole("group", { name: t.template, exact: true })
            .getByRole("button", { name: t.templateUse })
            .click();
          const dialog = page.getByRole("dialog");
          const options = await dialog
            .locator("select option")
            .evaluateAll((os) => os.map((o) => (o.textContent ?? "").trim()));
          expect(options, "the picker's options").toContain(t.label);
          expect(options.join("|"), "no option reads null").not.toMatch(/\bnull\b|\bundefined\b|^\||\|\||\|$/i);
          await dialog.locator("select").selectOption({ label: t.label });
          // The sentence itself, never the dialog's text: the selected <option> already holds the label.
          await expect(dialog.getByText(t.useConfirm)).toBeVisible();
          await expect(dialog.getByText(t.guardrails, { exact: true })).toBeVisible();
          await expectNoNullText(dialog, "template picker");
        });

        test("(5) the nutrition template picker offers the label", async ({ page }) => {
          await signInThroughForm(page, { lang });
          await nameless(page, LINA, sentinel.value);
          await openHydrated(page, "/nutrition-templates");
          const picker = page.getByRole("dialog", { name: t.nutritionUse });
          await expect(async () => {
            await page
              .getByRole("group", { name: t.nutritionTemplate, exact: true })
              .getByRole("button", { name: t.nutritionUse })
              .click();
            await expect(picker).toBeVisible({ timeout: 1_000 });
          }).toPass({ timeout: 20_000 });
          await expect(picker.getByRole("button", { name: t.label, exact: true })).toHaveCount(1);
          await expectNoNullText(picker, "nutrition template picker");
        });

        test("(5) the create-challenge dialog offers the label", async ({ page }) => {
          await signInThroughForm(page, { lang });
          await nameless(page, LINA, sentinel.value);
          await openHydrated(page, "/challenges");
          await page.getByRole("button", { name: t.newChallenge, exact: true }).click();
          const dialog = page.getByRole("dialog", { name: t.newChallenge });
          await expect(dialog).toBeVisible();
          await expect(dialog.getByRole("checkbox", { name: t.label, exact: true })).toHaveCount(1);
          await expectNoNullText(dialog, "create-challenge dialog");
        });
      });
    }

    test("(6) the name null AND the overview read failing: BUG-713's state, the label nowhere", async ({ page }) => {
      await signInThroughForm(page, { lang });
      await nameless(page, LINA, "__null__");
      await setSwitch(page, "evoli_fixture_overview", "fail");
      for (const [tab, sentence] of [
        ["routine", t.routineError],
        ["nutrition", t.nutritionError],
      ] as const) {
        await openHydrated(page, `/clients/${LINA}/${tab}`);
        await expect(page.getByRole("heading", { level: 1 }), `${tab}: every h1`).toHaveText([sentence]);
        expect(await page.locator("h1").count(), `${tab}: h1 elements`).toBe(1);
        await expect(page.locator(".client-head-id"), `${tab}: no identity block, no avatar`).toHaveCount(0);
        expect(await page.locator("body").innerText(), `${tab}: the label`).not.toContain(t.label);
        await expectNoNullText(page.locator("body"), tab);
      }
    });
  });
}

/* ── BUG-720 (ruling 720-R1) — the first-name fallback's case, in the browser ──────────────────
 *
 * Where a sentence speaks of a nameless trainee by FIRST name, `firstName()` gives "This trainee" /
 * « Ce client ». That capital is right as a sentence's first word only: inside a sentence it is
 * "this trainee" / « ce client » (« de ce client », never « de Ce client »). Petra (NUTRITION only)
 * is served nameless for the "Use on a trainee" flow on « Cut 1800 » / « Reset 1100 », and Yusuf
 * (a TRAINEE-changed routine) for the routine banner, which keeps its capital (Expected (3)).
 * Expected (1), (2) and (3) also run in WebKit. Every copy function the fallback reaches is pinned,
 * sentence by sentence, in `first-name-fallback-case.spec.ts`.
 */
const PETRA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0006";
const YUSUF = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0007";

const MID = {
  en: {
    use: "Use on a trainee",
    confirm: "Confirm",
    title: (template: string) => new RegExp(`^Use “${template}” on this trainee\\?$`),
    body: /^This trainee's meals for this week \(from [^)]+\) are rebuilt to these targets straight away/,
    floor: "If this is below this trainee's safe minimum, Evoli raises it to the minimum and tells you.",
    refused: "Nothing was changed for this trainee. Try again.",
    weekFailed:
      "This trainee's targets are updated. Their meals couldn't be rebuilt. Use “Apply to Unnamed client” to try again.",
    applied: "“Reset 1100” is now this trainee's plan.",
    banner: /^This trainee changed this plan on \d{1,2} [A-Z][a-z]{2} \d{4} \(UTC\)\. You're seeing their version\.$/,
  },
  fr: {
    use: "Utiliser pour un client",
    confirm: "Confirmer",
    // The guillemets' inner spaces are U+00A0, the space before « ? » too in some builds: `\s`.
    title: (template: string) => new RegExp(`^Utiliser «\\s${template}\\s» pour ce client\\s\\?$`),
    body: /^Les repas de ce client pour cette semaine \(à partir du [^)]+\) sont reconstruits immédiatement/,
    floor: "Si c'est en dessous du minimum sûr de ce client, Evoli le relève à ce minimum et vous le signale.",
    refused: "Rien n'a été modifié pour ce client. Réessayez.",
    weekFailed:
      "Les objectifs de ce client sont mis à jour. Ses repas n'ont pas pu être reconstruits. Utilisez « Appliquer à Client sans nom » pour réessayer.",
    applied: "« Reset 1100 » est désormais le plan de ce client.",
    banner: /^Ce client a modifié ce plan le \d{1,2}(er)? [a-zéû]+\.? \d{4} \(UTC\)\. Vous voyez sa version\.$/,
  },
} as const;

/** Library → "Use on a trainee" on `template` → the label. Returns the open confirm dialog. */
async function openNamelessConfirm(page: Page, lang: Lang, template: string) {
  const m = MID[lang];
  await openHydrated(page, "/nutrition-templates");
  const picker = page.getByRole("dialog", { name: m.use });
  await expect(async () => {
    await page.getByRole("group", { name: template, exact: true }).getByRole("button", { name: m.use }).click();
    await expect(picker).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  await picker.getByRole("button", { name: T[lang].label, exact: true }).click();
  // Found whatever the fallback's case, so a wrong case fails on the sentence under test, not
  // here; the title's own case is asserted by the dialog test.
  const dialog = page.getByRole("dialog", { name: new RegExp(m.title(template).source, "i") });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: m.confirm })).toBeEnabled();
  return dialog;
}

/** Confirm, land on Petra's nutrition page, and return the outcome's sentence. */
async function confirmNameless(page: Page, lang: Lang, dialog: Locator) {
  await dialog.getByRole("button", { name: MID[lang].confirm }).click();
  await page.waitForURL(`/clients/${PETRA}/nutrition`);
  const outcome = page.getByTestId("template-use-outcome");
  await expect(outcome).toBeVisible();
  return outcome.locator("p").first();
}

/** Expected (1): the targets write refused, for a nameless trainee. */
async function namelessTargetsRefused(page: Page, lang: Lang) {
  await nameless(page, PETRA, "__null__");
  const dialog = await openNamelessConfirm(page, lang, "Cut 1800");
  await setSwitch(page, "evoli_fixture_targets", "refused");
  await expect(await confirmNameless(page, lang, dialog)).toHaveText(MID[lang].refused);
}

/** Expected (2): the week write failed, for a nameless trainee. */
async function namelessWeekFailed(page: Page, lang: Lang) {
  await nameless(page, PETRA, "__null__");
  const dialog = await openNamelessConfirm(page, lang, "Cut 1800");
  await setSwitch(page, "evoli_fixture_week", "fail");
  await expect(await confirmNameless(page, lang, dialog)).toHaveText(MID[lang].weekFailed);
}

/** Expected (3): the routine's trainee-changed banner opens with the fallback, capital kept. */
async function namelessBanner(page: Page, lang: Lang) {
  await nameless(page, YUSUF, "__null__");
  await openHydrated(page, `/clients/${YUSUF}/routine`);
  await expect(page.getByRole("note").filter({ hasText: lang === "en" ? "changed this plan on" : "a modifié ce plan le" })).toHaveText(
    MID[lang].banner
  );
}

for (const lang of ["en", "fr"] as const) {
  test.describe(`BUG-720 — "this trainee" / « ce client » inside a sentence (${lang}, Chromium)`, () => {
    test.use({ locale: T[lang].locale });

    test("(1) targets refused: nothing was changed for this trainee", async ({ page }) => {
      await signInThroughForm(page, { lang });
      await namelessTargetsRefused(page, lang);
    });

    test("(2) the week failed: the lead keeps its capital, the quoted button is the label", async ({ page }) => {
      await signInThroughForm(page, { lang });
      await namelessWeekFailed(page, lang);
    });

    test("the confirm dialog and the applied outcome: lower case inside, capital at the start", async ({ page }) => {
      await signInThroughForm(page, { lang });
      await nameless(page, PETRA, "__null__");
      // Reset 1100 is below Petra's floor (1200), so the floor sentence is on the dialog.
      const dialog = await openNamelessConfirm(page, lang, "Reset 1100");
      await expect(dialog).toHaveAccessibleName(MID[lang].title("Reset 1100"));
      await expect(dialog.getByText(MID[lang].body)).toHaveCount(1);
      await expect(dialog.getByText(MID[lang].floor, { exact: true })).toBeVisible();
      await expect(await confirmNameless(page, lang, dialog)).toHaveText(MID[lang].applied);
    });

    test("(3) the routine banner opens with the fallback, capital kept", async ({ page }) => {
      await signInThroughForm(page, { lang });
      await namelessBanner(page, lang);
    });
  });
}

/* The roster config's project is Chromium; WebKit is launched here, like client-tab-bar.spec.ts. */
test.describe("BUG-720 in WebKit — Expected (1), (2) and (3), EN and FR", () => {
  let browser: Browser;
  test.beforeAll(async () => {
    expect(existsSync(webkit.executablePath()), "WebKit is not installed: npx playwright install webkit").toBe(true);
    browser = await webkit.launch();
  });
  test.afterAll(async () => {
    await browser?.close();
  });

  const cases = [
    ["(1) targets refused", namelessTargetsRefused],
    ["(2) the week failed", namelessWeekFailed],
    ["(3) the routine banner", namelessBanner],
  ] as const;
  for (const lang of ["en", "fr"] as const) {
    for (const [name, run] of cases) {
      test(`${name}, WebKit, ${lang}`, async ({ baseURL }) => {
        const context = await browser.newContext({ baseURL, locale: T[lang].locale });
        await context.addCookies([{ name: "evoli_pro_locale", value: lang, url: baseURL as string }]);
        const page = await context.newPage();
        try {
          await signInThroughForm(page, { lang });
          await run(page, lang);
        } finally {
          await context.close();
        }
      });
    }
  }
});
