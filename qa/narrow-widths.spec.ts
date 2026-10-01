import { expect, type Locator, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { expectNoSidewaysScroll } from "./layout";

/**
 * Four narrow-width and legibility rows, measured in a real browser on the fixture server:
 *
 *   BUG-252 — the nutrition page's "Activity level: …" badge (white-space: nowrap) pushed
 *             the page sideways at phone widths: 56 px at 320 in English, and every
 *             phone width in French ("Niveau d'activité : Modérément actif", 228 px).
 *   BUG-270 — the Weight row split "−6.0" from "kg" across two lines at 320 px
 *             (`formatKg` / `formatKgDelta` joined them with an ordinary space).
 *   BUG-300 — the Food log split "320" from "kcal" in its four-column macro grid.
 *   BUG-301 — `--ink-3` text read 3.11:1 on the white card, under WCAG 1.4.3's 4.5:1.
 *
 * "A number and its unit share one line box" is read with Range rects, not with text:
 * the probe takes the last digit before the unit and the unit's first letter and
 * compares the tops of their client rects. `toHaveText` normalises U+00A0 to a space,
 * so a text assertion is blind to the very character the fix is.
 *
 * Widths are SWEPT, not sampled: whether an ordinary space falls at a line end depends
 * on the exact width and the fixture's own numbers, so 320 alone could pass by luck.
 */

const EMAIL = "coach@evoli.fit";
const PASSWORD = "Password123!";
const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";

/** Every phone width the rows name, then each pixel between 320 and 414 for the probes. */
const PHONE_WIDTHS = [320, 340, 360, 375, 390, 414] as const;
const SWEEP: number[] = Array.from({ length: 414 - 320 + 1 }, (_, i) => 320 + i);

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/^(Email|E-mail|Adresse e-mail)$/).fill(EMAIL);
  await page.getByLabel(/^(Password|Mot de passe)$/).fill(PASSWORD);
  await page.getByRole("button", { name: /^(Sign in|Se connecter)$/ }).click();
  await page.waitForURL("/");
}

/**
 * Every "number, space, unit" inside `scope` whose number and unit sit on different
 * lines. Returns the offending strings, e.g. ["−6.0 kg"]; empty is the pass.
 */
async function splitNumberUnits(scope: Locator): Promise<string[]> {
  return scope.evaluateAll((roots) => {
    const UNIT = /(\d)([ \u00a0\u202f])(kg|kcal|g|%|pts)(?![\p{L}])/gu;
    const split: string[] = [];
    for (const root of roots) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.textContent ?? "";
        for (const m of text.matchAll(UNIT)) {
          const at = m.index ?? 0;
          const digit = document.createRange();
          digit.setStart(node, at);
          digit.setEnd(node, at + 1);
          const unitStart = at + 2;
          const unit = document.createRange();
          unit.setStart(node, unitStart);
          unit.setEnd(node, unitStart + 1);
          const d = digit.getBoundingClientRect();
          const u = unit.getBoundingClientRect();
          if (d.width === 0 && d.height === 0) continue; // not rendered (a closed <details>)
          if (Math.abs(d.top - u.top) > 2) {
            split.push(text.slice(Math.max(0, at - 6), unitStart + m[3].length).replace(/\u00a0/g, "⍽"));
          }
        }
      }
    }
    return split;
  });
}

async function openEveryFoodLogDay(page: Page) {
  const log = page.getByRole("region", { name: /^(Food log|Journal alimentaire)$/ });
  await expect(log).toBeVisible();
  await log.locator("details").evaluateAll((all) => all.forEach((d) => ((d as HTMLDetailsElement).open = true)));
  return log;
}

