import { expect } from "@playwright/test";
import { test } from "./fixture-test";
import {
  COPY,
  ENGINES,
  LANGS,
  WIDTHS,
  closeBrowsers,
  expectServerHtml,
  holdHydration,
  openPage,
  type Engine,
} from "./prehydration";

/**
 * BUG-686 follow-up — the FR / EN switch: an option chosen before React hydrates is CHOSEN.
 *
 * Before the fix (a862698), a click on the other language's radio in server HTML checked it
 * natively, and hydration left it checked while `locale` (and the page) stayed as rendered.
 * Clicking it again did nothing — a checked radio fires no change — so the page could not
 * be switched without first clicking the language already in force. Witnessed on every page
 * by `qa/prehydration-sweep.spec.ts`; /login here, the page a new coach meets first. Red on
 * a862698: the heading never changes language.
 */

test.afterAll(closeBrowsers);

for (const engine of Object.keys(ENGINES) as Engine[]) {
  for (const lang of LANGS) {
    for (const width of WIDTHS) {
      const other = lang === "en" ? "fr" : "en";
      const t = COPY[lang];
      const u = COPY[other];
      test.describe(`${engine} · ${lang} · ${width} px`, () => {
        test(`the other language picked before hydration is switched to (${lang} → ${other})`, async ({
          baseURL,
        }) => {
          const page = await openPage(engine, lang, width, baseURL, "anon");
          try {
            const hold = await holdHydration(page);
            await page.goto("/login", { waitUntil: "domcontentloaded" });
            await expect(page.getByRole("heading", { level: 1 })).toHaveText(t.login.title);
            const group = page.getByRole("radiogroup", { name: t.shell.language });
            const pick = group.getByRole("radio", { name: new RegExp(`^${other.toUpperCase()}\\b`) });
            // The native radio sits under its styled face; a click on its label is the person's.
            await pick.evaluate((radio) => (radio.closest("label") as HTMLLabelElement).click());
            await expect(pick).toBeChecked();
            await expectServerHtml(pick, `the ${other} option`);
            expect(await hold.release(), "JS chunks held until the option was picked").toBeGreaterThan(0);

            await expect(page.getByRole("heading", { level: 1 })).toHaveText(u.login.title);
            await expect(page.locator("html")).toHaveAttribute("lang", other);
            const after = page.getByRole("radiogroup", { name: u.shell.language });
            await expect(after.getByRole("radio", { name: new RegExp(`^${other.toUpperCase()}\\b`) })).toBeChecked();
          } finally {
            await page.context().close();
          }
        });
      });
    }
  }
}
