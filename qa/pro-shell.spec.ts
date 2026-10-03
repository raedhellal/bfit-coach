import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Locator, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";
import { expectNoSidewaysScroll, expectUnoccluded } from "./layout";
import { MARK_PATH } from "../src/components/ui/brand";

/**
 * Evoli Pro redesign, branch 1 — the token layer, the app shell, the black logo, the
 * favicon and the FR/EN switch (`evoli-pro-redesign-2026-10-02.md` §1–§3; Raed's rulings
 * of 2026-10-02; staff's challenge of the same day).
 *
 * The shell is two server-rendered layouts and CSS picks one: a 240 px sidebar from
 * 1024 px, a top bar + bottom tab bar below. So every check runs at the plan's four widths
 * (390 / 768 / 1280 / 1440) AND on both sides of each breakpoint (767|768, 1023|1024,
 * 1279|1280): a breakpoint is where a layout flips, and one sample per side is the least
 * that can see it flip the wrong way.
 */

const EMAIL = "coach@evoli.fit";
const PASSWORD = "Password123!";
const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";

/** The four screens the brief names: roster, a client page, challenges, templates. */
const ROUTES = [
  { path: "/", name: "roster" },
  { path: `/clients/${LINA}`, name: "client overview" },
  { path: "/challenges", name: "challenges" },
  { path: "/templates", name: "templates" },
] as const;

const DESIGN_WIDTHS = [390, 768, 1280, 1440] as const;
const BOUNDARY_WIDTHS = [767, 1023, 1024, 1279] as const;
const ALL_WIDTHS = [...DESIGN_WIDTHS, ...BOUNDARY_WIDTHS].sort((a, b) => a - b);

const NAV_EN = ["Roster", "Templates", "Recipes", "Nutrition templates", "Challenges"];
const NAV_FR = ["Clients", "Modèles", "Recettes", "Modèles nutrition", "Défis"];

async function signIn(page: Page) {
  await signInThroughForm(page, { email: EMAIL, password: PASSWORD });
}

async function signInFrench(page: Page) {
  await signInThroughForm(page, { email: EMAIL, password: PASSWORD, lang: "fr" });
}

async function box(locator: Locator, what: string) {
  const b = await locator.boundingBox();
  expect(b, `${what}: has no box`).not.toBeNull();
  return b!;
}

/** Every visible link, button and radio label of the chrome, with its size. */
async function undersizedChrome(page: Page) {
  return page.evaluate(() => {
    const roots = Array.from(document.querySelectorAll(".shell-sidebar, .shell-topbar, .shell-tabbar"));
    const out: string[] = [];
    let measured = 0;
    for (const root of roots) {
      for (const el of Array.from(root.querySelectorAll("a, button, label"))) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue; // the hidden layout
        measured += 1;
        if (r.width < 44 || r.height < 44) {
          out.push(`${el.tagName.toLowerCase()} "${(el.textContent ?? "").trim().slice(0, 30)}" ${Math.round(r.width)}×${Math.round(r.height)}`);
        }
      }
    }
    return { out, measured };
  });
}

