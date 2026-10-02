import { expect, type Browser, type Locator, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { expectNoEnglish } from "./french";
import { expectNoSidewaysScroll } from "./layout";
import { MARK_PATH } from "../src/components/ui/brand";

/**
 * EV-337k — the sign-in, activation, invitation, denial and unavailable screens in the Evoli
 * Pro redesign (plan §5.10). Fixture mode, default config. `/unavailable` can only be
 * reached through a failed session rotation against a real (stub) api, so its checks live
 * in `qa/coach-activation.stub.spec.ts`.
 *
 *   · BUG-662: the activation consent's checkbox and the two legal links are 44 px targets,
 *     a press anywhere on the checkbox's label toggles it, and keyboard focus is drawn.
 *   · Edge case 4 / R1: `/i/*` never shows the Evoli Pro mark, also to a browser that signed
 *     in as a coach a moment ago, signed in or signed out since.
 *   · X1 (no sideways scroll at the nine widths), X3 (44 px targets at 390), X4 (one h1),
 *     EN and FR, on the four routes this config can draw.
 */

const COACH = { email: "coach@evoli.fit", password: "Password123!" };
const PENDING = { email: "new.coach@evoli.fit", password: "Temp-pass-2026" };
const X1_WIDTHS = [320, 390, 767, 768, 1023, 1024, 1279, 1280, 1440] as const;
const FLOOR = 44;
const INVITE = "/i/edge-case-4-token?coach=Alex%20Roussel";

const LANG = {
  en: {
    locale: "en-US",
    email: "Email",
    password: "Password",
    signIn: "Sign in",
    consent: "I agree to the Terms of Service and the Privacy Policy.",
    terms: /^Terms of Service \(version /,
    privacy: /^Privacy Policy \(version /,
    submit: "Finish my account",
    repeat: "Repeat the new password",
    denied: "This trainee is not on your roster. They may have revoked access.",
    back: "Back to roster",
  },
  fr: {
    locale: "fr-FR",
    email: "Adresse e-mail",
    password: "Mot de passe",
    signIn: "Se connecter",
    consent: "J'accepte les Conditions d'utilisation et la Politique de confidentialité.",
    terms: /^Conditions d'utilisation \(version /,
    privacy: /^Politique de confidentialité \(version /,
    submit: "Finaliser mon compte",
    repeat: "Confirmez le nouveau mot de passe",
    denied: "Ce client ne fait pas partie de votre liste. Il a peut-être révoqué l'accès.",
    back: "Retour aux clients",
  },
} as const;
type Lang = keyof typeof LANG;

async function signIn(page: Page, lang: Lang, who: { email: string; password: string }, landing: RegExp | string) {
  const t = LANG[lang];
  await page.goto("/login");
  await page.getByLabel(t.email, { exact: true }).fill(who.email);
  await page.getByLabel(t.password, { exact: true }).fill(who.password);
  await page.getByRole("button", { name: t.signIn, exact: true }).click();
  await page.waitForURL(landing);
}

/**
 * Every visible control in `scope` smaller than 44 × 44, measured. A checkbox is measured
 * through its LABEL (BUG-662's rule: "the checkbox itself, or its label"); a radio of the
 * language switch IS its option's box (the input covers it).
 */
async function undersized(scope: Locator) {
  return scope.evaluate((root, floor) => {
    const out: string[] = [];
    for (const el of Array.from(root.querySelectorAll("a, button, input, select, textarea"))) {
      const target = el instanceof HTMLInputElement && el.type === "checkbox" ? el.closest("label") ?? el : el;
      const r = target.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue; // the other layout, display:none
      if (r.width < floor || r.height < floor) {
        const name = (el.getAttribute("aria-label") || (el as HTMLElement).innerText || el.tagName).trim();
        out.push(`${el.tagName.toLowerCase()} "${name.slice(0, 40)}" ${r.width.toFixed(1)}×${r.height.toFixed(1)}`);
      }
    }
    return out;
  }, FLOOR);
}

async function h1Count(page: Page) {
  return page.locator("h1").count();
}

for (const lang of ["en", "fr"] as const) {
  const t = LANG[lang];

  test.describe(`BUG-662 — the activation consent is a 44 px target (${lang})`, () => {
    test.use({ locale: t.locale });

    for (const width of X1_WIDTHS) {
      test(`${width}px: label ≥ 44 × 44 holding the checkbox, links ≥ 44 tall, a press anywhere on the label toggles it`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 900 });
        await signIn(page, lang, PENDING, /\/activate$/);
        const consent = page.getByRole("checkbox", { name: t.consent });
        const submit = page.getByRole("button", { name: t.submit });
        // The BUG-023 rule is untouched: never pre-ticked, the submit waits for the tick.
        await expect(consent).not.toBeChecked();
        await expect(submit).toBeDisabled();

        const label = page.locator("label").filter({ has: consent });
        await expect(label).toHaveCount(1);
        const lb = (await label.boundingBox())!;
        const cb = (await consent.boundingBox())!;
        expect(lb.height, "the label's height").toBeGreaterThanOrEqual(FLOOR);
        expect(lb.width, "the label's width").toBeGreaterThanOrEqual(FLOOR);
        expect(cb.x >= lb.x && cb.y >= lb.y && cb.x + cb.width <= lb.x + lb.width + 0.5 && cb.y + cb.height <= lb.y + lb.height + 0.5, "the checkbox is inside its label's box").toBe(true);

        for (const name of [t.terms, t.privacy]) {
          const link = page.getByRole("link", { name });
          const b = (await link.boundingBox())!;
          expect(b.height, `${name} height`).toBeGreaterThanOrEqual(FLOOR);
          expect(b.width, `${name} width`).toBeGreaterThanOrEqual(FLOOR);
        }

        // Presses on the label away from the box: its far end, and its bottom-left corner.
        await label.click({ position: { x: lb.width - 6, y: lb.height / 2 } });
        await expect(consent, "a press at the label's far end ticks it").toBeChecked();
        await label.click({ position: { x: 4, y: lb.height - 4 } });
        await expect(consent, "a press at its bottom-left corner unticks it").not.toBeChecked();

        await expectNoSidewaysScroll(page, `/activate (${lang})`);
      });
    }

    test("keyboard: the consent row and each legal link draw a focus ring", async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 900 });
      await signIn(page, lang, PENDING, /\/activate$/);
      const consent = page.getByRole("checkbox", { name: t.consent });
      await page.getByLabel(t.repeat).focus();
      await page.keyboard.press("Tab");
      await expect(consent).toBeFocused();
      const row = page.locator("label").filter({ has: consent });
      const ring = await row.evaluate((el) => {
        const s = getComputedStyle(el);
        return { style: s.outlineStyle, width: s.outlineWidth, color: s.outlineColor };
      });
      expect(ring, "the row's ring while its checkbox has keyboard focus").toEqual({
        style: "solid",
        width: "2px",
        color: "rgb(79, 124, 255)",
      });
      for (const name of [t.terms, t.privacy]) {
        await page.keyboard.press("Tab");
        const link = page.getByRole("link", { name });
        await expect(link).toBeFocused();
        const linkRing = await link.evaluate((el) => {
          const s = getComputedStyle(el);
          return { style: s.outlineStyle, width: s.outlineWidth };
        });
        expect(linkRing, `${name} ring`).toEqual({ style: "solid", width: "2px" });
      }
      // Nothing else on the row lost its ring: unfocused, the row draws none.
      await page.getByLabel(t.repeat).focus();
      expect(await row.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("none");
    });
  });
}

