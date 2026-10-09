import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, webkit, type Browser, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";
import { signInFrench } from "./french";
import { en, type Copy } from "../src/lib/copy";
import { fr } from "../src/lib/copy.fr";
import { codedInjuryLabels, injuryLabels } from "../src/lib/guardrailLabels";
import { openTargetsForm } from "./targets-card";

/**
 * EV-337m — the client overview's follow-ups to EV-337e (story EV-337, rulings 2–5; M1–M9).
 *
 * Fixture trainees (default suite, `coachApi.fixture.ts`):
 *   · Lina    — every scope, five stat cards with data, a published plan, MISSED_TWO_OR_MORE_SESSIONS.
 *   · Nils    — every scope, no plan (the programme card's "create" link).
 *   · Tobias  — every scope, both rules fired.
 *   · Yusuf   — WORKOUTS only, nothing fired (`[]`, his roster row's real 0).
 *   · Yann    — WORKOUTS only, MISSED_TWO_OR_MORE_SESSIONS fired (BUG-674).
 *   · Pablo   — `["PAIN_REPORTED"]`, a wire the api cannot send today (M4).
 *   · Quentin — `["MISSED_TWO_OR_MORE_SESSIONS", "SOMETHING_NEW"]` (M4).
 *   · Wanda   — a ONE-week progress window (M5).
 *   · Sara    — PROGRESS + WEIGH_INS.  · Petra — NUTRITION only.  · Mara — nothing shared.
 * The roster half of M3 (the same count as the roster row) is `pro-overview-roster-count.spec.ts`,
 * in the populated config.
 */

const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
const NILS = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0002";
const SARA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0003";
const DANA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0004";
const PETRA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0006";
const YUSUF = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0007";
const MARA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0008";
const TOBIAS = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0009";
const YANN = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0020";
const PABLO = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0021";
const QUENTIN = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0022";
const WANDA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0023";

async function signIn(page: Page) {
  await signInThroughForm(page, { email: "coach@evoli.fit", password: "Password123!" });
}

function region(page: Page, name: string) {
  return page.getByRole("region", { name, exact: true });
}

function tile(page: Page, label: string) {
  return page.locator(".overview-stats > .stat-card").filter({
    has: page.locator(".stat-card-label", { hasText: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) }),
  });
}

/* ═══ M1 — the five-card grid (ruling 2) ═════════════════════════════════════════════════ */

/** M1's widths: X1's nine and 900 (the old "4-up from 900" rule this grid does not follow). */
const M1_WIDTHS = [1440, 1280, 1279, 1024, 1023, 900, 768, 767, 390, 320] as const;

interface Box {
  label: string;
  left: number;
  right: number;
  top: number;
}

/** The five cards' boxes in DOM order, and the grid's own content box. */
async function gridFacts(page: Page) {
  return page.locator(".overview-stats").evaluate((grid) => {
    const g = grid.getBoundingClientRect();
    const cs = getComputedStyle(grid);
    const cards = Array.from(grid.children).map((el) => {
      const r = el.getBoundingClientRect();
      return {
        label: (el.querySelector(".stat-card-label")?.textContent ?? "").trim(),
        left: r.left,
        right: r.right,
        top: r.top,
      };
    });
    return {
      gridLeft: g.left + parseFloat(cs.paddingLeft),
      gridRight: g.right - parseFloat(cs.paddingRight),
      cards,
    };
  });
}

/** Cards grouped into visual rows (same top within 1 px), each row left to right. */
function rowsOf(cards: Box[]): Box[][] {
  const rows: Box[][] = [];
  for (const c of [...cards].sort((a, b) => a.top - b.top || a.left - b.left)) {
    const row = rows.find((r) => Math.abs(r[0].top - c.top) <= 1);
    if (row) row.push(c);
    else rows.push([c]);
  }
  return rows.map((r) => r.sort((a, b) => a.left - b.left));
}

