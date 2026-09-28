import { createServer } from "node:http";

/**
 * EV-278c — a stub of b-fit-api `c69c287` for the activation flow, so the portal's LIVE
 * code path runs: `/api/auth/login`'s bearer-explicit `GET /me/activation`, `apiFetch`'s
 * `Retry-After` read, `/api/auth/activate`'s token swap. The fixture skips all three.
 *
 * What it models, each from the api's own source at `c69c287`:
 *   - the PENDING allowlist (`SecurityConfig`): a `["PENDING"]` bearer reaches
 *     `GET /me/activation` and `POST /me/activate` and NOTHING under `/coach-portal/`
 *     (403 AUTH_FORBIDDEN), and every such refusal is COUNTED so a spec can prove the
 *     portal never tried;
 *   - `token_version` (`RefreshTokenUseCase`): activation bumps it, so the refresh token
 *     minted for the pending session answers 401 afterwards;
 *   - `AccountActivationUseCase`'s order of checks, and a 429 with `Retry-After`;
 *   - `GET /legal/versions` with values the fixture does NOT use (v2.3 / v1.7), so a
 *     portal that hard-coded "v1.0" would send the wrong versions here and be caught;
 *   - a LOST REPLY (`lost@stub.test`): the activation commits, then the socket is
 *     destroyed before a byte is written, so the portal cannot know the outcome. The api
 *     compares `token_version` on REFRESH only (`RefreshTokenUseCase`; the access filter
 *     does not), so the session's PENDING access token still reads `GET /me/activation`
 *     — which now answers `pending: false`. Modelled the same way here.
 *
 * Tokens are unsigned (`alg: none`), like the other stubs: `src/lib/jwt.ts` only decodes.
 */

const PORT = Number(process.env.ACTIVATION_STUB_PORT || 8097);
const TEMP = "Temp-pass-2026";
const LEGAL = { privacyPolicyVersion: "v2.3", termsVersion: "v1.7" };

const b64url = (o) =>
  Buffer.from(JSON.stringify(o)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const decode = (token) => {
  try {
    const part = String(token).split(".")[1];
    return JSON.parse(Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
  } catch {
    return null;
  }
};

let state;
function reset() {
  const account = (overrides) => ({
    grantedRole: "COACH",
    creatorKind: "ADMIN",
    creatorName: "Evoli",
    expiresAt: "2036-10-27T09:30:00Z",
    activated: false,
    password: TEMP,
    tokenVersion: 0,
    behaviour: "NONE",
    ...overrides,
  });
  state = {
    accounts: new Map([
      ["pending@stub.test", account({ sub: "2780c000-0000-4000-8000-0000000000a1" })],
      ["throttled@stub.test", account({ sub: "2780c000-0000-4000-8000-0000000000a2", behaviour: "THROTTLED" })],
      ["midway@stub.test", account({ sub: "2780c000-0000-4000-8000-0000000000a3", behaviour: "EXPIRES_MIDWAY" })],
      ["lost@stub.test", account({ sub: "2780c000-0000-4000-8000-0000000000a4", behaviour: "LOSES_REPLY" })],
    ]),
    journal: [],
    pendingPortalRefusals: 0,
    activationBodies: [],
    // Staff round 3: `/__refresh-fails?status=503|429` makes `/auth/refresh` answer that,
    // as b-fit-api does when it is down (5xx) or when `AuthRateLimitGuard.onRefresh`
    // throttles the portal server's IP (429, with `Retry-After`). 0 = answer normally.
    refreshFailure: 0,
  };
}
reset();

function mint(email, account, type) {
  const roles = account.activated ? [account.grantedRole] : ["PENDING"];
  return `${b64url({ alg: "none", typ: "JWT" })}.${b64url({
    sub: account.sub,
    email,
    roles,
    tv: account.tokenVersion,
    typ: type,
    nonce: `${Date.now()}-${Math.random()}`,
    exp: Math.floor(Date.now() / 1000) + 60 * 60,
  })}.stub`;
}
const tokensFor = (email, account) => ({
  accessToken: mint(email, account, "access"),
  refreshToken: mint(email, account, "refresh"),
  expiresIn: 60 * 60,
});

const json = (res, status, body, headers = {}) => {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload), ...headers });
  res.end(payload);
};
const readBody = (req) =>
  new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(raw || "{}"));
      } catch {
        resolve({});
      }
    });
  });

