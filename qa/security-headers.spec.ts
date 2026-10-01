import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { expect } from "@playwright/test";
import { test } from "./fixture-test";

/**
 * EV-229 — the portal cannot be framed, and sends the standard security headers.
 *
 *   AC1 — every response (pages and /api/*) carries X-Frame-Options: DENY,
 *         Content-Security-Policy: frame-ancestors 'none', X-Content-Type-Options:
 *         nosniff and Referrer-Policy: strict-origin-when-cross-origin.
 *   AC2 — a Playwright test fetches /login, /clients and /api/version and asserts all four.
 *   AC3 — a page that iframes the portal does not render it.
 *   Failure clause: headers on pages but not on /api/* (or the reverse) = not done.
 *
 * Beyond the AC's three paths, the same check runs on the answers that do NOT come from a
 * page: a middleware redirect (a signed-out /clients/{id}), a middleware 405, an
 * /api/auth/* handler (excluded from middleware's matcher) and a static asset.
 * Permissions-Policy is the coordinator's addition to the story's four, asserted the same way.
 */

const EXPECTED: Record<string, string> = {
  "x-frame-options": "DENY",
  "content-security-policy": "frame-ancestors 'none'",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
};

function expectHeaders(path: string, headers: Record<string, string>) {
  for (const [name, value] of Object.entries(EXPECTED)) {
    // Exact, so a header sent twice ("DENY, DENY", which a browser may reject) fails too.
    expect(headers[name], `${path}: ${name}`).toBe(value);
  }
}

test.describe("EV-229 AC1/AC2 — every response carries the headers", () => {
  for (const path of ["/login", "/clients", "/api/version"]) {
    test(`GET ${path}`, async ({ request }) => {
      const res = await request.get(path, { maxRedirects: 0 });
      expectHeaders(path, res.headers());
    });
  }

  test("a middleware redirect, a middleware 405, an /api/auth handler and a static asset", async ({
    request,
    page,
  }) => {
    const redirect = await request.get("/clients/6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001", { maxRedirects: 0 });
    expect(redirect.status(), "signed out, a trainee page redirects to /login").toBe(307);
    expectHeaders("signed-out /clients/{id} (307)", redirect.headers());

    const notAllowed = await request.post("/api/version", { maxRedirects: 0 });
    expect(notAllowed.status()).toBe(405);
    expectHeaders("POST /api/version (405)", notAllowed.headers());

    const logout = await request.post("/api/auth/logout", { maxRedirects: 0 });
    expectHeaders(`POST /api/auth/logout (${logout.status()})`, logout.headers());

    await page.goto("/login");
    const asset = await page.evaluate(
      () => Array.from(document.querySelectorAll("script[src]")).map((s) => (s as HTMLScriptElement).src)[0]
    );
    expect(asset, "the login page loads at least one script asset").toBeTruthy();
    const assetRes = await request.get(asset);
    expect(assetRes.ok()).toBe(true);
    expectHeaders("a /_next/static script", assetRes.headers());
  });
});

test.describe("EV-229 AC3 — a page that iframes the portal does not render it", () => {
  test("the framed document never reaches the login form", async ({ page, baseURL }) => {
    /**
     * The framing page comes from ANOTHER origin, as an attacker's would: a real HTTP
     * server this test owns, on 127.0.0.1 and a port the OS picks (127.0.0.1 is not
     * `localhost` to the browser's origin check). It has to be a real loopback server:
     * a page fulfilled by `page.route`, or one on a public host, is refused by Chromium's
     * local-network-access check before the portal ever answers, which would pass this
     * test on main for a reason that has nothing to do with the headers (witnessed:
     * net::ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS).
     */
    const framer: Server = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(`<!doctype html><title>framer</title><iframe src="${baseURL}/login" width="800" height="600"></iframe>`);
    });
    await new Promise<void>((resolve) => framer.listen(0, "127.0.0.1", resolve));
    const { port } = framer.address() as AddressInfo;

    try {
      /** Control: the same login page, opened top-level, does render its form. */
      await page.goto("/login");
      await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();

      const portalResponse = page.waitForResponse((r) => r.url() === `${baseURL}/login`);
      await page.goto(`http://127.0.0.1:${port}/`);
      // The portal DID answer the frame's request: what stops it is the response's headers.
      const res = await portalResponse;
      expect(res.status()).toBe(200);
      // Give a frame that WOULD load the time to do so before reading its state.
      await page.waitForTimeout(1500);

      const frame = page.frames().find((f) => f !== page.mainFrame());
      expect(frame, "the iframe exists").toBeTruthy();
      // A refused frame is left on the browser's error page, holding no login form.
      expect(frame!.url(), "the frame navigated to the portal").not.toBe(`${baseURL}/login`);
      expect(await frame!.locator("form").count(), "the login form rendered inside a foreign page").toBe(0);
    } finally {
      await new Promise<void>((resolve) => framer.close(() => resolve()));
    }
  });
});