async function expectRulingTwoGrid(page: Page, width: number, order: string[], where: string) {
  const { gridLeft, gridRight, cards } = await gridFacts(page);
  expect(cards.map((c) => c.label), `${where}: DOM order`).toEqual(order);
  const rows = rowsOf(cards);
  // The visual order is the DOM order: read left to right, top to bottom.
  expect(rows.flat().map((c) => c.label), `${where}: visual order`).toEqual(order);

  const shape = rows.map((r) => r.length);
  const expected = width >= 1280 ? [5] : width >= 768 ? [3, 2] : [2, 2, 1];
  expect(shape, `${where}: cards per row`).toEqual(expected);

  // No empty cell: every row starts at the grid's left edge and ends at its right edge
  // (within 1 px), and the first row's last card ends where every other row's does.
  const firstRowRight = rows[0][rows[0].length - 1].right;
  expect(Math.abs(firstRowRight - gridRight), `${where}: first row reaches the grid's right edge`).toBeLessThanOrEqual(1);
  for (const [i, row] of rows.entries()) {
    expect(Math.abs(row[0].left - gridLeft), `${where}: row ${i + 1} starts at the left edge`).toBeLessThanOrEqual(1);
    expect(
      Math.abs(row[row.length - 1].right - firstRowRight),
      `${where}: row ${i + 1} ends within 1 px of the first row's last card`
    ).toBeLessThanOrEqual(1);
  }
  if (width >= 768 && width < 1280) {
    // The two cards of the second row share it: each is half of it.
    const [a, b] = rows[1];
    expect(Math.abs(a.right - a.left - (b.right - b.left)), `${where}: the second row's halves`).toBeLessThanOrEqual(1);
  }
}

function cardOrder(copy: Copy, weeks: number): string[] {
  return [copy.client.adherence, copy.client.sessionsWindow(weeks), copy.client.streak, copy.client.lastSession, copy.client.weight];
}

test.describe("M1 — five stat cards, no empty grid cell at any width (ruling 2)", () => {
  test.describe("French", () => {
    test.use({ locale: "fr-FR" });
    test("Chromium: one row ≥ 1280, three then two sharing a full row to 768, two-two-one below", async ({ page }) => {
      await signInFrench(page);
      await page.goto(`/clients/${LINA}`);
      for (const width of M1_WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        await expectRulingTwoGrid(page, width, cardOrder(fr, 8), `Chromium ${width}px`);
      }
    });
  });

  test("English, the same grid (the labels are longer in neither language than the cards)", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${LINA}`);
    for (const width of M1_WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await expectRulingTwoGrid(page, width, cardOrder(en, 8), `Chromium EN ${width}px`);
    }
  });

  test.describe("WebKit", () => {
    let browser: Browser;
    test.beforeAll(async () => {
      expect(existsSync(webkit.executablePath()), "WebKit is not installed: npx playwright install webkit").toBe(true);
      browser = await webkit.launch();
    });
    test.afterAll(async () => {
      await browser?.close();
    });

    test("French, every M1 width", async ({ baseURL }) => {
      // The header stated: the runner hands its own context options (the suite's en-US
      // Accept-Language) to contexts it did not create.
      const context = await browser.newContext({
        baseURL,
        locale: "fr-FR",
        extraHTTPHeaders: { "Accept-Language": "fr-FR" },
      });
      const page = await context.newPage();
      // WebKit gets the dev server's HTML before React hydrates, and a fill before hydration
      // leaves the submit disabled: the helper waits for the form to take what was typed.
      await signInThroughForm(page, { lang: "fr", landing: `${baseURL}/` });
      await page.goto(`/clients/${LINA}`);
      for (const width of M1_WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        await expectRulingTwoGrid(page, width, cardOrder(fr, 8), `WebKit ${width}px`);
      }
      await context.close();
    });
  });
});

/* ═══ M2 — « plan » is the document, « Programme » the section (ruling 5, BUG-675) ═══════ */

test.describe("M2 — one word for the plan (BUG-675)", () => {
  test.describe("French", () => {
    test.use({ locale: "fr-FR" });
    test("the programme card and the missed-sessions card say « plan »", async ({ page }) => {
      await signInFrench(page);

      await page.goto(`/clients/${NILS}`);
      const empty = region(page, "Programme");
      await expect(empty).toContainText("Aucun plan actif.");
      await expect(empty.getByRole("link", { name: "Créer un plan", exact: true })).toHaveAttribute(
        "href",
        `/clients/${NILS}/routine`
      );

      await page.goto(`/clients/${LINA}`);
      await expect(region(page, "Programme").getByRole("link", { name: "Ouvrir le plan", exact: true })).toBeVisible();

      await page.goto(`/clients/${TOBIAS}`);
      await expect(region(page, "À traiter").getByRole("link", { name: "Adapter le plan", exact: true })).toHaveAttribute(
        "href",
        `/clients/${TOBIAS}/routine`
      );

      for (const id of [NILS, LINA, TOBIAS, YANN]) {
        await page.goto(`/clients/${id}`);
        const text = await page.locator("body").innerText();
        expect(text, id).not.toContain("Aucun programme actif");
        expect(text, id).not.toContain("Créer un programme");
        expect(text, id).not.toContain("Ouvrir le programme");
        expect(text, id).not.toContain("Adapter le programme");
      }
    });
  });

  test("English: the card's create link is the routine tab's own words", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${NILS}`);
    const card = region(page, "Routine");
    await expect(card).toContainText("No active plan.");
    await expect(card.getByRole("link", { name: "Build a plan", exact: true })).toHaveAttribute(
      "href",
      `/clients/${NILS}/routine`
    );
    await expect(page.locator("body")).not.toContainText("Write a plan");
  });
});

