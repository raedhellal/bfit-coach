import { expect, type Locator, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";

/**
 * BUG-707 — the adherence series' week dates fit their column, and the gap to the bar is clear.
 *
 * The rows were each a grid with a FIXED 76 px date column, and the French dates are wider:
 * « 28 sept. 2026 » is 82.5 px at 12.5 px, so it ran into the 10 px gap before the bar (EN
 * « 24 Aug 2026 », 77.1 px, too). The column is now sized to the widest date and shared by
 * every row (a subgrid of the list).
 *
 * Measured per row, EN and FR, at 390 / 768 / 1440: the date's TEXT (a Range over it, not its
 * box, which is the cell) ends inside its cell, and the bar's cell starts at least the 10 px
 * gap after the text. Every row is read in the same frame, so the dates are whatever the
 * fixture's clock puts on screen today.
 *
 * The third test is the browser WITHOUT subgrid (staff S1): the `@supports` block in
 * globals.css is deleted from the CSSOM (its absence is asserted, so the test cannot pass on
 * a rule it never found), and each row must still be one line of date, bar and figure, in that
 * order, with the gap clear. Only the cross-row alignment is allowed to go.
 *
 * Which dates show depends on the day the page is viewed, so the second test does not rely
 * on it: it writes a wide date (FR: the widest QA measured) into EVERY date cell and reads again. A column
 * sized to its content widens to it and the rows stay aligned; a fixed one does not.
 */

const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
const GAP = 10;
/** Sub-pixel rounding between a Range rect and a box rect. */
const EPS = 0.5;

const T = {
  en: { locale: "en-US", title: "Adherence, last 8 weeks", widest: "28 Sept 2026" },
  fr: { locale: "fr-FR", title: "Assiduité, 8 dernières semaines", widest: "28 sept. 2026" },
} as const;

type Row = { date: string; text: { left: number; right: number }; cell: { left: number; right: number }; barLeft: number };

function rows(page: Page, lang: keyof typeof T): Locator {
  return page.getByRole("region", { name: T[lang].title, exact: true }).locator("ul > li");
}

async function readRows(list: Locator): Promise<Row[]> {
  return list.evaluateAll((lis) =>
    lis.map((li) => {
      const [date, bar] = Array.from(li.children) as HTMLElement[];
      const range = document.createRange();
      range.selectNodeContents(date);
      const text = range.getBoundingClientRect();
      const cell = date.getBoundingClientRect();
      return {
        date: date.textContent ?? "",
        text: { left: text.left, right: text.right },
        cell: { left: cell.left, right: cell.right },
        barLeft: bar.getBoundingClientRect().left,
      };
    })
  );
}

function problems(found: Row[], aligned = true): string[] {
  const out: string[] = [];
  for (const r of found) {
    const w = (r.text.right - r.text.left).toFixed(1);
    if (r.text.right > r.cell.right + EPS) {
      out.push(`« ${r.date} » ${w} px ends ${(r.text.right - r.cell.right).toFixed(1)} px past its cell`);
    }
    if (r.barLeft - r.text.right < GAP - EPS) {
      out.push(`« ${r.date} » leaves ${(r.barLeft - r.text.right).toFixed(1)} px before the bar (gap ${GAP})`);
    }
  }
  // Aligned: one date column for every row.
  const lefts = new Set(found.map((r) => Math.round(r.cell.left)));
  const rights = new Set(found.map((r) => Math.round(r.cell.right)));
  if (aligned && (lefts.size !== 1 || rights.size !== 1)) out.push(`the date cells do not line up: ${JSON.stringify(found.map((r) => r.cell))}`);
  return out;
}

async function openOverview(page: Page, lang: keyof typeof T, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`/clients/${LINA}`);
  await expect(rows(page, lang)).toHaveCount(8);
  await page.evaluate(() => document.fonts.ready);
}

