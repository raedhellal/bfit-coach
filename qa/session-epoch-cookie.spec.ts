import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { expect, type APIRequestContext, type APIResponse } from "@playwright/test";
import { test } from "./fixture-test";

/**
 * BUG-745, ADR-0033 D33.14 point 1 — who writes the session epoch, and who reads it.
 *
 *   U4  the middleware rotation response has no `Set-Cookie` for the epoch, nor has
 *       `routeAccessToken`'s (a rotation is not a boundary);
 *   U5  `toLogin` on a request with no session cookie writes no epoch (and one that carried a
 *       session does: an expiry, a refused refresh);
 *   U6  `clearSession`, sign-in and activation each write a NEW value;
 *   the only reader is `src/lib/sessionEpoch.ts`, middleware and the handlers only write it,
 *   and the root layout's echo into `<html data-session-epoch>` is the one exception.
 *
 * Over HTTP against the real server (`playwright.session.config.ts`: fixture mode, with
 * `qa/session-epoch-stub-api.mjs` answering `POST /auth/refresh`). On `next start` the cookie is
 * `__Host-evoli_pro_epoch` and `Secure`; on `next dev` it is `evoli_pro_epoch`.
 */

const SRC = join(__dirname, "..", "src");

/** The name the server under test writes: production names it `__Host-…`. */
function epochName(baseURL: string | undefined): string {
  return baseURL?.startsWith("https:") ? "__Host-evoli_pro_epoch" : "evoli_pro_epoch";
}

