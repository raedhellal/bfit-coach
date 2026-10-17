import { expect, type Page, type Request } from "@playwright/test";
import { test } from "./fixture-test";
import { INTAKE, grant, openIntake, panel, setSwitch, signIn } from "./intake-harness";

/**
 * EV-368 — « Indiqué dans l'app : {objectif} » under section 1's « Objectif principal » (P4–P8),
 * in fixture mode with `COACH_INTAKE_REQUEST=on` (this suite's server, as EV-341b's specs).
 *
 * The fixture serves `GET …/intake`'s `profileGoal` as b-fit-api EV-368 does (READY only; absent on
 * GRANT_MISSING). `evoli_fixture_intake_profile_goal` stands in for the trainee's profile: a value
 * is sent as is, `none` is `null`. It is read on every read, so changing it and reloading is P7's
 * "the trainee changed their goal in the app".
 *
 * The story's sentences are LITERALS here, never read from `src/lib/copy.ts`. The goal words are
 * the interview control's own (« Perdre du gras » / "Lose fat"), not the nutrition page's.
 */

const T = {
  en: { locale: "en-US", line: "In the app: Lose fat", prefix: "In the app", after: "In the app: Build muscle", goal: "Main goal", control: "Lose fat" },
  // U+00A0 before the colon (P4).
  fr: { locale: "fr-FR", line: "Indiqué dans l'app : Perdre du gras", prefix: "Indiqué dans l'app", after: "Indiqué dans l'app : Prendre du muscle", goal: "Objectif principal", control: "Perdre du gras" },
} as const;

const SWITCH = "evoli_fixture_intake_profile_goal";
/** The line's own start, anchored (a bare substring would also match any sentence about the app). */
const lineText = (prefix: string) => new RegExp(`^${prefix}\\s*:`);
const line = (page: Page) => page.locator("[data-intake-profile-goal]");

for (const lang of ["en", "fr"] as const) {
  test.describe(`EV-368 the in-app goal line (${lang.toUpperCase()})`, () => {
    test.use({ locale: T[lang].locale });

    test("P4/P6: under the goal control, the control's own words, text with no control", async ({ page }) => {
      const t = T[lang];
      await signIn(page, lang);
      await grant(page);
      await setSwitch(page.context(), page, SWITCH, "LOSE_WEIGHT");
      await openIntake(page);

      const goals = panel(page, "GOALS");
      await expect(goals).toBeVisible();
      const shown = goals.locator("[data-intake-profile-goal]");
      await expect(shown).toHaveCount(1);
      // Raw textContent: the no-break space is asserted as such, not normalised away.
      expect(await shown.evaluate((el) => el.textContent)).toBe(t.line);

      // Directly under « Objectif principal »'s group.
      const previous = await shown.evaluate((el) => {
        const prev = el.previousElementSibling;
        return prev ? { tag: prev.tagName, field: prev.getAttribute("data-intake-field"), legend: prev.querySelector("legend")?.textContent ?? null } : null;
      });
      expect(previous).toEqual({ tag: "FIELDSET", field: "GOALS.primaryGoal", legend: t.goal });
      // The same words as the control above it.
      await expect(goals.getByRole("group", { name: t.goal, exact: true }).getByText(t.control, { exact: true })).toHaveCount(1);

      // P6: text only — nothing in it to focus or press, and it is not a form field.
      expect(await shown.evaluate((el) => el.tagName)).toBe("P");
      await expect(shown.locator("input, button, select, textarea, a, [tabindex], [role]")).toHaveCount(0);
      expect(await shown.getAttribute("tabindex")).toBeNull();
    });

    test("P7: after the goal changes in the app, a reload shows the new one", async ({ page }) => {
      const t = T[lang];
      await signIn(page, lang);
      await grant(page);
      await setSwitch(page.context(), page, SWITCH, "LOSE_WEIGHT");
      await openIntake(page);
      await expect(line(page)).toHaveText(t.line);

      await setSwitch(page.context(), page, SWITCH, "BUILD_MUSCLE");
      await page.reload();
      await expect(page.locator('[data-intake-ready="ready"]')).toHaveCount(1);
      expect(await line(page).evaluate((el) => el.textContent)).toBe(t.after);
    });

    test("P5: profileGoal null draws no line and no placeholder", async ({ page }) => {
      const t = T[lang];
      await signIn(page, lang);
      await grant(page);
      await setSwitch(page.context(), page, SWITCH, "none");
      await openIntake(page);

      await expect(panel(page, "GOALS")).toBeVisible();
      await expect(line(page)).toHaveCount(0);
      await expect(page.getByText(lineText(t.prefix))).toHaveCount(0);
    });

    test("edge case 2: a goal this build does not know is not shown, not even as a raw key", async ({ page }) => {
      const t = T[lang];
      await signIn(page, lang);
      await grant(page);
      await setSwitch(page.context(), page, SWITCH, "FUTURE_GOAL");
      await openIntake(page);

      await expect(panel(page, "GOALS")).toBeVisible();
      await expect(line(page)).toHaveCount(0);
      await expect(page.getByText(lineText(t.prefix))).toHaveCount(0);
      await expect(page.getByText("FUTURE_GOAL")).toHaveCount(0);
    });
  });
}

test("without the grant (GRANT_MISSING carries no profileGoal) there is no line", async ({ page }) => {
  await signIn(page, "en");
  await setSwitch(page.context(), page, SWITCH, "LOSE_WEIGHT");
  await page.goto(INTAKE);
  await expect(page.locator("[data-intake-grant-missing]")).toHaveCount(1);
  await expect(line(page)).toHaveCount(0);
  await expect(page.getByText(lineText(T.en.prefix))).toHaveCount(0);
});

test("P6: the browser makes no request for the line — it comes with the page's own intake read", async ({ page }) => {
  await signIn(page, "en");
  await grant(page);
  await setSwitch(page.context(), page, SWITCH, "LOSE_WEIGHT");
  const requests: Request[] = [];
  page.on("request", (r) => requests.push(r));
  await openIntake(page);
  await expect(line(page)).toHaveText(T.en.line);
  // Let anything the island might start after hydration go out.
  await page.waitForLoadState("networkidle");

  const asked = requests
    .filter((r) => r.resourceType() !== "document")
    .map((r) => new URL(r.url()))
    .filter((u) => !u.pathname.startsWith("/_next/static/") && !u.pathname.startsWith("/__nextjs"))
    .map((u) => u.pathname + u.search);
  expect(asked.filter((p) => /intake|profile|goal/i.test(p)), `requests after the document: ${asked.join(", ")}`).toEqual([]);
});

test.describe("P8 widths (FR, the default language)", () => {
  test.use({ locale: T.fr.locale });
  for (const width of [1440, 1024, 768, 390]) {
    test(`P8 at ${width}px: the line is shown, inside the viewport, with no sideways scroll`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await signIn(page, "fr");
      await grant(page);
      await setSwitch(page.context(), page, SWITCH, "LOSE_WEIGHT");
      await openIntake(page);

      await expect(line(page)).toBeVisible();
      const box = await line(page).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    });
  }
});