/**
 * Edge case 4 / R1: the invitation is a trainee's page. It reads no session, so a browser
 * that signed in as a coach — and is still signed in, or has signed out since — gets the
 * same Evoli Fit page as a stranger: no black mark, no « Evoli Pro », no Pro favicon.
 */
test.describe("edge case 4 — /i/* never shows the Evoli Pro mark", () => {
  /**
   * What a visitor SEES: the painted DOM, the favicon and the home-screen icon. Not the raw
   * HTML: Next 14 serialises the ROOT not-found into every page's flight data (EV-241), and
   * that tree carries the Pro mark although it is never painted on an /i page.
   *
   * ⚠ Known gap, not asserted here: the FIRST HTML of the 404s (`/i`, `/i/<token>/x`)
   * declares the ROOT favicon (`/icon.svg`, the Pro mark) — witnessed under `next dev` and
   * `next start`. The icons read below are
   * the DOM's after load, which are the `/i` ones. A no-JS reader of those two 404s still
   * gets the Pro favicon; the fix would be a middleware 404 rewrite (as /clients/denied's
   * 403), left to review. The invitation itself declares `/i/icon.svg` from its first byte.
   */
  async function expectNoProMark(page: Page, path: string, status: number, where: string) {
    const res = await page.goto(path);
    expect(res?.status(), where).toBe(status);
    await expect(page.locator('[data-brand-mark="ink"]'), `${where}: the black tile`).toHaveCount(0);
    await expect(page.locator(`svg path[d="${MARK_PATH}"]`), `${where}: the Pro mark's path, drawn`).toHaveCount(0);
    await expect(page.getByText("Evoli Pro", { exact: true }), `${where}: the Pro wordmark`).toHaveCount(0);
    await expect(page.getByText("Evoli Fit", { exact: true }).first(), `${where}: the trainee mark`).toBeVisible();
    // No shell either: nothing on these pages belongs to a coach's session.
    await expect(page.getByRole("navigation"), `${where}: no portal navigation`).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Sign out" }), `${where}: no sign-out`).toHaveCount(0);
    const favicon = page.locator('head link[rel="icon"]');
    await expect(favicon, `${where}: one favicon`).toHaveCount(1);
    await expect(favicon).toHaveAttribute("href", /^\/i\/icon\.svg/);
    const touch = page.locator('head link[rel="apple-touch-icon"]');
    await expect(touch).toHaveAttribute("href", /^\/i\/apple-icon\.png/);
    const svg = await page.request.get((await favicon.getAttribute("href"))!);
    expect(await svg.text(), `${where}: the favicon is not drawn from the Pro mark`).not.toContain(MARK_PATH);
  }

  /** The invitation, and the two /i URLs that are not one (404 from the /i segment). */
  const PATHS = [
    { path: INVITE, status: 200, what: "the invitation" },
    { path: "/i/edge-case-4-token/extra/segments", status: 404, what: "a mangled invite link" },
    { path: "/i", status: 404, what: "/i alone" },
  ] as const;

  test("signed out, never signed in", async ({ page }) => {
    for (const p of PATHS) await expectNoProMark(page, p.path, p.status, `a stranger on ${p.what}`);
  });

  test("signed in as a coach in the same browser", async ({ page }) => {
    await signIn(page, "en", COACH, "/");
    // The witness that the browser IS a signed-in coach's: the roster shows the Pro mark.
    await expect(page.locator('[data-brand-mark="ink"]').first()).toBeVisible();
    for (const p of PATHS) await expectNoProMark(page, p.path, p.status, `a signed-in coach's browser on ${p.what}`);
  });

  test("signed in as a coach, then signed out", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await signIn(page, "en", COACH, "/");
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.waitForURL(/\/login$/);
    for (const p of PATHS) await expectNoProMark(page, p.path, p.status, `after sign-out, on ${p.what}`);
  });

  test("the /i 404 keeps EV-241's signed-out sentences and its way to sign-in", async ({ page }) => {
    const res = await page.goto("/i/edge-case-4-token/extra");
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.getByRole("link", { name: "Go to sign-in" })).toHaveAttribute("href", "/login");
    // The token is never printed, on the 404 either.
    expect(await page.locator("body").innerText()).not.toContain("edge-case-4-token");
  });

  test("the coach's initials circle shows only the ?coach= name, and nothing without it", async ({ page }) => {
    await page.goto(INVITE);
    await expect(page.getByTestId("invite-coach-initials")).toHaveText("AR");
    await page.goto("/i/edge-case-4-token");
    await expect(page.getByTestId("invite-coach-initials")).toHaveCount(0);
  });
});

