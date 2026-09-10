import { createServer } from "node:http";

/**
 * A counting stand-in for b-fit-api, used by qa/refresh-single-flight.spec.ts only.
 *
 * It exists to make ONE thing observable that neither the fixture suite nor the live
 * suite can see: how many times `POST /auth/refresh` is called for a single page
 * render. The fixture never calls the api at all, and a real api would answer the
 * question only by rotating a token and silently signing the coach out.
 *
 * It is not a second fixture and no screen may ever be built against it: it serves the
 * smallest possible body for the two roster endpoints and nothing else.
 *
 * The scenario it stages:
 *   - login hands out an access token that is NOT expired (so `middleware.ts` does not
 *     refresh it on the way in) but that this server treats as stale,
 *   - so both api calls of the roster's `Promise.all` come back 401 at the same moment
 *     on EVERY render, because `apiFetch` cannot write the rotated cookie back during a
 *     render (only middleware can) — which makes the count reproducible per render.
 *
 * Refresh issues a new pair but keeps honouring the older refresh tokens, because
 * b-fit-api has no refresh-token revocation: a second concurrent refresh there does not
 * fail, it silently doubles the rotations. That is exactly why the cost has to be
 * counted rather than inferred from a broken screen.
 */

const PORT = Number(process.env.STUB_API_PORT || 8098);

const b64url = (o) =>
  Buffer.from(JSON.stringify(o))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

/** Same claim shape as b-fit-api's JwtTokenService; src/lib/jwt.ts only decodes. */
const mintAccess = (nonce) =>
  `${b64url({ alg: "none", typ: "JWT" })}.${b64url({
    sub: "1a2b3c4d-0000-4000-8000-00000000c0ac",
    email: "coach@evoli.fit",
    roles: ["USER", "COACH"],
    nonce,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 8,
  })}.stub`;

let state = null;
function reset() {
  state = {
    refreshCalls: 0,
    // The token login hands out. Every /coach-portal call with it answers 401.
    staleAccess: mintAccess("stale"),
    freshAccess: new Set(),
    refreshToken: "rt-0",
    issuedRefreshTokens: new Set(["rt-0"]),
  };
}
reset();

const json = (res, status, body) => {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
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

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  if (path === "/__health") return json(res, 200, { ok: true });
  if (path === "/__refresh-count") return json(res, 200, { count: state.refreshCalls });
  if (path === "/__reset-count") {
    // Only the counter, so one specific render can be measured after sign-in.
    state.refreshCalls = 0;
    return json(res, 200, { ok: true });
  }
  if (path === "/__reset") {
    reset();
    return json(res, 200, { ok: true });
  }

  if (path === "/auth/login" && req.method === "POST") {
    return json(res, 200, {
      accessToken: state.staleAccess,
      refreshToken: state.refreshToken,
      expiresIn: 60 * 60 * 8,
    });
  }

  if (path === "/auth/refresh" && req.method === "POST") {
    state.refreshCalls += 1;
    const body = await readBody(req);
    if (!state.issuedRefreshTokens.has(body.refreshToken)) {
      return json(res, 401, { code: "AUTH_INVALID_REFRESH_TOKEN", message: "Unknown token" });
    }
    state.refreshToken = `rt-${Date.now()}-${state.refreshCalls}`;
    state.issuedRefreshTokens.add(state.refreshToken);
    const accessToken = mintAccess(`fresh-${state.refreshCalls}`);
    // Every minted access token stays valid, as a signed unexpired JWT would be at
    // b-fit-api. So a doubled refresh breaks no screen here — it only shows up in the
    // count, which is the whole point of this stub.
    state.freshAccess.add(accessToken);
    return json(res, 200, {
      accessToken,
      refreshToken: state.refreshToken,
      expiresIn: 60 * 60 * 8,
    });
  }

  if (path.startsWith("/coach-portal/")) {
    const bearer = (req.headers.authorization || "").replace(/^Bearer /, "");
    if (!state.freshAccess.has(bearer)) {
      return json(res, 401, { code: "AUTH_UNAUTHORIZED", message: "Stale access token" });
    }
    if (path === "/coach-portal/me") {
      return json(res, 200, {
        coachId: "1a2b3c4d-0000-4000-8000-00000000c0ac",
        displayName: "Alex R.",
        tier: "STARTER",
        active: 0,
        capacity: 2,
      });
    }
    if (path === "/coach-portal/clients") {
      return json(res, 200, { items: [], page: 0, size: 100, totalElements: 0, totalPages: 0 });
    }
  }

  return json(res, 404, { code: "NOT_FOUND", message: path });
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`stub-api listening on http://localhost:${PORT}`);
});
