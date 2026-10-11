// The ONE api call fixture mode still makes: `POST /auth/refresh` (middleware's rotation and
// `routeAccessToken`, which call `fetch`/`apiPost` directly). For the session-epoch specs
// (BUG-745, ADR-0033 D33.14): a rotation that is NOT a boundary (U4, W10) and a refused refresh
// that IS one (W8). Everything else stays in the fixture.
//
//   refresh token "refused…"            → 401, the api refusing it (middleware's toLogin)
//   refresh token "rotate:<ROLE>:<email>" → 200, a fresh pair: an unsigned fixture-shaped access
//                                          token with that role, valid 15 min
//
//   STUB_API_PORT=3532 node qa/session-epoch-stub-api.mjs
import http from "node:http";

const port = Number(process.env.STUB_API_PORT || 3532);
let refreshes = 0;
let n = 0;

const enc = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
function mint(email, roles) {
  const payload = { sub: "1a2b3c4d-0000-4000-8000-00000000c0ac", email, roles, exp: Math.floor(Date.now() / 1000) + 900 };
  return `${enc({ alg: "none", typ: "JWT" })}.${enc(payload)}.fixture`;
}

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

http
  .createServer((req, res) => {
    const url = new URL(req.url, "http://stub");
    if (url.pathname === "/__health") return json(res, 200, { ok: true });
    if (url.pathname === "/__count") return json(res, 200, { refreshes });
    if (url.pathname === "/__reset") {
      refreshes = 0;
      return json(res, 200, { ok: true });
    }
    if (url.pathname === "/auth/refresh" && req.method === "POST") {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        refreshes += 1;
        let token = "";
        try {
          token = JSON.parse(raw).refreshToken || "";
        } catch {
          /* empty */
        }
        if (token.startsWith("rotate:")) {
          const [, role, email] = token.split(":");
          n += 1;
          return json(res, 200, {
            accessToken: mint(email || "coach@evoli.fit", role === "PENDING" ? ["PENDING"] : ["USER", "COACH"]),
            refreshToken: `rotate:${role}:${email}:${n}`,
            expiresIn: 900,
          });
        }
        return json(res, 401, { code: "AUTH_INVALID_REFRESH", message: "refresh token refused", details: null });
      });
      return;
    }
    json(res, 404, { code: "NOT_FOUND", message: req.url, details: null });
  })
// eslint-disable-next-line no-console
  .listen(port, () => console.log(`session-epoch stub api on ${port}`));