/**
 * X1 / X3 / X4 on /login, /activate, /i/* and /clients/denied, in both languages. The
 * login's primary fill is R2's darker gradient (A3), read from the computed style.
 */
for (const lang of ["en", "fr"] as const) {
  const t = LANG[lang];

  test.describe(`X1 / X3 / X4 — the shell-less screens (${lang})`, () => {
    test.use({ locale: t.locale });

    async function sweep(page: Page, label: string) {
      for (const width of X1_WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        await expectNoSidewaysScroll(page, `${label} (${lang})`);
        expect(await h1Count(page), `${label} at ${width}px: one h1`).toBe(1);
      }
      await page.setViewportSize({ width: 390, height: 900 });
      expect(await undersized(page.locator("body")), `${label} at 390px: controls under 44 px`).toEqual([]);
      // X6: a French page carries no English UI string (the dictionary-driven scan).
      if (lang === "fr") await expectNoEnglish(page, label);
    }

    test("/login", async ({ page }) => {
      await page.goto("/login");
      await sweep(page, "/login");
      const fill = await page
        .getByRole("button", { name: t.signIn, exact: true })
        .evaluate((el) => getComputedStyle(el).backgroundImage);
      expect(fill).toContain("rgb(58, 95, 224)");
      expect(fill).toContain("rgb(116, 64, 224)");
      // An error state keeps one h1 too.
      await page.goto("/login?error=expired");
      await expect(page.locator("form").getByRole("alert")).toBeVisible();
      expect(await h1Count(page)).toBe(1);
    });

    test("/activate", async ({ page }) => {
      await signIn(page, lang, PENDING, /\/activate$/);
      await sweep(page, "/activate");
    });

    test("/activate, expired", async ({ page }) => {
      await signIn(page, lang, { email: "expired.coach@evoli.fit", password: PENDING.password }, /\/activate$/);
      await expect(page.getByRole("checkbox")).toHaveCount(0);
      await sweep(page, "/activate (expired)");
    });

    test("/i/*", async ({ page }) => {
      await page.goto(INVITE);
      await sweep(page, "/i/*");
    });

    test("/clients/denied: served 403, AC5's sentence as the one h1, a real link back", async ({ page }) => {
      await signIn(page, lang, COACH, "/");
      const res = await page.goto("/clients/denied");
      expect(res?.status()).toBe(403);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(t.denied);
      const back = page.getByRole("main").getByRole("link", { name: t.back });
      await expect(back).toHaveAttribute("href", "/");
      // A link drawn as a button, not a link wrapped round a <button>.
      await expect(back.locator("button")).toHaveCount(0);
      await sweep(page, "/clients/denied");
    });
  });
}