test.describe("the shell at 390 / 768 / 1280 / 1440 and both sides of every breakpoint", () => {
  test.use({ locale: "en-GB" });

  for (const route of ROUTES) {
    test(`${route.name}: no sideways scroll, one h1, the logo, the nav reachable with 44 px targets`, async ({ page }) => {
      await signIn(page);
      for (const width of ALL_WIDTHS) {
        await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
        await page.goto(route.path);
        const at = `${route.name} at ${width}px`;

        // The brief's measure, verbatim, and the shared helper (clientWidth) beside it.
        const widths = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
        expect(widths.sw, `${at}: scrollWidth ${widths.sw} > innerWidth ${widths.iw}`).toBeLessThanOrEqual(widths.iw);
        await expectNoSidewaysScroll(page, at);

        // One h1 — the page's, never the shell's.
        await expect(page.locator("h1"), `${at}: h1 count`).toHaveCount(1);

        // Which layout is on screen is decided at 1024, and only one of each landmark is
        // exposed at a time.
        const wide = width >= 1024;
        await expect(page.locator(".shell-sidebar"), at).toBeVisible({ visible: wide });
        await expect(page.locator(".shell-topbar"), at).toBeVisible({ visible: !wide });
        await expect(page.locator(".shell-tabbar"), at).toBeVisible({ visible: !wide });
        await expect(page.getByRole("banner"), `${at}: one banner`).toHaveCount(1);
        const nav = page.getByRole("navigation", { name: "Portal" });
        await expect(nav, `${at}: one Portal navigation`).toHaveCount(1);

        // The black logo: the ink tile (not the gradient) and the wordmark, in the banner.
        const banner = page.getByRole("banner");
        await expect(banner.getByText("Evoli Pro", { exact: true })).toBeVisible();
        const mark = banner.locator('[data-brand-mark="ink"]');
        await expect(mark).toBeVisible();
        expect(await mark.evaluate((el) => getComputedStyle(el).backgroundColor), `${at}: tile colour`).toBe("rgb(11, 15, 23)");
        await expect(mark.locator("path")).toHaveAttribute("d", MARK_PATH);
        await expect(banner.getByRole("link", { name: "Evoli Pro, back to roster" })).toHaveAttribute("href", "/");

        // The five sections, in the stories' order, each on screen, unoccluded, ≥ 44 × 44.
        await expect(nav.getByRole("link")).toHaveText(NAV_EN);
        for (const name of NAV_EN) {
          const link = nav.getByRole("link", { name, exact: true });
          await expectUnoccluded(page, link, { label: `${name} nav link at ${width}px (${route.name})` });
          const b = await box(link, `${name} at ${width}px`);
          expect(b.width, `${name} width at ${width}px`).toBeGreaterThanOrEqual(44);
          expect(b.height, `${name} height at ${width}px`).toBeGreaterThanOrEqual(44);
          expect(b.x, `${name} left edge at ${width}px`).toBeGreaterThanOrEqual(0);
          expect(b.x + b.width, `${name} right edge at ${width}px`).toBeLessThanOrEqual(width + 0.5);
        }

        // Every target of the chrome, not only the five links.
        const chrome = await undersizedChrome(page);
        expect(chrome.measured, `${at}: measured nothing`).toBeGreaterThanOrEqual(6);
        expect(chrome.out, `${at}: chrome targets under 44 px`).toEqual([]);
      }
    });
  }

  test("the current section is marked to assistive technology, not by colour alone", async ({ page }) => {
    await signIn(page);
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/templates");
      const nav = page.getByRole("navigation", { name: "Portal" });
      await expect(nav.getByRole("link", { name: "Templates", exact: true })).toHaveAttribute("aria-current", "page");
      await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
      // The non-colour cue: bolder than its neighbours.
      const weights = await nav.getByRole("link").evaluateAll((els) => els.map((e) => getComputedStyle(e).fontWeight));
      expect(weights, `weights at ${width}px`).toEqual(["600", "700", "600", "600", "600"]);
    }
  });

  test("every section is reachable from the nav at 390 and at 1440", async ({ page }) => {
    await signIn(page);
    const targets = [
      ["Templates", "/templates"],
      ["Recipes", "/recipes"],
      ["Nutrition templates", "/nutrition-templates"],
      ["Challenges", "/challenges"],
      ["Roster", "/"],
    ] as const;
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(`/clients/${LINA}`);
      for (const [name, href] of targets) {
        await page.getByRole("navigation", { name: "Portal" }).getByRole("link", { name, exact: true }).click();
        await page.waitForURL(href);
        await expect(page.locator("h1")).toHaveCount(1);
      }
    }
  });

  test("keyboard focus on the chrome is drawn (2 px solid), at both layouts", async ({ page }) => {
    await signIn(page);
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/templates");
      await page.locator("body").click({ position: { x: 1, y: 1 } }).catch(() => undefined);
      // Tab until focus is on the logo link of the visible banner (the first stop).
      let found = false;
      for (let i = 0; i < 8 && !found; i += 1) {
        await page.keyboard.press("Tab");
        found = await page.evaluate(() => {
          const el = document.activeElement;
          return !!el && el.matches(".shell-home") && el.getBoundingClientRect().width > 0;
        });
      }
      expect(found, `the logo link takes keyboard focus at ${width}px`).toBe(true);
      const outline = await page.evaluate(() => {
        const s = getComputedStyle(document.activeElement as Element);
        return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) };
      });
      expect(outline.style, `focus outline at ${width}px`).toBe("solid");
      expect(outline.width).toBeGreaterThanOrEqual(2);
    }
  });
});

