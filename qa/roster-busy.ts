import type { Page } from "@playwright/test";

/**
 * BUG-742 — a witness that the roster's groups ENTERED `aria-busy` after a sort click, and
 * what the rows read at the moment it LEFT.
 *
 * The sort syncs (`coach-roster-triage`, `back-to-pro-roster`) read the page once the
 * groups have no `aria-busy="true"` left, because the busy marker leaves in the same commit
 * as the action's render (EV-356c F3-P1; `sorting` is the transition's pending flag). That is
 * a sync only if the marker was ever there: with it gone, `toHaveCount(0)` is true at once,
 * `waitForResponse` has resolved on the action's HEADERS (~45 ms after the click), and the
 * read lands before the render. QA's mutant M-691+nobusy passed both tests 3/3 that way, so
 * BUG-691's URL test was hollow.
 *
 * A poll cannot witness the entry: at the fixture's zero latency the busy window can be
 * shorter than an `expect` retry interval. So a MutationObserver armed BEFORE the click
 * records it, and `attributeOldValue` catches a set-and-cleared pair inside one batch.
 *
 * ENTERED IS NECESSARY, NOT SUFFICIENT (staff S2): a marker that leaves BEFORE the render
 * (staff's M-flash, busy cleared 20 ms after the sort starts) is entered and seen, and the
 * "busy gone" wait then passes early again. The observer therefore also snapshots the row
 * names at the first callback that finds busy gone (`rosterOrderWhenBusyLeft`); a test whose
 * sort changes the order asserts that snapshot is the new order. ⚠ The BUG-691 URL test
 * (`back-to-pro-roster`, `?filter=alerts&q=lin`) has no such witness: the sort changes nothing
 * visible on that filtered roster, so with a marker that leaves early its URL read can again
 * land before the render rewrites the URL (M-691 + M-flash: green 2 of 3). A sync on Next's
 * own history write would be shaped to the framework, so the gap is named here instead.
 */
export async function watchRosterBusy(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __rosterBusySeen: boolean; __rosterOrderWhenBusyLeft: string[] | null };
    w.__rosterBusySeen = false;
    w.__rosterOrderWhenBusyLeft = null;
    const busy = 'section[data-roster-group][aria-busy="true"]';
    new MutationObserver((records) => {
      for (const r of records) {
        if (r.type !== "attributes" || !(r.target instanceof Element)) continue;
        if (!r.target.matches("section[data-roster-group]")) continue;
        if (r.oldValue === "true" || r.target.getAttribute("aria-busy") === "true") w.__rosterBusySeen = true;
      }
      if (document.querySelector(busy)) {
        w.__rosterBusySeen = true;
      } else if (w.__rosterBusySeen && w.__rosterOrderWhenBusyLeft === null) {
        w.__rosterOrderWhenBusyLeft = Array.from(document.querySelectorAll(".roster-row")).map(
          (row) => row.querySelector(".roster-name")?.textContent?.trim() ?? ""
        );
      }
    }).observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["aria-busy"],
      attributeOldValue: true,
    });
  });
}

/** True once any roster group has carried `aria-busy="true"` since `watchRosterBusy`. */
export async function rosterBusyWasSeen(page: Page): Promise<boolean> {
  return page.evaluate(() => (window as unknown as { __rosterBusySeen?: boolean }).__rosterBusySeen === true);
}

/**
 * The rows' names, in render order, as the DOM stood when busy first left (null if it never
 * has). Read in the observer's callback, so in the same task as the commit that cleared it.
 */
export async function rosterOrderWhenBusyLeft(page: Page): Promise<string[] | null> {
  return page.evaluate(
    () => (window as unknown as { __rosterOrderWhenBusyLeft?: string[] | null }).__rosterOrderWhenBusyLeft ?? null
  );
}
