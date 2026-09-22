import { expect, test, type Page } from "@playwright/test";
import { atEachWidth, expectNoSidewaysScroll, expectUnoccluded } from "./layout";

/**
 * EV-187b — the monitoring blocks on the trainee's page: AC1 (scope blanking), AC3 (the
 * 8-week adherence series), AC4 (a red flag with its evidence), AC5 (the last ten
 * sessions) and AC6 (read-only, by a closed list).
 *
 * Fixture mode, default config: the roster is the `empty` scenario but every trainee id
 * below is answerable — which is how this suite has always driven per-trainee states,
 * and is how b-fit-api behaves too (the roster and the per-trainee reads are separate
 * calls). AC2's roster triage needs rows, so it lives in `coach-roster-triage.spec.ts`
 * against the populated scenario.
 *
 * What each trainee is here to prove:
 *   Lina   — ALL scopes, 12 sessions, one flag with evidence, a week with no plan.
 *   Tobias — ALL scopes, BOTH live rules fired, a 7 / 7 week, a real last weigh-in.
 *   Nils   — ALL scopes, SIX sessions ("of the last 6", never "of the last 10"), no flags.
 *   Sara   — PROGRESS + WEIGH_INS, no WORKOUTS: the workout blocks are ABSENT, and she
 *            is the one trainee for whom "Never weighed in" is true.
 *   Kaia   — ALL scopes and no data at all (edge case 1): every empty state at once.
 *   Yusuf  — WORKOUTS only: no PROGRESS, so the monitoring read is 403 and the blocks
 *            must say so from `scopes` and not from the status.
 */

const EMAIL = "coach@evoli.fit";
const PASSWORD = "Password123!";

const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
const NILS = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0002";
const SARA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0003";
const YUSUF = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0007";
const TOBIAS = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0009";
const KAIA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0010";

const NOT_SHARED_PROGRESS = "This trainee has not shared their progress with you.";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/");
}

/**
 * One monitoring block, by its landmark.
 *
 * `getByRole("region", …)` and not a `div` filtered by text: filtering divs by text
 * resolves to the INNERMOST element containing the string, which is the title itself —
 * a locator that is always "found" and contains nothing but the title, so every
 * assertion about the block's BODY passes or fails for the wrong reason. This cost the
 * first draft of this spec six red tests that were all really one defect in the
 * selector. `MonitoringBlock` renders a named `<section>` for exactly this, and for the
 * screen-reader navigation it also buys.
 */
function block(page: Page, title: string) {
  return page.getByRole("region", { name: title });
}

/** Every "<done> / <planned> sessions" line of the adherence series, in render order. */
async function weekLines(page: Page): Promise<string[]> {
  return page
    .getByText(/^\d+ \/ \d+ sessions$/)
    .allTextContents();
}

