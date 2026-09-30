import { expect, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { expectNoEnglish, signInFrench } from "./french";
import { atEachWidth, expectNoSidewaysScroll, expectUnoccluded } from "./layout";

/**
 * EV-321b — step challenges in the coach portal, against the POPULATED fixture roster
 * (`playwright.roster.config.ts`, `npm run test:e2e:roster`): the create dialog invites
 * from the roster, and the default suite's `empty` scenario has nobody to invite.
 *
 * The fixture ports b-fit-api EV-321a's progress calculator and ranking, so the table is
 * fed the api's shape. Seeded (`FIXTURE_CHALLENGE_IDS` in `coachApi.fixture.ts`):
 *   ACTIVE "10 000 pas par jour", 10 000/day, today−4 → today+2:
 *     Yusuf A. — 4 met, one day with NO row (NO_DATA), today 10 400  → rank 1
 *     Lina M.  — 3 met, today 6 150 (IN_PROGRESS)                    → rank 2
 *     Tobias R.— 1 met, NO row today or yesterday                    → rank 3, today "—"
 *     Mara D., Sara P. — INVITED
 *   ENDED "Semaine de rentrée", UPCOMING "Objectif 8 000 pas".
 */

const ACTIVE = "c4a11e00-0000-4000-8000-000000000001";
const ENDED = "c4a11e00-0000-4000-8000-000000000002";
const YUSUF = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0007";
const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
const TOBIAS = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0009";
const MARA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0008";
const SARA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0003";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("coach@evoli.fit");
  await page.getByLabel("Password").fill("Password123!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/");
}

const table = (page: Page) => page.getByRole("region", { name: "Participants' progress" });
const row = (page: Page, clientId: string) => page.locator(`tr[data-participant="${clientId}"]`);

