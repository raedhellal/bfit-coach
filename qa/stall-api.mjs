import { createServer } from "node:http";

/**
 * A STALLING stand-in for b-fit-api, used by qa/api-timeout.stub.spec.ts only (BUG-690).
 *
 * It makes one thing observable that neither the fixture suite nor a real api can show:
 * what the portal does when b-fit-api accepts a read and never answers. The fixture never
 * calls `apiFetch` at all (it answers in-process), so a fixture hold proves nothing about
 * the transport; a real api cannot be made to hang on demand.
 *
 * Not a fixture, and no screen may be built against it: it serves the smallest bodies the
 * roster needs (`/coach-portal/me`, `/coach-portal/clients`, `/coach-portal/trainees`),
 * and `/coach-portal/clients` is held for `holdMs` (−1 = never answered).
 *
 * Control routes:
 *   /__health, /__reset
 *   /__hold?ms=<n>   hold the roster read n ms (−1: never answer)
 *   /__stats         { clientsRequests, clientsAbandoned }: a request whose connection the
 *                    portal closed before this server answered counts as abandoned — the
 *                    witness that the portal itself gave up, not the browser.
 */

const PORT = Number(process.env.STALL_API_PORT || 8096);

const b64url = (o) =>
  Buffer.from(JSON.stringify(o))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

/** Same claim shape as b-fit-api's JwtTokenService; src/lib/jwt.ts only decodes. */
const ACCESS = `${b64url({ alg: "none", typ: "JWT" })}.${b64url({
  sub: "1a2b3c4d-0000-4000-8000-00000000c0ac",
  email: "coach@evoli.fit",
  roles: ["USER", "COACH"],
  exp: Math.floor(Date.now() / 1000) + 60 * 60 * 8,
})}.stub`;

let state;
function reset() {
  state = { holdMs: 0, clientsRequests: 0, clientsAbandoned: 0 };
}
reset();

const json = (res, status, body) => {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) });
  res.end(payload);
};

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  if (path === "/__health") return json(res, 200, { ok: true });
  if (path === "/__reset") {
    reset();
    return json(res, 200, { ok: true });
  }
  if (path === "/__hold") {
    state.holdMs = Number(url.searchParams.get("ms") ?? 0);
    return json(res, 200, { holdMs: state.holdMs });
  }
  if (path === "/__stats") {
    return json(res, 200, { clientsRequests: state.clientsRequests, clientsAbandoned: state.clientsAbandoned });
  }

  if (path === "/auth/login" && req.method === "POST") {
    req.resume();
    return json(res, 200, { accessToken: ACCESS, refreshToken: "rt-stall", expiresIn: 60 * 60 * 8 });
  }

  if (path.startsWith("/coach-portal/")) {
    if ((req.headers.authorization || "") !== `Bearer ${ACCESS}`) {
      return json(res, 401, { code: "AUTH_UNAUTHORIZED", message: "No session" });
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
    if (path === "/coach-portal/trainees") {
      return json(res, 200, { items: [], page: 0, size: 50, totalElements: 0, totalPages: 0 });
    }
    if (path === "/coach-portal/clients") {
      state.clientsRequests += 1;
      let answered = false;
      res.on("close", () => {
        if (!answered) state.clientsAbandoned += 1;
      });
      const answer = () => {
        answered = true;
        json(res, 200, { items: [], page: 0, size: 100, totalElements: 0, totalPages: 0 });
      };
      if (state.holdMs < 0) return; // never answered
      if (state.holdMs === 0) return answer();
      const timer = setTimeout(answer, state.holdMs);
      res.on("close", () => clearTimeout(timer));
      return;
    }
  }

  return json(res, 404, { code: "NOT_FOUND", message: path });
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`stall-api listening on http://localhost:${PORT}`);
});
