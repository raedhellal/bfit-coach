import { expect, type Locator, type Page } from "@playwright/test";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE LAYOUT ASSERTION THAT `toBeVisible()` IS NOT.
 *
 * EV-201's first cut passed its own suite, a review and a merge, and shipped a field
 * painted UNDER the exercise count with the page scrolling sideways at 320 and 360 px.
 * Every assertion it carried was green, for two structural reasons:
 *
 *   1. **`toBeVisible()` is blind to occlusion.** It asks whether the element has a
 *      non-empty bounding box and is not `display:none` / `visibility:hidden` /
 *      `opacity:0`. An element with a perfectly good box, painted under an opaque
 *      sibling, is "visible" to Playwright and invisible to a coach.
 *   2. **One viewport width is one data point.** The regression was invisible at
 *      exactly 390 — the width the screen was designed at — and broke at 320 and 360.
 *      A single-width assertion is a sample, not a sweep.
 *
 * So: a box-intersection check AND a hit test, at four widths, every time.
 *
 * ⚠ `elementFromPoint` is VIEWPORT-relative. Below the fold it answers `null`, which is
 * inconclusive and NOT a pass — so the element is scrolled into view first and a null
 * answer is a failure with its own message rather than a silent skip.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** The widths EV-201's regression lived and died at. 390 alone would have missed it. */
export const WIDTHS = [320, 360, 390, 414] as const;

type Box = { x: number; y: number; width: number; height: number };

function overlaps(a: Box, b: Box): boolean {
  // Zero-area intersection is not an overlap: two boxes that share an edge are adjacent.
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0.5 && h > 0.5;
}

/**
 * `subject` is on screen, not painted under `over`, and answerable at its own centre.
 *
 * `over` is the element the subject is at risk of colliding with — a sibling in the same
 * flex row, usually. Passing none checks the hit test alone.
 */
export async function expectUnoccluded(
  page: Page,
  subject: Locator,
  options: { over?: Locator; label: string }
): Promise<void> {
  await subject.scrollIntoViewIfNeeded();
  const box = await subject.boundingBox();
  expect(box, `${options.label}: has no bounding box at ${page.viewportSize()?.width}px`).not.toBeNull();
  const a = box as Box;
  expect(a.width, `${options.label}: zero width at ${page.viewportSize()?.width}px`).toBeGreaterThan(1);

  if (options.over) {
    await options.over.scrollIntoViewIfNeeded();
    const other = await options.over.boundingBox();
    expect(other, `${options.label}: the element it must not overlap has no box`).not.toBeNull();
    expect(
      overlaps(a, other as Box),
      `${options.label}: OVERLAPS its neighbour at ${page.viewportSize()?.width}px — ` +
        `subject ${JSON.stringify(a)} vs ${JSON.stringify(other)}. toBeVisible() cannot see this.`
    ).toBe(false);
  }

  /**
   * The hit test. `document.elementFromPoint` at the subject's centre must land ON the
   * subject or inside it — anything else means something opaque is painted over it.
   */
  const hit = await page.evaluate(
    ({ x, y }) => {
      const found = document.elementFromPoint(x, y);
      if (!found) return null;
      return { tag: found.tagName, outer: found.outerHTML.slice(0, 120) };
    },
    { x: a.x + a.width / 2, y: a.y + a.height / 2 }
  );
  expect(
    hit,
    `${options.label}: elementFromPoint answered null at ${page.viewportSize()?.width}px. ` +
      `That is INCONCLUSIVE, not a pass — the centre is outside the viewport.`
  ).not.toBeNull();

  const isSelfOrInside = await subject.evaluate(
    (el, point) => {
      const found = document.elementFromPoint(point.x, point.y);
      return found !== null && (el === found || el.contains(found) || found.contains(el));
    },
    { x: a.x + a.width / 2, y: a.y + a.height / 2 }
  );
  expect(
    isSelfOrInside,
    `${options.label}: something else is painted at its centre at ${page.viewportSize()?.width}px — ` +
      `hit ${JSON.stringify(hit)}`
  ).toBe(true);
}

/** No horizontal overflow: the document is not wider than the viewport. */
export async function expectNoSidewaysScroll(page: Page, label: string): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(
    overflow,
    `${label}: the page scrolls sideways by ${overflow}px at ${page.viewportSize()?.width}px`
  ).toBeLessThanOrEqual(1);
}

/** Run `body` at each of the four widths, with the width in the failure message. */
export async function atEachWidth(
  page: Page,
  body: (width: number) => Promise<void>
): Promise<void> {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await body(width);
  }
}