test.describe("AC3 — adherence over eight weeks, not one", () => {
  test("eight weeks render, oldest first, each with its own figures", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${LINA}`);

    await expect(page.getByText("Adherence, last 8 weeks")).toBeVisible();

    // One row per ISO week: seven with figures and one "No plan" week. AC3 seeds a week
    // that started before the plan existed, and it must NOT be a 0 % week.
    const lines = await weekLines(page);
    expect(lines.length + 1, "eight ISO weeks, one of them without a plan").toBe(8);
    await expect(page.getByText("No plan", { exact: true })).toHaveCount(1);

    /**
     * AC3: "one headline line whose two numbers equal the sums of the series (QA adds
     * them up by hand)". This is that addition, done by the spec rather than trusted.
     */
    const totals = lines.reduce(
      (sum, line) => {
        const [done, planned] = line.match(/\d+/g)!.map(Number);
        return { done: sum.done + done, planned: sum.planned + planned };
      },
      { done: 0, planned: 0 }
    );
    await expect(
      page.getByText(
        `${totals.done} of ${totals.planned} planned sessions in the last 8 weeks`
      )
    ).toBeVisible();
  });

  test("the current week agrees with the shipped 'adherence this week' block", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/clients/${LINA}`);

    // The shipped EV-183 tile, read off the same screen at the same moment.
    const tile = page.getByText("Adherence this week", { exact: true }).locator("..");
    const shipped = (await tile.textContent())?.match(/(\d+)\s*\/\s*(\d+)/);
    expect(shipped, "the shipped adherence tile must still read <done> / <planned>").not.toBeNull();

    // The LAST row of the series is the current week, and AC3 requires the two to be
    // identical — this is the assertion that catches a series bucketed a day out.
    const lines = await weekLines(page);
    expect(lines[lines.length - 1]).toBe(`${shipped![1]} / ${shipped![2]} sessions`);
  });

  test("a week with no plan is 'No plan', and no week is rendered as a percentage", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/clients/${LINA}`);
    const series = block(page, "Adherence, last 8 weeks");
    // ADR-0012 D6 and AC3's "not a 0 % adherence week", in the strongest form available:
    // the card renders no percentage for ANY week, so a Monday cannot read as one.
    await expect(series).not.toContainText("%");
    await expect(series).not.toContainText("NaN");
  });

  /**
   * 🔴 **THE BAR AND THE NUMBER BESIDE IT ARE ONE FACT.**
   *
   * The suite rendered a FULL bar next to "2 / 4 sessions" and stayed green: every
   * assertion here was about text, and the bar is `aria-hidden` and carried no text to
   * assert. The staff review caught it by rendering the page and reading `width:` off
   * the fill span by hand, which is not a gate.
   *
   * So the fill carries `data-fill` — the same number its width is set from — and this
   * test recomputes it from the row's own printed figures. It fails on the old code in
   * both directions: a full bar beside 2 / 4 (reassuring a coach about a client who is
   * behind) and an empty bar beside 1 / 3 on a Monday.
   */
  test("every drawn bar equals the figures printed beside it", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${LINA}`);

    const rows = block(page, "Adherence, last 8 weeks").getByRole("listitem");
    await expect(rows).toHaveCount(8);

    let drawn = 0;
    for (let i = 0; i < 8; i += 1) {
      const row = rows.nth(i);
      /**
       * The LAST span of the row, not the row's own text: the date column renders
       * "10 Aug 2026" immediately before the figures, so reading the whole row gives
       * "10 Aug 20263 / 4 sessions" and a digit-greedy match pulls "20263 / 4" out of it.
       * That is not a hypothetical — it is what this test did on its first run.
       */
      const label = (await row.locator("span").last().textContent())!;
      const fill = row.locator("[data-fill]");
      const figures = label.match(/^(\d+) \/ (\d+) sessions$/);

      if ((await fill.count()) === 0) {
        /**
         * The only two weeks allowed to draw nothing: one with no plan, and the
         * in-progress one. The current week is the LAST row, so "no bar" anywhere else
         * with figures present would be a week silently missing its picture.
         */
        const isNoPlan = label.includes("No plan");
        expect(
          isNoPlan || i === 7,
          `week ${i + 1} ("${label}") draws no bar and is neither the no-plan week nor the current one`
        ).toBe(true);
        continue;
      }

      drawn += 1;
      expect(figures, `a drawn bar on a row with no figures: "${label}"`).not.toBeNull();
      const [, done, planned] = figures!.map(Number);
      const expected = planned > 0 ? Math.round(Math.min(1, done / planned) * 100) : 0;
      expect(
        Number(await fill.getAttribute("data-fill")),
        `week ${i + 1} prints "${done} / ${planned} sessions" and draws a different bar`
      ).toBe(expected);
    }

    // …and the check above cannot pass by finding no bars at all.
    expect(drawn, "no week drew a bar, so the agreement was never tested").toBeGreaterThan(3);
  });

  test("the in-progress week draws no bar at all", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${LINA}`);

    const rows = block(page, "Adherence, last 8 weeks").getByRole("listitem");
    // A week that has not finished has no proportion to draw: three of five days done is
    // not 60 % of anything yet, and drawing it against either denominator asserts
    // something the week cannot support. Its figures still stand, and they are still the
    // shipped block's figures — AC3's "identical" clause lives on the LABEL.
    await expect(rows.nth(7).locator("[data-fill]")).toHaveCount(0);
    await expect(rows.nth(7)).toContainText(/\d+ \/ \d+ sessions/);
  });

  test("a trainee with no history renders one sentence and no chart", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${KAIA}`);

    await expect(page.getByText("No sessions in the last 8 weeks")).toBeVisible();
    // Edge case 1: no axis full of zeroes, no "0 / 0", no NaN, no division by zero.
    expect(await weekLines(page)).toEqual([]);
    const series = block(page, "Adherence, last 8 weeks");
    await expect(series).not.toContainText("0 / 0");
    await expect(series).not.toContainText("NaN");
  });
});