async function openDialog(page: Page) {
  await page.goto("/challenges");
  await page.getByRole("button", { name: "New challenge" }).click();
  const dialog = page.getByRole("dialog", { name: "New challenge" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe("the list", () => {
  test("reached from the nav; newest window first, each with its phase, goal and counts", async ({ page }) => {
    await signIn(page);
    await page.getByRole("navigation", { name: "Portal" }).getByRole("link", { name: "Challenges" }).click();
    await page.waitForURL("/challenges");
    await expect(page.getByRole("heading", { name: "Challenges", level: 1 })).toBeVisible();

    const cards = page.getByRole("list", { name: "Challenges" }).getByRole("listitem");
    await expect(cards).toHaveCount(3);
    // `endsOn` descending, the api's order: upcoming (+9), active (+2), ended (−14).
    await expect(cards.getByRole("heading", { level: 2 })).toHaveText([
      "Objectif 8 000 pas",
      "10 000 pas par jour",
      "Semaine de rentrée",
    ]);
    await expect(cards.nth(0)).toContainText("Upcoming");
    await expect(cards.nth(1)).toContainText("Active");
    await expect(cards.nth(1)).toContainText("10,000 steps a day");
    await expect(cards.nth(1)).toContainText("5 invited · 3 joined");
    await expect(cards.nth(1)).toContainText("7 days");
    await expect(cards.nth(2)).toContainText("Ended");
  });
});

test.describe("the ranked progress table", () => {
  test("rows come in the api's rank order — not by name, not by invite — and INVITED last", async ({ page }) => {
    await signIn(page);
    await page.goto(`/challenges/${ACTIVE}`);
    const ids = await table(page)
      .locator("tbody tr")
      .evaluateAll((rows) => rows.map((r) => r.getAttribute("data-participant")));
    expect(ids).toEqual([YUSUF, LINA, TOBIAS, MARA, SARA]);
    await expect(row(page, YUSUF).locator("td").first()).toHaveText("#1");
    await expect(row(page, LINA).locator("td").first()).toHaveText("#2");
    await expect(row(page, TOBIAS).locator("td").first()).toHaveText("#3");
    await expect(row(page, YUSUF)).toContainText("4 / 5");
    await expect(row(page, YUSUF)).toContainText("10,400 / 10,000 steps");
    // The sync time, and under it where the number came from — never "verified".
    await expect(row(page, YUSUF).locator("[data-synced]")).toHaveText(/^\d+ minutes ago$/); // seeded 40 min before the process started
    await expect(row(page, YUSUF).locator("[data-source]")).toHaveText("Apple Health");
    await expect(row(page, LINA).locator("[data-source]")).toHaveText("Health Connect");
    await expect(row(page, TOBIAS).locator("[data-source]")).toHaveText("Manual entry");
    await expect(row(page, LINA)).toContainText("49,720 steps");
    // The bar is capped at the goal and states its numbers.
    await expect(row(page, YUSUF).getByRole("progressbar")).toHaveAttribute("data-pct", "100");
    await expect(row(page, LINA).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "6150");
  });

  test("NO_DATA is '—' and 'no data', never 0 — today, in the strip and in the bar", async ({ page }) => {
    await signIn(page);
    await page.goto(`/challenges/${ACTIVE}`);
    const tobias = row(page, TOBIAS);
    // Today: no row from any source → a dash, and NO bar (an empty bar is a picture of zero).
    await expect(tobias.locator("[data-today]")).toHaveAttribute("data-today", "");
    await expect(tobias.locator("[data-today]")).toHaveText("— / 10,000 steps");
    await expect(tobias.getByRole("progressbar")).toHaveCount(0);

    // The strip: yesterday and today have no row. Their squares are NO_DATA, carry no
    // value and say "no data" — and nothing on the table says "0 steps".
    const noData = tobias.locator('[data-status="NO_DATA"]');
    await expect(noData).toHaveCount(2);
    for (const square of await noData.all()) {
      await expect(square).toHaveAttribute("data-value", "");
      await expect(square).toHaveAttribute("aria-label", /: no data$/);
    }
    // Yusuf's gap three days ago is the same fact in the middle of a strong week.
    await expect(row(page, YUSUF).locator('[data-status="NO_DATA"]')).toHaveCount(1);
    const text = await table(page).innerText();
    expect(text).not.toMatch(/(^|[^\d,])0 steps/);
    expect(text).not.toMatch(/\b0 \/ 10,000/);

    // Every square is named, so the strip is readable without its colours.
    const named = await table(page).getByRole("img").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
    expect(named.length).toBe(3 * 7);
    expect(named.every((n) => !!n && /: /.test(n))).toBe(true);
    await expect(row(page, LINA).getByRole("img").nth(0)).toHaveAttribute("aria-label", /: 12,400 steps, goal met$/);
    await expect(row(page, LINA).locator('[data-status="IN_PROGRESS"]')).toHaveCount(1);
    await expect(row(page, LINA).locator('[data-status="FUTURE"]')).toHaveCount(2);
  });

  test("an INVITED participant shows 'Invitation sent' and no number at all", async ({ page }) => {
    await signIn(page);
    await page.goto(`/challenges/${ACTIVE}`);
    for (const id of [MARA, SARA]) {
      const invited = row(page, id);
      await expect(invited).toContainText("Invitation sent");
      await expect(invited).toContainText("Their steps appear here once they accept.");
      await expect(invited.getByRole("img")).toHaveCount(0);
      await expect(invited.getByRole("progressbar")).toHaveCount(0);
      expect(await invited.innerText()).not.toMatch(/\d/);
    }
  });

  test("Refresh re-reads the challenge", async ({ page }) => {
    await signIn(page);
    await page.goto(`/challenges/${ACTIVE}`);
    const stamp = page.locator("[data-loaded-at]");
    const before = await stamp.getAttribute("data-loaded-at");
    await page.waitForTimeout(1100);
    await page.getByRole("button", { name: "Refresh" }).click();
    await expect(stamp).not.toHaveAttribute("data-loaded-at", before ?? "");
  });

  /**
   * Staff nit (a): the bar used `Math.round`, so 9,950–9,999 of 10,000 drew a FULL GREEN
   * bar on a day the api still calls IN_PROGRESS. The width floors (99 %) and the colour
   * follows `today >= target`. Painted, not just attributed: the fill's measured width
   * against its track, and its computed colour against Yusuf's bar (10,400, met).
   * `evoli_fixture_today_steps` sets Lina's today row; nothing else moves.
   */
  test("9,950 and 9,999 of 10,000 are a short blue bar; 10,000 is a full green one", async ({
    page,
    context,
    baseURL,
  }) => {
    await signIn(page);
    const lina = row(page, LINA);
    const paint = () =>
      lina.getByRole("progressbar").evaluate((bar) => {
        const fill = bar.firstElementChild as HTMLElement;
        return {
          ratio: fill.getBoundingClientRect().width / bar.getBoundingClientRect().width,
          colour: getComputedStyle(fill).backgroundColor,
        };
      });
    const metColour = () =>
      row(page, YUSUF)
        .getByRole("progressbar")
        .evaluate((bar) => getComputedStyle(bar.firstElementChild as HTMLElement).backgroundColor);

    for (const steps of [9_950, 9_999]) {
      await context.addCookies([{ name: "evoli_fixture_today_steps", value: String(steps), url: baseURL! }]);
      await page.goto(`/challenges/${ACTIVE}`);
      const bar = lina.getByRole("progressbar");
      await expect(bar).toHaveAttribute("aria-valuenow", String(steps));
      await expect(lina.locator('[data-status="IN_PROGRESS"]')).toHaveCount(1);
      await expect(bar).toHaveAttribute("data-pct", "99");
      await expect(bar).toHaveAttribute("data-met", "false");
      const painted = await paint();
      expect(painted.ratio, `${steps} steps must not paint a full bar`).toBeLessThan(0.995);
      expect(painted.colour, `${steps} steps must not paint the goal colour`).not.toBe(await metColour());
    }

    await context.addCookies([{ name: "evoli_fixture_today_steps", value: "10000", url: baseURL! }]);
    await page.goto(`/challenges/${ACTIVE}`);
    await expect(lina.locator('[data-status="IN_PROGRESS"]')).toHaveCount(0);
    await expect(lina.getByRole("progressbar")).toHaveAttribute("data-pct", "100");
    await expect(lina.getByRole("progressbar")).toHaveAttribute("data-met", "true");
    const painted = await paint();
    expect(painted.ratio).toBeCloseTo(1, 2);
    expect(painted.colour).toBe(await metColour());
  });
});

/**
 * Staff nit (b): "Mis à jour à 12:42 UTC" asked a coach in Paris to add two hours. The
 * time is now formatted in the browser, in the browser's zone, with no zone suffix. Each
 * zone below is never on UTC's wall clock (Kiritimati is UTC+14, Paris +1/+2), so a
 * server-rendered UTC time cannot pass. The expected value is computed here with Intl,
 * not read back from the portal's formatter.
 */
function wallClock(iso: string, locale: string, timeZone: string): string {
  return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone }).format(
    new Date(iso)
  );
}

test.describe("the refresh time is the coach's own clock (UTC+14)", () => {
  test.use({ timezoneId: "Pacific/Kiritimati" });

  test("English: 'Updated at HH:MM' in the browser's zone, no 'UTC'", async ({ page }) => {
    await signIn(page);
    await page.goto(`/challenges/${ACTIVE}`);
    const stamp = page.locator("[data-loaded-at]");
    const iso = (await stamp.getAttribute("data-loaded-at"))!;
    await expect(stamp).toHaveText(
      `Updated at ${wallClock(iso, "en-GB", "Pacific/Kiritimati")} · Updates every 45 seconds while this page is open.`
    );
    await expect(stamp).not.toContainText("UTC");
  });
});

test.describe("the refresh time is the coach's own clock (Paris, fr-FR)", () => {
  test.use({ locale: "fr-FR", timezoneId: "Europe/Paris" });

  test("French: 'Mis à jour à HH:MM' in Paris time, no 'UTC'", async ({ page }) => {
    await signInFrench(page);
    await page.goto(`/challenges/${ACTIVE}`);
    const stamp = page.locator("[data-loaded-at]");
    const iso = (await stamp.getAttribute("data-loaded-at"))!;
    await expect(stamp).toHaveText(
      `Mis à jour à ${wallClock(iso, "fr-FR", "Europe/Paris")} · Mise à jour toutes les 45 secondes tant que cette page est ouverte.`
    );
    await expect(stamp).not.toContainText("UTC");
  });
});

test.describe("create", () => {
  test("create → list → detail: the new challenge exists, invited, with the api's numbers", async ({ page }) => {
    await signIn(page);
    const dialog = await openDialog(page);
    // The defaults: 10,000 a day, one week from today.
    await expect(dialog.getByLabel("Daily step goal")).toHaveValue("10,000");
    await expect(dialog.getByTestId("challenge-window")).toContainText("7 days");

    await dialog.getByLabel("Title").fill("Semaine des 10 000 pas");
    await dialog.getByRole("checkbox", { name: "Lina M." }).check();
    await dialog.getByRole("checkbox", { name: "Sara P." }).check();
    await expect(dialog.getByText("2 selected")).toBeVisible();
    await dialog.getByRole("button", { name: "Create and invite" }).click();

    await page.waitForURL(/\/challenges\/[0-9a-f-]{36}\?created=1$/);
    await expect(page.getByRole("status").filter({ hasText: "Challenge created." })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Semaine des 10 000 pas");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Active");
    await expect(page.getByText("2 invited · 0 joined")).toBeVisible();
    await expect(table(page).locator("tbody tr")).toHaveCount(2);
    await expect(row(page, LINA)).toContainText("Invitation sent");
    await expect(row(page, SARA)).toContainText("Invitation sent");

    await page.getByRole("link", { name: "Back to challenges" }).click();
    await page.waitForURL("/challenges");
    const cards = page.getByRole("list", { name: "Challenges" }).getByRole("listitem");
    await expect(cards).toHaveCount(4);
    await expect(cards.filter({ hasText: "Semaine des 10 000 pas" })).toContainText("2 invited · 0 joined");
  });

  test("nothing is sent while the form is invalid, and each problem sits by its field", async ({ page }) => {
    await signIn(page);
    const dialog = await openDialog(page);
    await dialog.getByLabel("Daily step goal").fill("999");
    await dialog.getByRole("button", { name: "Create and invite" }).click();
    await expect(dialog.getByText("Give the challenge a title.")).toBeVisible();
    await expect(dialog.getByText("The daily goal is between 1,000 and 50,000 steps.")).toBeVisible();
    await expect(dialog.getByText("Choose at least one client.")).toBeVisible();
    await expect(page).toHaveURL("/challenges");
    await expect(page.getByRole("list", { name: "Challenges" }).getByRole("listitem")).toHaveCount(3);

    await dialog.getByLabel("Daily step goal").fill("50 000");
    await expect(dialog.getByText("The daily goal is between 1,000 and 50,000 steps.")).toHaveCount(0);
  });

  test("403 — a client whose link ended after the page loaded: nothing created, the form kept", async ({ page, context, baseURL }) => {
    await signIn(page);
    const dialog = await openDialog(page);
    await dialog.getByLabel("Title").fill("Refusé");
    await dialog.getByRole("checkbox", { name: "Lina M." }).check();
    await context.addCookies([{ name: "evoli_fixture_link", value: "ended", url: baseURL! }]);
    await dialog.getByRole("button", { name: "Create and invite" }).click();
    await expect(dialog.getByRole("alert")).toHaveText(
      "One of these clients is no longer linked to you. Nothing was created. Reload the page and choose again."
    );
    await expect(dialog.getByLabel("Title")).toHaveValue("Refusé");
    await expect(page).toHaveURL("/challenges");
  });

  test("409 — the coach already has 20 unended challenges", async ({ page, context, baseURL }) => {
    await signIn(page);
    const dialog = await openDialog(page);
    await dialog.getByLabel("Title").fill("Le vingt-et-unième");
    await dialog.getByRole("checkbox", { name: "Yusuf A." }).check();
    await context.addCookies([{ name: "evoli_fixture_challenge_cap", value: "reached", url: baseURL! }]);
    await dialog.getByRole("button", { name: "Create and invite" }).click();
    await expect(dialog.getByRole("alert")).toHaveText(
      "You already have 20 challenges that have not ended. Delete one to create another."
    );
  });

  // Staff nit (c): a failed roster read is not "no linked clients" — that sentence sends
  // a coach who HAS clients off to invite them again.
  test("a failed roster read says the clients could not be loaded, never that there are none", async ({
    page,
    context,
    baseURL,
  }) => {
    await signIn(page);
    await context.addCookies([{ name: "evoli_fixture_roster", value: "fail", url: baseURL! }]);
    const dialog = await openDialog(page);
    await expect(dialog.getByText("Your clients could not be loaded. Reload the page to try again.")).toBeVisible();
    await expect(dialog.getByText("You have no linked clients yet.", { exact: false })).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Create and invite" })).toBeDisabled();
  });
});

test.describe("delete", () => {
  test("behind a confirm that names it; afterwards the list no longer has it", async ({ page }) => {
    await signIn(page);
    await page.goto(`/challenges/${ENDED}`);
    await page.getByRole("button", { name: "Delete challenge" }).click();
    const confirm = page.getByRole("dialog", { name: "Delete this challenge?" });
    await expect(confirm).toContainText("“Semaine de rentrée” is deleted");
    await expect(confirm).toContainText("The steps your clients shared for this challenge are deleted, except days another challenge they have joined still covers.");
    await confirm.getByRole("button", { name: "Delete", exact: true }).click();
    await page.waitForURL("/challenges");
    const cards = page.getByRole("list", { name: "Challenges" }).getByRole("listitem");
    await expect(cards).toHaveCount(2);
    await expect(cards.filter({ hasText: "Semaine de rentrée" })).toHaveCount(0);

    // The deleted id now reads like any id that is not this coach's.
    await page.goto(`/challenges/${ENDED}`);
    await expect(page.getByText("That challenge is not in your list.")).toBeVisible();
  });
});

test.describe("a French browser (fr-FR) at 1280 × 800", () => {
  test.use({ locale: "fr-FR", viewport: { width: 1280, height: 800 } });

  test("the list, the table and the dialog are French, with French numbers", async ({ page }) => {
    await signInFrench(page);
    await page.goto("/challenges");
    await expect(page.getByRole("heading", { name: "Défis", level: 1 })).toBeVisible();
    const cards = page.getByRole("list", { name: "Défis" }).getByRole("listitem");
    await expect(cards.nth(1)).toContainText("10\u202f000 pas par jour");
    await expect(cards.nth(1)).toContainText("En cours");
    await expect(cards.nth(1)).toContainText("5 invités · 3 ont rejoint");
    await expect(cards.nth(0)).toContainText("À venir");
    await expect(cards.nth(2)).toContainText("Terminé");
    await expect(cards.nth(1)).toContainText(/Du \d{1,2} [a-zéû.]+ \d{4} au \d{1,2} [a-zéû.]+ \d{4} · 7 jours/);
    await expectNoEnglish(page, "the challenge list");

    await page.goto(`/challenges/${ACTIVE}`);
    const region = page.getByRole("region", { name: "Progression des participants" });
    await expect(region.locator(`tr[data-participant="${YUSUF}"] td`).first()).toHaveText("1er");
    await expect(region.locator(`tr[data-participant="${LINA}"] td`).first()).toHaveText("2e");
    await expect(region.locator(`tr[data-participant="${YUSUF}"]`)).toContainText("10\u202f400 / 10\u202f000 pas");
    await expect(region.locator(`tr[data-participant="${YUSUF}"]`)).toContainText("Apple Santé");
    await expect(region.locator(`tr[data-participant="${TOBIAS}"]`)).toContainText("— / 10\u202f000 pas");
    await expect(region.locator(`tr[data-participant="${TOBIAS}"]`)).toContainText("Saisie manuelle");
    await expect(region.locator(`tr[data-participant="${SARA}"]`)).toContainText("Invitation envoyée");
    await expect(region.locator(`tr[data-participant="${TOBIAS}"] [data-status="NO_DATA"]`).first()).toHaveAttribute(
      "aria-label",
      /: aucune donnée$/
    );
    await expectNoEnglish(page, "the challenge page");

    await page.goto("/challenges");
    await page.getByRole("button", { name: "Nouveau défi" }).click();
    const dialog = page.getByRole("dialog", { name: "Nouveau défi" });
    await expect(dialog.getByLabel("Objectif de pas par jour")).toHaveValue("10\u202f000");
    await dialog.getByRole("button", { name: "Créer et inviter" }).click();
    await expect(dialog.getByText("Donnez un titre au défi.")).toBeVisible();
    await expectNoEnglish(page, "the create dialog");
  });
});

test.describe("layout", () => {
  test("at 1280 the seven-day table fits its card: no sideways scroll, no clipped square", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 860 });
    await signIn(page);
    await page.goto(`/challenges/${ACTIVE}`);
    const overflow = await table(page)
      .locator("table")
      .evaluate((t) => (t.parentElement as HTMLElement).scrollWidth - (t.parentElement as HTMLElement).clientWidth);
    expect(overflow, "the progress table scrolls sideways inside its card at 1280").toBeLessThanOrEqual(0);
  });

  test("the fourth nav link and the list fit 320 / 360 / 390 / 414", async ({ page }) => {
    await signIn(page);
    await page.goto("/challenges");
    const nav = page.getByRole("navigation", { name: "Portal" });
    const signOut = page.getByRole("button", { name: "Sign out" });
    await atEachWidth(page, async () => {
      // `exact`: EV-273b's "Nutrition templates" contains "Templates", and a substring
      // match resolves to two links (strict mode).
      for (const name of ["Roster", "Templates", "Recipes", "Nutrition templates", "Challenges"]) {
        await expectUnoccluded(page, nav.getByRole("link", { name, exact: true }), {
          over: signOut,
          label: `${name} nav link`,
        });
      }
      await expectNoSidewaysScroll(page, "the challenge list");
    });
  });
});