/** An unsigned fixture-shaped token (middleware decodes, never verifies). `exp` in seconds. */
function token(roles: string[], exp: number, email = "coach@evoli.fit"): string {
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${enc({ alg: "none", typ: "JWT" })}.${enc({ sub: "1a2b3c4d-0000-4000-8000-00000000c0ac", email, roles, exp })}.fixture`;
}
const PAST = () => Math.floor(Date.now() / 1000) - 60;

interface SetCookie {
  name: string;
  value: string;
  attrs: string;
}
function setCookies(res: APIResponse): SetCookie[] {
  return res
    .headersArray()
    .filter((h) => h.name.toLowerCase() === "set-cookie")
    .map((h) => {
      const [pair, ...rest] = h.value.split(";");
      const eq = pair.indexOf("=");
      return { name: pair.slice(0, eq).trim(), value: pair.slice(eq + 1).trim(), attrs: rest.join(";").toLowerCase() };
    });
}
const epochOf = (res: APIResponse, name: string) => setCookies(res).filter((c) => c.name === name);

async function fresh(playwright: { request: { newContext: (o: object) => Promise<APIRequestContext> } }, baseURL?: string) {
  return playwright.request.newContext({ baseURL, ignoreHTTPSErrors: true });
}

test.describe("BUG-745 D33.14 — the session epoch cookie", () => {
  test("U4: the middleware rotation writes the session cookies and NO epoch", async ({ playwright, baseURL }) => {
    const api = await fresh(playwright, baseURL);
    try {
      const res = await api.get("/", {
        maxRedirects: 0,
        headers: { Cookie: `evoli_pro_at=${token(["USER", "COACH"], PAST())}; evoli_pro_rt=rotate:COACH:coach@evoli.fit` },
      });
      expect(res.status(), "the rotated session reaches the roster").toBe(200);
      const names = setCookies(res).map((c) => c.name);
      expect(names, "the rotation wrote both session cookies").toEqual(expect.arrayContaining(["evoli_pro_at", "evoli_pro_rt"]));
      expect(epochOf(res, epochName(baseURL)), "a rotation is not a boundary").toEqual([]);
    } finally {
      await api.dispose();
    }
  });

  test("U4: routeAccessToken's rotation (the activation handler) writes NO epoch", async ({ playwright, baseURL }) => {
    const api = await fresh(playwright, baseURL);
    try {
      // An expired PENDING access token and a refresh cookie: the handler rotates, then refuses
      // the body (no consent) with no session change.
      const res = await api.post("/api/auth/activate", {
        maxRedirects: 0,
        headers: {
          Cookie: `evoli_pro_at=${token(["PENDING"], PAST(), "new.coach@evoli.fit")}; evoli_pro_rt=rotate:PENDING:new.coach@evoli.fit`,
        },
        data: {},
      });
      expect(res.status()).toBe(400);
      expect((await res.json()).code).toBe("CONSENT_REQUIRED");
      const names = setCookies(res).map((c) => c.name);
      expect(names, "routeAccessToken stored the rotated pair through writeSession").toEqual(
        expect.arrayContaining(["evoli_pro_at", "evoli_pro_rt"])
      );
      expect(epochOf(res, epochName(baseURL)), "writeSession writes no epoch").toEqual([]);
    } finally {
      await api.dispose();
    }
  });

  test("U5: toLogin on a request with NO session cookie writes no epoch", async ({ playwright, baseURL }) => {
    const api = await fresh(playwright, baseURL);
    try {
      const res = await api.get("/", { maxRedirects: 0 });
      expect(res.status()).toBe(307);
      expect(new URL(res.headers()["location"], baseURL).pathname).toBe("/login");
      expect(epochOf(res, epochName(baseURL))).toEqual([]);
    } finally {
      await api.dispose();
    }
  });

  test("U5: toLogin on a request that carried a session writes a new epoch (expiry, refused refresh, not_coach)", async ({ playwright, baseURL }) => {
    const api = await fresh(playwright, baseURL);
    const name = epochName(baseURL);
    try {
      const cases = [
        { why: "expired access, no refresh", cookie: `evoli_pro_at=${token(["USER", "COACH"], PAST())}` },
        { why: "a refused refresh", cookie: `evoli_pro_at=${token(["USER", "COACH"], PAST())}; evoli_pro_rt=refused` },
        { why: "not a coach", cookie: `evoli_pro_at=${token(["USER"], PAST() + 3600)}` },
        { why: "a refresh cookie alone, refused", cookie: "evoli_pro_rt=refused" },
      ];
      const values = new Set<string>();
      for (const c of cases) {
        const res = await api.get("/", { maxRedirects: 0, headers: { Cookie: c.cookie } });
        expect(res.status(), c.why).toBe(307);
        expect(new URL(res.headers()["location"], baseURL).pathname, c.why).toBe("/login");
        const written = epochOf(res, name);
        expect(written, c.why).toHaveLength(1);
        expect(written[0].value, c.why).toMatch(/^[0-9a-f-]{36}$/);
        expect(written[0].attrs, `${c.why}: readable by scripts`).not.toContain("httponly");
        expect(written[0].attrs).toContain("max-age=34560000");
        expect(written[0].attrs).toContain("path=/");
        expect(written[0].attrs).toContain("samesite=lax");
        if (name.startsWith("__Host-")) expect(written[0].attrs).toContain("secure");
        values.add(written[0].value);
      }
      expect(values.size, "a NEW value each time").toBe(cases.length);
    } finally {
      await api.dispose();
    }
  });

  test("U6: sign-in, sign-out (clearSession) and activation each write a NEW value, never a deletion", async ({ playwright, baseURL }) => {
    const api = await fresh(playwright, baseURL);
    const name = epochName(baseURL);
    try {
      const login = await api.post("/api/auth/login", { data: { email: "coach@evoli.fit", password: "Password123!" } });
      expect(login.status()).toBe(200);
      const atLogin = epochOf(login, name);
      expect(atLogin, "sign-in writes the epoch").toHaveLength(1);

      const logout = await api.post("/api/auth/logout");
      expect(logout.status()).toBe(204);
      const atLogout = epochOf(logout, name);
      expect(atLogout, "sign-out writes the epoch").toHaveLength(1);
      expect(atLogout[0].value, "a value, not a deletion").toMatch(/^[0-9a-f-]{36}$/);
      expect(atLogout[0].attrs, "never Max-Age=0").toContain("max-age=34560000");
      expect(atLogout[0].value).not.toBe(atLogin[0].value);

      // Activation: a PENDING session from the fixture's sign-in, then the finished account.
      const pending = await api.post("/api/auth/login", { data: { email: "new.coach@evoli.fit", password: "Temp-pass-2026" } });
      expect(pending.status()).toBe(200);
      expect((await pending.json()).next).toBe("/activate");
      const atPending = epochOf(pending, name);
      expect(atPending).toHaveLength(1);
      const activated = await api.post("/api/auth/activate", {
        data: {
          temporaryPassword: "Temp-pass-2026",
          newPassword: "Coach-pass-2026",
          consentAccepted: true,
          privacyPolicyVersion: "v1.0",
          termsVersion: "v1.0",
        },
      });
      expect(activated.status()).toBe(200);
      const atActivation = epochOf(activated, name);
      expect(atActivation, "activation writes the epoch").toHaveLength(1);
      expect(new Set([atLogin[0].value, atLogout[0].value, atPending[0].value, atActivation[0].value]).size).toBe(4);
    } finally {
      await api.dispose();
    }
  });

  test("the only reader is sessionEpoch.ts; middleware and the handlers only write; the layout's echo is the one exception", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|tsx)$/.test(name)) files.push(path);
      }
    };
    walk(SRC);
    // Comments out, so an explanation never counts as a use.
    const code = (path: string) =>
      readFileSync(path, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");

    const touching = files.filter((f) => /SESSION_EPOCH_COOKIE|evoli_pro_epoch/.test(code(f))).map((f) => relative(SRC, f)).sort();
    expect(touching).toEqual(["app/layout.tsx", "lib/session.ts", "lib/sessionEpoch.ts", "middleware.ts"].sort());

    // The literal name lives in ONE place.
    for (const f of touching.filter((t) => t !== "lib/sessionEpoch.ts")) {
      expect(code(join(SRC, f)), `${f} names the cookie by the constant`).not.toMatch(/evoli_pro_epoch/);
    }
    // Writers write a NEW value; nothing else.
    for (const f of ["lib/session.ts", "middleware.ts"]) {
      const src = code(join(SRC, f));
      const body = src.replace(/^import[^;]*;$/gm, "");
      const uses = body.match(/SESSION_EPOCH_COOKIE/g)?.length ?? 0;
      const writes =
        body.match(/\.set\(\s*SESSION_EPOCH_COOKIE,\s*newSessionEpoch\(\),\s*sessionEpochCookieOptions\(\)\s*\)/g)?.length ?? 0;
      expect(uses, `${f} writes the epoch`).toBeGreaterThan(0);
      expect(writes, `${f}: every use is a write of a NEW value`).toBe(uses);
    }
    // The layout's echo: one read, and the value only goes into the attribute.
    const layout = code(join(SRC, "app/layout.tsx"));
    expect(layout.match(/SESSION_EPOCH_COOKIE/g)?.length, "imported once, read once").toBe(2);
    expect(layout).toMatch(/\.get\(SESSION_EPOCH_COOKIE\)\?\.value \?\? ""/);
    expect(layout).toMatch(/data-session-epoch=\{epoch\}/);
    // The fixture-only switch that removes layer (d) (ruling R8, staff N2): only in fixture mode,
    // a server-only variable, and nothing else in src renders the attribute.
    expect(layout).toContain('const wakeOff = COACH_API_MODE === "fixture" && jar.get("evoli_fixture_session_wake")?.value === "off";');
    expect(layout).toContain('data-session-wake={wakeOff ? "off" : undefined}');
    const wakeWriters = files.filter((f) => /data-session-wake=/.test(code(f))).map((f) => relative(SRC, f));
    expect(wakeWriters).toEqual(["app/layout.tsx"]);
    // The browser reads it in one place: the parser and `document.cookie` are sessionEpoch.ts's.
    const cookieReaders = files.filter((f) => /document\.cookie/.test(code(f))).map((f) => relative(SRC, f));
    expect(cookieReaders).toEqual(["lib/sessionEpoch.ts"]);
    // `writeSession` (rotation's path through routeAccessToken) writes no epoch.
    const session = code(join(SRC, "lib/session.ts"));
    const writeSession = session.slice(session.indexOf("export function writeSession"), session.indexOf("export function beginSessionEpoch"));
    expect(writeSession).toContain("REFRESH_COOKIE");
    expect(writeSession).not.toMatch(/SESSION_EPOCH|beginSessionEpoch|newSessionEpoch/);
  });
});