/** The principal behind a bearer, or null when the token is unknown or its version is stale. */
function principal(req) {
  const bearer = (req.headers.authorization || "").replace(/^Bearer /, "");
  const claims = decode(bearer);
  if (!claims?.email) return null;
  // An expired access token is refused, as the api's JWT filter refuses it.
  if (typeof claims.exp !== "number" || claims.exp * 1000 <= Date.now()) return null;
  const account = state.accounts.get(claims.email);
  if (!account) return null;
  return { email: claims.email, account, roles: claims.roles || [] };
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;
  const who = principal(req);
  if (!path.startsWith("/__")) {
    state.journal.push({ method: req.method, path, roles: who ? who.roles : null });
  }

  if (path === "/__health") return json(res, 200, { ok: true });
  if (path === "/__reset") {
    reset();
    return json(res, 200, { ok: true });
  }
  if (path === "/__refresh-fails") {
    state.refreshFailure = Number(url.searchParams.get("status") || 0);
    return json(res, 200, { ok: true, refreshFailure: state.refreshFailure });
  }
  if (path === "/__journal") {
    return json(res, 200, {
      journal: state.journal,
      pendingPortalRefusals: state.pendingPortalRefusals,
      activationBodies: state.activationBodies,
      tokenVersions: Object.fromEntries([...state.accounts].map(([e, a]) => [e, a.tokenVersion])),
    });
  }

  if (path === "/legal/versions" && req.method === "GET") return json(res, 200, LEGAL);

  if (path === "/auth/login" && req.method === "POST") {
    const body = await readBody(req);
    const account = state.accounts.get(String(body.email || "").toLowerCase());
    if (!account || body.password !== account.password) {
      return json(res, 401, { code: "AUTH_INVALID_CREDENTIALS", message: "Invalid credentials" });
    }
    return json(res, 200, tokensFor(body.email.toLowerCase(), account));
  }

  if (path === "/auth/refresh" && req.method === "POST") {
    const body = await readBody(req);
    if (state.refreshFailure === 429) {
      return json(res, 429, { code: "RATE_LIMITED", message: "Too many requests" }, { "Retry-After": "30" });
    }
    if (state.refreshFailure >= 500) {
      return json(res, state.refreshFailure, { code: "INTERNAL_ERROR", message: "Unavailable" });
    }
    const claims = decode(body.refreshToken);
    const account = claims && state.accounts.get(claims.email);
    if (!account || claims.typ !== "refresh" || claims.tv !== account.tokenVersion) {
      return json(res, 401, { code: "AUTH_INVALID_REFRESH_TOKEN", message: "Invalid refresh token" });
    }
    return json(res, 200, tokensFor(claims.email, account));
  }

  if (!who) return json(res, 401, { code: "AUTH_UNAUTHORIZED", message: "Unauthorized" });
  const pending = who.roles.length === 1 && who.roles[0] === "PENDING";

  if (path === "/me/activation" && req.method === "GET") {
    const a = who.account;
    if (a.activated) {
      return json(res, 200, { pending: false, grantedRole: null, expiresAt: null, creatorKind: null, creatorName: null });
    }
    return json(res, 200, {
      pending: true,
      grantedRole: a.grantedRole,
      expiresAt: a.expiresAt,
      creatorKind: a.creatorKind,
      creatorName: a.creatorName,
    });
  }

  if (path === "/me/activate" && req.method === "POST") {
    const body = await readBody(req);
    const a = who.account;
    state.activationBodies.push({
      email: who.email,
      keys: Object.keys(body).sort(),
      consentAccepted: body.consentAccepted,
      privacyPolicyVersion: body.privacyPolicyVersion,
      termsVersion: body.termsVersion,
    });
    if (typeof body.newPassword !== "string" || body.newPassword.length < 8) {
      return json(res, 400, { code: "VALIDATION_ERROR", message: "newPassword" });
    }
    if (a.behaviour === "THROTTLED") {
      return json(res, 429, { code: "RATE_LIMITED", message: "Too many attempts" }, { "Retry-After": "61" });
    }
    if (a.activated) return json(res, 409, { code: "ACCOUNT_ALREADY_ACTIVE", message: "active" });
    if (a.behaviour === "EXPIRES_MIDWAY") {
      return json(res, 410, { code: "ACTIVATION_EXPIRED", message: "expired" });
    }
    if (body.temporaryPassword !== a.password) {
      return json(res, 400, { code: "TEMPORARY_PASSWORD_INVALID", message: "incorrect" });
    }
    if (body.newPassword === a.password) {
      return json(res, 400, { code: "TEMPORARY_PASSWORD_REUSED", message: "reused" });
    }
    if (body.consentAccepted !== true) return json(res, 400, { code: "CONSENT_REQUIRED", message: "consent" });
    if (body.privacyPolicyVersion !== LEGAL.privacyPolicyVersion || body.termsVersion !== LEGAL.termsVersion) {
      return json(res, 409, { code: "CONSENT_VERSION_STALE", message: "stale", details: LEGAL });
    }
    a.activated = true;
    a.password = body.newPassword;
    a.tokenVersion += 1;
    if (a.behaviour === "LOSES_REPLY") {
      // Committed, and the caller never hears so.
      req.socket.destroy();
      return;
    }
    return json(res, 200, tokensFor(who.email, a));
  }

  if (path.startsWith("/coach-portal/")) {
    if (pending) {
      state.pendingPortalRefusals += 1;
      return json(res, 403, { code: "AUTH_FORBIDDEN", message: "Forbidden" });
    }
    if (!who.roles.includes("COACH")) return json(res, 403, { code: "AUTH_FORBIDDEN", message: "Forbidden" });
    if (path === "/coach-portal/me") {
      return json(res, 200, { coachId: who.account.sub, displayName: "New Coach", tier: "STARTER", active: 0, capacity: 2 });
    }
    if (path === "/coach-portal/clients") {
      return json(res, 200, { items: [], page: 0, size: 100, totalElements: 0, totalPages: 0 });
    }
  }

  return json(res, 404, { code: "NOT_FOUND", message: path });
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`activation-stub-api listening on http://localhost:${PORT}`);
});
