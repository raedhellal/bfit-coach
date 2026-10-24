import { expect, type Locator, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";

/**
 * fix/coach-tabbar-mobile — the client tab strip at a phone width (found filming at 390x844
 * on 34ef3d3; Raed approved the fix).
 *
 *   T1 At 390 px only « Vue d'ensemble · Programme · Nutrition » fitted; « Entretien » and
 *      « Messages » sat past the right edge. Each tab page drew a fresh strip at scrollLeft 0,
 *      so on the Messages and Entretien pages the CURRENT tab was off-screen and no visible
 *      tab looked selected. Now the current tab is scrolled into view inside the strip on
 *      mount, sideways only: the window's scrollY stays 0.
 *   T2 Nothing signalled that more tabs existed. Now, while the strip overflows, the side(s)
 *      holding hidden tabs fade out (a mask on the strip itself, so nothing sits over the
 *      tabs to catch a click), and the fade follows the scroll.
 *   T3 Where everything fits (1024 and 1280 px) there is no fade: the bar looks as before.
 *   T4 Keyboard: each tab, focused with Tab, is wholly inside the strip and drawn unmasked
 *      (its focus ring is never faded out).
 *
 * Red on 34ef3d3: T1 (both pages, both languages) and T2.
 */

const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
const NAV = { en: "Trainee sections", fr: "Sections du client" } as const;
const LOCALE = { en: "en-US", fr: "fr-FR" } as const;
const CURRENT = {
  en: { intake: "Intake", messages: "Messages" },
  fr: { intake: "Entretien", messages: "Messages" },
} as const;

function bar(page: Page, lang: keyof typeof NAV) {
  return page.getByRole("main").getByRole("navigation", { name: NAV[lang], exact: true });
}

/** The strip's geometry, the current tab's box, the window's scroll and what masks the strip. */
async function measure(nav: Locator) {
  return nav.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const cur = el.querySelector('[aria-current="page"]');
    const c = cur ? cur.getBoundingClientRect() : null;
    const cs = getComputedStyle(el);
    const mask = (cs.maskImage || cs.getPropertyValue("-webkit-mask-image") || "none").trim();
    const overlay = ["::before", "::after"].some((p) => {
      const ps = getComputedStyle(el, p);
      return ps.content !== "none" && ps.content !== "normal" && ps.backgroundImage !== "none";
    });
    return {
      left: r.left,
      right: r.right,
      scrollLeft: el.scrollLeft,
      maxScroll: el.scrollWidth - el.clientWidth,
      current: c && { left: c.left, right: c.right },
      scrollY: window.scrollY,
      innerWidth: window.innerWidth,
      fade: el.getAttribute("data-fade"),
      mask,
      overlay,
    };
  });
}

for (const lang of ["en", "fr"] as const) {
  test.describe(`T1 the current tab is in view at 390 px, ${lang.toUpperCase()}`, () => {
    test.use({ locale: LOCALE[lang], viewport: { width: 390, height: 844 } });

    for (const key of ["messages", "intake"] as const) {
      test(`on the ${key} page the current tab is wholly inside the strip and the window; scrollY 0`, async ({ page }) => {
        await signInThroughForm(page, { lang });
        await page.goto(`/clients/${LINA}/${key}`);
        await page.waitForLoadState("load");
        const nav = bar(page, lang);
        await expect(nav.locator('[aria-current="page"]')).toHaveText(CURRENT[lang][key]);
        // The strip is scrolled after hydration, so the box is polled, not sampled once.
        await expect
          .poll(
            async () => {
              const m = await measure(nav);
              const c = m.current!;
              return c.left >= m.left - 0.5 && c.right <= m.right + 0.5 && c.left >= 0 && c.right <= m.innerWidth;
            },
            { message: `${key}: the current tab's box inside the strip and the 390 px window` }
          )
          .toBe(true);
        const m = await measure(nav);
        expect(m.maxScroll, "the five tabs overflow a 390 px strip (the premise)").toBeGreaterThan(0);
        expect(m.scrollY, "revealing the tab never scrolls the window").toBe(0);
      });
    }
  });
}

