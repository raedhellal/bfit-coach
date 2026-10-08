import { expect, type Locator, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";
import { signInFrench } from "./french";
import { expectNoSidewaysScroll, expectUnoccluded } from "./layout";
import { en, type Copy } from "../src/lib/copy";
import { fr } from "../src/lib/copy.fr";

/**
 * EV-345 (A16 remainder) — at 768–1279 px the client overview is one screen shorter.
 *
 * The height itself (EV-345.2 = EV-342j J.3 as restated) is pinned in
 * `overview-one-session-list.spec.ts`, under the title the PO prescribed. This file pins the
 * layout that gets there and EV-345.3 / .4's "nothing is lost, nothing moves outside the band":
 *
 *   · in the band (768, 1024, 1279): « Recent activity » beside the routine and nutrition
 *     summaries; the weight trend beside « Adherence, last 8 weeks »; « Progress and milestone »
 *     across the row below, under the trend; a lone alert's action beside its title. No two
 *     blocks overlap, nothing scrolls sideways, nothing is cut with an ellipsis, every control
 *     is ≥ 44 px, there is one h1, and the blocks keep their DOM order (= Tab and screen-reader order; in the band the visual
 *     order is trend | series, then goal).
 *   · outside it (390, 1440): the three monitoring blocks stack full width in DOM order and the
 *     alert's action is under its evidence, as at EV-342j's merge. 1440 keeps its two-column
 *     activity row; 390 keeps one column. These, and Tobias's two stacked alert cards, pass on
 *     6caecb8 (before EV-345) as well; the band test and the J.3 heights fail there.
 *
 * Lina (every scope, one alert, ten sessions) is the page J.3 is measured on. Tobias has two
 * alerts, which keep the stacked card.
 */

const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
const TOBIAS = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0009";

type Box = { x: number; y: number; width: number; height: number };

async function box(locator: Locator, label: string): Promise<Box> {
  await expect(locator, `${label}: exactly one`).toHaveCount(1);
  const b = await locator.boundingBox();
  expect(b, `${label}: has a box`).not.toBeNull();
  return b as Box;
}

/** The overview's seven blocks, each found by its own landmark or heading — never by position. */
function blocks(page: Page, copy: Copy) {
  const main = page.getByRole("main");
  return {
    review: main.locator('section[aria-labelledby="ov-review"]'),
    activity: main.locator('section[aria-labelledby="ov-activity"]'),
    programme: main.locator('section[aria-labelledby="ov-programme"]'),
    nutrition: main.locator('section[aria-labelledby="ov-nutrition"]'),
    // The trend is a plain card (no landmark): the one card-level div that holds its title, as a
    // child of main (EV-342j's merge) or of `.ov-pair` (EV-345), so the 390/1440 checks below read
    // the same block on both trees and pass on both.
    trend: main
      .locator(":scope > div:not(.ov-pair), :scope > .ov-pair > div")
      .filter({ has: page.getByText(copy.client.weightTrend, { exact: true }) }),
    goal: main.getByRole("region", { name: copy.progressGoal.title, exact: true }),
    series: main.getByRole("region", { name: copy.client.adherenceSeries, exact: true }),
  };
}

const ORDER = ["review", "activity", "programme", "nutrition", "trend", "goal", "series"] as const;

/** The blocks follow one another in the document in ORDER (Tab and screen-reader order, not the band's visual order). */
async function expectDomOrder(page: Page, copy: Copy) {
  const b = blocks(page, copy);
  const handles = [];
  for (const key of ORDER) {
    await expect(b[key], `${key}: exactly one`).toHaveCount(1);
    handles.push(await b[key].elementHandle());
  }
  const following = await page.evaluate((els) => {
    const out: boolean[] = [];
    for (let i = 1; i < els.length; i++) {
      out.push(Boolean(els[i - 1]!.compareDocumentPosition(els[i]!) & Node.DOCUMENT_POSITION_FOLLOWING));
    }
    return out;
  }, handles);
  expect(following, `DOM order is ${ORDER.join(" → ")}`).toEqual(ORDER.slice(1).map(() => true));
}

/** No visible text inside main is cut: no ellipsis that is actually clipping, no line clamp. */
async function expectNothingCut(page: Page, label: string) {
  const cut = await page.getByRole("main").evaluate((main) =>
    [...main.querySelectorAll<HTMLElement>("*")]
      .filter((el) => {
        const cs = getComputedStyle(el);
        const clamped = cs.getPropertyValue("-webkit-line-clamp") !== "none" && cs.getPropertyValue("-webkit-line-clamp") !== "";
        return (cs.textOverflow === "ellipsis" && el.scrollWidth > el.clientWidth + 1) || clamped;
      })
      .map((el) => el.outerHTML.slice(0, 100))
  );
  expect(cut, `${label}: text cut`).toEqual([]);
}

/** Every visible link, button and field inside main is at least 44 × 44 px. */
async function expectTargets(page: Page, label: string) {
  const small = await page.getByRole("main").evaluate((main) =>
    [...main.querySelectorAll<HTMLElement>("a, button, input, select, textarea, summary")]
      .filter((el) => el.getClientRects().length > 0)
      .map((el) => ({ el: el.outerHTML.slice(0, 80), w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height }))
      .filter((c) => c.w < 44 || c.h < 44)
  );
  expect(small, `${label}: controls under 44 px`).toEqual([]);
}

for (const [lang, copy] of [
  ["en", en],
  ["fr", fr],
] as const) {
  test.describe(`EV-345 — the overview between 768 and 1279 px (${lang})`, () => {
    test.use({ locale: lang === "fr" ? "fr-FR" : "en-US" });

    test(`${lang}: two rows of two, the goal across, a lone alert's action beside its title, nothing lost`, async ({ page }) => {
      if (lang === "fr") await signInFrench(page);
      else await signInThroughForm(page);
      await page.goto(`/clients/${LINA}`);
      const b = blocks(page, copy);

      for (const width of [768, 1024, 1279]) {
        await page.setViewportSize({ width, height: 1024 });
        const at = `${width}px ${lang}`;

        // Row 1: the activity on the left, the routine and nutrition summaries stacked on the right.
        const act = await box(b.activity, `activity ${at}`);
        const prog = await box(b.programme, `programme ${at}`);
        const nutr = await box(b.nutrition, `nutrition ${at}`);
        expect(Math.abs(act.y - prog.y), `${at}: activity and routine summary share a top`).toBeLessThanOrEqual(1);
        expect(prog.x, `${at}: the summaries are right of the activity`).toBeGreaterThanOrEqual(act.x + act.width);
        expect(nutr.y, `${at}: nutrition under the routine summary`).toBeGreaterThanOrEqual(prog.y + prog.height);
        expect(Math.abs(nutr.x - prog.x), `${at}: nutrition in the summaries' column`).toBeLessThanOrEqual(1);

        // Row 2: the trend left, the series right; the goal across the whole row below both.
        const trend = await box(b.trend, `trend ${at}`);
        const series = await box(b.series, `series ${at}`);
        const goal = await box(b.goal, `goal ${at}`);
        expect(trend.y, `${at}: row 2 starts under row 1`).toBeGreaterThanOrEqual(Math.max(act.y + act.height, nutr.y + nutr.height));
        expect(Math.abs(trend.y - series.y), `${at}: trend and series share a top`).toBeLessThanOrEqual(1);
        expect(series.x, `${at}: the series is right of the trend`).toBeGreaterThanOrEqual(trend.x + trend.width);
        expect(goal.y, `${at}: the goal is under both`).toBeGreaterThanOrEqual(Math.max(trend.y + trend.height, series.y + series.height));
        expect(Math.abs(goal.x - trend.x), `${at}: the goal starts under the trend`).toBeLessThanOrEqual(1);
        expect(Math.abs(goal.x + goal.width - (series.x + series.width)), `${at}: the goal ends under the series`).toBeLessThanOrEqual(1);

        // Nothing painted over anything: each side-by-side pair, hit-tested at its centre.
        await expectUnoccluded(page, b.activity.getByRole("heading", { level: 2 }), { over: b.programme, label: `activity title ${at}` });
        await expectUnoccluded(page, b.trend.getByText(copy.client.weightTrend, { exact: true }), { over: b.series, label: `trend title ${at}` });

        // The lone alert: its action to the right of the title, not overlapping it, and 44 px tall.
        const alert = b.review.locator(".alert-card");
        await expect(alert).toHaveCount(1);
        const title = await box(alert.getByRole("heading", { level: 3 }), `alert title ${at}`);
        const action = alert.getByRole("link", { name: copy.client.adjustPlan, exact: true });
        const act2 = await box(action, `alert action ${at}`);
        expect(act2.x, `${at}: the action is right of the title`).toBeGreaterThanOrEqual(title.x + title.width);
        expect(act2.y + act2.height, `${at}: the action does not hang under the title`).toBeLessThanOrEqual(title.y + title.height + 1);
        await expectUnoccluded(page, action, { over: alert.getByRole("heading", { level: 3 }), label: `alert action ${at}` });

        await expectNoSidewaysScroll(page, `/clients/Lina at ${at}`);
        await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
        await expectNothingCut(page, at);
        await expectTargets(page, at);
      }
      await expectDomOrder(page, copy);
    });
  });
}

test.describe("EV-345 — two alerts keep the stacked card in the band", () => {
  test("Tobias at 768: each card's action is under its evidence", async ({ page }) => {
    await signInThroughForm(page);
    await page.goto(`/clients/${TOBIAS}`);
    await page.setViewportSize({ width: 768, height: 1024 });
    const action = page.getByRole("link", { name: en.client.adjustPlan, exact: true });
    const card = page.locator(".alert-card").filter({ has: action });
    const title = await box(card.getByRole("heading", { level: 3 }), "Tobias's missed-sessions title");
    const a = await box(action, "Tobias's action");
    expect(a.y, "the action is under the title").toBeGreaterThanOrEqual(title.y + title.height);
  });
});

test.describe("EV-345.4 — outside the band the overview is as at EV-342j's merge", () => {
  for (const width of [390, 1440]) {
    test(`${width} px: the trend, the goal and the series stack full width in DOM order; the alert's action is under its title`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await signInThroughForm(page);
      await page.goto(`/clients/${LINA}`);
      const b = blocks(page, en);
      const trend = await box(b.trend, "trend");
      const goal = await box(b.goal, "goal");
      const series = await box(b.series, "series");
      expect(goal.y, "goal under the trend").toBeGreaterThanOrEqual(trend.y + trend.height);
      expect(series.y, "series under the goal").toBeGreaterThanOrEqual(goal.y + goal.height);
      for (const [name, other] of [
        ["goal", goal],
        ["series", series],
      ] as const) {
        expect(Math.abs(other.x - trend.x), `${name} aligned with the trend`).toBeLessThanOrEqual(1);
        expect(Math.abs(other.width - trend.width), `${name} as wide as the trend`).toBeLessThanOrEqual(1);
      }
      // `.ov-pair` (EV-345) is not a box out here: it lays nothing out. (Absent at EV-342j's
      // merge, where these checks pass too: that is what makes them "unchanged" witnesses.)
      for (const pair of await page.locator(".ov-pair").all()) await expect(pair).toHaveCSS("display", "contents");

      const act = await box(b.activity, "activity");
      const prog = await box(b.programme, "programme");
      if (width >= 1280) {
        expect(Math.abs(act.y - prog.y), "1440: the activity row is two columns, as before").toBeLessThanOrEqual(1);
      } else {
        expect(prog.y, "390: one column, as before").toBeGreaterThanOrEqual(act.y + act.height);
      }

      const alert = b.review.locator(".alert-card");
      const title = await box(alert.getByRole("heading", { level: 3 }), "alert title");
      const action = await box(alert.getByRole("link", { name: en.client.adjustPlan, exact: true }), "alert action");
      expect(action.y, "the action is under the title, as before").toBeGreaterThanOrEqual(title.y + title.height);
      await expectDomOrder(page, en);
    });
  }
});
