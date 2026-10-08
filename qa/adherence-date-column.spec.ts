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

function problems(found: Row[]): string[] {
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
  if (lefts.size !== 1 || rights.size !== 1) out.push(`the date cells do not line up: ${JSON.stringify(found.map((r) => r.cell))}`);
  return out;
}

async function openOverview(page: Page, lang: keyof typeof T, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`/clients/${LINA}`);
  await expect(rows(page, lang)).toHaveCount(8);
  await page.evaluate(() => document.fonts.ready);
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
  });
}
