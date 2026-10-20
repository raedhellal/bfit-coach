import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";
import { callIntakeAction } from "./intake-actions-direct";

/**
 * EV-341w (staff r1 N3) — the release hold OFF, on the fixture server that leaves
 * `COACH_INTAKE_REQUEST` unset (`playwright.roster.config.ts`): BOTH server actions refuse
 * before calling the api. No card is on the page, so they are called directly
 * (`intake-actions-direct.ts`); that the same call reaches the api with the hold ON, and uses
 * the card's own action ids, is `intake-consent.spec.ts`'s control.
 *
 * The api calls are read from the fixture's journal (`GET /api/fixture/calls`): a refusal
 * that still asked or cancelled would show there even if the answer looked right.
 */

const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";

async function intakeCalls(page: Page): Promise<string[]> {
  const res = await page.request.get("/api/fixture/calls", { maxRedirects: 0 });
  expect(res.status(), "GET /api/fixture/calls (fixture mode only)").toBe(200);
  return ((await res.json()) as { api: { op: string }[] }).api.map((e) => e.op).filter((op) => /intake/i.test(op));
}

test("with the release hold off, « Demander l'accord » and « Annuler la demande » refuse with no api call", async ({ page, baseURL }) => {
  expect(process.env.COACH_INTAKE_REQUEST ?? "", "the runner's environment, which the dev server inherits").not.toBe("on");
  await signInThroughForm(page);
  // The overview is the page whose module graph holds the two actions: loading it is what
  // registers them on a dev server. With the hold off it renders no card and reads nothing.
  const response = await page.goto(`/clients/${LINA}`);
  expect(response?.status()).toBe(200);
  await expect(page.locator("[data-nav-progress-ready]")).toHaveCount(1);
  await expect(page.locator("[data-intake-state]")).toHaveCount(0);
  expect(await intakeCalls(page), "intake calls by the overview's render").toEqual([]);

  expect(await callIntakeAction(page, baseURL!, "askIntakeConsentAction", LINA)).toEqual({ ok: false, code: "FAILED" });
  expect(await callIntakeAction(page, baseURL!, "cancelIntakeConsentAction", LINA)).toEqual({ ok: false, code: "FAILED" });
  expect(await intakeCalls(page), "intake calls after both actions").toEqual([]);
});

/* ════════════════════════════════════════════════════════════════════════════
 * EV-341b G1–G8 — the interview merges DARK behind the same switch (story R6). This file runs
 * on the roster fixture server, which leaves `COACH_INTAKE_REQUEST` unset; G9 (on = as written)
 * is `intake-interview.spec.ts` and `intake-autosave-unit.spec.ts` on the default server, which
 * sets it. Both suites are the gate (README: no CI here), so both states are tested per run.
 * ════════════════════════════════════════════════════════════════════════════ */

const INTAKE = `/clients/${LINA}/intake`;
const STRAY = {
  en: [
    "Intake interview",
    "You can save the intake once",
    "can read this intake, notes included",
    "If you recorded an intake interview with",
  ],
  fr: [
    "Entretien initial",
    "L'entretien pourra être enregistré quand",
    "peut lire cet entretien, notes comprises",
    "Si vous avez mené un entretien avec",
  ],
} as const;
const TABS = {
  // EV-095b AC-B1: « Messages » is not behind the intake hold, so it stays when « Entretien » goes.
  en: { nav: "Trainee sections", tabs: ["Overview", "Routine", "Nutrition", "Messages"], intake: "Intake", locale: "en-US" },
  fr: { nav: "Sections du client", tabs: ["Vue d'ensemble", "Programme", "Nutrition", "Messages"], intake: "Entretien", locale: "fr-FR" },
} as const;
const MAIN_REVOKE_BODY = {
  en: "Lina M. will be removed from your roster and you will no longer see their training data. They keep their Evoli Fit account and all of their history.",
  fr: "Lina M. sera retiré de votre liste de clients et vous ne verrez plus ses données d'entraînement. Son compte Evoli Fit et tout son historique sont conservés.",
} as const;
const plainText = (text: string | null) => (text ?? "").replace(/[  ]/g, " ");

async function apiOps(page: Page): Promise<string[]> {
  const res = await page.request.get("/api/fixture/calls", { maxRedirects: 0 });
  return ((await res.json()) as { api: { op: string }[] }).api.map((e) => e.op);
}

