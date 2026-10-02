import { expect, type APIResponse } from "@playwright/test";
import { test } from "./fixture-test";

/**
 * EV-337n N5 / BUG-678 — every `/i` path that is not `/i/<one segment>` is the TRAINEE 404:
 * status 404, the `/i` head (Evoli Fit title, `/i` icons, the invitation's description) and
 * the server-rendered « Page introuvable » view, for any Accept-Language.
 *
 * On Vercel (production `46eb8b7`) `/i/tok/extra` and `/i/a/b/c` answered
 * `x-matched-path: /_not-found` — the ROOT 404, Evoli Pro title and icons — because the
 * middleware rewrote them onto themselves, which only the DYNAMIC `/i/[token]/[...rest]` can
 * serve, and Vercel did not resolve it. `next start` and `next dev` did, so the head checks
 * below were green here while production was wrong. What this suite CAN see locally is the
 * mechanism: `x-middleware-rewrite` names the route each request was rewritten to, and for a
 * deep path it must be the concrete `/i/no-invitation` (red on the base, where it is the path
 * itself). The deployment itself is checked by `qa/probes/invite-404-deployment.mjs <url>`.
 *
 * Raw HTML only (`page.request`): the first bytes are what a link preview, a no-JS reader
 * and "Add to Home Screen" get. Sentences are literals, never read from the dictionaries.
 */

/** 43 characters of base64url: the shape of a real b-fit-api invite token. */
const TOKEN = "Qm9fN2xRk4TzW8vYh1sLc3pGd6uJx0aEoB5nVi-_tKw";
const DEEP = ["/i/tok/extra", "/i/a/b/c", `/i/${TOKEN}/x`, `/i/${TOKEN}/x?coach=Alex%20Roussel`, "/i/no-invitation"];

const LANGS = {
  en: { header: "en-US,en;q=0.9", h1: "Page not found", description: "Open the invite in the Evoli Fit app to see who is inviting you. Nothing is shared until you accept." },
  fr: {
    header: "fr-FR,fr;q=0.9",
    h1: "Page introuvable",
    description: "Ouvrez l'invitation dans l'app Evoli Fit pour voir qui vous invite. Rien n'est partagé tant que vous n'avez pas accepté.",
  },
  // No Accept-Language at all (a crawler, a link-preview bot): French, by the locale rule.
  none: {
    header: null,
    h1: "Page introuvable",
    description: "Ouvrez l'invitation dans l'app Evoli Fit pour voir qui vous invite. Rien n'est partagé tant que vous n'avez pas accepté.",
  },
} as const;

function decode(s: string) {
  return s.replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
}

/** The real `<title>`, icon `<link>`s, description and `<h1>`s of a document (not its script payload). */
function documentOf(html: string) {
  const titles = Array.from(html.matchAll(/<title>([^<]*)<\/title>/g), (m) => decode(m[1]));
  const icons = Array.from(html.matchAll(/<link\b[^>]*>/g), (m) => m[0])
    .map((tag) => ({ rel: /\brel="([^"]*)"/.exec(tag)?.[1] ?? "", href: /\bhref="([^"]*)"/.exec(tag)?.[1] ?? "" }))
    .filter((link) => /(^|\s)(icon|apple-touch-icon|shortcut icon)(\s|$)/.test(link.rel));
  const description = decode(/<meta name="description" content="([^"]*)"/.exec(html)?.[1] ?? "");
  const h1s = Array.from(html.matchAll(/<h1\b[^>]*>([^<]*)<\/h1>/g), (m) => decode(m[1]));
  return { titles, icons, description, h1s };
}

async function expectTraineeHead(res: APIResponse, where: string, lang: (typeof LANGS)[keyof typeof LANGS]) {
  expect(res.status(), `${where}: status`).toBe(404);
  const html = await res.text();
  const doc = documentOf(html);
  expect(doc.titles, `${where}: <title>`).toEqual(["Evoli Fit"]);
  expect(doc.icons.map((i) => i.rel).sort(), `${where}: one favicon and one home-screen icon`).toEqual(["apple-touch-icon", "icon"]);
  expect(doc.icons.find((i) => i.rel === "icon")?.href, `${where}: favicon`).toBe("/i/icon.svg");
  expect(doc.icons.find((i) => i.rel === "apple-touch-icon")?.href, `${where}: home-screen icon`).toBe("/i/apple-icon.png");
  expect(doc.description, `${where}: description`).toBe(lang.description);
  // Server-rendered, not Next's empty-bodied error shell (QA PB-1).
  expect(doc.h1s, `${where}: the one h1, in the first HTML`).toEqual([lang.h1]);
  expect(html, `${where}: not the error shell`).not.toContain('id="__next_error__"');
  expect(html, `${where}: the trainee view`).toContain('data-testid="not-found"');
  // EV-229's headers ride the 404 as they ride every page.
  const headers = res.headers();
  expect(headers["x-frame-options"], `${where}: X-Frame-Options`).toBe("DENY");
  expect(headers["content-security-policy"], `${where}: CSP`).toBe("frame-ancestors 'none'");
  expect(headers["cache-control"], `${where}: Cache-Control`).toContain("no-store");
  return html;
}

