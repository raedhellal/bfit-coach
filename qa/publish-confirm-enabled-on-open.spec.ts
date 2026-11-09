import { expect, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";
import { holdNextAction } from "./hold-action";

/**
 * BUG-1111 — the publish dialog's controls are enabled in the FIRST render of the dialog.
 *
 * `openPublish` opens the dialog from its preview's continuation. Until BUG-1111 the dialog's
 * buttons were `disabled={pending}` on the transition that preview ran in, and that transition
 * was still pending when the dialog first rendered: on `e54017ba` an instrumented run saw the
 * « Publish » confirm render disabled on open in 10 of 10 EN runs. A press in that span did
 * nothing, and in one full-suite run (`BUG-1109` gate, coach `8b239785`) the confirm stayed
 * disabled until the 60 s test timeout.
 *
 * The state is read by a MutationObserver installed before the page loads: its callback runs
 * after the commit that inserts the dialog, before any later commit, so it sees what that
 * first render committed. Playwright's own checks poll, and would only see a later state.
 *
 * Both shapes of the dialog (AC3): no repairs (Yusuf's long plan, one control) and repairs
 * (Dana's shoulder injury, Cancel + « Publish with these changes »). The confirm still guards
 * its own request: held in flight, it is disabled, and the publish then lands.
 *
 * Every label is a LITERAL (a spec derived from copy.ts cannot witness it).
 */

const YUSUF = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0007";
/** A shoulder injury: publishing repairs Barbell Overhead Press and Barbell Bench Press. */
const DANA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0004";

type Lang = "en" | "fr";
const L = {
  en: {
    region: "Routine actions",
    publish: "Publish",
    withChanges: "Publish with these changes",
    cancel: "Cancel",
    published: "Published. The trainee sees it next time they open the app.",
  },
  fr: {
    region: "Actions du programme",
    publish: "Publier",
    withChanges: "Publier avec ces modifications",
    cancel: "Annuler",
    published: /^Publié\. /,
  },
} as const;

/** Records, once, every button of the first committed `[role=dialog]` that holds `confirm`. */
async function recordFirstDialog(page: Page, confirm: string) {
  await page.addInitScript((label: string) => {
    const w = window as unknown as { __firstDialog?: { name: string; disabled: boolean }[] };
    new MutationObserver((_, observer) => {
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) return;
      const buttons = Array.from(dialog.querySelectorAll("button"));
      if (!buttons.some((b) => (b.textContent ?? "").trim() === label)) return;
      w.__firstDialog = buttons.map((b) => ({ name: (b.textContent ?? "").trim(), disabled: b.disabled }));
      observer.disconnect();
    }).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  }, confirm);
}

async function firstDialog(page: Page) {
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __firstDialog?: unknown }).__firstDialog ?? null), {
      message: "the observer saw the dialog's first render",
    })
    .not.toBeNull();
  return page.evaluate(
    () => (window as unknown as { __firstDialog: { name: string; disabled: boolean }[] }).__firstDialog
  );
}

for (const lang of ["en", "fr"] as const satisfies readonly Lang[]) {
  test.describe(`BUG-1111 (${lang})`, () => {
    test.use({ locale: lang === "en" ? "en-US" : "fr-FR" });

    const cases = [
      { label: "no repairs", client: YUSUF, cookie: true, confirm: L[lang].publish, others: [] as string[] },
      { label: "repairs", client: DANA, cookie: false, confirm: L[lang].withChanges, others: [L[lang].cancel] },
    ];

    for (const c of cases) {
      test(`publish dialog, ${c.label}: « ${c.confirm} » is enabled in the dialog's first render, disabled while its own request runs`, async ({
        page,
        context,
        baseURL,
      }) => {
        if (c.cookie) await context.addCookies([{ name: "evoli_fixture_long_plan", value: YUSUF, url: baseURL! }]);
        await recordFirstDialog(page, c.confirm);
        await signInThroughForm(page, { lang });
        await page.goto(`/clients/${c.client}/routine`);
        const bar = page.getByRole("region", { name: L[lang].region, exact: true });
        const open = bar.getByRole("button", { name: L[lang].publish, exact: true });
        const dialog = page.getByRole("dialog");
        // A press before hydration opens nothing: retried until the dialog is there.
        await expect(async () => {
          await open.click();
          await expect(dialog).toHaveCount(1, { timeout: 2_000 });
        }).toPass();

        const first = await firstDialog(page);
        for (const name of [c.confirm, ...c.others]) {
          expect(first.find((b) => b.name === name), `« ${name} » is in the dialog's first render`).toBeTruthy();
          expect(
            first.find((b) => b.name === name)!.disabled,
            `« ${name} » is enabled in the dialog's first render (BUG-1111)`
          ).toBe(false);
        }

        const confirm = dialog.getByRole("button", { name: c.confirm, exact: true });
        const held = await holdNextAction(page);
        await confirm.click();
        await held.reached;
        await expect(confirm, "the confirm is disabled while its own request runs").toBeDisabled();
        held.release();
        await expect(dialog).toHaveCount(0);
        await expect(page.getByText(L[lang].published)).toBeVisible();
      });
    }
  });
}
