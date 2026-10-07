import { expect, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";
import { expectNoSidewaysScroll } from "./layout";
import { expectNoEnglish, signInFrench } from "./french";

/**
 * EV-337e — the client overview redesign (plan §5.2; story X1–X8 and the EV-337e line).
 *
 * Fixture trainees (default suite, `coachApi.fixture.ts`):
 *   · Lina   — every scope; MISSED_TWO_OR_MORE_SESSIONS with two dated misses; a published
 *              plan and an ACTIVE meal week.
 *   · Tobias — every scope; BOTH rules fired (missed sessions + no weigh-in for 21 days).
 *   · Nils   — every scope; no flag fired.
 *   · Dana   — every scope; a coded injury (SHOULDER) AND a free-typed injury note.
 *   · Sara   — PROGRESS + WEIGH_INS only.  · Petra — NUTRITION only.  · Yusuf — WORKOUTS only.
 *   · Mara   — nothing shared.
 */

const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
const NILS = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0002";
const SARA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0003";
const DANA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0004";
const PETRA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0006";
const YUSUF = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0007";
const MARA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0008";
const TOBIAS = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0009";

/** Story X1's widths, both sides of every breakpoint. */
const X1_WIDTHS = [1440, 1280, 1279, 1024, 1023, 768, 767, 390, 320] as const;

async function signIn(page: Page) {
  await signInThroughForm(page, { email: "coach@evoli.fit", password: "Password123!" });
}

function region(page: Page, name: string) {
  return page.getByRole("region", { name, exact: true });
}

interface Entry {
  op: string;
  document: boolean;
  request: string;
}

/** The fixture's api journal: one entry per CoachApi call. */
async function journal(page: Page): Promise<Entry[]> {
  const res = await page.request.get("/api/fixture/calls", { maxRedirects: 0 });
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { api?: Entry[] };
  expect(Array.isArray(body.api)).toBe(true);
  return body.api!;
}

/** The reads ONE document load of `path` made, sorted. */
async function readsOf(page: Page, path: string): Promise<string[]> {
  const before = (await journal(page)).length;
  const res = await page.goto(path);
  expect(res?.status()).toBe(200);
  return (await journal(page))
    .slice(before)
    .filter((e) => e.document)
    .map((e) => e.op)
    .sort();
}

test.describe("X1 + X4 — every width, both languages: no sideways scroll, one h1", () => {
  for (const [locale, lang] of [
    ["en-US", "en"],
    ["fr-FR", "fr"],
  ] as const) {
    test.describe(locale, () => {
      test.use({ locale });
      test("loaded, partly shared and nothing shared", async ({ page }) => {
        if (lang === "fr") await signInFrench(page);
        else await signIn(page);
        for (const [id, name] of [
          [TOBIAS, "Tobias R."],
          [SARA, "Sara P."],
          [MARA, "Mara D."],
        ] as const) {
          await page.goto(`/clients/${id}`);
          for (const width of X1_WIDTHS) {
            await page.setViewportSize({ width, height: 900 });
            await expectNoSidewaysScroll(page, `/clients/${name} at ${width}px (${locale})`);
            const h1 = page.getByRole("heading", { level: 1 });
            await expect(h1).toHaveCount(1);
            await expect(h1).toHaveText(name);
          }
        }
      });
    });
  }
});

test.describe("« À traiter » — alert cards for the flags the api returned, and only those", () => {
  test("two rules fired: two cards, each with the word, its sentence and its evidence", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${TOBIAS}`);
    const review = region(page, "To review");
    const cards = review.locator(".alert-card");
    await expect(cards).toHaveCount(2);
    expect(await cards.evaluateAll((els) => els.map((el) => el.getAttribute("data-flag")).sort())).toEqual([
      "MISSED_TWO_OR_MORE_SESSIONS",
      "NO_WEIGH_IN_14_DAYS",
    ]);
    // Status never by colour alone: each card says « Alert » in words, and is named by its h3.
    for (const name of ["Missed 2 or more planned sessions this week", "No weigh-in for 14 days"]) {
      const card = review.getByRole("group", { name });
      await expect(card).toContainText("Alert");
      await expect(card.getByRole("heading", { level: 3, name })).toBeVisible();
    }
    // The count beside the heading is the number of cards, with a sentence for a screen reader.
    await expect(review.locator(".count-chip")).toHaveText(/^2\s*2 alerts$/);
    // The missed-sessions card leads to the routine; the weigh-in card has no action to offer.
    await expect(review.getByRole("link", { name: "Adjust the plan" })).toHaveAttribute(
      "href",
      `/clients/${TOBIAS}/routine`
    );
    await expect(review.getByRole("link")).toHaveCount(1);
  });

  test("nothing fired: no card, the api's empty statement, no count", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${NILS}`);
    const review = region(page, "To review");
    await expect(review.locator(".alert-card")).toHaveCount(0);
    await expect(review).toContainText("No red flags");
    await expect(review.locator(".count-chip")).toHaveCount(0);
  });

  test("not shared: the scope sentence, never 'No red flags', no card", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${MARA}`);
    const review = region(page, "To review");
    await expect(review).toContainText(
      "Red flags need this trainee's sessions or weigh-ins, which they have not shared."
    );
    await expect(review).not.toContainText("No red flags");
    await expect(review.locator(".alert-card")).toHaveCount(0);
  });

  test("a link without WORKOUTS gets no 'Adjust the plan' (it could not open the plan)", async ({ page }) => {
    await signIn(page);
    // Sara: PROGRESS + WEIGH_INS, flagged NO_WEIGH_IN_14_DAYS only — and no WORKOUTS.
    await page.goto(`/clients/${SARA}`);
    const review = region(page, "To review");
    await expect(review.locator(".alert-card")).toHaveCount(1);
    await expect(review.getByRole("link")).toHaveCount(0);
  });

  test.describe("in French", () => {
    test.use({ locale: "fr-FR" });
    test("« Alerte », and no pain signal or « signalement » anywhere in the document", async ({ page }) => {
      await signInFrench(page);
      for (const id of [TOBIAS, LINA, DANA, SARA, MARA]) {
        const html = await (await page.request.get(`/clients/${id}`)).text();
        expect(html, id).toContain("À traiter");
        expect(html, id).not.toMatch(/douleur/i);
        expect(html, id).not.toMatch(/signalement/i);
        expect(html, id).not.toMatch(/\bpain\b/i);
      }
      await page.goto(`/clients/${TOBIAS}`);
      await expect(region(page, "À traiter").locator(".alert-word")).toHaveText(["Alerte", "Alerte"]);
      // The leftover guard on Lina, as coach-french.spec.ts does: Tobias's workouts are called
      // "Legs", api content that happens to equal an English dictionary word (R3).
      await page.goto(`/clients/${LINA}`);
      await expectNoEnglish(page, "the overview");
    });
  });
});

test.describe("the header", () => {
  // EV-342e (audit A5) reversed EV-337e's two header buttons: the overview carries the same
  // tab bar as the other client pages (qa/client-tab-bar.spec.ts), and the menu stays.
  test("Routine and Nutrition are 44 px links in the tab bar; the menu stays in the header", async ({ page }) => {
    await signIn(page);
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(`/clients/${LINA}`);
    const main = page.getByRole("main");
    const tabs = main.getByRole("navigation", { name: "Trainee sections" });
    for (const [name, href] of [
      ["Routine", `/clients/${LINA}/routine`],
      ["Nutrition", `/clients/${LINA}/nutrition`],
    ] as const) {
      await expect(main.getByRole("link", { name, exact: true }), `${name}: once on the page`).toHaveCount(1);
      const link = tabs.getByRole("link", { name, exact: true });
      await expect(link).toHaveAttribute("href", href);
      const box = (await link.boundingBox())!;
      expect(box.height, name).toBeGreaterThanOrEqual(44);
      expect(box.width, name).toBeGreaterThanOrEqual(44);
    }
    await expect(main.locator(".client-head").getByRole("button", { name: "More" })).toBeVisible();
  });

  test("an injury chip shows the coded label only, never the trainee's free text", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${DANA}`);
    // BUG-701: under the tab bar, above the first card, not in the header.
    const chips = page.getByRole("main").locator(".client-injuries .status-pill");
    await expect(chips).toHaveText(["Limitation: Shoulders"]);
    // Her free-typed note is on the routine tab, where it was; the overview does not restate it.
    await expect(page.getByRole("main")).not.toContainText("left shoulder");
  });

  test("no chip without WORKOUTS: the injuries come from the routine read", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${SARA}`);
    await expect(page.getByRole("main").locator(".client-injuries .status-pill")).toHaveCount(0);
  });
});

test.describe("the stat cards", () => {
  test("the ring repeats this week's numbers, and draws nothing it was not given", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${LINA}`);
    const ring = page.getByRole("img", { name: "3 of 4 planned sessions this week" });
    await expect(ring).toBeVisible();
    await expect(ring).toHaveAttribute("data-ratio", "0.750");
    const tile = page.getByText("Adherence this week", { exact: true }).locator("..");
    await expect(tile).toContainText("3 / 4");

    await page.goto(`/clients/${MARA}`);
    await expect(page.locator(".stat-card svg[role=img]")).toHaveCount(0);
  });

  test("the sessions card is the monitoring read's own sums, under its own window", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${LINA}`);
    const headline = (await page.getByText(/^\d+ of \d+ planned sessions in the last 8 weeks$/).textContent())!;
    const [done, planned] = headline.match(/\d+/g)!;
    const tile = page.getByText("Sessions · last 8 weeks", { exact: true }).locator("..");
    await expect(tile.locator(".stat-card-value")).toHaveText(done);
    await expect(tile.locator(".stat-card-foot")).toHaveText(`of ${planned} planned`);
  });

  test("not shared is a dash and words, never a zero", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${SARA}`);
    // Sara holds PROGRESS but not WORKOUTS: the sessions card needs both.
    const tile = page.getByText("Sessions · last 8 weeks", { exact: true }).locator("..");
    await expect(tile.locator(".stat-card-value")).toHaveText("—");
    await expect(tile.locator(".stat-card-foot")).toHaveText("Not shared");
  });
});

