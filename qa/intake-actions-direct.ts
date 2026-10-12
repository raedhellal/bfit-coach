import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page } from "@playwright/test";

/**
 * EV-341w (staff r1 N3) — the card's two server actions, called the way the browser calls
 * them but with no card on the page: a POST to the overview's URL that carries `Next-Action`
 * and the arguments as the JSON array React sends. That is how a test reaches an action on a
 * server whose release hold is OFF, where no button exists to press
 * (`intake-hold-off.spec.ts`).
 *
 * The id is Next 14.2's own: SHA-1 of `<absolute module path>:<export name>`
 * (`generateActionId`, next/dist/build/webpack/loaders/utils.js). Two things keep a drift in
 * that formula from passing quietly: `intake-consent.spec.ts` compares it with the header the
 * card's own click sends, and an id Next does not know answers no action result, which
 * `callIntakeAction` asserts before returning anything.
 */
export type IntakeActionName = "askIntakeConsentAction" | "cancelIntakeConsentAction";

export function intakeActionId(name: IntakeActionName): string {
  const file = realpathSync(join(__dirname, "..", "src", "lib", "intakeActions.ts"));
  return createHash("sha1").update(`${file}:${name}`).digest("hex");
}

/** The action's result, parsed from the flight answer's result row (`1:{"ok":…}`). */
export async function callIntakeAction(page: Page, baseURL: string, name: IntakeActionName, clientId: string): Promise<unknown> {
  const res = await page.request.post(`/clients/${clientId}`, {
    headers: {
      "Next-Action": intakeActionId(name),
      Accept: "text/x-component",
      "Content-Type": "text/plain;charset=UTF-8",
      Origin: baseURL,
    },
    data: JSON.stringify([clientId]),
    maxRedirects: 0,
  });
  const text = await res.text();
  expect(res.status(), `${name}: the action's HTTP answer (${text.slice(0, 200)})`).toBe(200);
  const row = text.split("\n").find((line) => /^\d+:\{"ok":/.test(line));
  expect(row, `${name}: an action result in the answer (${text.slice(0, 300)})`).toBeTruthy();
  return JSON.parse(row!.slice(row!.indexOf(":") + 1));
}