/* ═══ M3 — the flags and adherence the api builds from WORKOUTS (ruling 4, BUG-674) ═════ */

test.describe("M3 — a WORKOUTS-only link shows what the api evaluated on WORKOUTS (BUG-674)", () => {
  test("the missed-sessions flag is one card, the flag alone; adherence is done / planned", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${YANN}`);

    const review = region(page, "To review");
    const cards = review.locator(".alert-card");
    await expect(cards).toHaveCount(1);
    await expect(cards).toHaveAttribute("data-flag", "MISSED_TWO_OR_MORE_SESSIONS");
    await expect(review.getByRole("heading", { level: 3 })).toHaveText("Missed 2 or more planned sessions this week");
    // No PROGRESS, so the evidence read is not made: the card is the flag alone, never an EMPTY list.
    await expect(review.locator(".alert-evidence")).toHaveCount(0);
    await expect(review.locator(".count-chip")).toHaveText(/^1\s*1 alert$/);
    // WORKOUTS is held, so the plan can be opened from the card.
    await expect(review.getByRole("link", { name: "Adjust the plan" })).toHaveAttribute("href", `/clients/${YANN}/routine`);
    await expect(review).not.toContainText("which they have not shared");

    const adherence = tile(page, "Adherence this week");
    await expect(adherence.locator(".stat-card-value")).toHaveText("0 / 2");
    await expect(adherence.locator(".stat-card-foot")).toHaveText("sessions completed of planned");
    await expect(adherence).not.toContainText("Not shared");
    // The streak is PROGRESS: still not shared, still a dash.
    await expect(tile(page, "Current streak")).toContainText("—");
    await expect(tile(page, "Current streak")).toContainText("Not shared");
    // The last session is WORKOUTS on the api (`workouts ? lastSession(...) : null`, c82e55b):
    // the api sent it, so it is shown (staff nit 1 on EV-337m).
    const last = tile(page, "Last session");
    await expect(last.locator(".stat-card-value")).toHaveText(/\d/);
    await expect(last.locator(".stat-card-foot")).toHaveText("Full Body A · OK");
    await expect(last).not.toContainText("Not shared");
  });

  test("WORKOUTS only and nothing fired: the api's empty statement, and the adherence numbers", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${YUSUF}`);
    const review = region(page, "To review");
    await expect(review).toContainText("No red flags");
    await expect(review.locator(".alert-card")).toHaveCount(0);
    await expect(tile(page, "Adherence this week").locator(".stat-card-value")).toHaveText("0 / 2");
    await expect(page.getByRole("img", { name: "0 of 2 planned sessions this week" })).toBeVisible();
  });

  test("neither WORKOUTS nor WEIGH_INS: the sentence names sessions or weigh-ins", async ({ page }) => {
    await signIn(page);
    for (const id of [MARA, PETRA]) {
      await page.goto(`/clients/${id}`);
      const review = region(page, "To review");
      await expect(review).toHaveText(
        /^To review\s*Red flags need this trainee's sessions or weigh-ins, which they have not shared\.$/
      );
      await expect(tile(page, "Adherence this week")).toContainText("Not shared");
    }
  });

  test("PROGRESS + WEIGH_INS without WORKOUTS: the weigh-in flag, and no adherence (the api sends none)", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${SARA}`);
    const review = region(page, "To review");
    await expect(review.locator(".alert-card")).toHaveCount(1);
    await expect(review.locator(".alert-card")).toHaveAttribute("data-flag", "NO_WEIGH_IN_14_DAYS");
    const adherence = tile(page, "Adherence this week");
    await expect(adherence.locator(".stat-card-value")).toHaveText("—");
    await expect(adherence.locator(".stat-card-foot")).toHaveText("Not shared");
    // No WORKOUTS, so the api sends no last session: never "No sessions yet", which is a
    // claim about sessions this coach was never given (ADR-0015 F1; staff nit 1 on EV-337m).
    const last = tile(page, "Last session");
    await expect(last.locator(".stat-card-value")).toHaveText("—");
    await expect(last.locator(".stat-card-foot")).toHaveText("Not shared");
    await expect(page.getByRole("main")).not.toContainText("No sessions yet");
  });

  test.describe("French", () => {
    test.use({ locale: "fr-FR" });
    test("the card, the numbers and the not-shared sentence", async ({ page }) => {
      await signInFrench(page);
      await page.goto(`/clients/${YANN}`);
      const review = region(page, "À traiter");
      await expect(review.locator(".alert-card")).toHaveCount(1);
      await expect(review.getByRole("link", { name: "Adapter le plan", exact: true })).toBeVisible();
      await expect(tile(page, "Assiduité cette semaine").locator(".stat-card-value")).toHaveText("0 / 2");

      await page.goto(`/clients/${MARA}`);
      await expect(region(page, "À traiter")).toContainText(
        "Les signaux d'alerte ont besoin des séances ou des pesées de ce client, qu'il n'a pas partagées."
      );
    });
  });
});

/* ═══ M4 — alert cards only for the flags this portal labels ════════════════════════════ */

test.describe("M4 — a code with no sentence draws no card and is never printed", () => {
  for (const [locale, review, noneShown] of [
    ["en-US", "To review", "No alert to show."],
    ["fr-FR", "À traiter", "Aucune alerte à afficher."],
  ] as const) {
    test.describe(locale, () => {
      test.use({ locale });
      test("PAIN_REPORTED alone, and a known code beside an unknown one", async ({ page }) => {
        if (locale === "fr-FR") await signInFrench(page);
        else await signIn(page);

        await page.goto(`/clients/${PABLO}`);
        const pablo = region(page, review);
        await expect(pablo.locator(".alert-card")).toHaveCount(0);
        await expect(pablo.locator(".count-chip")).toHaveCount(0);
        // The api said a flag fired: the page may not say none did (X7), and names no rule.
        await expect(pablo).toContainText(noneShown);
        await expect(pablo).not.toContainText(locale === "fr-FR" ? "Aucun signal d'alerte" : "No red flags");
        const pabloHtml = await (await page.request.get(`/clients/${PABLO}`)).text();
        expect(await page.locator("body").innerText()).not.toContain("PAIN_REPORTED");
        expect(pabloHtml).not.toContain("PAIN_REPORTED");

        await page.goto(`/clients/${QUENTIN}`);
        const quentin = region(page, review);
        await expect(quentin.locator(".alert-card")).toHaveCount(1);
        await expect(quentin.locator(".alert-card")).toHaveAttribute("data-flag", "MISSED_TWO_OR_MORE_SESSIONS");
        await expect(quentin.locator(".count-chip")).toHaveText(locale === "fr-FR" ? /^1\s*1 alerte$/ : /^1\s*1 alert$/);
        const quentinHtml = await (await page.request.get(`/clients/${QUENTIN}`)).text();
        expect(await page.locator("body").innerText()).not.toContain("SOMETHING_NEW");
        expect(quentinHtml).not.toContain("SOMETHING_NEW");
      });
    });
  }
});

/* ═══ M5 — one week is "last week" ═══════════════════════════════════════════════════════ */

test.describe("M5 — the sessions card names a one-week window in the singular", () => {
  test("English", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${WANDA}`);
    await expect(tile(page, "Sessions · last week")).toHaveCount(1);
    await expect(page.locator("body")).not.toContainText("last 1 weeks");
    await page.goto(`/clients/${LINA}`);
    await expect(tile(page, "Sessions · last 8 weeks")).toHaveCount(1);
  });

  test.describe("French", () => {
    test.use({ locale: "fr-FR" });
    test("« dernière semaine », and 8 weeks as before", async ({ page }) => {
      await signInFrench(page);
      await page.goto(`/clients/${WANDA}`);
      await expect(tile(page, "Séances · dernière semaine")).toHaveCount(1);
      await expect(page.locator("body")).not.toContainText("1 dernières semaines");
      await page.goto(`/clients/${LINA}`);
      await expect(tile(page, "Séances · 8 dernières semaines")).toHaveCount(1);
    });
  });
});