test.describe("breakpoint rules (staff 2026-10-02)", () => {
  test.use({ locale: "en-GB" });

  test("gutters 16 | 24 | 32 flip at 768 and 1280; two columns from a 1280 px viewport", async ({ page }) => {
    await signIn(page);
    const expected: [number, number, number][] = [
      // width, page gutter, split columns
      [390, 16, 1],
      [767, 16, 1],
      [768, 24, 1],
      [1023, 24, 1],
      [1024, 24, 1],
      [1279, 24, 1],
      [1280, 32, 2],
      [1440, 32, 2],
    ];
    for (const [width, gutter, columns] of expected) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/templates");
      const measured = await page.evaluate(() => {
        const main = document.querySelector("main.page") as HTMLElement;
        // The two-column rule has no consumer before the screen branches, so it is probed
        // with a throwaway grid in the page's own column.
        const probe = document.createElement("div");
        probe.className = "layout-split";
        probe.innerHTML = "<div>a</div><div>b</div>";
        main.appendChild(probe);
        const cols = getComputedStyle(probe).gridTemplateColumns.split(" ").filter(Boolean).length;
        probe.remove();
        return { gutter: parseFloat(getComputedStyle(main).paddingLeft), cols };
      });
      expect(measured.gutter, `gutter at ${width}px`).toBe(gutter);
      expect(measured.cols, `columns at ${width}px`).toBe(columns);
    }
  });

  test("one sticky element per edge: the tab bar below 1024, the legal line from 1024", async ({ page }) => {
    await signIn(page);
    for (const width of [390, 767, 768, 1023, 1024, 1280]) {
      await page.setViewportSize({ width, height: 700 });
      await page.goto(`/clients/${LINA}`);
      const footer = await page.getByRole("contentinfo").evaluate((el) => getComputedStyle(el).position);
      if (width < 1024) {
        expect(footer, `legal footer at ${width}px`).toBe("static");
        // The tab bar rides the bottom edge of the viewport.
        const bar = await box(page.locator(".shell-tabbar"), `tab bar at ${width}px`);
        expect(Math.round(bar.y + bar.height), `tab bar bottom at ${width}px`).toBe(700);
      } else {
        expect(footer, `legal footer at ${width}px`).toBe("sticky");
        // Beside the sidebar: the sidebar ends where the sticky footer starts.
        const side = await box(page.locator(".shell-sidebar"), `sidebar at ${width}px`);
        const foot = await box(page.getByRole("contentinfo"), `footer at ${width}px`);
        expect(side.y + side.height, `sidebar bottom vs footer top at ${width}px`).toBeLessThanOrEqual(foot.y + 0.5);
      }
    }
  });
});

