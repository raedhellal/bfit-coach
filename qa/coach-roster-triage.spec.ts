import { expect, type Page } from "@playwright/test";
import { test } from "./fixture-test";

/**
 * EV-187 AC2 — the roster tells the coach who to open first.
 *
 * The POPULATED fixture scenario (`playwright.roster.config.ts`, `npm run
 * test:e2e:roster`), because an order and a badge need rows.
 *
 * The six seeded links and what each one is for:
 *   Tobias — ALL scopes, BOTH rules fired: the "2 flags" badge and the top of the list.
 *   Lina   — ALL scopes, one flag, trained yesterday: "1 flag", the singular spelling.
 *   Sara   — PROGRESS + WEIGH_INS, one flag, NEVER trained: the same flag count as Lina
 *            and a longer silence, which is what pins the second sort key down.
 *   Yusuf  — WORKOUTS only: a REAL zero. No badge, and never "0 flags".
 *   Petra  — NUTRITION only; Mara — nothing at all: no rule could be evaluated, so both
 *            read "Not shared" and both sort LAST.
 *
 * ⚠ FILE ORDER: this file is read-only against the fixture store, and it runs after
 * `coach-roster-scopes.spec.ts` (also read-only) and after `coach-library-apply.spec.ts`
 * (which mutates drafts, not the roster). See the note in playwright.roster.config.ts.
 */

const EMAIL = "coach@evoli.fit";
const PASSWORD = "Password123!";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/");
}

/** The wide table's rows, in render order. */
async function rowNames(page: Page): Promise<string[]> {
  await expect(page.locator(".only-wide tbody tr")).toHaveCount(6);
  return page
    .locator(".only-wide tbody tr")
    .evaluateAll((rows) => rows.map((r) => r.querySelector("td")?.textContent?.trim() ?? ""));
}

function row(page: Page, name: string) {
  return page.locator(".only-wide tbody tr", { hasText: name });
}

test.describe.configure({ mode: "serial" });

test("flagged rows come first, most flags first, longest silence next", async ({ page }) => {
  await signIn(page);
  const names = await rowNames(page);

  // Two flags beats one, whatever the silence.
  expect(names[0]).toContain("Tobias R.");
  // Both have one flag; Sara has never trained and Lina trained yesterday, so the
  // longest silence sorts higher. This is the key that a client-side sort on one page
  // of a roster would get wrong the moment there were two pages.
  expect(names[1]).toContain("Sara P.");
  expect(names[2]).toContain("Lina M.");
  // A real zero — evaluated, and none fired. It sorts after the flagged rows and before
  // the rows whose flags could not be evaluated at all.
  expect(names[3]).toContain("Yusuf A.");
  // "Not shared" sorts LAST, never among the no-flag rows: a coach must not read a
  // consent boundary as good news.
  expect(names.slice(4).join(" ")).toContain("Mara D.");
  expect(names.slice(4).join(" ")).toContain("Petra L.");
});

test("the order is stable across reloads for unchanged data", async ({ page }) => {
  await signIn(page);
  const first = await rowNames(page);
  await page.reload();
  const second = await rowNames(page);
  expect(second).toEqual(first);
});

test("the badge reads the exact count, in both spellings, and never zero", async ({ page }) => {
  await signIn(page);
  await rowNames(page);

  await expect(row(page, "Tobias R.")).toContainText("2 flags");
  await expect(row(page, "Lina M.")).toContainText("1 flag");
  await expect(row(page, "Lina M.")).not.toContainText("1 flags");

  // A real zero carries NO badge — not "0 flags", not a grey chip.
  await expect(row(page, "Yusuf A.")).not.toContainText("flag");
  await expect(page.getByText("0 flags")).toHaveCount(0);

  // …and an unevaluable count is a sentence, not a number.
  await expect(row(page, "Petra L.")).toContainText("Not shared");
  await expect(row(page, "Mara D.")).toContainText("Not shared");
});

test("the badge count equals the flags on that trainee's own page", async ({ page }) => {
  await signIn(page);
  await rowNames(page);
  await row(page, "Tobias R.").getByRole("link").first().click();
  await page.waitForURL(/\/clients\//);

  // AC2's last clause: QA compares the badge count to the flags listed on the page. One
  // evaluation, two projections — if these ever disagree, one of them is a fiction.
  await expect(page.getByRole("heading", { name: "Tobias R." })).toBeVisible();
  await expect(page.getByText("Missed 2 or more planned sessions this week")).toBeVisible();
  await expect(page.getByText("No weigh-in for 14 days")).toBeVisible();
});

test("one control flips the order, and it is remembered for the session", async ({ page }) => {
  await signIn(page);
  await rowNames(page);

  // AC2's default on a fresh browser session.
  const needsAttention = page.getByRole("radio", { name: "Needs attention" });
  await expect(needsAttention).toBeChecked();

  await page.getByRole("radio", { name: "Recently active" }).click();
  await expect(page.getByRole("radio", { name: "Recently active" })).toBeChecked();

  // Most recently active first: Lina trained yesterday, Tobias nine days ago, and every
  // trainee with no known activity is after them.
  const byActivity = await rowNames(page);
  expect(byActivity[0]).toContain("Lina M.");
  expect(byActivity[1]).toContain("Tobias R.");

  // Remembered across a navigation away and back — which a query string is not.
  await page.goto("/clients/6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001");
  await page.goto("/");
  await expect(page.getByRole("radio", { name: "Recently active" })).toBeChecked();
  expect(await rowNames(page)).toEqual(byActivity);

  // …and a FRESH browser session is "Needs attention" again: the cookie is a session
  // cookie, so clearing cookies is exactly what closing the browser does to it.
  await page.context().clearCookies();
  await signIn(page);
  await expect(page.getByRole("radio", { name: "Needs attention" })).toBeChecked();
  expect((await rowNames(page))[0]).toContain("Tobias R.");
});

test("the roster still renders no bare null, NaN or undefined", async ({ page }) => {
  await signIn(page);
  await rowNames(page);
  const body = page.locator("body");
  await expect(body).not.toContainText("null");
  await expect(body).not.toContainText("NaN");
  await expect(body).not.toContainText("undefined");
});
