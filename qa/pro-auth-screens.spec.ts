import { expect, type Browser, type Locator, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { expectNoEnglish } from "./french";
import { expectNoSidewaysScroll } from "./layout";
import { MARK_PATH } from "../src/components/ui/brand";
import { sanitiseCoachName } from "../src/lib/inviteName";

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
   * What a visitor SEES: the painted DOM, the tab title, the favicon and the home-screen
   * icon — in the FIRST HTML (what a no-JS reader, a link preview or "Add to Home Screen"
   * before hydration gets) AND in the document after load. Not the raw HTML's script
   * payload: Next 14 serialises the ROOT not-found into every page's flight data (EV-241),
   * and that tree carries the Pro mark although it is never painted on an /i page; only real
   * `<title>` and `<link>` tags are read from the first HTML.
   *
   * Staff on 1f16b4c: the /i 404s served `<title>Evoli Pro</title>` and the root
   * `/icon.svg` + `/apple-icon.png` from the first byte (the title even after load);
   * `src/app/i/layout.tsx` states the /i head explicitly.
   */
  async function expectNoProMark(page: Page, path: string, status: number, title: string, where: string) {
    // The first HTML, with this browser's cookies (page.request shares the context's jar).
    const raw = await page.request.get(path);
    expect(raw.status(), `${where}: first HTML status`).toBe(status);
    const html = await raw.text();
    const head = headOf(html);
    expect(head.titles, `${where}: first HTML <title>`).toEqual([title]);
    expect(head.icons.length, `${where}: first HTML declares icons`).toBeGreaterThanOrEqual(2);
    for (const icon of head.icons) {
      expect(icon.href, `${where}: first HTML <link rel="${icon.rel}">`).toMatch(/^\/i\//);
    }
    expect(head.icons.map((i) => i.rel), `${where}: a favicon and a home-screen icon`).toEqual(
      expect.arrayContaining(["icon", "apple-touch-icon"])
    );

    const res = await page.goto(path);
    expect(res?.status(), where).toBe(status);
    expect(await page.title(), `${where}: document.title after load`).toBe(title);
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
    await expect(touch).toHaveCount(1);
    await expect(touch).toHaveAttribute("href", /^\/i\/apple-icon\.png/);
    for (const href of [await favicon.getAttribute("href"), await touch.getAttribute("href")]) {
      const icon = await page.request.get(href!);
      expect(icon.status(), `${where}: ${href} answers`).toBe(200);
      expect((await icon.body()).toString("latin1"), `${where}: ${href} is not drawn from the Pro mark`).not.toContain(MARK_PATH);
    }
  }

  /**
   * The invitation (its own title, `invitePage.titleFrom`), and the two /i URLs that are not
   * one (404 from the /i segment, titled with the trainee brand). English: the default
   * config's browser.
   */
  const PATHS = [
    { path: INVITE, status: 200, title: "Alex Roussel invited you to Evoli Fit", what: "the invitation" },
    { path: "/i/edge-case-4-token", status: 200, title: "Your coach invited you to Evoli", what: "an invitation with no name" },
    { path: "/i/edge-case-4-token/extra/segments", status: 404, title: "Evoli Fit", what: "a mangled invite link" },
    { path: "/i", status: 404, title: "Evoli Fit", what: "/i alone" },
  ] as const;

  test("signed out, never signed in", async ({ page }) => {
    for (const p of PATHS) await expectNoProMark(page, p.path, p.status, p.title, `a stranger on ${p.what}`);
  });

  test("signed in as a coach in the same browser", async ({ page }) => {
    await signIn(page, "en", COACH, "/");
    // The witness that the browser IS a signed-in coach's: the roster shows the Pro mark.
    await expect(page.locator('[data-brand-mark="ink"]').first()).toBeVisible();
    for (const p of PATHS) await expectNoProMark(page, p.path, p.status, p.title, `a signed-in coach's browser on ${p.what}`);
  });

  test("signed in as a coach, then signed out", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await signIn(page, "en", COACH, "/");
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.waitForURL(/\/login$/);
    for (const p of PATHS) await expectNoProMark(page, p.path, p.status, p.title, `after sign-out, on ${p.what}`);
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

  test("an initial comes only from a word that starts with a letter (staff nit, 1f16b4c)", async ({ page }) => {
    const initials = page.getByTestId("invite-coach-initials");
    const cases: Array<[string, string | null]> = [
      ["(Alex) Roussel", "R"],
      ["(Alex)", null],
      ["\u2066Alex\u2069 Roussel", "R"], // a bidi isolate leads the first word
      ["\u0301Alex Roussel", "R"], // a stray combining mark leads it
      ["2Pac Shakur", "S"],
      ["E\u0301milie Roux", "\u00c9R"], // decomposed É stays one initial
    ];
    for (const [name, expected] of cases) {
      await page.goto(`/i/edge-case-4-token?coach=${encodeURIComponent(name)}`);
      if (expected === null) {
        await expect(initials, JSON.stringify(name)).toHaveCount(0);
      } else {
        const text = (await initials.textContent()) ?? "";
        expect(text.normalize("NFC"), JSON.stringify(name)).toBe(expected);
      }
    }
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

/** The real `<title>` and icon `<link>` tags of a document's HTML (not its script payload). */
function headOf(html: string) {
  const titles = Array.from(html.matchAll(/<title>([^<]*)<\/title>/g), (m) => m[1]);
  const icons = Array.from(html.matchAll(/<link\b[^>]*>/g), (m) => m[0])
    .map((tag) => ({ rel: /\brel="([^"]*)"/.exec(tag)?.[1] ?? "", href: /\bhref="([^"]*)"/.exec(tag)?.[1] ?? "" }))
    .filter((link) => /(^|\s)(icon|apple-touch-icon|shortcut icon)(\s|$)/.test(link.rel));
  return { titles, icons };
}

/**
 * EV-337k round 3 (staff APPROVE WITH NITS + QA PASS on 8b5ca26, coordinator 2026-10-02):
 * the PO's panel sentence, the /i 404s' description and server-rendered body (QA PB-1), an
 * unbreakable coach name (PB-2) and a name cut inside an emoji (PB-3).
 */
test.describe("EV-337k round 3", () => {
  const INVITE_BODY_EN =
    "Open the invite in the Evoli Fit app to see who is inviting you. Nothing is shared until you accept.";

  for (const [locale, panel] of [
    ["en-US", "Routines, nutrition and challenges for your clients, in one place. You see only what each client agreed to share with you."],
    ["fr-FR", "Programmes, nutrition et défis pour vos clients, sur un seul écran. Vous ne voyez que ce que chaque client a accepté de partager avec vous."],
  ] as const) {
    test.describe(locale, () => {
      test.use({ locale });
      test("PO ruling: the login panel says the coach sees only what each client agreed to share", async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 900 });
        await page.goto("/login");
        await expect(page.locator(".login-brand-body")).toHaveText(panel);
      });
    });
  }

  for (const path of ["/i", "/i/round-3-token/extra"]) {
    test(`PB-1: ${path} is a 404 whose FIRST HTML already holds the page, under the /i head`, async ({ page, browser, baseURL }) => {
      const raw = await page.request.get(path);
      expect(raw.status()).toBe(404);
      const html = await raw.text();
      // The h1 and its sentence are in the server's HTML, not added by JavaScript later.
      expect(html).toMatch(/<h1[^>]*>Page not found<\/h1>/);
      expect(html).toContain("There is no page at this address. Check the link, or sign in to Evoli Pro.");
      expect(html).not.toContain('id="__next_error__"');
      // The legal footer is server-rendered too.
      expect(html).toContain('class="legal-footer"');
      // Staff nit: the description is the invitation's, not the coach-facing tagline.
      const description = /<meta name="description" content="([^"]*)"/.exec(html)?.[1];
      expect(description).toBe(INVITE_BODY_EN);
      const head = headOf(html);
      expect(head.titles).toEqual(["Evoli Fit"]);
      for (const icon of head.icons) expect(icon.href).toMatch(/^\/i\//);
      // And with JavaScript off, the page is still there.
      const context = await browser.newContext({ baseURL, javaScriptEnabled: false, locale: "en-US" });
      try {
        const noJs = await context.newPage();
        const res = await noJs.goto(path);
        expect(res?.status()).toBe(404);
        await expect(noJs.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
        await expect(noJs.getByRole("link", { name: "Go to sign-in" })).toHaveAttribute("href", "/login");
      } finally {
        await context.close();
      }
    });
  }

  test("PB-1: the invitation itself is still a 200 with its own title, and its icons answer", async ({ page }) => {
    const raw = await page.request.get(INVITE);
    expect(raw.status()).toBe(200);
    expect(headOf(await raw.text()).titles).toEqual(["Alex Roussel invited you to Evoli Fit"]);
    for (const icon of ["/i/icon.svg", "/i/apple-icon.png"]) expect((await page.request.get(icon)).status()).toBe(200);
  });

  test("PB-2: a 60-character name with no break opportunity never scrolls the invitation sideways", async ({ page }) => {
    const name = "W".repeat(60);
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/i/round-3-token?coach=${name}`);
      await expect(page.getByRole("heading", { level: 1 })).toContainText(name.slice(0, 20));
      await expectNoSidewaysScroll(page, `/i with a 60-character name at ${width}px`);
      const h1 = (await page.getByRole("heading", { level: 1 }).boundingBox())!;
      expect(h1.x + h1.width, `the heading ends inside the viewport at ${width}px`).toBeLessThanOrEqual(width);
    }
  });

  test("PB-3: a name whose 60th character is an emoji answers 200 and keeps the whole emoji", async ({ page }) => {
    const emoji = "\u{1F600}";
    const name = `${"a".repeat(59)}${emoji}bcd`;
    // The cap counts characters (code points), so the 60th is the emoji, whole.
    expect(sanitiseCoachName(name)).toBe(`${"a".repeat(59)}${emoji}`);
    expect(sanitiseCoachName(`${"a".repeat(58)}${emoji}${emoji}`)).toBe(`${"a".repeat(58)}${emoji}${emoji}`);
    const res = await page.goto(`/i/round-3-token?coach=${encodeURIComponent(name)}`);
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(`a${emoji}`);
    const href = await page.getByRole("link", { name: "Open in Evoli Fit", exact: true }).getAttribute("href");
    expect(new URL(href!).searchParams.get("coach")).toBe(`${"a".repeat(59)}${emoji}`);
  });
});
