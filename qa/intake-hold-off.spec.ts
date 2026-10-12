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