/* ═══ M6 — a free entry EQUAL to a code is coded; nothing else is (ruling 3) ════════════ */

test("M6 — injury chips: equality after normalising, never includes or a prefix", () => {
  const chips = (injuries: string[], copy: Copy) => codedInjuryLabels(injuries, copy).map(copy.client.injuryChip);
  // French: « Limitation : Bas du dos », with the no-break space before the colon that the copy writes.
  expect(chips(["lower back"], fr)).toEqual([fr.client.injuryChip("Bas du dos")]);
  expect(fr.client.injuryChip("Bas du dos")).toBe("Limitation : Bas du dos");
  expect(chips(["LOWER_BACK"], fr)).toEqual(["Limitation : Bas du dos"]);
  expect(chips(["lower back", "LOWER_BACK", " Lower-Back "], fr)).toEqual(["Limitation : Bas du dos"]);
  for (const sentence of ["lower back pain", "mal au dos le matin", "bas du dos", "my lower back", "lower"]) {
    expect(chips([sentence], fr), sentence).toEqual([]);
    expect(chips([sentence], en), sentence).toEqual([]);
  }
  expect(chips(["lower back"], en)).toEqual([en.client.injuryChip(en.guardrails.injuries.LOWER_BACK)]);
  // The routine tab is unchanged: the code gets its label, a sentence is passed through whole.
  expect(injuryLabels(["lower back", "lower back pain", "mal au dos le matin"], fr)).toEqual([
    "Bas du dos",
    "lower back pain",
    "mal au dos le matin",
  ]);
});