/** Deletes every `@supports (… subgrid …)` block that styles `.adherence-week`; returns how many. */
async function withoutSubgrid(page: Page): Promise<number> {
  return page.evaluate(() => {
    let removed = 0;
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules;
      } catch {
        continue; // a cross-origin sheet: not ours
      }
      for (let i = rules.length - 1; i >= 0; i -= 1) {
        const rule = rules[i];
        if (rule instanceof CSSSupportsRule && rule.conditionText.includes("subgrid") && rule.cssText.includes(".adherence-week")) {
          sheet.deleteRule(i);
          removed += 1;
        }
      }
    }
    return removed;
  });
}

/** Each row is ONE line: date, then bar, then figure, side by side and vertically overlapping. */
async function rowsOnOneLine(list: Locator): Promise<string[]> {
  return list.evaluateAll((lis) =>
    lis.flatMap((li) => {
      const [date, bar, figure] = (Array.from(li.children) as HTMLElement[]).map((e) => e.getBoundingClientRect());
      const out: string[] = [];
      const label = li.children[0]?.textContent ?? "?";
      if (!(date.right <= bar.left + 0.5 && bar.right <= figure.left + 0.5)) out.push(`« ${label} »: date, bar and figure are not side by side`);
      // A week with no bar (no plan, or still running) holds an EMPTY cell, 0 px high: the
      // line is then read from the date and the figure alone.
      const boxes = bar.height > 0 ? [date, bar, figure] : [date, figure];
      const top = Math.max(...boxes.map((b) => b.top));
      const bottom = Math.min(...boxes.map((b) => b.bottom));
      if (bottom <= top) out.push(`« ${label} »: date, bar and figure are not on one line (stacked)`);
      if (bar.width < 40) out.push(`« ${label} »: the bar's cell is ${bar.width.toFixed(1)} px wide`);
      return out;
    })
  );
}

for (const lang of ["fr", "en"] as const) {
  test.describe(`BUG-707 (${lang})`, () => {
    test.use({ locale: T[lang].locale });

    test("every week date fits its column and leaves the gap to the bar clear, at 390 / 768 / 1440", async ({ page }) => {
      await signInThroughForm(page, { lang });
      for (const width of [390, 768, 1440]) {
        await openOverview(page, lang, width);
        const found = await readRows(rows(page, lang));
        expect(found, `${lang} at ${width}: eight rows read`).toHaveLength(8);
        expect(problems(found), `${lang} at ${width}`).toEqual([]);
      }
    });

    test("the column follows its content: the widest date in every row still fits (clock-independent)", async ({ page }) => {
      await signInThroughForm(page, { lang });
      for (const width of [390, 768, 1440]) {
        await openOverview(page, lang, width);
        await rows(page, lang).evaluateAll((lis, widest) => {
          for (const li of lis) (li.children[0] as HTMLElement).textContent = widest;
        }, T[lang].widest);
        const found = await readRows(rows(page, lang));
        expect(found.every((r) => r.date === T[lang].widest)).toBe(true);
        expect(problems(found), `${lang} at ${width}, every date « ${T[lang].widest} »`).toEqual([]);
      }
    });

    test("without subgrid each row is still one line of date, bar and figure, with the gap clear", async ({ page }) => {
      await signInThroughForm(page, { lang });
      for (const width of [390, 768, 1440]) {
        await openOverview(page, lang, width);
        expect(await withoutSubgrid(page), `${lang} at ${width}: the @supports (subgrid) block was found and removed`).toBeGreaterThan(0);
        await expect
          .poll(() => rows(page, lang).first().evaluate((li) => getComputedStyle(li).gridTemplateColumns.includes("subgrid")))
          .toBe(false);
        const list = rows(page, lang);
        expect(await rowsOnOneLine(list), `${lang} at ${width}, no subgrid`).toEqual([]);
        expect(problems(await readRows(list), false), `${lang} at ${width}, no subgrid`).toEqual([]);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `${lang} at ${width}, no subgrid: sideways scroll`).toBeLessThanOrEqual(1);
      }
    });
  });
}