test.describe("AC4 — a red flag shows its evidence and its age", () => {
  test("the missed-sessions flag lists the dates and the session names", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${LINA}`);

    await expect(
      page.getByText("Missed 2 or more planned sessions this week")
    ).toBeVisible();
    await expect(page.getByText("Missed sessions", { exact: true })).toBeVisible();
    /**
     * The names the fixture scheduled on the missed days — AC4's "the name of the
     * session that was scheduled on each", without a second click.
     *
     * Scoped to the FLAG's own list item, because those names also appear in the session
     * history further down the page: an unscoped match would be green whether or not the
     * evidence block carries them at all.
     */
    const flag = page
      .getByText("Missed 2 or more planned sessions this week")
      .locator("xpath=ancestor::li[1]");
    await expect(flag).toContainText("Lower Body B");
    await expect(flag).toContainText("Upper Body B");
    // Two missed days, each its own row: AC4's "as a list the coach can read".
    await expect(flag.getByRole("listitem")).toHaveCount(2);
  });

  test("both live rules fire on one page, with their two different evidence shapes", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/clients/${TOBIAS}`);

    await expect(page.getByText("Missed 2 or more planned sessions this week")).toBeVisible();
    await expect(page.getByText("No weigh-in for 14 days")).toBeVisible();
    // A real date and its age — the sentence BUG-197's fix reserved for a trainee who
    // HAS weighed in. "Never weighed in" would be a lie about this trainee.
    await expect(page.getByText(/^Last weigh-in .+ — 21 days ago$/)).toBeVisible();
    await expect(page.getByText("Never weighed in")).toHaveCount(0);
  });

  test("'Never weighed in' is reserved for a trainee who never has", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${SARA}`);
    await expect(page.getByText("No weigh-in for 14 days")).toBeVisible();
    await expect(page.getByText("Never weighed in")).toBeVisible();
    await expect(page.getByText(/Last weigh-in /)).toHaveCount(0);
  });

  test("a trainee with no fired flag has no evidence block at all", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${NILS}`);

    await expect(page.getByText("No red flags")).toBeVisible();
    // The converse AC4 asks for: no evidence is rendered for a flag that did not fire.
    await expect(page.getByText("Missed sessions", { exact: true })).toHaveCount(0);
    await expect(page.getByText(/Last weigh-in /)).toHaveCount(0);
    await expect(page.getByText("Never weighed in")).toHaveCount(0);
  });
});

test.describe("AC5 — the last ten sessions, with what the trainee said", () => {
  test("ten rows, and a summary whose four numbers sum to the rows shown", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${LINA}`);

    const summary = page.getByText(/^Of the last \d+ sessions: /);
    await expect(summary).toBeVisible();
    const text = (await summary.textContent())!;
    const [returned, easy, ok, hard, none] = text.match(/\d+/g)!.map(Number);
    expect(returned, "the cap is server-side: twelve completed sessions return ten").toBe(10);
    expect(easy + ok + hard + none, "the four numbers must sum to the rows shown").toBe(returned);
    expect(text).toContain(`${easy} easy · ${ok} OK · ${hard} hard · ${none} no feedback`);

    const history = block(page, "Recent sessions");
    await expect(history.getByRole("listitem")).toHaveCount(10);
  });

  test("the newest row is the session the shipped 'Last session' block names", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/clients/${LINA}`);

    /**
     * `ancestor::div[2]` because `StatTile` paints the value ABOVE the label in two
     * sibling divs inside the tile: `getByText("Last session").locator("..")` is the
     * label's own wrapper and carries no date at all, which is how this assertion first
     * failed on a null match instead of on a mismatch.
     */
    const tile = page
      .getByText("Last session", { exact: true })
      .locator("xpath=ancestor::div[1]");
    const tileText = (await tile.textContent())!;
    expect(tileText, "the shipped Last session tile must carry a date").toMatch(
      /\d{1,2} \w{3,5} \d{4}/
    );
    const newest = (await block(page, "Recent sessions")
      .getByRole("listitem")
      .first()
      .textContent())!;

    // The same date, the same session and the same difficulty, compared on one screen.
    const date = tileText.match(/\d{1,2} \w{3,5} \d{4}/)![0];
    expect(newest).toContain(date);
    expect(newest).toContain("Upper Body A");
    expect(newest).toContain("Hard");
  });

  test("a trainee with fewer than ten sessions names the real count", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${NILS}`);

    await expect(page.getByText(/^Of the last 6 sessions: /)).toBeVisible();
    await expect(page.getByText(/^Of the last 10 sessions: /)).toHaveCount(0);
    await expect(block(page, "Recent sessions").getByRole("listitem")).toHaveCount(6);
    // A session the trainee gave no feedback on reads the sentence, not a blank cell.
    await expect(page.getByText("No feedback given").first()).toBeVisible();
  });

  test("a trainee with zero completed sessions renders a sentence, not an empty table", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/clients/${KAIA}`);

    await expect(page.getByText("No completed sessions yet")).toBeVisible();
    await expect(block(page, "Recent sessions").getByRole("listitem")).toHaveCount(0);
    await expect(page.getByText(/^Of the last /)).toHaveCount(0);
  });
});