/** The FR/EN switch on /login works before anyone signs in (R3), and keeps what was typed. */
test.describe("the language switch on /login", () => {
  test.use({ locale: "fr-FR" });

  test("EN re-renders the page in English, writes the cookie, and keeps the typed address", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { level: 1, name: "Connexion" })).toBeVisible();
    await page.getByLabel("Adresse e-mail", { exact: true }).fill("someone@example.com");
    await page.getByRole("radio", { name: /^EN/ }).check();
    await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByLabel("Email", { exact: true })).toHaveValue("someone@example.com");
    const cookie = (await page.context().cookies()).find((c) => c.name === "evoli_pro_locale");
    expect(cookie?.value).toBe("en");
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
  });

  test("edge case 1: a tampered locale cookie is ignored on the shell-less pages", async ({ browser, baseURL }) => {
    for (const path of ["/login", INVITE]) {
      for (const [acceptLanguage, lang] of [
        [undefined, "fr"],
        ["en-GB", "en"],
      ] as const) {
        const html = await langOf(browser, String(baseURL), path, acceptLanguage);
        expect(html, `${path}, cookie xx, Accept-Language ${acceptLanguage ?? "(none)"}`).toBe(lang);
      }
    }
  });
});

/** `<html lang>` of `path` for a browser holding the cookie `evoli_pro_locale=xx`. */
async function langOf(browser: Browser, baseURL: string, path: string, acceptLanguage: string | undefined) {
  // A bare context sends no Accept-Language at all; `locale` is what makes Chromium send one
  // on a navigation (measured: with an `extraHTTPHeaders` Accept-Language the page rendered French).
  const context = await browser.newContext({ baseURL, ...(acceptLanguage ? { locale: acceptLanguage } : {}) });
  try {
    await context.addCookies([{ name: "evoli_pro_locale", value: "xx", url: baseURL }]);
    const page = await context.newPage();
    await page.goto(path);
    return await page.locator("html").getAttribute("lang");
  } finally {
    await context.close();
  }
}