/* ═══ M7 — the summary reads can be made to fail, separately ═════════════════════════════ */

/** Path `/`: a cookie set from a /clients/… URL would get that path, and a second one beside it. */
async function failRead(page: Page, value: string) {
  await page.context().addCookies([{ name: "evoli_fixture_summary_read", value, url: new URL("/", page.url()).href }]);
}

test.describe("M7 — `evoli_fixture_summary_read`: the summary cards' unavailable state", () => {
  test("off: both cards draw their data", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${LINA}`);
    await expect(region(page, "Routine").getByRole("link", { name: "Open the plan" })).toBeVisible();
    await expect(region(page, "Nutrition").getByRole("link", { name: "See the week" })).toBeVisible();
  });

  test("the routine read answers 500: the programme card is unavailable, the nutrition card is not", async ({ page }) => {
    await signIn(page);
    await failRead(page, `routine:500:${LINA}`);
    const res = await page.goto(`/clients/${LINA}`);
    expect(res?.status()).toBe(200);
    await expect(region(page, "Routine")).toHaveText(/^Routine\s*This trainee's routine could not be loaded\.$/);
    await expect(region(page, "Nutrition").getByRole("link", { name: "See the week" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Lina M.");
    // Another client is untouched by the switch.
    await page.goto(`/clients/${DANA}`);
    await expect(region(page, "Routine").getByRole("link", { name: "Open the plan" })).toBeVisible();
  });

  test("the nutrition read answers 500: the nutrition card is unavailable, the programme card is not", async ({ page }) => {
    await signIn(page);
    await failRead(page, `nutrition:500:${LINA}`);
    await page.goto(`/clients/${LINA}`);
    await expect(region(page, "Nutrition")).toHaveText(/^Nutrition\s*This trainee's nutrition could not be loaded\.$/);
    await expect(region(page, "Routine").getByRole("link", { name: "Open the plan" })).toBeVisible();
  });

  test("a 403 on either read is the link ending between reads: the denial page", async ({ page }) => {
    await signIn(page);
    for (const read of ["routine", "nutrition"]) {
      await failRead(page, `${read}:403:${LINA}`);
      await page.goto(`/clients/${LINA}`);
      await page.waitForURL("/clients/denied");
      await expect(page.locator("body")).not.toContainText("Intermediate Muscle Building Routine");
    }
  });

  test.describe("French", () => {
    test.use({ locale: "fr-FR" });
    test("« n'a pas pu être chargé » on each card", async ({ page }) => {
      await signInFrench(page);
      await failRead(page, `routine:500:${LINA}`);
      await page.goto(`/clients/${LINA}`);
      await expect(region(page, "Programme")).toContainText("Le programme de ce client n'a pas pu être chargé.");
      await failRead(page, `nutrition:500:${LINA}`);
      await page.goto(`/clients/${LINA}`);
      await expect(region(page, "Nutrition")).toContainText("La nutrition de ce client n'a pas pu être chargée.");
    });
  });

  test("no production code path reads the switch: only the fixture module names it", () => {
    const src = join(__dirname, "..", "src");
    const files = (function walk(dir: string): string[] {
      return readdirSync(dir).flatMap((e) => {
        const p = join(dir, e);
        return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(e) ? [p] : [];
      });
    })(src);
    const readers = files.filter((f) => readFileSync(f, "utf8").includes("evoli_fixture_summary_read"));
    expect(readers.map((f) => f.slice(src.length + 1))).toEqual(["lib/coachApi.fixture.ts"]);
  });
});

/* ═══ M8 — a targets save reaches the overview's nutrition card without a reload ═════════ */

test("M8 — save targets, then the Overview tab within 30 s shows them, with no reload", async ({ page }) => {
  await signIn(page);
  // The overview first, so a stale copy of it could be in the browser's router cache.
  await page.goto(`/clients/${LINA}`);
  const before = (await region(page, "Nutrition").innerText()).trim();
  await page.evaluate(() => ((window as unknown as { __m8: string }).__m8 = "same document"));

  await page.getByRole("main").getByRole("link", { name: "Nutrition", exact: true }).click();
  await page.waitForURL(`/clients/${LINA}/nutrition`);
  await openTargetsForm(page);
  await page.getByLabel("Calories").fill("2345");
  await page.getByLabel("Protein").fill("161");
  await page.getByRole("button", { name: "Save targets" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Save targets" }).click();
  await expect(page.getByText("Targets saved.")).toBeVisible();

  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await page.waitForURL(`/clients/${LINA}`);
  const card = region(page, "Nutrition");
  await expect(card).toContainText("2,345 kcal · 161 g protein");
  expect(before).not.toContain("2,345");
  // A soft navigation: the document (and the marker on it) survived.
  expect(await page.evaluate(() => (window as unknown as { __m8?: string }).__m8)).toBe("same document");
});