test.describe("AC1 — a missing scope is a sentence, never a zero", () => {
  for (const [name, id] of [
    ["WORKOUTS only (no PROGRESS)", YUSUF],
    ["PROGRESS + WEIGH_INS (no WORKOUTS)", SARA],
  ] as const) {
    test(`${name}: the workout blocks say so, with no number in them`, async ({ page }) => {
      await signIn(page);
      const response = await page.goto(`/clients/${id}`);
      // The monitoring endpoint 403s for Yusuf — and the PAGE is still a 200. A denial
      // on one block may not take the trainee's whole page with it.
      expect(response?.status()).toBe(200);

      for (const title of ["Adherence, last 8 weeks", "Recent sessions"]) {
        const region = block(page, title);
        await expect(region).toContainText(NOT_SHARED_PROGRESS);
        /**
         * AC1: "no number, no zero, no empty chart and no '0 sessions' appears in any of
         * them". The title carries the only legitimate digit on the card ("8 weeks"), so
         * it is removed along with the sentence and ANY remaining digit is data this
         * coach was not given.
         */
        const text = (await region.textContent())!;
        expect(text.replace(title, "").replace(NOT_SHARED_PROGRESS, "")).not.toMatch(/\d/);
      }
    });
  }

  test("the not-shared sentence is never rendered because the api was unreachable", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/clients/${LINA}`);
    // Lina shares everything, so neither block may carry a consent sentence — the
    // portal decides from `scopes` and never from a status code.
    await expect(page.getByText(NOT_SHARED_PROGRESS)).toHaveCount(0);
    await expect(page.getByText("These blocks could not be loaded.")).toHaveCount(0);
  });
});

test.describe("AC6 — the page is read-only, by a closed list", () => {
  /**
   * ⚠️ **AMENDED BY EV-202b, and narrowed rather than relaxed.**
   *
   * This test asserted that the whole page carried NO field and exactly one button.
   * EV-202b authorises one form on it — the coaching start date and the milestone
   * weight, the two values EV-202 Ruling 1 lets a coach write — so the page-wide
   * version of the claim is now false, and leaving it as a `.skip` or deleting it
   * would take EV-187 AC6's coverage with it.
   *
   * What it asserts instead is the same property drawn where it is still true and
   * where it still catches something:
   *   · EV-187's own two blocks contain no control at all — the monitoring read stays
   *     a read, and the story's "it is not one control away from writing" holds of the
   *     adherence series and the session history;
   *   · the page's controls remain a CLOSED LIST by accessible name, now three items
   *     long. A fourth still fails here, by name, rather than by review.
   */
  test("nothing on the monitoring page can write", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${LINA}`);

    for (const title of ["Adherence, last 8 weeks", "Recent sessions"]) {
      await expect(
        block(page, title).locator("input, textarea, select, button"),
        `${title} is a read, and must carry no control`
      ).toHaveCount(0);
    }

    /**
     * The two fields EV-202b adds, and no third. AC2 counts them inside its own block;
     * this counts them across the whole page, which is what catches a field arriving
     * somewhere else on it.
     */
    await expect(page.locator("main").locator("input, textarea, select")).toHaveCount(2);

    /**
     * Every button on the page, by accessible name, against AC6's closed list. The
     * revoke menu is EV-183's (iii→ the client-level control) and is the only one; a
     * new button arriving here fails this test by name rather than by review.
     */
    const names = await page
      .locator("main")
      .getByRole("button")
      .evaluateAll((els) =>
        els.map((el) =>
          (
            el.getAttribute("aria-label") ||
            el.getAttribute("title") ||
            el.textContent ||
            ""
          ).trim()
        )
      );
    /**
     * "More" is EV-183's revoke menu — AC6 item (ii)'s client-level control. "Save" is
     * EV-202b's, and it is the ONLY write on this page. The shell's "Sign out" is
     * chrome and is scoped out above. A new control arriving here fails by name.
     */
    expect(names.sort()).toEqual(["More", "Save"]);
  });
});

test.describe("responsive — the narrow widths this repo sweeps", () => {
  test("the series and the session list survive 320–414 px", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${TOBIAS}`);

    await atEachWidth(page, async () => {
      await expectNoSidewaysScroll(page, "the trainee monitoring page");
      // Edge case 2: a 7 / 7 week must not overflow its bar or wrap its label.
      await expectUnoccluded(page, page.getByText("7 / 7 sessions"), {
        label: "the 7 / 7 week",
      });
      await expectUnoccluded(page, page.getByText("No weigh-in for 14 days"), {
        label: "the weigh-in red flag",
      });
    });
  });
});