test.describe("the FR/EN switch (Raed 2026-10-02)", () => {
  test.use({ locale: "fr-FR" });

  test("at 1440 the sidebar switch flips the copy and <html lang>, and the choice survives a reload", async ({ page, context }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInFrench(page);
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    const nav = page.getByRole("navigation", { name: "Portail" });
    await expect(nav.getByRole("link")).toHaveText(NAV_FR);

    const langFr = page.getByRole("radiogroup", { name: "Langue" });
    await expect(langFr.getByRole("radio", { name: /^FR/ })).toBeChecked();
    await langFr.getByRole("radio", { name: /^EN/ }).check();

    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("navigation", { name: "Portal" }).getByRole("link")).toHaveText(NAV_EN);
    await expect(page.getByRole("heading", { level: 1, name: "Roster" })).toBeVisible();
    await expect(page.getByRole("radiogroup", { name: "Language" }).getByRole("radio", { name: /^EN/ })).toBeChecked();

    // Persisted: a cookie the server reads, httpOnly (nothing in the browser needs it).
    const cookie = (await context.cookies()).find((c) => c.name === "evoli_pro_locale");
    expect(cookie?.value).toBe("en");
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("Lax");

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { level: 1, name: "Roster" })).toBeVisible();
    // The cookie outranks the browser's French Accept-Language on a fresh document too.
    await page.goto("/templates");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { level: 1, name: "Templates" })).toBeVisible();
  });

  test("a page visited seconds before the switch is not replayed from the router cache in the old language", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInFrench(page);
    const navFr = page.getByRole("navigation", { name: "Portail" });
    await navFr.getByRole("link", { name: "Modèles", exact: true }).click();
    await page.waitForURL("/templates");
    await expect(page.getByRole("heading", { level: 1, name: "Modèles" })).toBeVisible();
    await navFr.getByRole("link", { name: "Clients", exact: true }).click();
    await page.waitForURL("/");

    await page.getByRole("radiogroup", { name: "Langue" }).getByRole("radio", { name: /^EN/ }).check();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");

    // A SOFT navigation back to /templates, well inside the 30 s client cache window.
    await page.getByRole("navigation", { name: "Portal" }).getByRole("link", { name: "Templates", exact: true }).click();
    await page.waitForURL("/templates");
    await expect(page.getByRole("heading", { level: 1, name: "Templates" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    // And Back, to the roster rendered in French before the switch.
    await page.goBack();
    await page.waitForURL("/");
    await expect(page.getByRole("heading", { level: 1, name: "Roster" })).toBeVisible();
  });

  test("at 390 the switch is in the account menu, and choosing French again restores it", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signInFrench(page);
    const account = page.getByRole("button", { name: "Mon compte" });
    await expect(account).toHaveAttribute("aria-expanded", "false");
    const ab = await box(account, "account button");
    expect(ab.width).toBeGreaterThanOrEqual(44);
    expect(ab.height).toBeGreaterThanOrEqual(44);
    // Closed: no sign-out or switch on screen.
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toHaveCount(0);

    await account.click();
    await expect(account).toHaveAttribute("aria-expanded", "true");
    const panel = page.getByRole("region", { name: "Mon compte" });
    await expect(panel.getByRole("button", { name: "Se déconnecter" })).toBeVisible();
    await expectUnoccluded(page, panel.getByRole("radio", { name: /^EN/ }), { label: "EN option in the account menu" });
    await expectNoSidewaysScroll(page, "the open account menu at 390");
    await panel.getByRole("radio", { name: /^EN/ }).check();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("navigation", { name: "Portal" }).getByRole("link")).toHaveText(NAV_EN);

    // The menu outlives the re-render in the new language (the island is not remounted).
    await expect(page.getByRole("button", { name: "Account" })).toHaveAttribute("aria-expanded", "true");
    // Escape closes it and returns focus to the button.
    await page.keyboard.press("Escape");
    const accountEn = page.getByRole("button", { name: "Account" });
    await expect(accountEn).toHaveAttribute("aria-expanded", "false");
    await expect(accountEn).toBeFocused();

    await accountEn.click();
    await page.getByRole("region", { name: "Account" }).getByRole("radio", { name: /^FR/ }).check();
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await expect(page.getByRole("heading", { level: 1, name: "Clients" })).toBeVisible();
  });
});