test.describe("BUG-252 — the activity badge never scrolls the nutrition page sideways", () => {
  for (const locale of ["en-GB", "fr-FR"] as const) {
    test.describe(locale, () => {
      test.use({ locale });

      test(`no sideways scroll, and the badge sits inside the viewport (${locale})`, async ({ page }) => {
        await signIn(page);
        await page.goto(`/clients/${LINA}/nutrition`);
        const badge = page.getByText(/^(Activity level: |Niveau d.activité[ \u00a0\u202f]?:)/);
        await expect(badge, "the fixture's Lina must show the badge, or this test proves nothing").toBeVisible();

        for (const width of PHONE_WIDTHS) {
          await page.setViewportSize({ width, height: 900 });
          await expectNoSidewaysScroll(page, `/clients/{id}/nutrition (${locale})`);
          const box = (await badge.boundingBox())!;
          expect(box.x + box.width, `the badge runs past the viewport at ${width}px`).toBeLessThanOrEqual(width);
          // Nothing cut: the badge's text fits its own box (no clipped "Moderatel").
          const clipped = await badge.evaluate((el) => el.scrollWidth - el.clientWidth);
          expect(clipped, `the badge's text is clipped at ${width}px`).toBeLessThanOrEqual(1);
        }
      });
    });
  }
});

test.describe("BUG-252 — the meal week's apply button, with the longest name the portal prints", () => {
  test("a 40-character name wraps inside the button instead of scrolling the page", async ({ page, context, baseURL }) => {
    // The fixture's display-name switch (coachApi.fixture.ts): Lina, served under a long name.
    await context.addCookies([
      {
        name: "evoli_fixture_display_name",
        value: `${LINA}:${encodeURIComponent("Maximilian-Alexander Featherstonehaugh-Smythe")}`,
        url: baseURL!,
      },
    ]);
    await signIn(page);
    await page.goto(`/clients/${LINA}/nutrition`);
    const apply = page.getByRole("button", { name: /^Apply to Maximilian/ });
    await expect(apply).toBeVisible();

    for (const width of PHONE_WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await expectNoSidewaysScroll(page, "/clients/{id}/nutrition with a 40-character name");
      const box = (await apply.boundingBox())!;
      expect(box.x + box.width, `the apply button runs past the viewport at ${width}px`).toBeLessThanOrEqual(width);
      expect(box.height, `the apply button is under 44 px tall at ${width}px`).toBeGreaterThanOrEqual(44);
    }
  });
});

test.describe("BUG-270 — the Weight row never splits a number from 'kg'", () => {
  test("Range-rect probe over every width from 320 to 414", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${LINA}`);
    const weight = page.locator('[data-metric="weight"]');
    await expect(weight).toContainText("kg");

    const failures: string[] = [];
    for (const width of SWEEP) {
      await page.setViewportSize({ width, height: 900 });
      const split = await splitNumberUnits(weight);
      if (split.length) failures.push(`${width}px: ${split.join(" | ")}`);
    }
    expect(failures, "a number and its kg unit wrapped apart").toEqual([]);
  });

  test("the weigh-in tile and its delta line keep 'kg' on the number's line too", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${LINA}`);
    await expect(page.locator("main")).toContainText("kg");
    const failures: string[] = [];
    for (const width of SWEEP) {
      await page.setViewportSize({ width, height: 900 });
      const split = await splitNumberUnits(page.locator("main"));
      if (split.length) failures.push(`${width}px: ${split.join(" | ")}`);
    }
    expect(failures, "a number and its unit wrapped apart on the trainee page").toEqual([]);
  });
});

test.describe("BUG-300 — the Food log never splits a number from its unit", () => {
  for (const locale of ["en-GB", "fr-FR"] as const) {
    test.describe(locale, () => {
      test.use({ locale });

      test(`every day open, Range-rect probe from 320 to 414 (${locale})`, async ({ page }) => {
        await signIn(page);
        await page.goto(`/clients/${LINA}/nutrition`);
        const log = await openEveryFoodLogDay(page);
        await expect(log.locator("dd").first()).toBeVisible();

        const failures: string[] = [];
        for (const width of SWEEP) {
          await page.setViewportSize({ width, height: 900 });
          const split = await splitNumberUnits(log);
          if (split.length) failures.push(`${width}px: ${split.join(" | ")}`);
        }
        expect(failures, "a Food log number and its unit wrapped apart").toEqual([]);
      });
    });
  }
});