test("G1: one predicate — no file in src/ but src/lib/env.ts reads process.env.COACH_INTAKE_REQUEST", () => {
  const src = join(__dirname, "..", "src");
  const readers = readdirSync(src, { recursive: true, encoding: "utf8" })
    .filter((f) => /\.(ts|tsx|mjs|js)$/.test(f))
    .filter((f) => /process\.env(\.COACH_INTAKE_REQUEST|\[["']COACH_INTAKE_REQUEST["']\])/.test(readFileSync(join(src, f), "utf8")));
  expect(readers).toEqual([join("lib", "env.ts")]);
});

for (const lang of ["en", "fr"] as const) {
  test.describe(`EV-341b dark (${lang.toUpperCase()})`, () => {
    test.use({ locale: TABS[lang].locale });

    test("G2 no « Entretien » tab on any client page; G8 no stray intake string on them", async ({ page }) => {
      await signInThroughForm(page, { lang });
      for (const path of [`/clients/${LINA}`, `/clients/${LINA}/routine`, `/clients/${LINA}/nutrition`, "/"]) {
        await page.goto(path);
        await expect(page.locator("[data-nav-progress-ready]")).toHaveCount(1);
        if (path !== "/") {
          const nav = page.getByRole("main").getByRole("navigation", { name: TABS[lang].nav, exact: true });
          await expect(nav.getByRole("link")).toHaveText([...TABS[lang].tabs]);
        }
        await expect(page.getByRole("link", { name: TABS[lang].intake, exact: true })).toHaveCount(0);
        await expect(page.getByRole("heading", { name: TABS[lang].intake, exact: true })).toHaveCount(0);
        const text = plainText(await page.locator("body").innerText());
        for (const stray of STRAY[lang]) expect(text, `${path}: "${stray}"`).not.toContain(plainText(stray));
      }
    });

    test("G7 the revoke dialog body is main's, verbatim; G8 nothing of B12's sentence", async ({ page }) => {
      await signInThroughForm(page, { lang });
      await page.goto(`/clients/${LINA}`);
      await expect(page.locator("[data-nav-progress-ready]")).toHaveCount(1);
      await page.locator(".client-head").getByRole("button", { name: lang === "en" ? "More" : "Plus", exact: true }).click();
      await page.getByRole("menuitem", { name: lang === "en" ? "Revoke access" : "Révoquer l'accès", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: lang === "en" ? "Revoke access?" : "Révoquer l'accès ?", exact: true });
      await expect(dialog).toBeVisible();
      await expect.poll(async () => plainText(await dialog.locator("p").first().textContent())).toBe(plainText(MAIN_REVOKE_BODY[lang]));
      expect(plainText(await dialog.innerText())).not.toContain(plainText(STRAY[lang][3]));
    });

    test("G6 /invited/{userId} has no intake section, sentence or control; G8 no stray string", async ({ page }) => {
      await signInThroughForm(page, { lang });
      await page.getByRole("button", { name: lang === "en" ? "Add a client" : "Ajouter un client", exact: true }).click();
      const dialog = page.getByRole("dialog").first();
      await dialog.getByLabel(lang === "en" ? "Name" : "Nom", { exact: true }).fill("Inès Ouali");
      await dialog.getByLabel(lang === "en" ? "Email address" : "Adresse e-mail", { exact: true }).fill("ines.dark@example.com");
      await dialog.getByRole("button", { name: lang === "en" ? "Add client" : "Ajouter le client", exact: true }).click();
      await page.getByRole("dialog").getByRole("button", { name: lang === "en" ? "Done" : "Terminé", exact: true }).click();
      await page.locator("[data-invited-section]").getByRole("group", { name: "Inès Ouali", exact: true }).getByRole("link").click();
      await page.waitForURL(/\/invited\/[0-9a-f-]{36}$/);
      await expect(page.locator("[data-body-data]")).toHaveCount(1);
      await expect(page.locator("[data-invited-intake]")).toHaveCount(0);
      await expect(page.getByRole("button", { name: TABS[lang].intake, exact: true })).toHaveCount(0);
      const text = plainText(await page.locator("body").innerText());
      for (const stray of STRAY[lang]) expect(text).not.toContain(plainText(stray));
      expect(text).not.toContain(lang === "en" ? "has activated their account and allowed the intake" : "aura activé son compte et autorisé l'entretien");
    });
  });
}

test("G3 the page is a 404 and reads no intake, intake-consent or routine", async ({ page }) => {
  await signInThroughForm(page);
  const before = await apiOps(page);
  const response = await page.goto(INTAKE);
  expect(response?.status()).toBe(404);
  const ops = (await apiOps(page)).slice(before.length);
  expect(ops.filter((op) => /intake|routine/i.test(op)), "no intake, intake-consent or routine read").toEqual([]);
  await expect(page.locator("[data-intake-ready]")).toHaveCount(0);
});

test("G4 the save handler is 404 for every method, Origin and Content-Type, before B13, with no upstream call; G5 the reload handler too", async ({
  page,
}) => {
  await signInThroughForm(page);
  const before = (await apiOps(page)).length;
  const path = `/api/clients/${LINA}/intake/GOALS`;
  for (const method of ["PUT", "GET", "POST", "PATCH", "DELETE", "OPTIONS"]) {
    for (const headers of [
      { "Content-Type": "application/json" },
      { "Content-Type": "text/plain", Origin: "https://evil.example" },
      { "Content-Type": "application/json", Origin: "null" },
    ] as Record<string, string>[]) {
      const res = await page.request.fetch(path, {
        method,
        data: method === "GET" ? undefined : JSON.stringify({ version: 0, values: {} }),
        headers,
        maxRedirects: 0,
      });
      expect(res.status(), `${method} ${JSON.stringify(headers)}`).toBe(404);
    }
  }
  for (const method of ["GET", "POST", "PUT", "DELETE"]) {
    const res = await page.request.fetch(`/api/bff/clients/${LINA}/intake`, { method, maxRedirects: 0 });
    expect(res.status(), `bff ${method}`).toBe(404);
  }
  expect((await apiOps(page)).slice(before), "the fixture backend received nothing").toEqual([]);
});