test.describe("the locale rule without a switch (coordinator's restatement of Raed's ruling)", () => {
  // No cookie: the browser decides, and French is the default when it names neither.
  const cases: [string | null, "fr" | "en"][] = [
    [null, "fr"],
    ["de-DE", "fr"],
    ["de-DE,fr;q=0.9", "fr"],
    ["en-US", "en"],
    ["en-US,en;q=0.9,fr;q=0.8", "en"],
    ["fr-CA,en;q=0.8", "fr"],
  ];
  for (const [header, lang] of cases) {
    test(`Accept-Language ${JSON.stringify(header)} → <html lang="${lang}"> on /login`, async ({ playwright, baseURL }) => {
      const api = await playwright.request.newContext({
        baseURL,
        extraHTTPHeaders: header === null ? {} : { "Accept-Language": header },
      });
      try {
        const res = await api.get("/login", { maxRedirects: 0 });
        expect(res.status()).toBe(200);
        // The request context sends no Accept-Language of its own: `null` really is "no header".
        expect(res.headers()["content-type"]).toContain("text/html");
        expect(await res.text()).toContain(`<html lang="${lang}"`);
      } finally {
        await api.dispose();
      }
    });
  }
});

test.describe("favicon and home-screen icon (the black mark, Evoli Pro only)", () => {
  test("/icon.svg and /apple-icon.png answer a request with no session", async ({ playwright, baseURL }) => {
    const api = await playwright.request.newContext({ baseURL });
    try {
      const svg = await api.get("/icon.svg", { maxRedirects: 0 });
      expect(svg.status()).toBe(200);
      expect(svg.headers()["content-type"]).toContain("image/svg+xml");
      const body = await svg.text();
      expect(body, "the favicon is drawn from the same path as BrandMark").toContain(`d="${MARK_PATH}"`);
      expect(body).toContain('fill="#0B0F17"');
      expect(body).toContain('fill="#32D583"');

      const png = await api.get("/apple-icon.png", { maxRedirects: 0 });
      expect(png.status()).toBe(200);
      expect(png.headers()["content-type"]).toContain("image/png");
      const bytes = await png.body();
      // 180 × 180, read from the IHDR chunk.
      expect(bytes.readUInt32BE(16)).toBe(180);
      expect(bytes.readUInt32BE(20)).toBe(180);

      // The exclusion is those two files, not everything that starts with their names.
      const lookalike = await api.get("/icon.svg-x", { maxRedirects: 0 });
      expect(lookalike.status(), "a lookalike path is still behind the guard").toBe(307);
    } finally {
      await api.dispose();
    }
  });

  test("Pro pages link the Pro favicon and home-screen icon; the invite page links neither", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator('head link[rel="icon"][href^="/icon.svg"]')).toHaveCount(1);
    await expect(page.locator('head link[rel="apple-touch-icon"][href^="/apple-icon.png"]')).toHaveCount(1);

    // The trainee-facing invite page: its own favicon AND its own home-screen icon. The root
    // `apple-icon.png` used to carry into /i/* (staff B1, 2026-10-02) — a trainee adding the
    // invite to a home screen got the Evoli Pro black mark.
    await page.goto("/i/sometoken");
    const favicon = page.locator('head link[rel="icon"]');
    await expect(favicon).toHaveCount(1);
    await expect(favicon).toHaveAttribute("href", /^\/i\/icon\.svg/);
    const touch = page.locator('head link[rel="apple-touch-icon"]');
    await expect(touch).toHaveCount(1);
    const touchHref = (await touch.getAttribute("href"))!;
    expect(touchHref, "the invite page's home-screen icon is not the Pro one").not.toMatch(/^\/apple-icon\.png/);
    expect(touchHref).toMatch(/^\/i\/apple-icon\.png/);

    const svg = await page.request.get((await favicon.getAttribute("href"))!);
    expect(svg.status()).toBe(200);
    const svgBody = await svg.text();
    expect(svgBody, "the invite favicon is not drawn from the Pro mark").not.toContain(MARK_PATH);
    expect(svgBody).toContain("#4F7CFF");

    const png = await page.request.get(touchHref);
    expect(png.status()).toBe(200);
    expect(png.headers()["content-type"]).toContain("image/png");
    const bytes = await png.body();
    expect(bytes.readUInt32BE(16)).toBe(180);
    expect(bytes.readUInt32BE(20)).toBe(180);
    expect(bytes.toString("latin1"), "the invite home-screen icon carries no Pro mark path").not.toContain(MARK_PATH);
    // A PNG holds pixels, not a path, so the brand is read from the pixels: the trainee
    // tile's top-left corner is the gradient's blue end, never the Pro tile's #0B0F17.
    const corner = await page.evaluate(async (src) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      return Array.from(ctx.getImageData(2, 2, 1, 1).data.slice(0, 3));
    }, touchHref);
    expect(corner[2], `invite home-screen icon corner rgb(${corner.join(",")}) is blue`).toBeGreaterThan(200);
    expect(corner[0] + corner[1] + corner[2], "not the near-black Pro tile").toBeGreaterThan(300);

    // And the page draws the trainee logo (the rising line), never the black mark.
    await expect(page.locator('[data-brand-mark="ink"]')).toHaveCount(0);
    await expect(page.locator('main path[d="M3 16 L9 7 L13 13 L21 4"]')).toHaveCount(1);
  });

  test("the favicon in the repo is the file Next serves (no drift between the two)", async ({ playwright, baseURL }) => {
    const api = await playwright.request.newContext({ baseURL });
    try {
      const served = await (await api.get("/icon.svg")).text();
      expect(served.trim()).toBe(readFileSync(join(__dirname, "../src/app/icon.svg"), "utf8").trim());
    } finally {
      await api.dispose();
    }
  });
});

