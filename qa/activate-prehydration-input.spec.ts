import { expect, type Page, type Request } from "@playwright/test";
import { test } from "./fixture-test";
import {
  CLICK_TIMEOUT,
  COPY,
  ENGINES,
  LANGS,
  PENDING,
  WIDTHS,
  closeBrowsers,
  expectServerHtml,
  holdHydration,
  openPage,
  waitForFiber,
  type Copy,
  type Engine,
} from "./prehydration";

/**
 * BUG-686 follow-up — /activate (EV-278c): what a new coach types and ticks before React
 * hydrates reaches `ActivationForm`'s state.
 *
 * Before the fix (a862698), the three password fields and the consent box kept their
 * pre-hydration DOM values while state stayed "" / false, so « Finish my account » stayed
 * disabled on a visibly complete form, and a click on the visibly ticked box UNticked it
 * with consent still false. `qa/prehydration-sweep.spec.ts` witnessed the four mismatches;
 * this spec is the behaviour. Red on a862698 (Chromium and WebKit): in (1) and (2) the button
 * is still disabled where it must be enabled.
 *
 * (1) everything before hydration → one click finishes the account with the typed values
 *     and the person's own tick (`consentAccepted: true`);
 * (2) passwords before hydration, the box left alone → still disabled (the consent rule:
 *     nothing ticks it but the person), and the person's tick after hydration enables it.
 */

const NEW_PASSWORD = "Coach-pass-2026";

test.afterAll(closeBrowsers);

function activationBody(req: Request) {
  return JSON.parse(req.postData() || "{}") as Record<string, unknown>;
}

function form(page: Page, t: Copy) {
  return {
    temporary: page.getByLabel(t.activate.temporaryPassword, { exact: true }),
    fresh: page.getByLabel(t.activate.newPassword, { exact: true }),
    repeat: page.getByLabel(t.activate.repeatPassword, { exact: true }),
    consent: page.getByRole("checkbox", { name: t.activate.consent }),
    submit: page.getByRole("button", { name: t.activate.submit, exact: true }),
  };
}

for (const engine of Object.keys(ENGINES) as Engine[]) {
  for (const lang of LANGS) {
    for (const width of WIDTHS) {
      const t = COPY[lang];
      test.describe(`${engine} · ${lang} · ${width} px`, () => {
        test("(1) passwords and the tick before hydration: one click finishes the account with them", async ({
          baseURL,
        }) => {
          const page = await openPage(engine, lang, width, baseURL, "pending");
          try {
            const hold = await holdHydration(page);
            await page.goto("/activate", { waitUntil: "domcontentloaded" });
            const f = form(page, t);
            await f.temporary.fill(PENDING.password);
            await expectServerHtml(f.temporary, "the temporary password");
            await f.fresh.fill(NEW_PASSWORD);
            await f.repeat.fill(NEW_PASSWORD);
            await f.consent.check();
            await expectServerHtml(f.consent, "the consent tick");
            expect(await hold.release(), "JS chunks held until the form was filled").toBeGreaterThan(0);

            // Enabled with no further input: only the adoption of the typed values can do it.
            await expect(f.submit).toBeEnabled();
            await expect(f.consent).toBeChecked();
            const sent = page.waitForRequest((r) => r.url().endsWith("/api/auth/activate") && r.method() === "POST");
            await f.submit.click({ timeout: CLICK_TIMEOUT });
            expect(activationBody(await sent)).toMatchObject({
              temporaryPassword: PENDING.password,
              newPassword: NEW_PASSWORD,
              consentAccepted: true,
            });
            await page.waitForURL(new URL("/", baseURL).href);
          } finally {
            await page.context().close();
          }
        });

        test("(2) passwords before hydration, box left alone: disabled until the person ticks it", async ({
          baseURL,
        }) => {
          const page = await openPage(engine, lang, width, baseURL, "pending");
          try {
            const hold = await holdHydration(page);
            await page.goto("/activate", { waitUntil: "domcontentloaded" });
            const f = form(page, t);
            await f.temporary.fill(PENDING.password);
            await f.fresh.fill(NEW_PASSWORD);
            await f.repeat.fill(NEW_PASSWORD);
            await expectServerHtml(f.repeat, "the repeated password");
            expect(await hold.release()).toBeGreaterThan(0);

            await waitForFiber(f.consent);
            await expect(f.consent).not.toBeChecked();
            await expect(f.submit).toBeDisabled();
            await f.consent.check();
            // Enabled by the tick alone: the three passwords typed before hydration are in state.
            await expect(f.submit).toBeEnabled();
            const sent = page.waitForRequest((r) => r.url().endsWith("/api/auth/activate") && r.method() === "POST");
            await f.submit.click({ timeout: CLICK_TIMEOUT });
            expect(activationBody(await sent)).toMatchObject({
              temporaryPassword: PENDING.password,
              newPassword: NEW_PASSWORD,
              consentAccepted: true,
            });
            await page.waitForURL(new URL("/", baseURL).href);
          } finally {
            await page.context().close();
          }
        });
      });
    }
  }
}
