import type { Page } from "@playwright/test";

/**
 * BUG-742 — a witness that the roster's groups ENTERED `aria-busy` after a sort click.
 *
 * The sort syncs (`coach-roster-triage`, `back-to-pro-roster`) read the page once the
 * groups have no `aria-busy="true"` left, because the busy marker leaves in the same frame
 * the action's render lands (EV-356c F3-P1). That is a sync only if the marker was ever
 * there: with it gone, `toHaveCount(0)` is true at once, `waitForResponse` has resolved on
 * the action's HEADERS (~45 ms after the click), and the read lands before the render.
 * QA's mutant M-691+nobusy passed both tests 3/3 that way, so BUG-691's URL test was hollow.
 *
 * A poll cannot witness the entry: at the fixture's zero latency the busy window can be
 * shorter than an `expect` retry interval. So a MutationObserver armed BEFORE the click
 * records it, and `attributeOldValue` catches a set-and-cleared pair inside one batch.
 */
export async function watchRosterBusy(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __rosterBusySeen: boolean };
    w.__rosterBusySeen = false;
    const busy = 'section[data-roster-group][aria-busy="true"]';
    new MutationObserver((records) => {
      for (const r of records) {
        if (r.type !== "attributes" || !(r.target instanceof Element)) continue;
        if (!r.target.matches("section[data-roster-group]")) continue;
        if (r.oldValue === "true" || r.target.getAttribute("aria-busy") === "true") w.__rosterBusySeen = true;
      }
      if (document.querySelector(busy)) w.__rosterBusySeen = true;
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