test.describe("sign-out is a hard navigation (staff 2026-10-02)", () => {
  test.use({ locale: "en-GB", viewport: { width: 1440, height: 900 } });

  test("signing out replaces the page: Back does not show the portal", async ({ page }) => {
    await signIn(page);
    await page.goto("/templates");
    await expect(page.getByRole("heading", { level: 1, name: "Templates" })).toBeVisible();
    // A document load, not a soft one: the marker set on this window does not survive.
    await page.evaluate(() => ((window as unknown as { __soft?: boolean }).__soft = true));
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.waitForURL("/login");
    expect(await page.evaluate(() => (window as unknown as { __soft?: boolean }).__soft ?? false)).toBe(false);

    await page.goBack();
    await page.waitForLoadState();
    await expect(page.getByRole("heading", { level: 1, name: "Templates" })).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Portal" })).toHaveCount(0);
  });
});

test.describe("the account menu lets keyboard focus go (staff S2, WCAG 2.4.11)", () => {
  test.use({ locale: "en-GB", viewport: { width: 390, height: 844 } });

  /** From the top bar's logo link, one Tab: the Account button is the next stop. */
  async function focusTrigger(page: Page) {
    const trigger = page.getByRole("button", { name: "Account" });
    await page.getByRole("banner").getByRole("link", { name: "Evoli Pro, back to roster" }).focus();
    await page.keyboard.press("Tab");
    await expect(trigger).toBeFocused();
    return trigger;
  }

  test("Tab past Sign out closes the panel; so does Shift+Tab before the button", async ({ page }) => {
    await signIn(page);
    await page.goto("/templates");
    const trigger = await focusTrigger(page);
    await page.keyboard.press("Enter");
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    const panel = page.getByRole("region", { name: "Account" });

    await page.keyboard.press("Tab"); // the checked language radio
    await expect(panel.getByRole("radio", { name: /^EN/ })).toBeFocused();
    await page.keyboard.press("Tab"); // Sign out
    await expect(panel.getByRole("button", { name: "Sign out" })).toBeFocused();
    await page.keyboard.press("Tab"); // out of the panel, onto the page
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(panel).toHaveCount(0);
    expect(await page.evaluate(() => !!document.activeElement?.closest("main"))).toBe(true);

    // The other way out.
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Shift+Tab");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");

    // Moving INSIDE the panel does not close it.
    await trigger.click();
    await panel.getByRole("radio", { name: /^EN/ }).focus();
    await panel.getByRole("button", { name: "Sign out" }).focus();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
  });
});