test.describe("« Activité récente »", () => {
  test("sessions and weigh-ins, newest first, five at most", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${LINA}`);
    const rows = region(page, "Recent activity").locator(".activity-row");
    await expect(rows).toHaveCount(5);
    await expect(rows.filter({ hasText: /^.*Weigh-in · 70\.4\s*kg/ })).toHaveCount(1);
  });

  test("only one source shared: its rows, and a line naming what is not shared", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${DANA}`);
    await expect(region(page, "Recent activity").locator(".activity-row").first()).toBeVisible();

    await page.goto(`/clients/${SARA}`);
    const card = region(page, "Recent activity");
    // WEIGH_INS held and empty; sessions not shared (no WORKOUTS): two facts, two sentences.
    await expect(card).toContainText("No weigh-ins recorded recently.");
    await expect(card).toContainText("Sessions are not shared.");
    await expect(card.locator(".activity-row")).toHaveCount(0);
  });

  test("nothing shared: one sentence", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${MARA}`);
    await expect(region(page, "Recent activity")).toHaveText(
      /Recent activity\s*This trainee has not shared their sessions or weigh-ins with you\./
    );
  });
});

test.describe("the programme and nutrition summaries", () => {
  test("Lina: her plan and her week, each with its link", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${LINA}`);
    const programme = region(page, "Routine");
    await expect(programme).toContainText("Intermediate Muscle Building Routine");
    await expect(programme).toContainText(/\d days? a week/);
    await expect(programme.getByRole("link", { name: "Open the plan" })).toHaveAttribute(
      "href",
      `/clients/${LINA}/routine`
    );
    const nutrition = region(page, "Nutrition");
    await expect(nutrition).toContainText(/[\d,]+\s*kcal · \d+\s*g protein/);
    await expect(nutrition).toContainText("Week planned");
    await expect(nutrition).toContainText(/^.*Week of \d/);
    await expect(nutrition.getByRole("link", { name: "See the week" })).toHaveAttribute(
      "href",
      `/clients/${LINA}/nutrition`
    );
  });

  test("a saved draft: the card says so and offers to resume it", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${LINA}/routine`);
    await page.getByLabel("Sets").first().fill("5");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText(/^Draft saved /)).toBeVisible();
    await page.goto(`/clients/${LINA}`);
    const programme = region(page, "Routine");
    await expect(programme.locator(".status-pill")).toHaveText("Draft in progress");
    await expect(programme).toContainText(/A draft saved on .+ is not published yet\./);
    await expect(programme.getByRole("link", { name: "Resume the draft" })).toBeVisible();
  });

  test("a withheld scope is never asked for, and says so in words", async ({ page }) => {
    await signIn(page);
    expect(await readsOf(page, `/clients/${MARA}`)).toEqual(["getClient", "getClientProgress"]);
    await expect(region(page, "Routine")).toContainText("This trainee has not shared their workouts with you.");
    await expect(region(page, "Nutrition")).toContainText("This trainee has not shared their nutrition with you.");
    await expect(region(page, "No data shared")).toContainText("This is not a zero");

    expect(await readsOf(page, `/clients/${PETRA}`)).toEqual(["getClient", "getClientProgress", "getNutrition"]);
    expect(await readsOf(page, `/clients/${YUSUF}`)).toEqual(["getClient", "getClientProgress", "getRoutine"]);
    await expect(region(page, "No data shared")).toHaveCount(0);
  });
});

test("every link and button in the page is a 44 px target at 390 px", async ({ page }) => {
  await signIn(page);
  await page.setViewportSize({ width: 390, height: 900 });
  for (const id of [LINA, TOBIAS]) {
    await page.goto(`/clients/${id}`);
    const small = await page
      .getByRole("main")
      .locator("a, button")
      .evaluateAll((els) =>
        els
          .map((el) => {
            const r = el.getBoundingClientRect();
            return { what: (el.textContent || el.getAttribute("title") || "?").trim().slice(0, 40), w: r.width, h: r.height };
          })
          .filter((c) => c.w > 0 && c.h > 0 && (c.w < 44 || c.h < 44))
      );
    expect(small, id).toEqual([]);
  }
});