test.describe("BUG-678 — /i paths deeper than one segment are the trainee 404", () => {
  for (const [name, lang] of Object.entries(LANGS)) {
    for (const path of DEEP) {
      test(`${path} (${name} Accept-Language) is 404 under the /i head, rewritten to the concrete /i/no-invitation`, async ({ playwright, baseURL }) => {
        // A bare request context: no browser default Accept-Language, no cookies.
        const ctx = await playwright.request.newContext({
          baseURL,
          extraHTTPHeaders: lang.header ? { "Accept-Language": lang.header } : {},
        });
        try {
          const res = await ctx.get(path, { maxRedirects: 0 });
          const html = await expectTraineeHead(res, path, lang);
          // The mechanism (red on the base: the deep path was rewritten onto itself, the
          // dynamic route Vercel did not serve).
          expect(res.headers()["x-middleware-rewrite"], `${path}: rewritten to the concrete page`).toBe("/i/no-invitation");
          // The token in the URL is never printed back: not in the head, not in the drawn page.
          // (Next's flight payload carries the requested URL as `urlParts`; that is the
          // address bar's own content, not something the page prints.)
          const head = /<head>[\s\S]*?<\/head>/.exec(html)?.[0] ?? "";
          const main = /<main\b[\s\S]*?<\/main>/.exec(html)?.[0] ?? "";
          expect(main, `${path}: the page is drawn`).not.toBe("");
          expect(head + main, `${path}: the token is not in the head or the page`).not.toContain(TOKEN);
        } finally {
          await ctx.dispose();
        }
      });
    }
  }

  test("/i alone is unchanged: 404 under the /i head, rewritten onto itself", async ({ playwright, baseURL }) => {
    const ctx = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { "Accept-Language": LANGS.en.header } });
    try {
      const res = await ctx.get("/i", { maxRedirects: 0 });
      await expectTraineeHead(res, "/i", LANGS.en);
      expect(res.headers()["x-middleware-rewrite"]).toBe("/i");
    } finally {
      await ctx.dispose();
    }
  });

  test("an invitation is still a 200, not rewritten, under its own title", async ({ playwright, baseURL }) => {
    const ctx = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { "Accept-Language": LANGS.en.header } });
    try {
      for (const path of [`/i/${TOKEN}`, "/i/tok"]) {
        const res = await ctx.get(path, { maxRedirects: 0 });
        expect(res.status(), path).toBe(200);
        expect(res.headers()["x-middleware-rewrite"], `${path}: not rewritten`).toBeUndefined();
        const doc = documentOf(await res.text());
        expect(doc.titles, path).toEqual(["Your coach invited you to Evoli"]);
        expect(doc.icons.map((i) => i.href).sort(), path).toEqual(["/i/apple-icon.png", "/i/icon.svg"]);
      }
    } finally {
      await ctx.dispose();
    }
  });

  test("a write to a deep /i path is still refused with 405, before any rewrite", async ({ playwright, baseURL }) => {
    const ctx = await playwright.request.newContext({ baseURL });
    try {
      for (const path of ["/i/tok/extra", "/i/no-invitation"]) {
        const res = await ctx.post(path, { maxRedirects: 0 });
        expect(res.status(), path).toBe(405);
        expect(res.headers()["allow"], path).toBe("GET, HEAD");
      }
    } finally {
      await ctx.dispose();
    }
  });

  test("outside /i the root 404 is unchanged: the Pro head, and a guarded path still goes to /login", async ({ playwright, baseURL }) => {
    const ctx = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { "Accept-Language": LANGS.en.header } });
    try {
      const guarded = await ctx.get("/does-not-exist-route", { maxRedirects: 0 });
      expect(guarded.status()).toBe(307);
      expect(guarded.headers()["location"]).toBe("/login");
      // An unguarded unknown path (the matcher excludes /api/auth) reaches the ROOT 404.
      const root = await ctx.get("/api/auth/does-not-exist-route", { maxRedirects: 0 });
      expect(root.status()).toBe(404);
      const doc = documentOf(await root.text());
      expect(doc.titles).toEqual(["Evoli Pro"]);
      expect(doc.icons.find((i) => i.rel === "icon")?.href).toMatch(/^\/icon\.svg/);
      expect(doc.h1s).toEqual(["Page not found"]);
    } finally {
      await ctx.dispose();
    }
  });
});