test.describe("session boundaries are document loads (ADR-0033 D33.7)", () => {
  test.use({ locale: "en-GB", viewport: { width: 1440, height: 900 } });

  /** A mark on this window; a soft navigation keeps it, a document load does not. */
  const mark = (page: Page) => page.evaluate(() => ((window as unknown as { __mark?: boolean }).__mark = true));
  const marked = (page: Page) => page.evaluate(() => (window as unknown as { __mark?: boolean }).__mark ?? false);

  test("a page restored from the back/forward cache reloads; an ordinary pageshow does not", async ({ page }) => {
    await signIn(page);
    await page.goto("/templates");
    await expect(page.getByRole("heading", { level: 1, name: "Templates" })).toBeVisible();

    // Control: not a restore — nothing happens.
    await mark(page);
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: false })));
    await page.waitForTimeout(500);
    expect(await marked(page), "an ordinary pageshow must not reload").toBe(true);

    // A restore: the guard turns it into a real request.
    await Promise.all([
      page.waitForEvent("load", { timeout: 10_000 }),
      page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }))),
    ]);
    expect(await marked(page), "a bfcache restore must reload the document").toBe(false);
    await expect(page).toHaveURL(/\/templates$/);
  });

  test("sign-in ends in a document load", async ({ page }) => {
    await signInThroughForm(page, { email: EMAIL, password: PASSWORD, beforeSubmit: () => mark(page) });
    await expect(page.getByRole("heading", { level: 1, name: "Roster" })).toBeVisible();
    expect(await marked(page), "sign-in was a soft navigation").toBe(false);
  });

  test("a pending sign-in and a finished activation each end in a document load", async ({ page }) => {
    await signInThroughForm(page, {
      email: "new.coach@evoli.fit",
      password: "Temp-pass-2026",
      landing: /\/activate$/,
      beforeSubmit: () => mark(page),
    });
    expect(await marked(page), "the pending sign-in was a soft navigation").toBe(false);

    await page.getByLabel("Temporary password").fill("Temp-pass-2026");
    await page.getByLabel("New password", { exact: true }).fill("Coach-pass-2026");
    await page.getByLabel("Repeat the new password").fill("Coach-pass-2026");
    await page.getByRole("checkbox", { name: "I agree to the Terms of Service and the Privacy Policy." }).check();
    await mark(page);
    await page.getByRole("button", { name: "Finish my account" }).click();
    await page.waitForURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1, name: "Roster" })).toBeVisible();
    expect(await marked(page), "activation was a soft navigation").toBe(false);
  });

  test("an activation whose session expired leaves for /login with a document load", async ({ page }) => {
    await signInThroughForm(page, { email: "new.coach@evoli.fit", password: "Temp-pass-2026", landing: /\/activate$/ });
    await page.route("**/api/auth/activate", (route) =>
      route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ code: "SESSION_EXPIRED" }) })
    );
    await page.getByLabel("Temporary password").fill("Temp-pass-2026");
    await page.getByLabel("New password", { exact: true }).fill("Coach-pass-2026");
    await page.getByLabel("Repeat the new password").fill("Coach-pass-2026");
    await page.getByRole("checkbox", { name: "I agree to the Terms of Service and the Privacy Policy." }).check();
    await mark(page);
    await page.getByRole("button", { name: "Finish my account" }).click();
    await page.waitForURL(/\/login\?error=expired$/);
    expect(await marked(page), "the expired-session exit was a soft navigation").toBe(false);
  });
});

test.describe("the switch says when it could not change the language", () => {
  test.use({ locale: "fr-FR", viewport: { width: 1440, height: 900 } });

  test("a failed server action leaves French in force and says so in one line", async ({ page }) => {
    await signInFrench(page);
    const group = page.getByRole("radiogroup", { name: "Langue" });
    const status = group.getByRole("status");
    await expect(status).toHaveText("");
    // Every server action POST fails on the wire.
    await page.route("**/*", (route) =>
      route.request().method() === "POST" && route.request().headers()["next-action"] ? route.abort() : route.fallback()
    );
    await group.getByRole("radio", { name: /^EN/ }).check();
    await expect(status).toHaveText("La langue n'a pas pu être changée. Réessayez.");
    await expect(group.getByRole("radio", { name: /^FR/ })).toBeChecked();
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  });
});
