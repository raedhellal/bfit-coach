import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * EV-190c / AC8 — the 44 px touch-target floor across the portal, at 390 px.
 *
 * `kit.tsx` carried a parked staff follow-up: `Input` was 40 px and the modal's Close
 * button 32 px, both under BUG-146's floor, "its own change with its own QA pass".
 * This is that change and this is that pass. The fix is made ONCE in `kit.tsx` —
 * `MIN_TOUCH_TARGET` exists precisely because the height is not a per-screen decision —
 * so this spec walks the screens rather than the components.
 *
 * ⚠️ What is measured: controls — `button`, `input`, `select`, `textarea`. What is NOT:
 * anchors that are inline text (the breadcrumb, the header wordmark). WCAG 2.5.8
 * exempts a link in a sentence, and a 44 px tall inline link would push the sentences
 * it sits in apart. Anchors that BEHAVE like controls — the tab strip — already carry
 * `MIN_TOUCH_TARGET` themselves and are asserted by name below.
 *
 * This file sorts first in the suite on purpose: `coach-routine.spec.ts` ends with a
 * revoke that turns every later client read into a 403 for the rest of the run.
 */

const EMAIL = "coach@evoli.fit";
const PASSWORD = "Password123!";
const YUSUF = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0007";
const FLOOR = 44;

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 390, height: 844 } });

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/");
}

/** Every rendered control in `scope`, with the size it actually occupies. */
async function undersized(scope: Locator | Page) {
  const controls = scope.locator("button, input, select, textarea");
  return await controls.evaluateAll(
    (els, floor) =>
      els
        .map((el) => {
          const box = el.getBoundingClientRect();
          return {
            what: `${el.tagName.toLowerCase()}:${
              el.getAttribute("aria-label") || (el as HTMLElement).innerText || el.id || "?"
            }`.slice(0, 60),
            w: Math.round(box.width),
            h: Math.round(box.height),
          };
        })
        // A control that is not rendered at all (a closed modal's) has no size, and an
        // invisible element is not a touch target.
        .filter((c) => c.w > 0 && c.h > 0)
        .filter((c) => c.h < floor || c.w < floor),
    FLOOR
  );
}

test("login, roster, overview, routine and nutrition have no control under 44 px", async ({
  page,
}) => {
  await page.goto("/login");
  expect(await undersized(page), "login").toEqual([]);

  await signIn(page);
  expect(await undersized(page), "roster").toEqual([]);

  for (const path of [
    `/clients/${YUSUF}`,
    `/clients/${YUSUF}/routine`,
    `/clients/${YUSUF}/nutrition`,
  ]) {
    await page.goto(path);
    expect(await undersized(page), path).toEqual([]);
  }
});

test("the modal Close button and the controls inside a dialog clear the floor too", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(`/clients/${YUSUF}/routine`);

  // The catalog picker is the read-only dialog: it opens without writing anything.
  await page.getByRole("button", { name: "Add exercise" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  // The specific control AC8 names, measured by itself so a regression says which.
  const close = dialog.getByRole("button", { name: "Close" });
  const box = await close.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(FLOOR);
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(FLOOR);

  expect(await undersized(dialog), "catalog picker").toEqual([]);
});

test("the tab strip is still a 44 px target at 390 px", async ({ page }) => {
  await signIn(page);
  await page.goto(`/clients/${YUSUF}/routine`);

  for (const name of ["Overview", "Routine", "Nutrition"]) {
    const box = await page.getByRole("link", { name, exact: true }).boundingBox();
    expect(box?.height ?? 0, name).toBeGreaterThanOrEqual(FLOOR);
  }
});

test("1440 px: the taller fields did not break the layout that holds them", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page);

  // A taller `Input` changes vertical rhythm on every form, which is why AC8 asks for
  // the wide viewport to be re-checked. Nothing may overflow the document horizontally
  // — that is the failure a grown control produces at a fixed width.
  for (const path of ["/", `/clients/${YUSUF}`, `/clients/${YUSUF}/routine`]) {
    await page.goto(path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});