/**
 * BUG-301 — every element painted in `--ink-3` reaches 4.5:1 against the background it
 * actually sits on (walked up the tree, translucent layers composited), on the pages
 * that carry the token. Light theme only: the portal ports no dark palette
 * (globals.css header).
 */
test.describe("BUG-301 — --ink-3 text reaches 4.5:1 where it is painted", () => {
  const ROUTES = [
    "/",
    `/clients/${LINA}`,
    `/clients/${LINA}/nutrition`,
    `/clients/${LINA}/routine`,
    "/templates",
    "/recipes",
    "/nutrition-templates",
    "/challenges",
  ];

  test("the token itself is 4.5:1 on white", async ({ page }) => {
    await page.goto("/login");
    const ratio = await page.evaluate(() => {
      const probe = document.createElement("span");
      probe.style.color = "var(--ink-3)";
      document.body.appendChild(probe);
      const rgb = getComputedStyle(probe).color.match(/\d+(\.\d+)?/g)!.map(Number);
      probe.remove();
      const lin = (v: number) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };
      const L = 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
      return 1.05 / (L + 0.05);
    });
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  test("every --ink-3 text node, on every page that uses it", async ({ page }) => {
    await signIn(page);
    const report: string[] = [];
    let measured = 0;
    for (const route of ROUTES) {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      await page.locator("details").evaluateAll((all) => all.forEach((d) => ((d as HTMLDetailsElement).open = true)));
      const result = await page.evaluate(() => {
        const parse = (c: string) => {
          const n = c.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 0];
          return { r: n[0], g: n[1], b: n[2], a: n.length > 3 ? n[3] : 1 };
        };
        const probe = document.createElement("span");
        probe.style.color = "var(--ink-3)";
        document.body.appendChild(probe);
        const token = getComputedStyle(probe).color;
        probe.remove();

        const lin = (v: number) => {
          const c = v / 255;
          return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        };
        const lum = (c: { r: number; g: number; b: number }) =>
          0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);

        /** The opaque colour under `el`: translucent layers composited onto what is below. */
        function backgroundOf(el: Element | null): { r: number; g: number; b: number } | null {
          const layers: { r: number; g: number; b: number; a: number }[] = [];
          for (let e = el; e; e = e.parentElement) {
            const s = getComputedStyle(e);
            if (s.backgroundImage !== "none") return null; // a gradient: not judged here
            const c = parse(s.backgroundColor);
            if (c.a > 0) layers.push(c);
            if (c.a >= 1) break;
          }
          let out = { r: 255, g: 255, b: 255 };
          for (const l of layers.reverse()) {
            out = { r: l.r * l.a + out.r * (1 - l.a), g: l.g * l.a + out.g * (1 - l.a), b: l.b * l.a + out.b * (1 - l.a) };
          }
          return out;
        }

        const failures: string[] = [];
        let count = 0;
        for (const el of Array.from(document.querySelectorAll("body *"))) {
          const s = getComputedStyle(el);
          if (s.color !== token) continue;
          const ownText = Array.from(el.childNodes).some(
            (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim() !== ""
          );
          if (!ownText) continue;
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0 || s.visibility === "hidden" || Number(s.opacity) === 0) continue;
          const bg = backgroundOf(el);
          if (!bg) continue;
          const fg = parse(s.color);
          const [hi, lo] = [lum(fg), lum(bg)].sort((x, y) => y - x);
          const ratio = (hi + 0.05) / (lo + 0.05);
          count += 1;
          if (ratio < 4.5) {
            failures.push(
              `${ratio.toFixed(2)}:1 "${(el.textContent ?? "").trim().slice(0, 30)}" on rgb(${Math.round(bg.r)},${Math.round(bg.g)},${Math.round(bg.b)})`
            );
          }
        }
        return { failures, count };
      });
      measured += result.count;
      for (const f of result.failures) report.push(`${route}: ${f}`);
    }
    expect(measured, "no --ink-3 text was found, so nothing was measured").toBeGreaterThan(20);
    expect(report, "--ink-3 text under 4.5:1").toEqual([]);
  });
});
