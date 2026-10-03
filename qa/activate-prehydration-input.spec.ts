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
  expectStateHoldsWhatIsShown,
  holdHydration,
  openPage,
  waitForFiber,
  type Copy,
  type Engine,
} from "./prehydration";

/**
 * BUG-686 follow-up — /activate (EV-278c): the passwords a new coach types before React
 * hydrates reach `ActivationForm`'s state; the consent box NEVER does.
 *
 * Before the fix (a862698), the three password fields kept their pre-hydration DOM values
 * while state stayed "", so « Finish my account » stayed disabled on a filled form
 * (`qa/prehydration-sweep.spec.ts` witnessed the mismatches).
 *
 * The consent box is excluded from adoption by ruling (staff review, 2026-10-03; BUG-023 /
 * Planet49 "active tap", ADR-0019 "own act"). A box found ticked at hydration does not prove
 * a tick in this document: before `autoComplete="off"`, Back into a new document had the
 * browser restore it ticked. The hook therefore RESETS it (`data-adopt="never"`) through the
 * node's own setter, so React's value tracker sees "unticked" too. The person ticks it once
 * more, and that tick must register.
 *
 * (1) passwords and a tick before hydration → passwords adopted; the box is shown unticked
 *     and the submit disabled; ONE tick enables it, and the body says `consentAccepted: true`;
 * (2) passwords before hydration, the box left alone → disabled until the person ticks it;
 * (3) Back: ticked after hydration, away to about:blank, Back → a new document (back_forward)
 *     whose box the browser did NOT restore (`autoComplete="off"`, read before hydration),
 *     unticked and held false after it;
 * (4) THE RESET'S GUARD — the only test that pins how the box is reset. Only the box is ticked
 *     before hydration (no password, so no replay re-renders the form and re-syncs React's
 *     tracker as a side effect). After the reset, the very next tick must reach state.
 *     Staff's mutants: with no reset at all (M2), (1) still passes; with a reset through the
 *     untracked prototype setter (M3), every other test passes but the first tick is eaten
 *     (shown ticked, held false). (4) is red under M3.
 * Red on a862698: (1) and (2) keep the button disabled after the tick (passwords not
 * adopted).
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
        test("(1) passwords and a tick before hydration: passwords adopted, the tick is not", async ({
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

            // The pre-hydration tick is taken back, on screen and in state alike.
            await waitForFiber(f.consent);
            await expect(f.consent).not.toBeChecked();
            await expectStateHoldsWhatIsShown(f.consent, "the consent box");
            await expectStateHoldsWhatIsShown(f.repeat, "the repeated password");
            await expect(f.submit).toBeDisabled();

            // One tick, the person's own, enables it: the passwords are already in state.
            await f.consent.check();
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

        test("(3) Back into a new document: the browser does not restore the tick, and it is not held", async ({
          baseURL,
        }) => {
          const page = await openPage(engine, lang, width, baseURL, "pending");
          try {
            await page.goto("/activate");
            const f = form(page, t);
            await waitForFiber(f.consent);
            await f.consent.check();
            await expect(f.consent).toBeChecked();

            await page.goto("about:blank");
            const hold = await holdHydration(page);
            await page.goBack({ waitUntil: "domcontentloaded" });
            await expect(page).toHaveURL(/\/activate$/);
            // A new document (not the bfcache): the page is no-store, and the browser says so.
            expect(
              await page.evaluate(
                () => (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined)?.type,
              ),
            ).toBe("back_forward");
            // Before hydration: no restored tick on screen at all (autoComplete="off").
            await expectServerHtml(f.consent, "the consent box after Back");
            await expect(f.consent).not.toBeChecked();
            expect(await hold.release()).toBeGreaterThan(0);

            await waitForFiber(f.consent);
            await expect(f.consent).not.toBeChecked();
            await expectStateHoldsWhatIsShown(f.consent, "the consent box after Back");
            await f.consent.check();
            await expectStateHoldsWhatIsShown(f.consent, "the first tick after Back");
            await f.temporary.fill(PENDING.password);
            await f.fresh.fill(NEW_PASSWORD);
            await f.repeat.fill(NEW_PASSWORD);
            await expect(f.submit).toBeEnabled();
          } finally {
            await page.context().close();
          }
        });

        test("(4) the reset's guard: a box ticked before hydration is reset, and the next tick registers", async ({
          baseURL,
        }) => {
          const page = await openPage(engine, lang, width, baseURL, "pending");
          try {
            const hold = await holdHydration(page);
            await page.goto("/activate", { waitUntil: "domcontentloaded" });
            const f = form(page, t);
            await f.consent.check();
            await expectServerHtml(f.consent, "the consent tick");
            expect(await hold.release(), "JS chunks held until the box was ticked").toBeGreaterThan(0);

            await waitForFiber(f.consent);
            // The reset ran (it is what unticks the box).
            await expect(f.consent).not.toBeChecked();
            await expectStateHoldsWhatIsShown(f.consent, "the reset consent box");
            // The person's tick, at once and before any other input: it must reach state.
            await f.consent.check();
            await expectStateHoldsWhatIsShown(f.consent, "the first tick after the reset");
            await expect(f.consent).toBeChecked();

            await f.temporary.fill(PENDING.password);
            await f.fresh.fill(NEW_PASSWORD);
            await f.repeat.fill(NEW_PASSWORD);
            await expect(f.submit).toBeEnabled();
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
