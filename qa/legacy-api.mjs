import { createServer } from "node:http";

/**
 * b-fit-api **as deployed on main today** (cc9a3c8), reproduced exactly where it
 * differs from the api this branch is written against.
 *
 * Why this exists rather than another fixture: the portal is live at
 * bfit-coach-seven.vercel.app against a production api that PREDATES ADR-0015
 * B1/D5 and EV-184a/EV-185a. Two differences, and they are the whole point of this
 * file — everything else here is the smallest body that makes the screen reachable:
 *
 *   1. `GET /coach-portal/clients/{id}` (`TraineeOverviewResponse`) has **no
 *      `scopes` field**, `currentStreakDays` is a primitive `int` (never null) and
 *      `weightSeries` / `redFlags` are non-null lists. The portal's types say
 *      otherwise, and types do not survive a JSON boundary: `hasScope` received
 *      `undefined` and `undefined.includes` threw inside a server component's
 *      render, so opening any trainee from the roster was a 500 for the coach.
 *   2. The routine and nutrition endpoints **do not exist** — EV-184a is unmerged —
 *      so they answer Spring's default 404 body, which carries no `code`. The
 *      portal must state that and not throw.
 *
 * It is NOT a second fixture and no screen may be built against it. It serves only
 * what qa/coach-legacy-api.spec.ts needs to open the roster and two trainees, and its
 * responses are copied field for field from
 * b-fit-api@cc9a3c8 `com.bfit.application.dto.coachportal`. If that file changes,
 * this one is wrong and the spec stops meaning anything.
 */

const PORT = Number(process.env.LEGACY_API_PORT || 8099);

const CLIENT_ID = "1a2b3c4d-0000-4000-8000-0000000000a1";
/**
 * A second trainee for the HALF-migrated case: an api that has deployed ADR-0015 B1
 * (the overview carries `scopes`) but not yet EV-184a/EV-185a (the tabs 404). That
 * ordering is a real deploy, not a hypothetical — B1 is one response field on an
 * endpoint that already exists, and the tabs are new controllers. It is the only way
 * to exercise the tabs' 404 branch at all: with `scopes` absent the portal fails
 * closed and never calls them.
 */
const SCOPED_CLIENT_ID = "1a2b3c4d-0000-4000-8000-0000000000a2";

const b64url = (o) =>
  Buffer.from(JSON.stringify(o))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

/** Same claim shape as b-fit-api's JwtTokenService; src/lib/jwt.ts only decodes. */
const mintAccess = () =>
  `${b64url({ alg: "none", typ: "JWT" })}.${b64url({
    sub: "1a2b3c4d-0000-4000-8000-00000000c0ac",
    email: "coach@evoli.fit",
    roles: ["USER", "COACH"],
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 8,
  })}.legacy`;

const json = (res, status, body) => {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
};

/**
 * Spring Boot's default 404 for a path no controller maps — note there is NO `code`,
 * which is what makes it different from ADR-0013's handled `{ code, message, details }`
 * envelope and is why the portal cannot classify it as anything but "load failed".
 */
const springNotFound = (res, path) =>
  json(res, 404, {
    timestamp: new Date().toISOString(),
    status: 404,
    error: "Not Found",
    path,
  });

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  if (path === "/__health") return json(res, 200, { ok: true });

  if (path === "/auth/login" && req.method === "POST") {
    return json(res, 200, {
      accessToken: mintAccess(),
      refreshToken: "legacy-rt",
      expiresIn: 60 * 60 * 8,
    });
  }
  if (path === "/auth/refresh" && req.method === "POST") {
    return json(res, 200, {
      accessToken: mintAccess(),
      refreshToken: "legacy-rt",
      expiresIn: 60 * 60 * 8,
    });
  }

  if (path === "/coach-portal/me") {
    return json(res, 200, {
      coachId: "1a2b3c4d-0000-4000-8000-00000000c0ac",
      displayName: "Alex R.",
      tier: "STARTER",
      active: 1,
      capacity: 2,
    });
  }

  // CoachClientSummaryResponse @ cc9a3c8 — no `scopes`, `currentStreakDays` an int.
  if (path === "/coach-portal/clients") {
    return json(res, 200, {
      items: [
        {
          id: CLIENT_ID,
          traineeDisplayName: "Lina M.",
          currentPlanName: "Three Day Split",
          lastCompletedWorkoutDate: "2026-09-14",
          currentStreakDays: 4,
          status: "ACTIVE",
          since: "2026-09-01T09:00:00Z",
        },
        {
          id: SCOPED_CLIENT_ID,
          traineeDisplayName: "Omar K.",
          currentPlanName: "Two Day Full Body",
          lastCompletedWorkoutDate: "2026-09-10",
          currentStreakDays: 2,
          status: "ACTIVE",
          since: "2026-09-02T09:00:00Z",
        },
      ],
      page: 0,
      size: 100,
      totalElements: 2,
      totalPages: 1,
    });
  }

  // TraineeOverviewResponse @ cc9a3c8 — no `scopes`, and every block populated. A
  // coach opening this trainee is the exact request that 500s without the guard.
  if (path === `/coach-portal/clients/${CLIENT_ID}`) {
    return json(res, 200, {
      clientId: CLIENT_ID,
      traineeDisplayName: "Lina M.",
      since: "2026-09-01T09:00:00Z",
      adherenceThisWeek: { done: 3, planned: 4 },
      currentStreakDays: 4,
      lastSession: { date: "2026-09-14", name: "Upper body", difficulty: "OK" },
      weightSeries: [
        { date: "2026-09-01", weightKg: 71.2 },
        { date: "2026-09-08", weightKg: 70.6 },
      ],
      redFlags: [],
    });
  }

  // The half-migrated api: B1 has landed, so this overview DOES carry `scopes` —
  // and the tabs it grants still 404 below.
  if (path === `/coach-portal/clients/${SCOPED_CLIENT_ID}`) {
    return json(res, 200, {
      clientId: SCOPED_CLIENT_ID,
      traineeDisplayName: "Omar K.",
      since: "2026-09-02T09:00:00Z",
      scopes: ["WORKOUTS", "NUTRITION", "PROGRESS", "WEIGH_INS"],
      adherenceThisWeek: { done: 2, planned: 4 },
      currentStreakDays: 2,
      lastSession: { date: "2026-09-10", name: "Lower body", difficulty: "HARD" },
      weightSeries: [],
      redFlags: [],
    });
  }

  // EV-184a / EV-185a are unmerged on main: these paths map to no controller.
  return springNotFound(res, path);
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`legacy-api listening on http://localhost:${PORT}`);
});
