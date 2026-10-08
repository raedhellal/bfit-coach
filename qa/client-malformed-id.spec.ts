import { expect, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";

/**
 * BUG-600 — `/clients/<not-a-UUID>` gets the answer an unknown id gets: 403, the denial page.
 *
 * The live api's `{id}` is a `UUID` path variable, so a malformed id never reaches its guard:
 * it is `400 INVALID_REQUEST « Invalid value for 'id'. »`. That is not a 403, so the layout
 * did not redirect and the page served 200 « This trainee could not be loaded. ». The fixture
 * answered 403 for ANY id, which hid it; it now answers the api's 400 (`failIfMalformedId`).
 *
 * Expected (the register's row): the same answer as an unknown id, no existence oracle either
 * way, and the fixture answers what the api answers. The layout now refuses a malformed id
 * WITHOUT an api call, which the fixture's journal witnesses (`/api/fixture/calls`, `api`).
 */

const UNKNOWN_UUID = "0b0b0b0b-0000-4000-8000-00000000dead";
const MALFORMED = [
  "does-not-exist-route",
  "123",
  // A real trainee's id with one character too many, and the same id without its dashes.
  "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001x",
  "6f1b0f7e1f2a4c3d9a110d5b7c9e0001",
];
const TABS = ["", "/routine", "/nutrition"];

const DENIED = {
  en: "This trainee is not on your roster. They may have revoked access.",
  fr: "Ce client ne fait pas partie de votre liste. Il a peut-être révoqué l'accès.",
} as const;

interface Entry {
  op: string;
  arg: string | null;
}

async function overviewReadsOf(page: Page, id: string): Promise<number> {
  const res = await page.request.get("/api/fixture/calls", { maxRedirects: 0 });
  expect(res.status(), "GET /api/fixture/calls (fixture mode only)").toBe(200);
  const body = (await res.json()) as { api?: Entry[] };
  expect(Array.isArray(body.api), "the calls route serves the api journal as `api`").toBe(true);
  return body.api!.filter((e) => e.op === "getClient" && e.arg === id).length;
}

async function expectDenied(page: Page, path: string, lang: keyof typeof DENIED) {
  const response = await page.goto(path);
  expect(response?.status(), `${path}: the status`).toBe(403);
  await expect(page, `${path}: the denial page`).toHaveURL(/\/clients\/denied$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText([DENIED[lang]]);
}

for (const lang of ["en", "fr"] as const) {
  test.describe(`BUG-600 (${lang})`, () => {
    test.use({ locale: lang === "en" ? "en-US" : "fr-FR" });

    test("a malformed client id is the 403 denial page on every tab, and asks the api nothing", async ({ page }) => {
      await signInThroughForm(page, { lang });
      for (const id of MALFORMED) {
        for (const tab of TABS) {
          await expectDenied(page, `/clients/${id}${tab}`, lang);
        }
        expect(await overviewReadsOf(page, id), `${id}: overview reads sent to the api`).toBe(0);
      }
    });

    test("control: an unknown well-formed id gets the same 403 page, after the api's answer", async ({ page }) => {
      await signInThroughForm(page, { lang });
      for (const tab of TABS) {
        await expectDenied(page, `/clients/${UNKNOWN_UUID}${tab}`, lang);
      }
      // It IS asked: the api's 403 is what decides an unknown id (no oracle in the portal).
      expect(await overviewReadsOf(page, UNKNOWN_UUID)).toBeGreaterThan(0);
    });
  });
}