test.describe("T2 the overflow is signalled at 390 px, FR", () => {
  test.use({ locale: LOCALE.fr, viewport: { width: 390, height: 844 } });

  test("the overview fades the end only; scrolled to the end it fades the start only; the fade takes no clicks", async ({
    page,
  }) => {
    await signInThroughForm(page, { lang: "fr" });
    await page.goto(`/clients/${LINA}`);
    const nav = bar(page, "fr");
    await expect.poll(async () => (await measure(nav)).fade, { message: "overview: hidden tabs to the right" }).toBe("end");
    let m = await measure(nav);
    expect(m.scrollLeft, "the overview tab is first: no scroll").toBe(0);
    expect(m.mask, "the end fade is painted").toContain("linear-gradient");

    // The fade catches no pointer: the point 2 px inside the strip's right edge, in the
    // faded part, still hits a tab link (the partly hidden « Entretien »).
    const hit = await nav.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const at = document.elementFromPoint(r.right - 2, r.top + r.height / 2);
      return at ? (at.closest("a")?.textContent ?? `not a link: ${at.tagName}`) : "null";
    });
    expect(hit, "a click in the faded part reaches the tab under it").toBe("Entretien");

    await nav.evaluate((el) => el.scrollTo({ left: el.scrollWidth, behavior: "auto" }));
    await expect.poll(async () => (await measure(nav)).fade, { message: "scrolled to the end" }).toBe("start");
    await nav.evaluate((el) => el.scrollTo({ left: 40, behavior: "auto" }));
    await expect.poll(async () => (await measure(nav)).fade, { message: "scrolled midway" }).toBe("both");
    m = await measure(nav);
    expect(m.scrollY).toBe(0);
  });

  test("the Messages page fades the start only (the hidden tabs are to the left)", async ({ page }) => {
    await signInThroughForm(page, { lang: "fr" });
    await page.goto(`/clients/${LINA}/messages`);
    const nav = bar(page, "fr");
    await expect.poll(async () => (await measure(nav)).fade).toBe("start");
    expect((await measure(nav)).mask).toContain("linear-gradient");
  });
});

for (const width of [1024, 1280] as const) {
  for (const lang of ["en", "fr"] as const) {
    test.describe(`T3 no fade where the tabs fit, ${width} px, ${lang.toUpperCase()}`, () => {
      test.use({ locale: LOCALE[lang], viewport: { width, height: 900 } });

      test("overview and Messages have no fade and no scroll", async ({ page }) => {
        await signInThroughForm(page, { lang });
        for (const path of [`/clients/${LINA}`, `/clients/${LINA}/messages`]) {
          await page.goto(path);
          await page.waitForLoadState("load");
          const nav = bar(page, lang);
          await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
          // Give the hydrated bar a frame to measure itself, then read once.
          await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
          const m = await measure(nav);
          expect(m.maxScroll, `${path}: everything fits`).toBeLessThanOrEqual(0);
          expect(m.fade, `${path}: no fade state`).toBeNull();
          expect(m.mask, `${path}: no mask`).toBe("none");
          expect(m.overlay, `${path}: no gradient overlay`).toBe(false);
          expect(m.scrollLeft).toBe(0);
        }
      });
    });
  }
}

test.describe("T4 keyboard through the narrow strip, FR, 390 px", () => {
  test.use({ locale: LOCALE.fr, viewport: { width: 390, height: 844 } });

  test("each focused tab is wholly inside the strip and unmasked; the window does not scroll", async ({ page }) => {
    await signInThroughForm(page, { lang: "fr" });
    await page.goto(`/clients/${LINA}`);
    const nav = bar(page, "fr");
    const links = nav.getByRole("link");
    await expect(links).toHaveCount(5);
    await expect.poll(async () => (await measure(nav)).fade).toBe("end");
    await links.first().focus();
    // A programmatic focus() is not :focus-visible in Chromium; one Shift+Tab / Tab pair
    // puts the browser in keyboard modality on the same tab.
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    for (let i = 0; i < 5; i++) {
      if (i > 0) await page.keyboard.press("Tab");
      const link = links.nth(i);
      await expect(link).toBeFocused();
      await expect
        .poll(async () => {
          const s = await link.evaluate((a) => {
            const n = a.closest("nav")!;
            const r = n.getBoundingClientRect();
            const c = a.getBoundingClientRect();
            const cs = getComputedStyle(n);
            return {
              inside: c.left >= r.left - 0.5 && c.right <= r.right + 0.5,
              visible: a.matches(":focus-visible"),
              mask: (cs.maskImage || cs.getPropertyValue("-webkit-mask-image") || "none").trim(),
            };
          });
          return s.inside && s.visible && s.mask === "none";
        }, { message: `tab ${i + 1}: inside the strip, focus-visible, strip unmasked` })
        .toBe(true);
    }
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });
});
